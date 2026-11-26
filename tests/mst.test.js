import { test } from "node:test";
import assert from "node:assert/strict";
import { Graph } from "../src/structures/graph.js";
import { MST_INFO, MST_KINDS, kruskal, prim, traceMst, parseMstStart, compareEdges } from "../src/algorithms/mst.js";

/* ---------- seeded randomness ---------- */

function mulberry32(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Random undirected graph, 1..maxN vertices from ids 0..11 (not always contiguous). */
function randomGraph(rand, round, maxN = 12) {
    const weighted = round % 2 === 1;
    const n = 1 + Math.floor(rand() * maxN);
    const pool = Array.from({ length: 12 }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const vertices = pool.slice(0, n);
    const density = [0, 0.1, 0.2, 0.35, 0.5, 0.8][Math.floor(rand() * 6)];
    // Small weight range on some rounds forces many ties.
    const wMax = round % 4 === 1 ? 3 : 99;
    const edges = [];
    for (const u of vertices) {
        for (const v of vertices) {
            if (u >= v) continue;
            if (rand() < density) {
                edges.push(weighted ? { from: u, to: v, weight: 1 + Math.floor(rand() * wMax) } : { from: u, to: v });
            }
        }
    }
    const res = Graph.from({ directed: false, weighted, vertices, edges });
    assert.ok(res.ok, res.error);
    return res.value;
}

const build = (cfg) => {
    const r = Graph.from(cfg);
    assert.ok(r.ok, r.error);
    return r.value;
};

/* ---------- independent references ---------- */

/** Connected components by flood fill over snapshot edges: vertex -> component label. */
function refComponents(snap) {
    const adj = new Map(snap.vertices.map((v) => [v, []]));
    for (const e of snap.edges) {
        adj.get(e.from).push(e.to);
        adj.get(e.to).push(e.from);
    }
    const comp = new Map();
    let c = 0;
    for (const s of snap.vertices) {
        if (comp.has(s)) continue;
        const stack = [s];
        comp.set(s, c);
        while (stack.length) {
            const u = stack.pop();
            for (const v of adj.get(u)) if (!comp.has(v)) { comp.set(v, c); stack.push(v); }
        }
        c++;
    }
    return { comp, count: c };
}

/** True when the edge set has no cycle (simple array-based union-find, no ranks). */
function isAcyclic(vertices, edges) {
    const p = new Map(vertices.map((v) => [v, v]));
    const f = (x) => (p.get(x) === x ? x : f(p.get(x)));
    for (const e of edges) {
        const a = f(e.from), b = f(e.to);
        if (a === b) return false;
        p.set(a, b);
    }
    return true;
}

/** Brute force: try every subset of exactly V − components edges; min weight acyclic one. */
function bruteForceForestWeight(snap) {
    const { count } = refComponents(snap);
    const k = snap.vertices.length - count;
    const E = snap.edges;
    let best = Infinity;
    const pick = [];
    const rec = (i, w) => {
        if (w >= best) return;
        if (pick.length === k) {
            if (isAcyclic(snap.vertices, pick)) best = w;
            return;
        }
        if (E.length - i < k - pick.length) return;
        pick.push(E[i]);
        rec(i + 1, w + E[i].weight);
        pick.pop();
        rec(i + 1, w);
    };
    rec(0, 0);
    return best;
}

/** O(V²) array Prim per component (written independently of the module's heap Prim). */
function refForestWeight(snap) {
    const W = new Map();
    for (const e of snap.edges) {
        W.set(`${e.from},${e.to}`, e.weight);
        W.set(`${e.to},${e.from}`, e.weight);
    }
    const done = new Set();
    let total = 0;
    for (const s of snap.vertices) {
        if (done.has(s)) continue;
        const dist = new Map([[s, 0]]);
        for (;;) {
            let u = null;
            for (const [v, d] of dist) if (!done.has(v) && (u === null || d < dist.get(u))) u = v;
            if (u === null) break;
            done.add(u);
            total += dist.get(u);
            for (const v of snap.vertices) {
                const w = W.get(`${u},${v}`);
                if (w !== undefined && !done.has(v) && (!dist.has(v) || w < dist.get(v))) dist.set(v, w);
            }
        }
    }
    return total;
}

/* ---------- structural checkers ---------- */

function checkTreeEdgesExist(snap, treeEdges) {
    const key = new Map(snap.edges.map((e) => [`${e.from},${e.to}`, e.weight]));
    for (const e of treeEdges) {
        const k = e.from < e.to ? `${e.from},${e.to}` : `${e.to},${e.from}`;
        assert.ok(key.has(k), `tree edge ${e.from}-${e.to} not in graph`);
        assert.equal(key.get(k), e.weight);
    }
}

function checkLines(kind, steps) {
    const n = MST_INFO[kind].pseudocode.length;
    for (const s of steps) {
        assert.ok(Number.isInteger(s.line) && s.line >= 1 && s.line <= n, `bad line ${s.line} on ${s.type}`);
        assert.equal(typeof s.message, "string");
        assert.ok(s.message.length > 0);
    }
}

const KRUSKAL_TYPES = new Set(["start", "sort", "make-set", "consider", "find", "accept", "reject", "stop-early", "done"]);
const PRIM_TYPES = new Set(["start", "add-vertex", "push", "update", "keep", "pop", "skip", "accept", "done"]);

/** Kruskal step invariants, replayed with an independent union-find. */
function checkKruskalSteps(snap, res) {
    const steps = res.steps;
    checkLines("kruskal", steps);
    assert.equal(steps[0].type, "start");
    assert.equal(steps.at(-1).type, "done");
    const p = new Map(snap.vertices.map((v) => [v, v]));
    const f = (x) => (p.get(x) === x ? x : f(p.get(x)));
    let total = 0;
    let lastConsidered = null;
    for (const s of steps) {
        assert.ok(KRUSKAL_TYPES.has(s.type), s.type);
        // DSU snapshot covers exactly the graph vertices.
        assert.deepEqual(Object.keys(s.dsu.parent).map(Number).sort((a, b) => a - b), snap.vertices);
        if (s.type === "consider") {
            if (lastConsidered) assert.ok(compareEdges(lastConsidered, s.edge) < 0, "edges not considered in ascending order");
            lastConsidered = s.edge;
        }
        if (s.type === "accept") {
            const a = f(s.edge.from), b = f(s.edge.to);
            assert.notEqual(a, b, `accepted ${s.edge.from}-${s.edge.to} closes a cycle`);
            p.set(a, b);
            total += s.edge.weight;
            assert.notEqual(s.roots.u, s.roots.v);
        }
        if (s.type === "reject") {
            assert.equal(f(s.edge.from), f(s.edge.to), `rejected ${s.edge.from}-${s.edge.to} joins different components`);
            assert.equal(s.roots.u, s.roots.v);
            assert.match(s.message, /would form a cycle: \d+ and \d+ already connected through root \d+/);
        }
        if (s.type === "find") {
            // Reported roots agree with the DSU snapshot recorded in the same step.
            const root = (x) => { while (s.dsu.parent[x] !== x) x = s.dsu.parent[x]; return x; };
            assert.equal(s.roots.u, root(s.edge.from));
            assert.equal(s.roots.v, root(s.edge.to));
        }
        assert.equal(s.totalWeight, total);
        assert.equal(s.accepted, s.treeEdges.length);
    }
    assert.equal(total, res.value.totalWeight);
}

function checkPrimSteps(snap, res) {
    const steps = res.steps;
    checkLines("prim", steps);
    assert.equal(steps[0].type, "start");
    assert.equal(steps.at(-1).type, "done");
    const inTree = new Set();
    for (const s of steps) {
        assert.ok(PRIM_TYPES.has(s.type), s.type);
        if (s.type === "add-vertex") inTree.add(s.vertex);
        if (s.type === "accept") {
            assert.ok(inTree.has(s.edge.from) && !inTree.has(s.edge.to), "accepted edge must leave the tree");
            // Cut property: no cheaper edge crosses the cut right now.
            for (const e of snap.edges) {
                const cross = inTree.has(e.from) !== inTree.has(e.to);
                if (cross) assert.ok(e.weight >= s.edge.weight, `cheaper crossing edge ${e.from}-${e.to} exists`);
            }
        }
        if (s.type === "skip") assert.ok(inTree.has(s.edge.from) && inTree.has(s.edge.to), "skip needs both ends in tree");
        if (s.type === "pop") {
            for (const h of s.heap) {
                const less = h.weight < s.edge.weight || (h.weight === s.edge.weight && h.vertex < s.edge.to);
                assert.ok(!less, "popped entry was not the minimum");
            }
        }
        assert.deepEqual(s.visited, Array.from(inTree).sort((a, b) => a - b));
        for (const v of s.frontier) assert.ok(!inTree.has(v));
    }
}

/* ---------- registry ---------- */

test("MST_INFO has both algorithms with pseudocode, complexity and summary", () => {
    assert.deepEqual(MST_KINDS, ["kruskal", "prim"]);
    for (const k of MST_KINDS) {
        assert.ok(MST_INFO[k].pseudocode.length > 3);
        assert.ok(MST_INFO[k].complexity.time);
        assert.match(MST_INFO[k].summary, /same total weight/);
    }
    assert.match(MST_INFO.kruskal.complexity.time, /O\(E log E\)/);
    assert.match(MST_INFO.prim.complexity.time, /O\(E log V\)/);
    assert.match(MST_INFO.prim.complexity.time, /O\(V²\)/);
});

/* ---------- hand-written known graph ---------- */

const KNOWN = {
    directed: false,
    weighted: true,
    vertices: [0, 1, 2, 3, 4, 5],
    edges: [
        { from: 0, to: 1, weight: 4 },
        { from: 0, to: 2, weight: 3 },
        { from: 1, to: 2, weight: 1 },
        { from: 1, to: 3, weight: 2 },
        { from: 2, to: 3, weight: 4 },
        { from: 3, to: 4, weight: 2 },
        { from: 4, to: 5, weight: 6 },
        { from: 3, to: 5, weight: 6 },
    ],
};

test("Kruskal on the known graph: exact sort, accept/reject order, early stop", () => {
    const g = build(KNOWN);
    const res = kruskal(g);
    assert.ok(res.ok);
    const e = (a, b, w) => ({ from: a, to: b, weight: w });
    assert.deepEqual(res.value.sortedEdges, [e(1, 2, 1), e(1, 3, 2), e(3, 4, 2), e(0, 2, 3), e(0, 1, 4), e(2, 3, 4), e(3, 5, 6), e(4, 5, 6)]);
    assert.deepEqual(res.value.treeEdges, [e(1, 2, 1), e(1, 3, 2), e(3, 4, 2), e(0, 2, 3), e(3, 5, 6)]);
    assert.equal(res.value.totalWeight, 14);
    assert.equal(res.value.isSpanningTree, true);
    assert.equal(res.value.componentCount, 1);
    const decisions = res.steps.filter((s) => s.type === "accept" || s.type === "reject").map((s) => `${s.type} ${s.edge.from}-${s.edge.to}`);
    assert.deepEqual(decisions, ["accept 1-2", "accept 1-3", "accept 3-4", "accept 0-2", "reject 0-1", "reject 2-3", "accept 3-5"]);
    const stop = res.steps.find((s) => s.type === "stop-early");
    assert.ok(stop);
    assert.equal(stop.cursor, 7);
    assert.deepEqual(res.steps.slice(0, 3).map((s) => s.type), ["start", "sort", "make-set"]);
    const rej = res.steps.find((s) => s.type === "reject");
    assert.match(rej.message, /would form a cycle: 0 and 1 already connected through root \d+/);
    assert.match(res.steps.at(-1).message, /total weight 14/);
    checkKruskalSteps(g.snapshot(), res);
});

test("Prim on the known graph from 0: exact accept order, update, keep and stale skips", () => {
    const g = build(KNOWN);
    const res = prim(g, 0);
    assert.ok(res.ok);
    const acc = res.steps.filter((s) => s.type === "accept").map((s) => `${s.edge.from}-${s.edge.to}`);
    assert.deepEqual(acc, ["0-2", "2-1", "1-3", "3-4", "3-5"]);
    assert.equal(res.value.totalWeight, 14);
    assert.deepEqual(res.value.parent, { 0: null, 2: 0, 1: 2, 3: 1, 4: 3, 5: 3 });
    const types = res.steps.map((s) => s.type);
    assert.equal(types.filter((t) => t === "update").length, 2); // key[1] 4→1, key[3] 4→2
    assert.equal(types.filter((t) => t === "keep").length, 1); // 4–5 (6) vs 3–5 (6)
    const staleSkips = res.steps.filter((s) => s.type === "skip" && s.line === 6).map((s) => s.vertex);
    assert.deepEqual(staleSkips, [1, 3]);
    assert.equal(res.steps.at(-1).pops, 7);
    assert.equal(res.steps.at(-1).pushes, 7);
    checkPrimSteps(g.snapshot(), res);
});

test("Kruskal and Prim agree with the textbook CLRS graph (total 37)", () => {
    // CLRS Figure 23.1 with a..i mapped to 0..8.
    const g = build({
        directed: false, weighted: true, vertices: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        edges: [
            { from: 0, to: 1, weight: 4 }, { from: 0, to: 7, weight: 8 }, { from: 1, to: 2, weight: 8 },
            { from: 1, to: 7, weight: 11 }, { from: 2, to: 3, weight: 7 }, { from: 2, to: 5, weight: 4 },
            { from: 2, to: 8, weight: 2 }, { from: 3, to: 4, weight: 9 }, { from: 3, to: 5, weight: 14 },
            { from: 4, to: 5, weight: 10 }, { from: 5, to: 6, weight: 2 }, { from: 6, to: 7, weight: 1 },
            { from: 6, to: 8, weight: 6 }, { from: 7, to: 8, weight: 7 },
        ],
    });
    assert.equal(kruskal(g).value.totalWeight, 37);
    for (const s of g.vertices()) assert.equal(prim(g, s).value.totalWeight, 37);
});

/* ---------- edge cases ---------- */

test("directed, empty, bad start and unknown kind are refused with readable reasons", () => {
    const d = build({ directed: true, vertices: [0, 1], edges: [{ from: 0, to: 1 }] });
    for (const r of [kruskal(d), prim(d, 0)]) {
        assert.equal(r.ok, false);
        assert.match(r.error, /undirected/);
        assert.deepEqual(r.steps, []);
    }
    const empty = new Graph();
    assert.match(kruskal(empty).error, /empty/);
    assert.match(prim(empty, 0).error, /empty/);
    assert.equal(kruskal({}).ok, false);
    const g = build({ vertices: [0, 1] });
    assert.match(prim(g, 5).error, /not in the graph/);
    assert.match(prim(g, "0").error, /whole number/);
    assert.equal(traceMst("boruvka", g).ok, false);
    assert.equal(parseMstStart("1", g).value, 1);
    assert.equal(parseMstStart("7", g).ok, false);
    assert.equal(parseMstStart("x", g).ok, false);
});

test("single vertex: empty tree, weight 0", () => {
    const g = build({ vertices: [7] });
    const k = kruskal(g);
    assert.equal(k.value.totalWeight, 0);
    assert.equal(k.value.edgeCount, 0);
    assert.equal(k.value.isSpanningTree, true);
    const p = prim(g, 7);
    assert.equal(p.value.totalWeight, 0);
    assert.deepEqual(p.value.covered, [7]);
    assert.deepEqual(p.steps.map((s) => s.type), ["start", "add-vertex", "done"]);
});

test("unweighted graphs count every edge as 1", () => {
    const g = build({ vertices: [0, 1, 2, 3], edges: [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 0, to: 2 }, { from: 2, to: 3 }] });
    assert.equal(kruskal(g).value.totalWeight, 3);
    assert.equal(prim(g, 3).value.totalWeight, 3);
    assert.match(kruskal(g).steps[0].message, /weight 1/);
});

test("disconnected graph: Kruskal builds a forest, Prim covers start's component only", () => {
    const g = build({
        directed: false, weighted: true, vertices: [0, 1, 2, 5, 6, 9],
        edges: [{ from: 0, to: 1, weight: 5 }, { from: 1, to: 2, weight: 3 }, { from: 0, to: 2, weight: 1 }, { from: 5, to: 6, weight: 7 }],
    });
    const k = kruskal(g);
    assert.equal(k.value.isSpanningTree, false);
    assert.equal(k.value.componentCount, 3);
    assert.equal(k.value.edgeCount, 3);
    assert.equal(k.value.totalWeight, 11);
    assert.deepEqual(k.value.components, { 0: 0, 1: 0, 2: 0, 5: 5, 6: 5, 9: 9 });
    assert.match(k.steps.at(-1).message, /FOREST/);
    assert.match(k.steps.at(-1).message, /3 components/);
    assert.equal(k.steps.some((s) => s.type === "stop-early"), false);
    const p = prim(g, 5);
    assert.deepEqual(p.value.covered, [5, 6]);
    assert.deepEqual(p.value.uncovered, [0, 1, 2, 9]);
    assert.equal(p.value.totalWeight, 7);
    assert.equal(p.value.isSpanningTree, false);
    assert.match(p.steps.at(-1).message, /only covers start 5's component/);
});

test("inputs are never mutated", () => {
    const g = build(KNOWN);
    const before = JSON.stringify(g.snapshot());
    kruskal(g);
    prim(g, 3);
    assert.equal(JSON.stringify(g.snapshot()), before);
    assert.equal(g.integrityError(), null);
});

/* ---------- 300 seeded random graphs ---------- */

test("300 seeded random graphs: Kruskal and Prim match references and invariants", () => {
    const rand = mulberry32(0xC27);
    let brute = 0, disconnected = 0, ties = 0;
    for (let round = 0; round < 300; round++) {
        const g = randomGraph(rand, round, round < 150 ? 7 : 12);
        const snap = g.snapshot();
        const { comp, count } = refComponents(snap);
        const V = snap.vertices.length;
        if (count > 1) disconnected++;

        let expected = refForestWeight(snap);
        if (V <= 7 && snap.edges.length <= 21) {
            const bf = bruteForceForestWeight(snap);
            assert.equal(bf, expected, `reference disagreement round ${round}`);
            expected = bf;
            brute++;
        }
        if (new Set(snap.edges.map((e) => e.weight)).size < snap.edges.length) ties++;

        const k = kruskal(g);
        assert.ok(k.ok, k.error);
        assert.equal(k.value.totalWeight, expected, `kruskal total round ${round}`);
        assert.equal(k.value.edgeCount, V - count, `kruskal edge count round ${round}`);
        assert.equal(k.value.componentCount, count);
        assert.ok(isAcyclic(snap.vertices, k.value.treeEdges), `kruskal cycle round ${round}`);
        checkTreeEdgesExist(snap, k.value.treeEdges);
        for (const e of k.value.treeEdges) assert.equal(comp.get(e.from), comp.get(e.to));
        for (const v of snap.vertices) for (const w of snap.vertices) {
            assert.equal(k.value.components[v] === k.value.components[w], comp.get(v) === comp.get(w));
        }
        checkKruskalSteps(snap, k);

        const start = snap.vertices[Math.floor(rand() * V)];
        const p = prim(g, start);
        assert.ok(p.ok, p.error);
        const compOf = snap.vertices.filter((v) => comp.get(v) === comp.get(start));
        assert.deepEqual(p.value.covered, compOf, `prim coverage round ${round}`);
        assert.equal(p.value.edgeCount, compOf.length - 1);
        assert.ok(isAcyclic(snap.vertices, p.value.treeEdges));
        checkTreeEdgesExist(snap, p.value.treeEdges);
        const sub = { vertices: compOf, edges: snap.edges.filter((e) => comp.get(e.from) === comp.get(start)) };
        assert.equal(p.value.totalWeight, refForestWeight(sub), `prim total round ${round}`);
        if (count === 1) assert.equal(p.value.totalWeight, k.value.totalWeight);
        checkPrimSteps(snap, p);

        // Determinism: same graph, same steps.
        assert.deepEqual(kruskal(g).steps, k.steps);
        assert.deepEqual(prim(g, start).steps, p.steps);
    }
    assert.ok(brute >= 100, `only ${brute} brute-force checks`);
    assert.ok(disconnected >= 50, `only ${disconnected} disconnected graphs`);
    assert.ok(ties >= 50, `only ${ties} graphs with tied weights`);
});
