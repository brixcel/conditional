import { test } from "node:test";
import assert from "node:assert/strict";
import { Graph } from "../src/structures/graph.js";
import {
    GRAPH_TRAVERSAL_INFO,
    TRAVERSAL_KINDS,
    bfs,
    dfsIterative,
    dfsRecursive,
    traverseAll,
    traceTraversal,
    parseStartVertex,
} from "../src/algorithms/graph-traversal.js";

/* ---------- seeded randomness ---------- */

function mulberry32(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const MODES = [
    { directed: false, weighted: false },
    { directed: false, weighted: true },
    { directed: true, weighted: false },
    { directed: true, weighted: true },
];

/** Random graph with 1..12 vertices drawn from IDs 0..11 (not always contiguous). */
function randomGraph(rand, round) {
    const mode = MODES[round % 4];
    const n = 1 + Math.floor(rand() * 12);
    const pool = Array.from({ length: 12 }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const vertices = pool.slice(0, n);
    // Densities from 0 (all isolated) to fairly dense; low densities give disconnected graphs.
    const density = [0, 0.08, 0.15, 0.25, 0.4, 0.6][Math.floor(rand() * 6)];
    const edges = [];
    for (const u of vertices) {
        for (const v of vertices) {
            if (u === v) continue;
            if (!mode.directed && u > v) continue;
            if (rand() < density) {
                edges.push(mode.weighted ? { from: u, to: v, weight: 1 + Math.floor(rand() * 99) } : { from: u, to: v });
            }
        }
    }
    const res = Graph.from({ ...mode, vertices, edges });
    assert.ok(res.ok, res.error);
    return res.value;
}

/* ---------- independent reference implementations (adjacency rebuilt from edges()) ---------- */

function refAdj(g) {
    const adj = new Map(g.vertices().map((v) => [v, []]));
    for (const { from, to } of g.edges()) {
        adj.get(from).push(to);
        if (!g.directed) adj.get(to).push(from);
    }
    for (const list of adj.values()) list.sort((a, b) => a - b);
    return adj;
}

function refBfs(adj, s, seen = new Set()) {
    const order = [];
    const dist = new Map([[s, 0]]);
    const parent = new Map([[s, null]]);
    seen.add(s);
    const q = [s];
    for (let head = 0; head < q.length; head++) {
        const u = q[head];
        order.push(u);
        for (const v of adj.get(u)) {
            if (seen.has(v)) continue;
            seen.add(v);
            dist.set(v, dist.get(u) + 1);
            parent.set(v, u);
            q.push(v);
        }
    }
    return { order, dist, parent };
}

function refDfs(adj, s, seen = new Set()) {
    const order = [];
    const parent = new Map();
    const go = (u, p) => {
        seen.add(u);
        order.push(u);
        parent.set(u, p);
        for (const v of adj.get(u)) if (!seen.has(v)) go(v, u);
    };
    go(s, null);
    return { order, parent };
}

/** Undirected connected components by union-find, labelled 1.. in order of smallest member. */
function refComponents(g) {
    const ids = g.vertices();
    const root = new Map(ids.map((v) => [v, v]));
    const find = (x) => (root.get(x) === x ? x : (root.set(x, find(root.get(x))), root.get(x)));
    for (const { from, to } of g.edges()) root.set(find(from), find(to));
    const label = new Map();
    const out = {};
    for (const v of ids) {
        const r = find(v);
        if (!label.has(r)) label.set(r, label.size + 1);
        out[v] = label.get(r);
    }
    return out;
}

/** Reference forest: restart at smallest unvisited vertex; label each tree. */
function refForest(g, kind) {
    const adj = refAdj(g);
    const seen = new Set();
    const order = [];
    const comp = {};
    let c = 0;
    for (const s of g.vertices()) {
        if (seen.has(s)) continue;
        c++;
        const r = kind === "bfs" ? refBfs(adj, s, seen) : refDfs(adj, s, seen);
        for (const v of r.order) comp[v] = c;
        order.push(...r.order);
    }
    return { order, comp, count: c };
}

const RUN = { bfs, dfsIterative, dfsRecursive };
const TYPES = new Set([
    "start", "enqueue", "dequeue", "push", "pop", "visit", "discover", "skip-visited",
    "dead-end", "enter", "tree-edge", "return", "new-component", "done",
]);

/* ---------- invariant helpers ---------- */

function assertParentTree(g, value, roots, ctx) {
    const { order, parent, treeEdges } = value;
    const visited = new Set(order);
    assert.equal(visited.size, order.length, `${ctx}: a vertex was visited twice`);
    assert.deepEqual(Object.keys(parent).map(Number).sort((a, b) => a - b), [...visited].sort((a, b) => a - b),
        `${ctx}: parent keys must be exactly the visited vertices`);
    for (const v of order) {
        const p = parent[v];
        assert.notEqual(p, -1, `${ctx}: -1 sentinel in parent`);
        if (p === null) {
            assert.ok(roots.has(v), `${ctx}: ${v} has null parent but is not a root`);
            continue;
        }
        assert.ok(visited.has(p), `${ctx}: parent ${p} of ${v} not visited`);
        assert.ok(g.hasEdge(p, v), `${ctx}: parent edge ${p}->${v} not in graph`);
        assert.ok(order.indexOf(p) < order.indexOf(v), `${ctx}: parent ${p} visited after child ${v}`);
        // Walking up must reach a root without cycling.
        let x = v;
        for (let k = 0; k <= order.length && parent[x] !== null; k++) x = parent[x];
        assert.equal(parent[x], null, `${ctx}: parent chain from ${v} does not end at a root`);
    }
    assert.equal(treeEdges.length, order.length - roots.size, `${ctx}: tree edge count`);
    for (const e of treeEdges) {
        assert.equal(parent[e.to], e.from, `${ctx}: tree edge ${e.from}->${e.to} disagrees with parent`);
        assert.equal(e.weight, g.weight(e.from, e.to), `${ctx}: tree edge weight`);
    }
}

function assertStepInvariants(kind, steps, value, listing, ctx) {
    assert.equal(steps[0].type, "start", `${ctx}: first step`);
    assert.equal(steps.at(-1).type, "done", `${ctx}: last step`);
    assert.deepEqual(steps.at(-1).order, value.order, `${ctx}: final order`);
    assert.deepEqual(steps.at(-1).treeEdges, value.treeEdges, `${ctx}: final tree edges`);
    let prev = null;
    let visits = 0, enters = 0, returns = 0;
    for (const s of steps) {
        assert.ok(TYPES.has(s.type), `${ctx}: unknown type ${s.type}`);
        assert.ok(Number.isInteger(s.line) && s.line >= 1 && s.line <= listing.length, `${ctx}: line ${s.line} out of range`);
        assert.equal(typeof s.message, "string");
        assert.ok(s.message.length > 0 && !s.message.includes("undefined") && !s.message.includes("-1"),
            `${ctx}: bad message "${s.message}"`);
        assert.notEqual(s.vertex, -1);
        assert.deepEqual(s.visited, s.visited.slice().sort((a, b) => a - b), `${ctx}: visited not sorted`);
        assert.equal(new Set(s.visited).size, s.visited.length);
        for (const v of s.order) assert.ok(s.visited.includes(v), `${ctx}: ordered vertex ${v} not visited`);
        if (prev) {
            for (const v of prev.visited) assert.ok(s.visited.includes(v), `${ctx}: visited shrank`);
            assert.deepEqual(s.order.slice(0, prev.order.length), prev.order, `${ctx}: order not a prefix-extension`);
            assert.deepEqual(s.treeEdges.slice(0, prev.treeEdges.length), prev.treeEdges, `${ctx}: tree edges rewritten`);
            assert.ok(s.edgesExamined >= prev.edgesExamined, `${ctx}: edgesExamined decreased`);
        }
        if (kind === "bfs") {
            assert.equal(new Set(s.frontier).size, s.frontier.length, `${ctx}: BFS queue holds a duplicate [${s.frontier}]`);
            for (const v of s.frontier) {
                assert.ok(s.visited.includes(v), `${ctx}: queued ${v} not marked visited (BFS marks on enqueue)`);
                assert.ok(!s.order.includes(v), `${ctx}: queued ${v} was already dequeued`);
            }
            if (s.type === "dequeue") visits++;
            assert.deepEqual(s.callStack, []);
        } else if (kind === "dfsIterative") {
            if (s.type === "visit") visits++;
            assert.deepEqual(s.callStack, []);
        } else {
            assert.deepEqual(s.frontier, s.callStack, `${ctx}: recursive frontier is the call stack`);
            assert.equal(s.depth, s.callStack.length);
            for (let i = 0; i + 1 < s.callStack.length; i++) {
                assert.equal(value.parent[s.callStack[i]], s.callStack[i + 1], `${ctx}: call stack is not a tree path`);
            }
            if (s.type === "enter") { visits++; enters++; }
            if (s.type === "return") returns++;
        }
        prev = s;
    }
    assert.equal(visits, value.order.length, `${ctx}: one visit step per visited vertex`);
    if (kind === "dfsRecursive") {
        assert.equal(enters, returns, `${ctx}: enter/return unbalanced`);
        assert.deepEqual(steps.at(-1).callStack, []);
    }
}

/* ---------- property tests ---------- */

test("300 seeded random graphs: single-source traversals match references", () => {
    const rand = mulberry32(23023);
    let disconnected = 0, isolated = 0;
    for (let round = 0; round < 300; round++) {
        const g = randomGraph(rand, round);
        const before = JSON.stringify(g.snapshot());
        const ids = g.vertices();
        const start = ids[Math.floor(rand() * ids.length)];
        const adj = refAdj(g);
        if (refComponents(g)[ids.at(-1)] > 1 || refForest(g, "bfs").count > 1) disconnected++;
        if (ids.some((v) => g.degree(v) === 0)) isolated++;

        const rb = refBfs(adj, start);
        const rd = refDfs(adj, start);
        const results = {};
        for (const kind of TRAVERSAL_KINDS) {
            const ctx = `round ${round} ${kind} ${g.directed ? "dir" : "undir"} start=${start}`;
            const res = RUN[kind](g, start);
            assert.ok(res.ok, `${ctx}: ${res.error}`);
            assert.equal(JSON.stringify(g.snapshot()), before, `${ctx}: graph mutated`);
            assert.equal(JSON.stringify(res.value.graph), before, `${ctx}: value.graph is the snapshot`);
            results[kind] = res;
            const ref = kind === "bfs" ? rb : rd;
            assert.deepEqual(res.value.order, ref.order, `${ctx}: visit order`);
            assert.deepEqual(new Set(res.value.order), new Set(ref.order), `${ctx}: reachable set`);
            assertParentTree(g, res.value, new Set([start]), ctx);
            for (const v of ref.order) assert.equal(res.value.parent[v], ref.parent.get(v), `${ctx}: parent[${v}]`);
            assertStepInvariants(kind, res.steps, res.value, GRAPH_TRAVERSAL_INFO[kind].pseudocode, ctx);
            assert.equal(res.value.components, undefined);
        }
        // BFS: distances match reference and equal the parent-chain length.
        const bv = results.bfs.value;
        for (const v of bv.order) {
            assert.equal(bv.distance[v], rb.dist.get(v), `round ${round}: BFS distance of ${v}`);
            let len = 0;
            for (let x = v; bv.parent[x] !== null; x = bv.parent[x]) len++;
            assert.equal(len, rb.dist.get(v), `round ${round}: BFS parent path of ${v} is not shortest`);
        }
        // Iterative DFS must equal recursive DFS exactly.
        assert.deepEqual(results.dfsIterative.value.order, results.dfsRecursive.value.order, `round ${round}: iter vs rec order`);
        assert.deepEqual(results.dfsIterative.value.parent, results.dfsRecursive.value.parent, `round ${round}: iter vs rec parent`);
        assert.deepEqual(results.dfsIterative.value.treeEdges, results.dfsRecursive.value.treeEdges, `round ${round}: iter vs rec tree edges`);
    }
    assert.ok(disconnected >= 100, `generator should produce many disconnected graphs (got ${disconnected})`);
    assert.ok(isolated >= 60, `generator should produce graphs with isolated vertices (got ${isolated})`);
});

test("300 seeded random graphs: traverseAll covers every vertex with correct component labels", () => {
    const rand = mulberry32(777);
    for (let round = 0; round < 300; round++) {
        const g = randomGraph(rand, round);
        const ids = g.vertices();
        for (const kind of TRAVERSAL_KINDS) {
            const ctx = `round ${round} all-${kind} ${g.directed ? "dir" : "undir"}`;
            const res = traverseAll(g, kind);
            assert.ok(res.ok, `${ctx}: ${res.error}`);
            const { order, components, componentCount } = res.value;
            assert.deepEqual(order.slice().sort((a, b) => a - b), ids, `${ctx}: every vertex exactly once`);
            const forest = refForest(g, kind === "bfs" ? "bfs" : "dfs");
            assert.deepEqual(order, forest.order, `${ctx}: forest order`);
            assert.deepEqual(components, forest.comp, `${ctx}: restart labels`);
            assert.equal(componentCount, forest.count);
            if (!g.directed) assert.deepEqual(components, refComponents(g), `${ctx}: connected components`);
            const roots = new Set(ids.filter((v) => res.value.parent[v] === null));
            assert.equal(roots.size, componentCount, `${ctx}: one root per component`);
            assertParentTree(g, res.value, roots, ctx);
            assertStepInvariants(kind, res.steps, res.value, GRAPH_TRAVERSAL_INFO[kind].pseudocodeAll, ctx);
            const nc = res.steps.filter((s) => s.type === "new-component");
            assert.equal(nc.length, componentCount, `${ctx}: one new-component step per component`);
            nc.forEach((s, i) => {
                assert.equal(s.component, i + 1);
                assert.ok(!s.visited.includes(s.vertex), `${ctx}: restart vertex ${s.vertex} already visited`);
                // Restart vertex is the smallest unvisited one.
                assert.equal(s.vertex, ids.find((v) => !s.visited.includes(v)), `${ctx}: restart not at smallest unvisited`);
            });
        }
    }
});

/* ---------- hand-written known graphs ---------- */

// Undirected:  0-1, 0-2, 1-3, 2-3, 3-4, 2-5, and a separate component 6-7, isolated 9.
function knownGraph(directed = false) {
    return Graph.from({
        directed,
        vertices: [0, 1, 2, 3, 4, 5, 6, 7, 9],
        edges: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [2, 5], [6, 7]].map(([from, to]) => ({ from, to })),
    }).value;
}

test("known undirected graph: exact BFS and DFS orders, parents, distances", () => {
    const g = knownGraph();
    const b = bfs(g, 0).value;
    assert.deepEqual(b.order, [0, 1, 2, 3, 5, 4]);
    assert.deepEqual(b.parent, { 0: null, 1: 0, 2: 0, 3: 1, 5: 2, 4: 3 });
    assert.deepEqual(b.distance, { 0: 0, 1: 1, 2: 1, 3: 2, 5: 2, 4: 3 });
    for (const kind of ["dfsIterative", "dfsRecursive"]) {
        const d = RUN[kind](g, 0).value;
        assert.deepEqual(d.order, [0, 1, 3, 2, 5, 4], kind);
        assert.deepEqual(d.parent, { 0: null, 1: 0, 3: 1, 2: 3, 5: 2, 4: 3 }, kind);
    }
    assert.deepEqual(bfs(g, 3).value.order, [3, 1, 2, 4, 0, 5]);
    assert.deepEqual(dfsRecursive(g, 3).value.order, [3, 1, 0, 2, 5, 4]);
    const all = traverseAll(g, "bfs").value;
    assert.deepEqual(all.order, [0, 1, 2, 3, 5, 4, 6, 7, 9]);
    assert.deepEqual(all.components, { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 9: 3 });
    assert.equal(all.componentCount, 3);
});

test("known directed graph follows out-edges only", () => {
    const g = knownGraph(true);
    assert.deepEqual(bfs(g, 0).value.order, [0, 1, 2, 3, 5, 4]);
    assert.deepEqual(bfs(g, 3).value.order, [3, 4]);
    assert.deepEqual(dfsIterative(g, 2).value.order, [2, 3, 4, 5]);
    assert.deepEqual(dfsRecursive(g, 7).value.order, [7]);
    // Directed restart: 6 -> 7 is one tree; 9 alone.
    const all = traverseAll(g, "dfsRecursive").value;
    assert.deepEqual(all.order, [0, 1, 3, 4, 2, 5, 6, 7, 9]);
    assert.equal(all.componentCount, 3);
    // Starting smaller vertices later: 1 -> 0 edge reaches an earlier tree but is not re-entered.
    const g2 = Graph.from({ directed: true, vertices: [0, 1, 2], edges: [{ from: 1, to: 0 }, { from: 2, to: 1 }] }).value;
    const a2 = traverseAll(g2, "bfs").value;
    assert.deepEqual(a2.order, [0, 1, 2]);
    assert.deepEqual(a2.components, { 0: 1, 1: 2, 2: 3 });
});

test("BFS trace on a triangle: exact step sequence and skip messages", () => {
    const g = Graph.from({ vertices: [0, 1, 2], edges: [{ from: 0, to: 1 }, { from: 0, to: 2 }, { from: 1, to: 2 }] }).value;
    const { steps } = bfs(g, 0);
    assert.deepEqual(steps.map((s) => s.type), [
        "start", "enqueue", "dequeue", "discover", "enqueue", "discover", "enqueue",
        "dequeue", "skip-visited", "skip-visited", "dequeue", "skip-visited", "skip-visited", "done",
    ]);
    assert.deepEqual(steps.map((s) => s.line), [1, 2, 4, 7, 8, 7, 8, 4, 6, 6, 4, 6, 6, 9]);
    assert.deepEqual(steps[6].frontier, [1, 2]);
    assert.match(steps[2].message, /Dequeue 0 from the front of the queue \[0\]/);
    assert.match(steps[9].message, /2 is already visited \(it is already waiting in the queue\), skip/);
    assert.match(steps[11].message, /0 is already visited \(it was already dequeued and visited\), skip/);
});

test("iterative DFS: stack is top-first, stale duplicates are skipped on pop", () => {
    // 0-1, 0-2, 1-2: from 0 push 2 then 1 (top = 1). Visit 1 pushes 2 again -> duplicate.
    const g = Graph.from({ vertices: [0, 1, 2], edges: [{ from: 0, to: 1 }, { from: 0, to: 2 }, { from: 1, to: 2 }] }).value;
    const { steps, value } = dfsIterative(g, 0);
    assert.deepEqual(value.order, [0, 1, 2]);
    const pushes = steps.filter((s) => s.type === "push").map((s) => s.frontier);
    assert.deepEqual(pushes, [[0], [2], [1, 2], [2, 2]]);
    const stale = steps.filter((s) => s.type === "skip-visited" && s.line === 5);
    assert.equal(stale.length, 1);
    assert.equal(stale[0].vertex, 2);
    assert.match(stale[0].message, /stale copy/);
});

test("recursive DFS: enter/return frames on a path", () => {
    const g = Graph.from({ vertices: [0, 1, 2], edges: [{ from: 0, to: 1 }, { from: 1, to: 2 }] }).value;
    const { steps } = dfsRecursive(g, 0);
    const frames = steps.filter((s) => s.type === "enter" || s.type === "return").map((s) => `${s.type}:${s.vertex}:${s.callStack.join("")}`);
    assert.deepEqual(frames, ["enter:0:0", "enter:1:10", "enter:2:210", "return:2:10", "return:1:0", "return:0:"]);
    assert.match(steps.find((s) => s.type === "return" && s.vertex === 2).message, /back to Visit\(1\)/);
});

test("single vertex and isolated start", () => {
    const g = Graph.from({ directed: true, weighted: true, vertices: [5, 8], edges: [{ from: 8, to: 5, weight: 4 }] }).value;
    for (const kind of TRAVERSAL_KINDS) {
        const r = RUN[kind](g, 5);
        assert.ok(r.ok);
        assert.deepEqual(r.value.order, [5]);
        assert.deepEqual(r.value.parent, { 5: null });
        assert.deepEqual(r.value.treeEdges, []);
        assert.match(r.steps.at(-1).message, /Not reachable from 5: 8/);
        const t = RUN[kind](g, 8).value;
        assert.deepEqual(t.treeEdges, [{ from: 8, to: 5, weight: 4 }]);
    }
});

test("errors: empty graph, bad start, unknown kind, non-graph", () => {
    const empty = new Graph();
    for (const kind of TRAVERSAL_KINDS) {
        const r = RUN[kind](empty, 0);
        assert.equal(r.ok, false);
        assert.match(r.error, /graph is empty/);
        assert.deepEqual(r.steps, []);
        assert.equal(traverseAll(empty, kind).ok, false);
    }
    const g = knownGraph();
    for (const bad of [8, 12, -1, 1.5, "0", null, undefined, NaN]) {
        const r = bfs(g, bad);
        assert.equal(r.ok, false, `start ${String(bad)}`);
        assert.match(r.error, /Start vertex/);
        assert.match(r.error, /Choose one of: 0, 1, 2, 3, 4, 5, 6, 7, 9/);
    }
    assert.equal(bfs(g, 0).ok, true, "0 is a valid start (no falsy checks)");
    assert.equal(traverseAll(g, "dfs").ok, false);
    assert.equal(traceTraversal("nope", g, 0).ok, false);
    assert.equal(bfs({ neighbors() { return []; } }, 0).ok, false);
});

test("parseStartVertex validates text against the graph", () => {
    const g = knownGraph();
    assert.deepEqual(parseStartVertex("0", g), { ok: true, value: 0 });
    assert.deepEqual(parseStartVertex(" 9 ", g), { ok: true, value: 9 });
    assert.match(parseStartVertex("", g).error, /required/);
    assert.match(parseStartVertex("abc", g).error, /whole number/);
    assert.match(parseStartVertex("8", g).error, /not in the graph/);
    assert.match(parseStartVertex("12", g).error, /between 0 and 11/);
    assert.match(parseStartVertex("0", new Graph()).error, /empty/);
});

test("traceTraversal dispatches single vs all", () => {
    const g = knownGraph();
    assert.equal(traceTraversal("bfs", g, 6).value.mode, "single");
    assert.deepEqual(traceTraversal("bfs", g, 6).value.order, [6, 7]);
    const all = traceTraversal("dfsIterative", g, 6, { allComponents: true });
    assert.equal(all.value.mode, "all");
    assert.equal(all.value.order.length, 9);
});

test("registry: pseudocode, complexity and done lines are well formed", () => {
    for (const kind of TRAVERSAL_KINDS) {
        const info = GRAPH_TRAVERSAL_INFO[kind];
        assert.ok(info.name && info.summary && info.short && info.frontierName);
        assert.ok(info.pseudocode.length >= 8);
        assert.equal(info.pseudocodeAll.length, info.pseudocode.length + 3);
        assert.deepEqual(info.pseudocodeAll.slice(3), [...info.pseudocode]);
        assert.ok(info.doneLine >= 1 && info.doneLine <= info.pseudocode.length);
        assert.match(info.complexity.timeList, /O\(V \+ E\)/);
        assert.match(info.complexity.timeMatrix, /O\(V²\)/);
        assert.equal(info.complexity.space, "O(V)");
    }
    assert.match(GRAPH_TRAVERSAL_INFO.dfsIterative.pseudocode.join("\n"), /DESCENDING/);
});
