/**
 * Tests for src/structures/segment-tree.js (G13).
 * Covers metadata, constructor validation, defensive copies, exact query overlap
 * classification, edge cases, integrityError() corruption checks, and 600 seeded
 * property-test sequences (300 sum-started + 300 min-started).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    SegmentTree,
    SEGMENT_TREE_LIMITS,
    SEGMENT_TREE_INFO,
} from "../src/structures/segment-tree.js";
import { layoutCompleteTree } from "../src/core/tree-layout.js";

const VALID_STEP_TYPES = new Set([
    "visit",
    "full",
    "partial",
    "disjoint",
    "combine",
    "update-leaf",
    "recompute",
    "done",
]);

const VALID_OVERLAPS = new Set(["full", "partial", "disjoint"]);

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randInt(rand, lo, hi) {
    return lo + Math.floor(rand() * (hi - lo + 1));
}

function refQuery(arr, l, r, mode) {
    let acc = arr[l];
    for (let i = l + 1; i <= r; i++) {
        acc = mode === "sum" ? acc + arr[i] : Math.min(acc, arr[i]);
    }
    return Object.is(acc, -0) ? 0 : acc;
}

function assertNotNegZero(n, label = "number") {
    assert.equal(Object.is(n, -0), false, `${label} must not be -0`);
}

function verifySnapshotShape(snap, { requirePopulatedValues = true } = {}) {
    assert.equal(typeof snap, "object");
    assert.ok(snap !== null);
    assert.ok(Array.isArray(snap.nodes));
    assert.ok(Array.isArray(snap.values));
    assert.ok(SEGMENT_TREE_LIMITS.modes.includes(snap.mode));

    let prevIndex = -1;
    for (const n of snap.nodes) {
        assert.ok(Number.isInteger(n.index) && n.index >= 0, `valid node index ${n.index}`);
        assert.ok(n.index > prevIndex, "snapshot.nodes sorted strictly ascending by index");
        prevIndex = n.index;
        assert.ok(Number.isInteger(n.lo) && Number.isInteger(n.hi) && n.lo >= 0 && n.lo <= n.hi);
        if (requirePopulatedValues) {
            assert.ok(Number.isInteger(n.value), `node ${n.index} value must be finite integer`);
            assertNotNegZero(n.value, `node ${n.index} value`);
        } else if (n.value !== null) {
            assert.ok(Number.isInteger(n.value), `populated node ${n.index} value must be finite integer`);
            assertNotNegZero(n.value, `node ${n.index} value`);
        }
    }
    for (let i = 0; i < snap.values.length; i++) {
        assert.ok(Number.isInteger(snap.values[i]));
        assertNotNegZero(snap.values[i], `values[${i}]`);
    }
}

function verifySteps(res, expectedOp, tree) {
    assert.equal(res.ok, true, res.error || "expected ok result");
    assert.ok(Array.isArray(res.steps) && res.steps.length > 0, `${expectedOp} must emit steps`);

    const lines = SEGMENT_TREE_INFO.pseudocode[expectedOp];
    assert.ok(Array.isArray(lines) && lines.length > 0, `pseudocode exists for ${expectedOp}`);

    let prevVisited = 0;
    let prevCombines = 0;

    for (let idx = 0; idx < res.steps.length; idx++) {
        const s = res.steps[idx];
        const isLast = idx === res.steps.length - 1;

        assert.ok(VALID_STEP_TYPES.has(s.type), `unknown step type "${s.type}"`);
        assert.equal(s.operation, expectedOp, "step.operation matches");
        assert.ok(Number.isInteger(s.line) && s.line >= 1 && s.line <= lines.length, `line ${s.line} in 1..${lines.length}`);
        assert.equal(typeof s.message, "string");
        assert.ok(s.message.length > 0, "step.message must be non-empty");
        assert.equal(s.message.includes("Infinity"), false, `step.message must not leak raw Infinity: ${s.message}`);

        assert.ok(Array.isArray(s.range) && s.range.length === 2, "step.range is [lo, hi]");
        assert.ok(Number.isInteger(s.range[0]) && Number.isInteger(s.range[1]) && s.range[0] >= 0 && s.range[0] <= s.range[1]);
        assertNotNegZero(s.range[0], "range[0]");
        assertNotNegZero(s.range[1], "range[1]");

        if (isLast) {
            assert.equal(s.type, "done", "final step must be done");
            assert.equal(s.node, null, "done step has node === null");
            assert.equal(s.overlap, null, "done step has overlap === null");
        } else {
            assert.notEqual(s.type, "done", "done step may only appear last");
            assert.ok(Number.isInteger(s.node) && s.node >= 0, `non-done step.node must be integer >= 0 (got ${s.node})`);
            const snapNode = s.snapshot.nodes.find((nd) => nd.index === s.node);
            assert.ok(snapNode, `step.node ${s.node} must exist in step.snapshot.nodes`);
            assert.deepEqual([snapNode.lo, snapNode.hi], s.range, `step.range must match node ${s.node} range`);
            if (expectedOp === "query") {
                assert.ok(VALID_OVERLAPS.has(s.overlap), `query step must have valid overlap (got ${s.overlap})`);
            } else {
                assert.equal(s.overlap, null, `${expectedOp} step must have overlap === null`);
            }
        }

        if (expectedOp === "query") {
            assert.ok(Array.isArray(s.queryRange) && s.queryRange.length === 2);
            assertNotNegZero(s.queryRange[0], "queryRange[0]");
            assertNotNegZero(s.queryRange[1], "queryRange[1]");
        } else {
            assert.equal(s.queryRange, null);
        }

        if (s.value !== null) {
            assert.ok(Number.isInteger(s.value), `step.value must be null or finite integer (got ${s.value})`);
            assertNotNegZero(s.value, "step.value");
        }

        assert.ok(Number.isInteger(s.nodesVisited) && s.nodesVisited >= prevVisited, "nodesVisited is monotonic");
        assert.ok(Number.isInteger(s.combines) && s.combines >= prevCombines, "combines is monotonic");
        prevVisited = s.nodesVisited;
        prevCombines = s.combines;

        const isBuildLike = expectedOp === "build" || expectedOp === "setMode";
        verifySnapshotShape(s.snapshot, { requirePopulatedValues: isLast || !isBuildLike });
    }

    const doneSnap = res.steps.at(-1).snapshot;
    assert.deepEqual(doneSnap, tree.snapshot(), "done snapshot matches final tree snapshot");
}

/* ---------- 1. Metadata & Limits ---------- */

test("SEGMENT_TREE_LIMITS and SEGMENT_TREE_INFO are frozen and complete", () => {
    assert.equal(Object.isFrozen(SEGMENT_TREE_LIMITS), true);
    assert.equal(Object.isFrozen(SEGMENT_TREE_LIMITS.modes), true);
    assert.deepEqual(SEGMENT_TREE_LIMITS, {
        minSize: 1,
        maxSize: 16,
        minValue: -999,
        maxValue: 999,
        modes: ["sum", "min"],
    });

    assert.equal(Object.isFrozen(SEGMENT_TREE_INFO), true);
    assert.equal(Object.isFrozen(SEGMENT_TREE_INFO.complexity), true);
    assert.equal(Object.isFrozen(SEGMENT_TREE_INFO.pseudocode), true);
    assert.equal(SEGMENT_TREE_INFO.name, "Segment Tree");
    assert.equal(typeof SEGMENT_TREE_INFO.summary, "string");
    assert.ok(SEGMENT_TREE_INFO.summary.length > 20);
    assert.deepEqual(SEGMENT_TREE_INFO.complexity, {
        build: "O(n)",
        query: "O(log n)",
        update: "O(log n)",
        setMode: "O(n)",
        space: "O(n)",
    });

    for (const op of ["build", "query", "update", "setMode"]) {
        const lines = SEGMENT_TREE_INFO.pseudocode[op];
        assert.ok(Array.isArray(lines) && lines.length >= 3, `${op} pseudocode present`);
        assert.equal(Object.isFrozen(lines), true, `${op} pseudocode frozen`);
        for (const line of lines) {
            assert.equal(typeof line, "string");
            assert.ok(line.trim().length > 0);
        }
    }
});

/* ---------- 2. Constructor, Bounds, Validation & Defensive Copies ---------- */

test("constructor defaults, boundary sizes (1 and 16), and layoutCompleteTree compatibility", () => {
    const def = new SegmentTree();
    assert.deepEqual(def.toArray(), [2, 5, 1, 4, 9, 3, 6, 8]);
    assert.equal(def.size, 8);
    assert.equal(def.mode, "sum");
    assert.equal(def.nodeCount, 15);
    assert.equal(def.maxIndex, 14);
    assert.equal(def.integrityError(), null);

    const single = new SegmentTree([42], { mode: "min" });
    assert.equal(single.size, 1);
    assert.equal(single.mode, "min");
    assert.equal(single.nodeCount, 1);
    assert.equal(single.maxIndex, 0);
    assert.equal(single.integrityError(), null);

    const sixteen = new SegmentTree(
        Array.from({ length: 16 }, (_, i) => i - 8),
        { mode: "sum" },
    );
    assert.equal(sixteen.size, 16);
    assert.equal(sixteen.nodeCount, 31);
    assert.equal(sixteen.maxIndex, 30);
    assert.equal(sixteen.integrityError(), null);

    // Verify every size 1..16 maps cleanly into layoutCompleteTree(maxIndex + 1).
    for (let n = 1; n <= 16; n++) {
        const vals = Array.from({ length: n }, (_, i) => i + 1);
        const st = new SegmentTree(vals);
        assert.equal(st.nodeCount, 2 * n - 1);
        assert.equal(st.integrityError(), null);
        const layout = layoutCompleteTree(st.maxIndex + 1);
        for (const node of st.snapshot().nodes) {
            assert.ok(layout.nodes[node.index], `layout has slot for node ${node.index} when n=${n}`);
        }
    }
});

test("constructor throws TypeError for bad types and RangeError for out-of-range values", () => {
    for (const badValues of [null, 42, "123", {}, true]) {
        assert.throws(() => new SegmentTree(badValues), TypeError, `values=${String(badValues)}`);
    }
    for (const badElem of ["5", null, undefined, {}, true]) {
        assert.throws(() => new SegmentTree([1, badElem, 3]), TypeError, `elem=${String(badElem)}`);
    }
    for (const badOpts of [null, "sum", 123, []]) {
        assert.throws(() => new SegmentTree([1, 2], badOpts), TypeError, `opts=${String(badOpts)}`);
    }
    for (const badModeType of [null, 0, 1, {}, []]) {
        assert.throws(() => new SegmentTree([1, 2], { mode: badModeType }), TypeError);
    }

    assert.throws(() => new SegmentTree([]), RangeError, "empty array");
    assert.throws(() => new SegmentTree(new Array(17).fill(1)), RangeError, "size 17");
    for (const badNum of [1.5, -0.1, NaN, Infinity, -Infinity, -1000, 1000]) {
        assert.throws(() => new SegmentTree([1, badNum]), RangeError, `num=${String(badNum)}`);
    }
    for (const badMode of ["", "max", "gcd", "SUM", "MIN"]) {
        assert.throws(() => new SegmentTree([1, 2], { mode: badMode }), RangeError, `mode=${badMode}`);
    }
});

test("defensive copies prevent external mutation of internal state", () => {
    const input = [2, 5, 1, 4];
    const st = new SegmentTree(input);
    input[0] = 999;
    assert.deepEqual(st.toArray(), [2, 5, 1, 4]);

    const arr = st.toArray();
    arr[1] = -999;
    assert.deepEqual(st.toArray(), [2, 5, 1, 4]);

    const snap = st.snapshot();
    snap.values[2] = 777;
    snap.nodes[0].value = -123;
    snap.nodes.push({ index: 99, lo: 0, hi: 0, value: 0 });
    assert.deepEqual(st.toArray(), [2, 5, 1, 4]);
    assert.equal(st.query(0, 3).value, 12);
    assert.equal(st.integrityError(), null);

    const buildInput = [10, 20, 30];
    const bld = st.build(buildInput);
    assert.equal(bld.ok, true);
    buildInput[0] = -999;
    bld.steps[0].snapshot.values[0] = 888;
    bld.steps[0].range[0] = 99;
    assert.deepEqual(st.toArray(), [10, 20, 30]);
    assert.equal(st.query(0, 2).value, 60);
    assert.equal(st.integrityError(), null);
});

/* ---------- 3. Hand-Written Query Overlap Classification (sum & min) ---------- */

test("hand-written query(1, 5) on n=8 hits exact partial, full, and disjoint nodes in both modes", () => {
    const data = [2, 5, 1, 4, 9, 3, 6, 8];

    // Expected traversal for [1..5] on [0..7]:
    //   partial:  [0, 1, 3, 2]
    //   full:     [8, 4, 5]
    //   disjoint: [7, 6]
    //   combine:  [3, 1, 2, 0]
    for (const [mode, expectedAnswer] of [["sum", 22], ["min", 1]]) {
        const st = new SegmentTree(data, { mode });
        const res = st.query(1, 5);
        verifySteps(res, "query", st);

        assert.equal(res.value, expectedAnswer, `${mode} query(1, 5)`);

        const partialNodes = res.steps.filter((s) => s.type === "partial").map((s) => s.node);
        const fullNodes = res.steps.filter((s) => s.type === "full").map((s) => s.node);
        const disjointNodes = res.steps.filter((s) => s.type === "disjoint").map((s) => s.node);
        const combineNodes = res.steps.filter((s) => s.type === "combine").map((s) => s.node);

        assert.deepEqual(partialNodes, [0, 1, 3, 2], `${mode} partial nodes`);
        assert.deepEqual(fullNodes, [8, 4, 5], `${mode} full nodes`);
        assert.deepEqual(disjointNodes, [7, 6], `${mode} disjoint nodes`);
        assert.deepEqual(combineNodes, [3, 1, 2, 0], `${mode} combine nodes`);

        for (const s of res.steps.filter((x) => x.type === "combine")) {
            assert.equal(s.overlap, "partial");
        }

        const done = res.steps.at(-1);
        assert.equal(done.type, "done");
        assert.equal(done.node, null);
        assert.deepEqual(done.range, [1, 5]);
        assert.deepEqual(done.queryRange, [1, 5]);
        assert.equal(done.overlap, null);
        assert.equal(done.value, expectedAnswer);
        assert.equal(done.nodesVisited, 9);
        assert.equal(done.combines, 4);
    }
});

test("hand-written update, build, and setMode step traces", () => {
    const st = new SegmentTree([2, 5, 1, 4, 9, 3, 6, 8], { mode: "sum" });
    const upd = st.update(2, 10);
    verifySteps(upd, "update", st);

    assert.deepEqual(upd.value, { index: 2, oldValue: 1, value: 10, root: 47 });
    assert.deepEqual(upd.steps.filter((s) => s.type === "visit").map((s) => s.node), [0, 1, 4]);
    assert.deepEqual(upd.steps.filter((s) => s.type === "update-leaf").map((s) => s.node), [9]);
    assert.deepEqual(upd.steps.filter((s) => s.type === "recompute").map((s) => s.node), [4, 1, 0]);
    assert.equal(upd.steps.at(-1).nodesVisited, 4);
    assert.equal(upd.steps.at(-1).combines, 3);
    assert.equal(st.query(0, 7).value, 47);
    assert.equal(st.integrityError(), null);

    // Bottom-up build shows leaves filling before ancestors combine.
    const bld = st.build([3, 7, 2]);
    verifySteps(bld, "build", st);
    assert.equal(st.size, 3);
    assert.equal(st.nodeCount, 5);
    assert.equal(bld.steps[0].type, "visit");
    assert.equal(bld.steps[0].snapshot.nodes[0].value, null, "root uncomputed during initial visit");
    assert.equal(bld.steps.at(-1).value, 12);
    assert.equal(st.integrityError(), null);

    // setMode round-trip: sum -> min -> sum.
    const toMin = st.setMode("min");
    verifySteps(toMin, "setMode", st);
    assert.equal(st.mode, "min");
    assert.equal(st.query(0, 2).value, 2);
    assert.equal(st.integrityError(), null);

    const toSum = st.setMode("sum");
    verifySteps(toSum, "setMode", st);
    assert.equal(st.mode, "sum");
    assert.equal(st.query(0, 2).value, 12);
    assert.deepEqual(st.toArray(), [3, 7, 2]);
    assert.equal(st.integrityError(), null);
});

/* ---------- 4. Edge Cases & Invalid Operation Atomicity ---------- */

test("edge cases: n=1, n=16, non-power-of-two sizes, single-element & full-range queries", () => {
    // n = 1
    for (const mode of ["sum", "min"]) {
        const st = new SegmentTree([-999], { mode });
        const q = st.query(0, 0);
        verifySteps(q, "query", st);
        assert.equal(q.value, -999);
        assert.equal(q.steps.at(-1).nodesVisited, 1);
        assert.equal(q.steps.at(-1).combines, 0);

        const u = st.update(0, 999);
        verifySteps(u, "update", st);
        assert.equal(st.query(0, 0).value, 999);
        assert.equal(u.steps.at(-1).nodesVisited, 1);
        assert.equal(u.steps.at(-1).combines, 0);
        assert.equal(st.integrityError(), null);
    }

    // Non-power-of-two sizes + n=16: exhaustively check ALL [l..r] ranges in both modes.
    for (const n of [3, 5, 6, 7, 9, 13, 16]) {
        const vals = Array.from({ length: n }, (_, i) => ((i * 73) % 199) - 100);
        for (const mode of ["sum", "min"]) {
            const st = new SegmentTree(vals, { mode });
            assert.equal(st.integrityError(), null);

            // Full-range query should immediately hit root full overlap (1 node, 0 combines).
            const fullQ = st.query(0, n - 1);
            verifySteps(fullQ, "query", st);
            assert.equal(fullQ.value, refQuery(vals, 0, n - 1, mode));
            assert.equal(fullQ.steps.at(-1).nodesVisited, 1);
            assert.equal(fullQ.steps.at(-1).combines, 0);

            for (let l = 0; l < n; l++) {
                for (let r = l; r < n; r++) {
                    const res = st.query(l, r);
                    assert.equal(res.ok, true);
                    assert.equal(res.value, refQuery(vals, l, r, mode), `n=${n} mode=${mode} [${l}..${r}]`);
                }
            }
        }
    }
});

test("negative values (-999), -0 normalization, and build size changes", () => {
    const st = new SegmentTree([-999, -0, -50, -0], { mode: "sum" });
    assert.equal(st.integrityError(), null);
    for (const v of st.toArray()) assertNotNegZero(v);
    for (const n of st.snapshot().nodes) assertNotNegZero(n.value);

    const qZero = st.query(-0, -0);
    verifySteps(qZero, "query", st);
    assert.equal(qZero.value, -999);

    const uZero = st.update(-0, -0);
    verifySteps(uZero, "update", st);
    assertNotNegZero(st.toArray()[0]);
    assertNotNegZero(st.query(0, 1).value);
    assert.equal(st.query(0, 1).value, 0);

    const m = st.setMode("min");
    verifySteps(m, "setMode", st);
    assert.equal(st.query(0, 3).value, -50);
    assertNotNegZero(st.query(0, 1).value);

    // Build size changes: 4 -> 8 -> 5 -> 16 -> 1
    for (const nextSize of [8, 5, 16, 1]) {
        const arr = Array.from({ length: nextSize }, (_, i) => (i % 2 === 0 ? -0 : -999));
        const res = st.build(arr);
        verifySteps(res, "build", st);
        assert.equal(st.size, nextSize);
        assert.equal(st.nodeCount, 2 * nextSize - 1);
        assert.equal(st.integrityError(), null);
    }
});

test("invalid operations return { ok: false, error, steps: [] } without mutating state", () => {
    const st = new SegmentTree([10, 20, 30, 40], { mode: "sum" });
    const before = st.snapshot();

    const invalidCalls = [
        () => st.query(3, 1),          // l > r
        () => st.query(-1, 2),         // l < 0
        () => st.query(0, 4),          // r >= n
        () => st.query(4, 4),          // l >= n
        () => st.query(0.5, 2),        // float
        () => st.query(0, NaN),        // NaN
        () => st.query("0", 2),        // string
        () => st.query(0, Infinity),   // Infinity
        () => st.update(-1, 5),        // index < 0
        () => st.update(4, 5),         // index >= n
        () => st.update(1.5, 5),       // float index
        () => st.update("1", 5),       // string index
        () => st.update(1, 1000),      // value > 999
        () => st.update(1, -1000),     // value < -999
        () => st.update(1, 3.14),      // float value
        () => st.update(1, NaN),       // NaN value
        () => st.update(1, "5"),       // string value
        () => st.build([]),            // empty
        () => st.build(new Array(17).fill(0)), // too large
        () => st.build("not-array"),   // non-array
        () => st.build([1, 1000]),     // value out of range
        () => st.build([1, -1000]),    // value out of range
        () => st.build([1, NaN]),      // NaN
        () => st.build([1, "2"]),      // string
        () => st.setMode("max"),       // unsupported mode
        () => st.setMode(""),          // empty mode
        () => st.setMode(null),        // non-string mode
        () => st.setMode(123),         // non-string mode
    ];

    for (const call of invalidCalls) {
        const res = call();
        assert.equal(res.ok, false);
        assert.equal(typeof res.error, "string");
        assert.ok(res.error.length > 0);
        assert.deepEqual(res.steps, []);
        assert.deepEqual(st.snapshot(), before, "state unchanged after failed operation");
        assert.equal(st.integrityError(), null);
    }
});

/* ---------- 5. integrityError() Corruption Tests ---------- */

test("integrityError() detects leaf, internal sum/min, range, missing, and stray node corruption", () => {
    // 1. Corrupt leaf value
    let st = new SegmentTree([2, 5, 1, 4], { mode: "sum" });
    st._nodes.get(3).value = 99;
    assert.match(st.integrityError(), /Leaf node 3/);

    // 2. Corrupt internal sum value
    st = new SegmentTree([2, 5, 1, 4], { mode: "sum" });
    st._nodes.get(1).value = 999;
    assert.match(st.integrityError(), /Internal node 1.*sum/);

    // 3. Corrupt internal min value
    st = new SegmentTree([2, 5, 1, 4], { mode: "min" });
    st._nodes.get(0).value = 2;
    assert.match(st.integrityError(), /Internal node 0.*min/);

    // 4. Corrupt node range
    st = new SegmentTree([2, 5, 1, 4], { mode: "sum" });
    st._nodes.get(2).hi = 2;
    assert.match(st.integrityError(), /Node 2 has range/);

    // 5. Stray unreachable node
    st = new SegmentTree([2, 5, 1, 4], { mode: "sum" });
    st._nodes.set(99, { index: 99, lo: 0, hi: 0, value: 0 });
    assert.match(st.integrityError(), /Stray unreachable node.*99/);

    // 6. Missing node
    st = new SegmentTree([2, 5, 1, 4], { mode: "sum" });
    st._nodes.delete(4);
    assert.match(st.integrityError(), /Missing node at index 4/);

    // 7. Corrupt mode
    st = new SegmentTree([2, 5, 1, 4], { mode: "sum" });
    st._mode = "max";
    assert.match(st.integrityError(), /Invalid mode/);
});

/* ---------- 6. Seeded Property Tests (300 sum + 300 min = 600 sequences) ---------- */

for (const initialMode of ["sum", "min"]) {
    test(`300 seeded mulberry32 sequences (${initialMode}) match reference model and step contract`, () => {
        const seedOffset = initialMode === "sum" ? 10000 : 20000;
        let queryCount = 0;
        let updateCount = 0;
        let buildCount = 0;
        let setModeCount = 0;

        for (let seq = 0; seq < 300; seq++) {
            const rand = mulberry32(seedOffset + seq);
            const initSize = randInt(rand, 1, 16);
            let model = Array.from({ length: initSize }, () => randInt(rand, -999, 999));
            let mode = initialMode;

            const st = new SegmentTree(model, { mode });
            assert.equal(st.integrityError(), null);

            for (let op = 0; op < 30; op++) {
                const roll = rand();
                if (roll < 0.5) {
                    // query
                    const a = randInt(rand, 0, model.length - 1);
                    const b = randInt(rand, 0, model.length - 1);
                    const l = Math.min(a, b);
                    const r = Math.max(a, b);

                    const res = st.query(l, r);
                    verifySteps(res, "query", st);
                    assert.equal(res.value, refQuery(model, l, r, mode), `seq=${seq} op=${op} query(${l},${r}) mode=${mode}`);
                    assert.equal(res.steps.at(-1).value, res.value);
                    queryCount++;
                } else if (roll < 0.8) {
                    // update
                    const i = randInt(rand, 0, model.length - 1);
                    const val = randInt(rand, -999, 999);
                    model[i] = val;

                    const res = st.update(i, val);
                    verifySteps(res, "update", st);
                    assert.equal(res.value.index, i);
                    assert.equal(res.value.value, val);
                    assert.equal(res.value.root, refQuery(model, 0, model.length - 1, mode));
                    updateCount++;
                } else if (roll < 0.92) {
                    // build
                    const nextSize = randInt(rand, 1, 16);
                    model = Array.from({ length: nextSize }, () => randInt(rand, -999, 999));

                    const res = st.build(model);
                    verifySteps(res, "build", st);
                    assert.equal(res.value.size, nextSize);
                    assert.equal(res.value.root, refQuery(model, 0, model.length - 1, mode));
                    buildCount++;
                } else {
                    // setMode (toggle or re-apply)
                    mode = rand() < 0.7 ? (mode === "sum" ? "min" : "sum") : mode;
                    const res = st.setMode(mode);
                    verifySteps(res, "setMode", st);
                    assert.equal(res.value.mode, mode);
                    assert.equal(res.value.root, refQuery(model, 0, model.length - 1, mode));
                    setModeCount++;
                }

                assert.deepEqual(st.toArray(), model);
                assert.equal(st.mode, mode);
                assert.equal(st.nodeCount, 2 * model.length - 1);
                assert.equal(st.integrityError(), null);
            }
        }

        assert.ok(queryCount > 4000, `exercised queries (${queryCount})`);
        assert.ok(updateCount > 2000, `exercised updates (${updateCount})`);
        assert.ok(buildCount > 800, `exercised builds (${buildCount})`);
        assert.ok(setModeCount > 500, `exercised setMode (${setModeCount})`);
    });
}
