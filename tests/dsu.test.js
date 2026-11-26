import { test } from "node:test";
import assert from "node:assert/strict";
import { DisjointSet, DSU_INFO, DSU_LIMITS } from "../src/structures/dsu.js";

function seeded(seed) {
    // mulberry32 PRNG, matching the other suites for reproducible runs.
    return () => {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Simple label-array reference model for Disjoint Set Union. */
class LabelModel {
    constructor(n) {
        this.reset(n);
    }

    reset(n) {
        this.n = n;
        this.labels = Array.from({ length: n }, (_, i) => i);
    }

    connected(a, b) {
        return this.labels[a] === this.labels[b];
    }

    union(a, b) {
        const from = this.labels[a];
        const to = this.labels[b];
        if (from === to) return false;
        for (let i = 0; i < this.n; i++) {
            if (this.labels[i] === from) this.labels[i] = to;
        }
        return true;
    }

    setCount() {
        return new Set(this.labels).size;
    }

    sets() {
        const groups = new Map();
        for (let i = 0; i < this.n; i++) {
            const lbl = this.labels[i];
            let arr = groups.get(lbl);
            if (!arr) {
                arr = [];
                groups.set(lbl, arr);
            }
            arr.push(i);
        }
        return [...groups.values()];
    }
}

/** Non-mutating path walk from `x` to root using a plain `parent` array. */
function purePathToRoot(parent, x) {
    const path = [x];
    let curr = x;
    let hops = 0;
    while (parent[curr] !== curr) {
        curr = parent[curr];
        path.push(curr);
        hops++;
        assert.ok(hops < parent.length, `cycle detected in parent array from ${x}`);
    }
    return path;
}

const VALID_STEP_TYPES = new Set([
    "visit",
    "root-found",
    "compress",
    "same-set",
    "compare-rank",
    "link",
    "rank-up",
    "done",
]);

function assertValidSteps(result, n, expectedOp, label = "", { allowEmpty = false } = {}) {
    assert.ok(Array.isArray(result.steps), `${label}: steps is array`);
    if (!allowEmpty) {
        assert.ok(result.steps.length >= 1, `${label}: at least one step`);
    }

    for (let i = 0; i < result.steps.length; i++) {
        const s = result.steps[i];
        assert.deepEqual(
            Object.keys(s).sort(),
            ["edge", "ids", "line", "message", "operation", "pathIds", "snapshot", "type"],
            `${label} step ${i}: exact step keys`,
        );
        assert.ok(VALID_STEP_TYPES.has(s.type), `${label} step ${i}: valid step type "${s.type}"`);
        assert.equal(s.operation, expectedOp, `${label} step ${i}: operation matches`);

        const pseudoLines = DSU_INFO.pseudocode[s.operation];
        assert.ok(Array.isArray(pseudoLines), `${label} step ${i}: pseudocode exists for ${s.operation}`);
        assert.ok(
            Number.isInteger(s.line) && s.line >= 1 && s.line <= pseudoLines.length,
            `${label} step ${i}: line ${s.line} out of 1..${pseudoLines.length} for ${s.operation}`,
        );

        assert.equal(typeof s.message, "string", `${label} step ${i}: message is string`);
        assert.ok(s.message.length > 0, `${label} step ${i}: message is non-empty`);

        assert.ok(Array.isArray(s.ids), `${label} step ${i}: ids is array`);
        assert.ok(Array.isArray(s.pathIds), `${label} step ${i}: pathIds is array`);
        for (const id of s.ids) {
            assert.ok(Number.isInteger(id) && id >= 0 && id < n, `${label} step ${i}: valid id ${id} (no -1)`);
        }
        for (const id of s.pathIds) {
            assert.ok(Number.isInteger(id) && id >= 0 && id < n, `${label} step ${i}: valid pathId ${id} (no -1)`);
        }

        if (s.edge !== null) {
            assert.equal(typeof s.edge, "object", `${label} step ${i}: edge is object or null`);
            assert.ok(
                Number.isInteger(s.edge.from) && s.edge.from >= 0 && s.edge.from < n,
                `${label} step ${i}: edge.from valid`,
            );
            assert.ok(
                Number.isInteger(s.edge.to) && s.edge.to >= 0 && s.edge.to < n,
                `${label} step ${i}: edge.to valid`,
            );
            if (s.type === "compress") {
                assert.ok(
                    Number.isInteger(s.edge.oldParent) && s.edge.oldParent >= 0 && s.edge.oldParent < n,
                    `${label} step ${i}: compress edge.oldParent valid`,
                );
                assert.notEqual(
                    s.edge.oldParent,
                    s.edge.to,
                    `${label} step ${i}: compress edge.oldParent differs from new root`,
                );
            }
        } else {
            assert.notEqual(s.type, "compress", `${label} step ${i}: compress must have edge`);
            assert.notEqual(s.type, "link", `${label} step ${i}: link must have edge`);
        }

        // Snapshot shape & no -1 sentinels
        assert.ok(s.snapshot && typeof s.snapshot === "object", `${label} step ${i}: snapshot object`);
        assert.deepEqual(
            Object.keys(s.snapshot).sort(),
            ["parent", "rank", "roots"],
            `${label} step ${i}: exact snapshot keys`,
        );
        assert.equal(s.snapshot.parent.length, n, `${label} step ${i}: snapshot.parent length`);
        assert.equal(s.snapshot.rank.length, n, `${label} step ${i}: snapshot.rank length`);
        for (let k = 0; k < n; k++) {
            const p = s.snapshot.parent[k];
            const r = s.snapshot.rank[k];
            assert.ok(Number.isInteger(p) && p >= 0 && p < n, `${label} step ${i}: snapshot.parent[${k}] valid`);
            assert.ok(Number.isInteger(r) && r >= 0, `${label} step ${i}: snapshot.rank[${k}] valid`);
        }
        const expectedRoots = [];
        for (let k = 0; k < n; k++) {
            if (s.snapshot.parent[k] === k) expectedRoots.push(k);
        }
        assert.deepEqual(s.snapshot.roots, expectedRoots, `${label} step ${i}: snapshot.roots accurate`);
    }
}

function assertMatchesModelPure(dsu, model, label) {
    assert.equal(dsu.integrityError(), null, `${label}: integrityError must be null`);
    assert.equal(dsu.size, model.n, `${label}: size`);
    assert.equal(dsu.setCount, model.setCount(), `${label}: setCount`);
    assert.deepEqual(dsu.sets(), model.sets(), `${label}: sets()`);

    // Check every pair (i, j) via non-mutating root-walk on parentArray()
    const parent = dsu.parentArray();
    const roots = Array.from({ length: model.n }, (_, i) => {
        const path = purePathToRoot(parent, i);
        return path[path.length - 1];
    });
    for (let i = 0; i < model.n; i++) {
        for (let j = i; j < model.n; j++) {
            assert.equal(
                roots[i] === roots[j],
                model.connected(i, j),
                `${label}: pure pair (${i}, ${j}) connectivity`,
            );
        }
    }
}

test("DSU_LIMITS and DSU_INFO metadata are frozen and complete", () => {
    assert.deepEqual(DSU_LIMITS, { minSize: 1, maxSize: 16 });
    assert.ok(Object.isFrozen(DSU_LIMITS));
    assert.ok(Object.isFrozen(DSU_INFO));
    assert.equal(DSU_INFO.name, "Disjoint Set Union (Union-Find)");
    assert.equal(typeof DSU_INFO.summary, "string");
    assert.ok(DSU_INFO.summary.length > 30);

    for (const key of ["both", "rankOnly", "compressOnly", "neither", "makeSet", "space"]) {
        assert.equal(typeof DSU_INFO.complexity[key], "string", `complexity.${key}`);
        assert.ok(DSU_INFO.complexity[key].length > 0);
    }

    for (const op of ["find", "union", "connected", "reset"]) {
        assert.ok(Array.isArray(DSU_INFO.pseudocode[op]), `pseudocode.${op} is array`);
        assert.ok(DSU_INFO.pseudocode[op].length >= 1, `pseudocode.${op} non-empty`);
    }
});

test("constructor validation and default options", () => {
    const def = new DisjointSet();
    assert.equal(def.size, 8);
    assert.equal(def.setCount, 8);
    assert.equal(def.byRank, true);
    assert.equal(def.compress, true);
    assert.deepEqual(def.parentArray(), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(def.rankArray(), [0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(def.integrityError(), null);

    // Numeric out-of-range or non-integer -> RangeError
    for (const bad of [0, -1, 17, 100, 1.5, 4.2, NaN, Infinity, -Infinity]) {
        assert.throws(() => new DisjointSet(bad), RangeError, `expected RangeError for n=${bad}`);
    }

    // Non-number n -> TypeError
    for (const bad of ["8", null, {}, [], true, false]) {
        assert.throws(() => new DisjointSet(bad), TypeError, `expected TypeError for n=${String(bad)}`);
    }

    // Invalid options or non-boolean flags -> TypeError
    for (const badOpt of [null, "fast", 123, []]) {
        assert.throws(() => new DisjointSet(4, badOpt), TypeError, `expected TypeError for options=${String(badOpt)}`);
    }
    for (const badBool of [1, 0, "true", null, {}]) {
        assert.throws(() => new DisjointSet(4, { byRank: badBool }), TypeError);
        assert.throws(() => new DisjointSet(4, { compress: badBool }), TypeError);
    }
});

test("boundaries n = 1 and n = 16 and reset()", () => {
    const one = new DisjointSet(1);
    assert.equal(one.size, 1);
    assert.equal(one.setCount, 1);
    assert.deepEqual(one.sets(), [[0]]);
    assert.equal(one.integrityError(), null);

    const f0 = one.find(0);
    assert.equal(f0.ok, true);
    assert.equal(f0.value, 0);
    assertValidSteps(f0, 1, "find", "n=1 find(0)");

    const u00 = one.union(0, 0);
    assert.equal(u00.ok, true);
    assert.equal(u00.value, false);
    assert.equal(one.setCount, 1);
    assert.equal(u00.steps[u00.steps.length - 1].type, "same-set");
    assertValidSteps(u00, 1, "union", "n=1 union(0,0)");

    const c00 = one.connected(0, 0);
    assert.equal(c00.ok, true);
    assert.equal(c00.value, true);
    assertValidSteps(c00, 1, "connected", "n=1 connected(0,0)");

    // Resize up to 16 via reset(16)
    const r16 = one.reset(16);
    assert.equal(r16.ok, true);
    assert.equal(r16.value, 16);
    assert.equal(one.size, 16);
    assert.equal(one.setCount, 16);
    assert.equal(one.integrityError(), null);
    assertValidSteps(r16, 16, "reset", "reset(16)");

    // Merge all 16 into one set
    for (let i = 1; i < 16; i++) {
        const res = one.union(0, i);
        assert.equal(res.ok, true);
        assertValidSteps(res, 16, "union", `n=16 union(0,${i})`);
    }
    assert.equal(one.setCount, 1);
    assert.deepEqual(one.sets(), [Array.from({ length: 16 }, (_, i) => i)]);
    assert.equal(one.integrityError(), null);

    // Invalid reset calls fail without mutating state
    const beforeSnap = one.snapshot();
    for (const badN of [0, -1, 17, 2.5, NaN, Infinity, "8", null, {}]) {
        const badRes = one.reset(badN);
        assert.equal(badRes.ok, false, `reset(${String(badN)}) fails`);
        assert.equal(typeof badRes.error, "string");
        assert.deepEqual(badRes.steps, []);
        assert.deepEqual(one.snapshot(), beforeSnap, `reset(${String(badN)}) must not mutate`);
        assert.equal(one.size, 16);
        assert.equal(one.setCount, 1);
    }

    // reset() without argument keeps current size
    const rSame = one.reset();
    assert.equal(rSame.ok, true);
    assert.equal(rSame.value, 16);
    assert.equal(one.setCount, 16);
    assertValidSteps(rSame, 16, "reset", "reset()");
});

test("invalid element IDs return { ok: false, error, steps: [] } without mutating DSU", () => {
    // Build a non-flat chain so any accidental compression on the 1st arg would be detectable!
    const dsu = new DisjointSet(5, { byRank: false, compress: true });
    assert.equal(dsu.union(0, 1).ok, true);
    assert.equal(dsu.union(1, 2).ok, true);
    assert.deepEqual(dsu.parentArray(), [1, 2, 2, 3, 4]);

    const beforeSnap = dsu.snapshot();
    const beforeCount = dsu.setCount;
    const badIds = [-1, 5, 16, 100, 1.5, -0.5, NaN, Infinity, -Infinity, "0", "abc", null, undefined, {}, []];

    for (const bad of badIds) {
        const f = dsu.find(bad);
        assert.equal(f.ok, false, `find(${String(bad)}) fails`);
        assert.equal(typeof f.error, "string");
        assert.deepEqual(f.steps, []);

        // Invalid 1st arg
        const u1 = dsu.union(bad, 0);
        assert.equal(u1.ok, false, `union(${String(bad)}, 0) fails`);
        assert.deepEqual(u1.steps, []);

        // Valid 1st arg (0 has depth 2!) + invalid 2nd arg -> must NOT compress 0!
        const u2 = dsu.union(0, bad);
        assert.equal(u2.ok, false, `union(0, ${String(bad)}) fails`);
        assert.deepEqual(u2.steps, []);

        const c1 = dsu.connected(bad, 0);
        assert.equal(c1.ok, false, `connected(${String(bad)}, 0) fails`);
        assert.deepEqual(c1.steps, []);

        const c2 = dsu.connected(0, bad);
        assert.equal(c2.ok, false, `connected(0, ${String(bad)}) fails`);
        assert.deepEqual(c2.steps, []);

        assert.deepEqual(dsu.snapshot(), beforeSnap, `state unchanged after bad=${String(bad)}`);
        assert.equal(dsu.setCount, beforeCount);
    }
});

test("union(x, x) and union of elements already in the same set return ok(false) with same-set step", () => {
    const dsu = new DisjointSet(6, { byRank: true, compress: true });

    // Self union on element 0 (also verifies 0 is never treated as falsy)
    const selfRes = dsu.union(0, 0);
    assert.equal(selfRes.ok, true);
    assert.equal(selfRes.value, false);
    assert.equal(dsu.setCount, 6);
    assert.equal(selfRes.steps[selfRes.steps.length - 1].type, "same-set");
    assertValidSteps(selfRes, 6, "union", "union(0,0)");

    // Merge 0-1 and 1-2
    assert.equal(dsu.union(0, 1).ok, true);
    assert.equal(dsu.union(1, 2).ok, true);
    assert.equal(dsu.setCount, 4);

    // Redundant union(0, 2)
    const dupRes = dsu.union(0, 2);
    assert.equal(dupRes.ok, true);
    assert.equal(dupRes.value, false);
    assert.equal(dsu.setCount, 4);
    const last = dupRes.steps[dupRes.steps.length - 1];
    assert.equal(last.type, "same-set");
    assert.deepEqual(last.ids, [0, 2, 0]);
    assert.equal(last.edge, null);
    assertValidSteps(dupRes, 6, "union", "redundant union(0,2)");
});

test("tall chain without byRank + visible path compression with oldParent", () => {
    const dsu = new DisjointSet(8, { byRank: false, compress: true });

    // union(0,1), union(1,2), ..., union(6,7) -> chain 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7
    for (let i = 0; i < 7; i++) {
        const res = dsu.union(i, i + 1);
        assert.equal(res.ok, true);
        assert.equal(res.value, i + 1);
        assertValidSteps(res, 8, "union", `chain union(${i},${i + 1})`);
    }

    assert.deepEqual(dsu.parentArray(), [1, 2, 3, 4, 5, 6, 7, 7]);
    assert.equal(dsu.setCount, 1);
    assert.equal(dsu.integrityError(), null);

    // find(0) walks depth 7 and compresses 0..5 directly to root 7
    const fRes = dsu.find(0);
    assert.equal(fRes.ok, true);
    assert.equal(fRes.value, 7);
    assertValidSteps(fRes, 8, "find", "chain find(0)");

    // Check visit steps: first has edge: null, next 7 have edge { from: i, to: i+1 }
    const visits = fRes.steps.filter((s) => s.type === "visit");
    assert.equal(visits.length, 8);
    assert.equal(visits[0].edge, null);
    assert.deepEqual(visits[0].ids, [0]);
    for (let i = 1; i < 8; i++) {
        assert.deepEqual(visits[i].edge, { from: i - 1, to: i });
        assert.deepEqual(visits[i].ids, [i]);
    }

    // Check root-found step
    const foundSteps = fRes.steps.filter((s) => s.type === "root-found");
    assert.equal(foundSteps.length, 1);
    assert.deepEqual(foundSteps[0].ids, [7]);
    assert.equal(foundSteps[0].edge, null);

    // Check compress steps for nodes 0..5 (6 already pointed to 7)
    const compressSteps = fRes.steps.filter((s) => s.type === "compress");
    assert.equal(compressSteps.length, 6);
    for (let v = 0; v <= 5; v++) {
        assert.deepEqual(compressSteps[v].ids, [v, 7]);
        assert.deepEqual(compressSteps[v].edge, { from: v, to: 7, oldParent: v + 1 });
        assert.equal(compressSteps[v].snapshot.parent[v], 7);
    }

    // After find(0), every node 0..6 points directly to root 7
    assert.deepEqual(dsu.parentArray(), [7, 7, 7, 7, 7, 7, 7, 7]);
    assert.equal(dsu.integrityError(), null);

    // A second find(0) emits zero compress steps and ends on line 5 (return root)
    const fRes2 = dsu.find(0);
    assert.equal(fRes2.ok, true);
    assert.equal(fRes2.value, 7);
    assert.equal(fRes2.steps.filter((s) => s.type === "compress").length, 0);
    assert.equal(fRes2.steps.at(-1).type, "done");
    assert.equal(fRes2.steps.at(-1).line, 5);

    // Explicit byRank=false direction test when rootA > rootB: rootA always attaches under rootB
    const dirDsu = new DisjointSet(6, { byRank: false, compress: false });
    const rev = dirDsu.union(5, 2);
    assert.equal(rev.ok, true);
    assert.equal(rev.value, 2);
    assert.equal(dirDsu.parentArray()[5], 2);
    assert.equal(dirDsu.parentArray()[2], 2);
    const rev2 = dirDsu.union(4, 5);
    assert.equal(rev2.ok, true);
    assert.equal(rev2.value, 2);
    assert.equal(dirDsu.parentArray()[4], 2);
});

test("same union sequence with byRank stays flat, breaks ties to smaller root, and bumps rank", () => {
    const dsu = new DisjointSet(8, { byRank: true, compress: true });

    for (let i = 0; i < 7; i++) {
        const res = dsu.union(i, i + 1);
        assert.equal(res.ok, true);
        assert.equal(res.value, 0, `union(${i}, ${i + 1}) keeps smaller root 0`);
        assertValidSteps(res, 8, "union", `byRank union(${i},${i + 1})`);
        if (i === 0) {
            // First merge is rank 0 vs rank 0 -> tie -> rank-up on root 0
            assert.equal(res.steps.filter((s) => s.type === "rank-up").length, 1);
        } else {
            // Subsequent merges attach rank 0 under rank 1 -> no rank-up
            assert.equal(res.steps.filter((s) => s.type === "rank-up").length, 0);
        }
    }

    // Verify max depth <= 2 (in fact 1) and rank[0] === 1
    const parent = dsu.parentArray();
    const maxDepth = Math.max(...parent.map((_, i) => purePathToRoot(parent, i).length - 1));
    assert.ok(maxDepth <= 2, `expected flat tree maxDepth <= 2, got ${maxDepth}`);
    assert.equal(dsu.rankArray()[0], 1);
    assert.equal(dsu.integrityError(), null);

    // Test multi-level rank tie-breaking: rank 0 -> 1 -> 2 -> 3
    const d2 = new DisjointSet(8, { byRank: true, compress: false });
    // Pairwise rank-0 merges: {0,1} (root 0, r=1), {2,3} (root 2, r=1), {4,5} (root 4, r=1), {6,7} (root 6, r=1)
    assert.equal(d2.union(1, 0).value, 0);
    assert.equal(d2.union(3, 2).value, 2);
    assert.equal(d2.union(5, 4).value, 4);
    assert.equal(d2.union(7, 6).value, 6);
    assert.deepEqual(d2.rankArray(), [1, 0, 1, 0, 1, 0, 1, 0]);

    // Rank-1 ties: smaller root wins
    assert.equal(d2.union(3, 1).value, 0);
    assert.equal(d2.union(7, 5).value, 4);
    assert.equal(d2.rankArray()[0], 2);
    assert.equal(d2.rankArray()[4], 2);

    // Rank-2 tie: 0 vs 4 -> root 0 with rank 3 (size 8 = 2^3)
    const topMerge = d2.union(6, 2);
    assert.equal(topMerge.ok, true);
    assert.equal(topMerge.value, 0);
    assert.equal(d2.rankArray()[0], 3);
    assert.equal(topMerge.steps.filter((s) => s.type === "rank-up").length, 1);
    assert.equal(d2.integrityError(), null);

    // Deterministic rankA < rankB test: lower-rank a attaches under higher-rank b with 0 rank-up steps
    const d3 = new DisjointSet(4, { byRank: true, compress: false });
    assert.equal(d3.union(2, 3).value, 2); // rank[2] = 1, rank[0] = 0
    const lowUnderHigh = d3.union(0, 3);   // rankA (0) < rankB (1) -> 0 attaches under 2
    assert.equal(lowUnderHigh.ok, true);
    assert.equal(lowUnderHigh.value, 2);
    assert.equal(d3.parentArray()[0], 2);
    assert.equal(d3.rankArray()[2], 1);
    assert.equal(lowUnderHigh.steps.filter((s) => s.type === "rank-up").length, 0);
    assert.equal(d3.integrityError(), null);
});

test("snapshot, parentArray, and rankArray return defensive copies", () => {
    const dsu = new DisjointSet(4);
    const u = dsu.union(0, 1);
    assert.equal(u.ok, true);

    // Mutate returned arrays and earlier step snapshots
    const pCopy = dsu.parentArray();
    pCopy[0] = 99;
    const rCopy = dsu.rankArray();
    rCopy[0] = 99;
    const snapCopy = dsu.snapshot();
    snapCopy.parent[1] = 99;
    snapCopy.roots.push(99);

    assert.equal(dsu.integrityError(), null);
    assert.equal(dsu.parentArray()[0], 0);
    assert.equal(dsu.rankArray()[0], 1);

    // Later union must not mutate earlier step's snapshot
    const stepBefore = structuredClone(u.steps[u.steps.length - 1].snapshot);
    dsu.union(2, 3);
    assert.deepEqual(u.steps[u.steps.length - 1].snapshot, stepBefore);
});

test("integrityError() detects all structural and rank corruptions", () => {
    // 1. Out-of-range parent
    {
        const d = new DisjointSet(4);
        d._parent[2] = 4;
        assert.match(d.integrityError(), /parent\[2\]/i);
        d._parent[2] = -1;
        assert.match(d.integrityError(), /parent\[2\]/i);
    }

    // 2. Negative / non-integer rank & array length mismatch
    {
        const d = new DisjointSet(4);
        d._rank[1] = -1;
        assert.match(d.integrityError(), /rank\[1\]/i);
        d._rank[1] = 0;
        d._parent.push(4);
        assert.match(d.integrityError(), /parent array length/i);
        d._parent.pop();
        d._rank.pop();
        assert.match(d.integrityError(), /rank array length/i);
    }

    // 3. Cycle in parent pointers
    {
        const d = new DisjointSet(4);
        d._parent[0] = 1;
        d._parent[1] = 0;
        assert.match(d.integrityError(), /cycle/i);
    }

    // 4. Wrong setCount
    {
        const d = new DisjointSet(4);
        d._setCount = 3;
        assert.match(d.integrityError(), /setCount/i);
    }

    // 5. rank[parent] <= rank[child] when byRank === true
    {
        const d = new DisjointSet(4, { byRank: true });
        d._parent[1] = 0;
        d._setCount = 3;
        // rank[0] === 0 === rank[1] -> violates strict inequality!
        assert.match(d.integrityError(), /rank invariant/i);

        d._rank[1] = 2;
        d._rank[0] = 1;
        assert.match(d.integrityError(), /rank invariant/i);
    }

    // 6. Root of rank k with fewer than 2^k elements
    {
        const d = new DisjointSet(4, { byRank: true });
        d._parent[1] = 0;
        d._setCount = 3;
        // Set {0, 1} has size 2, but rank 2 requires at least 2^2 = 4 elements
        d._rank[0] = 2;
        assert.match(d.integrityError(), /subtree size invariant/i);
    }

    // 7. When byRank === false, non-roots with rank 0 are valid
    {
        const d = new DisjointSet(4, { byRank: false, compress: false });
        d.union(0, 1);
        d.union(1, 2);
        assert.deepEqual(d.rankArray(), [0, 0, 0, 0]);
        assert.equal(d.integrityError(), null);
    }
});

// 1,200 seeded mulberry32 sequences: 300 for each of the 4 (byRank × compress) combinations
const OPTION_COMBOS = [
    { byRank: true, compress: true, seedBase: 10000 },
    { byRank: true, compress: false, seedBase: 20000 },
    { byRank: false, compress: true, seedBase: 30000 },
    { byRank: false, compress: false, seedBase: 40000 },
];

for (const { byRank, compress, seedBase } of OPTION_COMBOS) {
    test(`300 seeded property sequences: byRank=${byRank}, compress=${compress}`, () => {
        for (let seq = 0; seq < 300; seq++) {
            const rand = seeded(seedBase + seq);
            let n = DSU_LIMITS.minSize + Math.floor(rand() * (DSU_LIMITS.maxSize - DSU_LIMITS.minSize + 1));
            const dsu = new DisjointSet(n, { byRank, compress });
            const model = new LabelModel(n);

            const seqLabel = `byRank=${byRank} compress=${compress} seq=${seq} n=${n}`;
            assertMatchesModelPure(dsu, model, `${seqLabel} init`);

            const opCount = 20 + Math.floor(rand() * 11); // 20..30 ops per sequence
            for (let step = 0; step < opCount; step++) {
                const opLabel = `${seqLabel} op=${step}`;
                const roll = rand();

                if (roll < 0.55) {
                    // union(a, b)
                    const a = Math.floor(rand() * n);
                    const b = Math.floor(rand() * n);
                    const prePathA = purePathToRoot(dsu.parentArray(), a);
                    const modelMerged = model.union(a, b);
                    const res = dsu.union(a, b);

                    assert.equal(res.ok, true, `${opLabel} union(${a},${b}) ok`);
                    assertValidSteps(res, n, "union", `${opLabel} union(${a},${b})`);

                    if (!modelMerged) {
                        assert.equal(res.value, false, `${opLabel} redundant union returns false`);
                        assert.equal(
                            res.steps[res.steps.length - 1].type,
                            "same-set",
                            `${opLabel} redundant union ends in same-set`,
                        );
                    } else {
                        assert.ok(
                            Number.isInteger(res.value) && res.value >= 0 && res.value < n,
                            `${opLabel} union returns newRoot`,
                        );
                        assert.equal(
                            dsu.parentArray()[res.value],
                            res.value,
                            `${opLabel} returned newRoot is a root`,
                        );
                        assert.equal(
                            res.steps[res.steps.length - 1].type,
                            "done",
                            `${opLabel} merged union ends in done`,
                        );
                    }

                    // If compress is true, verify every node on prePathA now points directly to root of a
                    if (compress) {
                        const postParent = dsu.parentArray();
                        const postRootA = purePathToRoot(postParent, a).at(-1);
                        // Note: if rootA became childRoot under newRoot, prePathA's nodes point to old rootA (or newRoot if rootA stayed root).
                        // Specifically, every non-root node on prePathA had parent[v] set to old rootA during find(a).
                        const oldRootA = prePathA[prePathA.length - 1];
                        for (let k = 0; k < prePathA.length - 1; k++) {
                            assert.equal(
                                postParent[prePathA[k]],
                                oldRootA,
                                `${opLabel} pathA compressed node ${prePathA[k]} -> ${oldRootA}`,
                            );
                        }
                        assert.ok(postRootA >= 0 && postRootA < n);
                    }
                } else if (roll < 0.80) {
                    // find(x)
                    const x = Math.floor(rand() * n);
                    const preParent = dsu.parentArray();
                    const prePath = purePathToRoot(preParent, x);
                    const expectedRoot = prePath[prePath.length - 1];

                    const res = dsu.find(x);
                    assert.equal(res.ok, true, `${opLabel} find(${x}) ok`);
                    assert.equal(res.value, expectedRoot, `${opLabel} find(${x}) root`);
                    assertValidSteps(res, n, "find", `${opLabel} find(${x})`);

                    if (compress) {
                        const postParent = dsu.parentArray();
                        for (const v of prePath) {
                            assert.equal(
                                postParent[v],
                                expectedRoot,
                                `${opLabel} find(${x}) compressed node ${v} directly to root ${expectedRoot}`,
                            );
                        }
                        const expectedCompressed = prePath.filter((v) => preParent[v] !== expectedRoot);
                        const compressSteps = res.steps.filter((s) => s.type === "compress");
                        assert.equal(
                            compressSteps.length,
                            expectedCompressed.length,
                            `${opLabel} find(${x}) exact compress step count`,
                        );
                        for (let k = 0; k < expectedCompressed.length; k++) {
                            const v = expectedCompressed[k];
                            assert.deepEqual(compressSteps[k].edge, {
                                from: v,
                                to: expectedRoot,
                                oldParent: preParent[v],
                            });
                        }
                    } else {
                        assert.deepEqual(
                            dsu.parentArray(),
                            preParent,
                            `${opLabel} find(${x}) without compression must not mutate parent`,
                        );
                        assert.equal(
                            res.steps.filter((s) => s.type === "compress").length,
                            0,
                            `${opLabel} find(${x}) without compression emits no compress steps`,
                        );
                    }
                } else if (roll < 0.96) {
                    // connected(a, b)
                    const a = Math.floor(rand() * n);
                    const b = Math.floor(rand() * n);
                    const expected = model.connected(a, b);
                    const res = dsu.connected(a, b);

                    assert.equal(res.ok, true, `${opLabel} connected(${a},${b}) ok`);
                    assert.equal(res.value, expected, `${opLabel} connected(${a},${b}) value`);
                    assertValidSteps(res, n, "connected", `${opLabel} connected(${a},${b})`);
                    assert.equal(
                        res.steps[res.steps.length - 1].type,
                        expected ? "same-set" : "done",
                        `${opLabel} connected(${a},${b}) terminal step type`,
                    );
                } else {
                    // reset(newN?)
                    const changeSize = rand() < 0.5;
                    const nextN = changeSize
                        ? DSU_LIMITS.minSize + Math.floor(rand() * (DSU_LIMITS.maxSize - DSU_LIMITS.minSize + 1))
                        : undefined;
                    const res = dsu.reset(nextN);
                    const actualN = nextN === undefined ? dsu.size : nextN;
                    n = actualN;
                    model.reset(actualN);

                    assert.equal(res.ok, true, `${opLabel} reset ok`);
                    assert.equal(res.value, actualN, `${opLabel} reset returns size`);
                    assertValidSteps(res, actualN, "reset", `${opLabel} reset`);
                }

                assertMatchesModelPure(dsu, model, opLabel);
            }

            // End-of-sequence exhaustive check: find(i) returns identical root for every member of a set,
            // and connected(i, j) agrees with model for all pairs (i, j).
            const finalN = dsu.size;
            const findRoots = [];
            for (let i = 0; i < finalN; i++) {
                const f = dsu.find(i);
                assert.equal(f.ok, true);
                assertValidSteps(f, finalN, "find", `${seqLabel} final find(${i})`);
                findRoots.push(f.value);
            }
            for (const set of model.sets()) {
                const r0 = findRoots[set[0]];
                for (const member of set) {
                    assert.equal(
                        findRoots[member],
                        r0,
                        `${seqLabel} all members of set [${set.join(",")}] share root`,
                    );
                }
            }
            for (let i = 0; i < finalN; i++) {
                for (let j = i; j < finalN; j++) {
                    const c = dsu.connected(i, j);
                    assert.equal(c.ok, true);
                    assert.equal(c.value, model.connected(i, j), `${seqLabel} final connected(${i},${j})`);
                }
            }
            assert.equal(dsu.integrityError(), null, `${seqLabel} final integrityError`);
        }
    });
}
