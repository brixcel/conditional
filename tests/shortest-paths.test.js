import { test } from "node:test";
import assert from "node:assert/strict";
import { Graph } from "../src/structures/graph.js";
import {
    SHORTEST_PATHS_INFO,
    TOPO_INFO,
    SHORTEST_PATH_KINDS,
    TOPO_METHODS,
    dijkstra,
    dijkstraEdges,
    bellmanFord,
    bellmanFordEdges,
    traceShortestPath,
    topologicalSort,
} from "../src/algorithms/shortest-paths.js";

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

function pickVertices(rand, n) {
    const pool = Array.from({ length: 12 }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
}

/** Random Graph with 1..12 vertices (IDs 0..11, not always contiguous), weights 1..99. */
function randomGraph(rand, mode) {
    const n = 1 + Math.floor(rand() * 12);
    const vertices = pickVertices(rand, n);
    const density = [0, 0.08, 0.15, 0.25, 0.4, 0.6][Math.floor(rand() * 6)];
    // Small weight range sometimes, so equal-length paths (ties) are common.
    const maxW = rand() < 0.5 ? 3 : 99;
    const edges = [];
    for (const u of vertices) {
        for (const v of vertices) {
            if (u === v || (!mode.directed && u > v)) continue;
            if (rand() < density) {
                edges.push(mode.weighted ? { from: u, to: v, weight: 1 + Math.floor(rand() * maxW) } : { from: u, to: v });
            }
        }
    }
    const res = Graph.from({ ...mode, vertices, edges });
    assert.ok(res.ok, res.error);
    return res.value;
}

/* ---------- independent references ---------- */

/** Directed arcs from a Graph's edges() (undirected edges both ways). */
function arcsOf(g) {
    const arcs = [];
    for (const { from, to, weight } of g.edges()) {
        arcs.push({ from, to, weight });
        if (!g.directed) arcs.push({ from: to, to: from, weight });
    }
    return arcs;
}

/** Floyd-Warshall all-pairs distances. Map<i, Map<j, number>>; Infinity = unreachable. */
function floydWarshall(vertices, arcs) {
    const d = new Map(vertices.map((i) => [i, new Map(vertices.map((j) => [j, i === j ? 0 : Infinity]))]));
    for (const { from, to, weight } of arcs) {
        if (weight < d.get(from).get(to)) d.get(from).set(to, weight);
    }
    for (const k of vertices) {
        for (const i of vertices) {
            const ik = d.get(i).get(k);
            if (ik === Infinity) continue;
            for (const j of vertices) {
                const kj = d.get(k).get(j);
                if (kj === Infinity) continue;
                if (ik + kj < d.get(i).get(j)) d.get(i).set(j, ik + kj);
            }
        }
    }
    return d;
}

/** Negative cycle reachable from s, per Floyd-Warshall: some i with d[i][i] < 0 and d[s][i] < ∞. */
function refNegCycleReachable(vertices, arcs, s) {
    const d = floydWarshall(vertices, arcs);
    return vertices.some((i) => d.get(i).get(i) < 0 && d.get(s).get(i) < Infinity);
}

/** Checks dist[] against the reference and that parent pointers form shortest paths back to s. */
function assertShortestPathTree(vertices, arcs, s, value, ref, ctx) {
    const w = new Map(arcs.map((a) => [`${a.from}->${a.to}`, a.weight]));
    for (const v of vertices) {
        assert.equal(value.dist[v], ref.get(s).get(v), `${ctx}: dist[${v}]`);
    }
    assert.equal(value.parent[s], null, `${ctx}: source has no parent`);
    for (const v of vertices) {
        if (v === s) continue;
        const p = value.parent[v];
        if (value.dist[v] === Infinity) {
            assert.equal(p, null, `${ctx}: unreachable ${v} has no parent`);
            continue;
        }
        assert.notEqual(p, null, `${ctx}: reachable ${v} needs a parent`);
        assert.ok(w.has(`${p}->${v}`), `${ctx}: parent edge ${p}->${v} exists`);
        assert.equal(value.dist[p] + w.get(`${p}->${v}`), value.dist[v], `${ctx}: parent edge into ${v} is tight`);
        // Walking parents reaches s within V steps, summing exactly dist[v].
        let x = v;
        let total = 0;
        for (let i = 0; i < vertices.length && x !== s; i++) {
            total += w.get(`${value.parent[x]}->${x}`);
            x = value.parent[x];
        }
        assert.equal(x, s, `${ctx}: parent chain from ${v} reaches the source`);
        assert.equal(total, value.dist[v], `${ctx}: parent path weight for ${v}`);
    }
    const tree = value.treeEdges.map((e) => `${e.from}->${e.to}`).sort();
    const expectTree = vertices.filter((v) => value.parent[v] !== null).map((v) => `${value.parent[v]}->${v}`).sort();
    assert.deepEqual(tree, expectTree, `${ctx}: treeEdges match parent`);
}

/** Reference pass count for early-exit Bellman-Ford over arcs in ascending (from, to) order. */
function refBellmanFordPasses(vertices, arcs, s) {
    const order = arcs.slice().sort((a, b) => a.from - b.from || a.to - b.to);
    const dist = new Map(vertices.map((v) => [v, v === s ? 0 : Infinity]));
    for (let pass = 1; pass <= vertices.length - 1; pass++) {
        let changed = false;
        for (const { from, to, weight } of order) {
            if (dist.get(from) !== Infinity && dist.get(from) + weight < dist.get(to)) {
                dist.set(to, dist.get(from) + weight);
                changed = true;
            }
        }
        if (!changed) return { passes: pass, earlyExit: true };
    }
    return { passes: vertices.length - 1, earlyExit: false };
}

function assertLines(steps, code, ctx) {
    for (const s of steps) {
        assert.ok(Number.isInteger(s.line) && s.line >= 1 && s.line <= code.length, `${ctx}: line ${s.line} for ${s.type}`);
        assert.equal(typeof s.message, "string");
        assert.ok(s.message.length > 0 && !/undefined|NaN|\[object/.test(s.message), `${ctx}: message "${s.message}"`);
    }
}

/** Step-level invariants shared by Dijkstra and Bellman-Ford. */
function assertPathSteps(steps, value, ctx) {
    let prev = null;
    let relaxCount = 0;
    for (const st of steps) {
        if (st.type === "relax") {
            relaxCount++;
            assert.ok(st.newDist < st.oldDist, `${ctx}: relax must strictly improve (${st.oldDist} -> ${st.newDist})`);
            assert.equal(st.dist[st.edge.to], st.newDist, `${ctx}: snapshot recorded after the relax`);
            assert.equal(st.parent[st.edge.to], st.edge.from, `${ctx}: parent updated on relax`);
        }
        if (st.type === "no-improvement") {
            assert.ok(!(st.newDist < st.oldDist), `${ctx}: no-improvement really is no improvement`);
        }
        if (prev) {
            for (const v of Object.keys(st.dist)) {
                assert.ok(st.dist[v] <= prev.dist[v], `${ctx}: distances never increase`);
            }
            assert.ok(st.edgesChecked >= prev.edgesChecked && st.relaxations >= prev.relaxations, `${ctx}: counters monotone`);
        }
        prev = st;
    }
    assert.equal(relaxCount, value.relaxations, `${ctx}: relaxations counter`);
    const last = steps.at(-1);
    assert.equal(last.type, "done");
    assert.deepEqual(last.dist, value.dist, `${ctx}: final step dist`);
    assert.deepEqual(last.parent, value.parent, `${ctx}: final step parent`);
}

/* ---------- topo references ---------- */

function refHasCycle(vertices, arcs) {
    const out = new Map(vertices.map((v) => [v, []]));
    for (const a of arcs) out.get(a.from).push(a.to);
    const color = new Map(vertices.map((v) => [v, 0]));
    const go = (u) => {
        color.set(u, 1);
        for (const v of out.get(u)) {
            if (color.get(v) === 1) return true;
            if (color.get(v) === 0 && go(v)) return true;
        }
        color.set(u, 2);
        return false;
    };
    return vertices.some((v) => color.get(v) === 0 && go(v));
}

/** Lexicographically smallest topological order by brute force (null if cyclic). */
function refKahnSmallest(vertices, arcs) {
    const placed = new Set();
    const order = [];
    while (order.length < vertices.length) {
        const free = vertices
            .filter((v) => !placed.has(v))
            .filter((v) => !arcs.some((a) => a.to === v && !placed.has(a.from)));
        if (free.length === 0) return null;
        const m = Math.min(...free);
        placed.add(m);
        order.push(m);
    }
    return order;
}

function refDfsTopo(vertices, arcs) {
    const out = new Map(vertices.map((v) => [v, []]));
    for (const a of arcs) out.get(a.from).push(a.to);
    for (const l of out.values()) l.sort((a, b) => a - b);
    const seen = new Set();
    const post = [];
    const go = (u) => {
        seen.add(u);
        for (const v of out.get(u)) if (!seen.has(v)) go(v);
        post.push(u);
    };
    for (const v of [...vertices].sort((a, b) => a - b)) if (!seen.has(v)) go(v);
    return post.reverse();
}

function assertCycle(cycle, arcs, ctx, { negative = false } = {}) {
    assert.ok(Array.isArray(cycle) && cycle.length >= 1, `${ctx}: cycle listed`);
    assert.equal(new Set(cycle).size, cycle.length, `${ctx}: cycle vertices distinct`);
    const w = new Map(arcs.map((a) => [`${a.from}->${a.to}`, a.weight]));
    let total = 0;
    for (let i = 0; i < cycle.length; i++) {
        const key = `${cycle[i]}->${cycle[(i + 1) % cycle.length]}`;
        assert.ok(w.has(key), `${ctx}: cycle edge ${key} exists`);
        total += w.get(key);
    }
    if (negative) assert.ok(total < 0, `${ctx}: cycle weight ${total} < 0`);
}

/* ---------- 300-graph property tests ---------- */

test("300 seeded random graphs: Dijkstra distances and parents match Floyd-Warshall", () => {
    const rand = mulberry32(2601);
    for (let round = 0; round < 300; round++) {
        const g = randomGraph(rand, MODES[round % 4]);
        const before = JSON.stringify(g.snapshot());
        const vs = g.vertices();
        const s = vs[Math.floor(rand() * vs.length)];
        const ctx = `round ${round} src ${s}`;
        const res = dijkstra(g, s);
        assert.ok(res.ok, res.error);
        const arcs = arcsOf(g);
        assertShortestPathTree(vs, arcs, s, res.value, floydWarshall(vs, arcs), ctx);
        assertPathSteps(res.steps, res.value, ctx);
        assertLines(res.steps, SHORTEST_PATHS_INFO.dijkstra.pseudocode, ctx);

        // Settle order: reachable vertices, each once, by non-decreasing (dist, id).
        const settled = res.value.settledOrder;
        assert.deepEqual([...settled].sort((a, b) => a - b), vs.filter((v) => res.value.dist[v] !== Infinity), ctx);
        for (let i = 1; i < settled.length; i++) {
            const a = res.value.dist[settled[i - 1]];
            const b = res.value.dist[settled[i]];
            assert.ok(a < b || (a === b && settled[i - 1] < settled[i]), `${ctx}: settle order by (dist, id)`);
        }
        // Heap snapshot is in priority order.
        for (const st of res.steps) {
            for (let i = 1; i < st.pq.length; i++) {
                const x = st.pq[i - 1];
                const y = st.pq[i];
                assert.ok(x.dist < y.dist || (x.dist === y.dist && x.vertex < y.vertex), `${ctx}: pq order`);
            }
        }
        assert.equal(JSON.stringify(g.snapshot()), before, `${ctx}: graph not mutated`);
    }
});

test("300 seeded random graphs: Bellman-Ford matches Floyd-Warshall and Dijkstra, with exact early exit", () => {
    const rand = mulberry32(2602);
    let early = 0;
    let full = 0;
    for (let round = 0; round < 300; round++) {
        const g = randomGraph(rand, MODES[round % 4]);
        const vs = g.vertices();
        const s = vs[Math.floor(rand() * vs.length)];
        const ctx = `round ${round} src ${s}`;
        const res = bellmanFord(g, s);
        assert.ok(res.ok, res.error);
        const arcs = arcsOf(g);
        assert.equal(res.value.negativeCycle, false, ctx);
        assertShortestPathTree(vs, arcs, s, res.value, floydWarshall(vs, arcs), ctx);
        assertPathSteps(res.steps, res.value, ctx);
        assertLines(res.steps, SHORTEST_PATHS_INFO.bellmanFord.pseudocode, ctx);

        const d = dijkstra(g, s);
        assert.deepEqual(res.value.dist, d.value.dist, `${ctx}: Dijkstra === Bellman-Ford`);

        const ref = refBellmanFordPasses(vs, arcs, s);
        assert.equal(res.value.passes, ref.passes, `${ctx}: passes`);
        assert.equal(res.value.earlyExit, ref.earlyExit, `${ctx}: early exit`);
        if (ref.earlyExit) early++;
        else full++;
        const passStarts = res.steps.filter((st) => st.type === "pass-start").length;
        assert.equal(passStarts, ref.passes, `${ctx}: pass-start steps`);
        assert.equal(res.steps.some((st) => st.type === "check-start"), !ref.earlyExit, `${ctx}: check pass only without early exit`);
        const arcCount = arcs.length;
        assert.equal(res.value.passes * arcCount + (ref.earlyExit ? 0 : arcCount), res.steps.at(-1).edgesChecked, `${ctx}: edges checked = passes × E (+ check pass)`);
    }
    assert.ok(early > 50 && full > 5, `both exit paths exercised (early ${early}, full ${full})`);
});

test("300 seeded raw edge lists with negative weights: Bellman-Ford detects negative cycles exactly", () => {
    const rand = mulberry32(2603);
    let cycles = 0;
    let clean = 0;
    for (let round = 0; round < 300; round++) {
        const n = 1 + Math.floor(rand() * 7);
        const vertices = pickVertices(rand, n);
        const directed = round % 5 !== 0;
        const edges = [];
        const seen = new Set();
        const density = [0.15, 0.3, 0.5][round % 3];
        for (const u of vertices) {
            for (const v of vertices) {
                if (u === v && (!directed || rand() > 0.05)) continue;
                if (!directed && u > v) continue;
                if (rand() >= density) continue;
                const key = `${u}->${v}`;
                if (seen.has(key)) continue;
                seen.add(key);
                edges.push({ from: u, to: v, weight: Math.floor(rand() * 16) - (round % 2 ? 3 : 6) });
            }
        }
        const raw = { directed, vertices, edges };
        const arcs = [];
        for (const e of edges) {
            arcs.push(e);
            if (!directed) arcs.push({ from: e.to, to: e.from, weight: e.weight });
        }
        const s = vertices[Math.floor(rand() * n)];
        const ctx = `round ${round} src ${s}`;
        const res = bellmanFordEdges(raw, s);
        assert.ok(res.ok, res.error);
        const expect = refNegCycleReachable(vertices, arcs, s);
        assert.equal(res.value.negativeCycle, expect, `${ctx}: negative cycle detected iff reachable`);
        assertLines(res.steps, SHORTEST_PATHS_INFO.bellmanFord.pseudocode, ctx);
        if (expect) {
            cycles++;
            assertCycle(res.value.cycle, arcs, ctx, { negative: true });
            assert.ok(res.steps.some((st) => st.type === "negative-cycle"), ctx);
        } else {
            clean++;
            assert.equal(res.value.cycle, null, ctx);
            assertShortestPathTree([...vertices].sort((a, b) => a - b), arcs, s, res.value, floydWarshall(vertices, arcs), ctx);
            const ref = refBellmanFordPasses(vertices, arcs, s);
            assert.equal(res.value.passes, ref.passes, `${ctx}: passes`);
        }
        const negative = arcs.some((a) => a.weight < 0);
        const dj = dijkstraEdges(raw, s);
        assert.equal(dj.ok, !negative, `${ctx}: Dijkstra refuses exactly when a weight is negative`);
        if (negative) assert.match(dj.error, /negative/);
    }
    assert.ok(cycles > 30 && clean > 30, `both outcomes exercised (cycles ${cycles}, clean ${clean})`);
});

/** Random directed graph: half are DAGs (edges follow a random rank), half are unrestricted. */
function randomDirected(rand, round) {
    const n = 1 + Math.floor(rand() * 12);
    const vertices = pickVertices(rand, n);
    const rank = new Map(pickVertices(rand, 12).map((v, i) => [v, i]));
    const dag = round % 2 === 0;
    const density = [0.05, 0.12, 0.2, 0.35][Math.floor(rand() * 4)];
    const edges = [];
    for (const u of vertices) {
        for (const v of vertices) {
            if (u === v) continue;
            if (dag && rank.get(u) > rank.get(v)) continue;
            if (rand() < density) edges.push({ from: u, to: v });
        }
    }
    const res = Graph.from({ directed: true, weighted: false, vertices, edges });
    assert.ok(res.ok, res.error);
    return res.value;
}

test("300 seeded random directed graphs: topological sorts are valid and detect cycles exactly", () => {
    const rand = mulberry32(2604);
    let cyclic = 0;
    let acyclic = 0;
    for (let round = 0; round < 300; round++) {
        const g = randomDirected(rand, round);
        const vs = g.vertices();
        const arcs = arcsOf(g);
        const hasCycle = refHasCycle(vs, arcs);
        if (hasCycle) cyclic++;
        else acyclic++;
        for (const method of TOPO_METHODS) {
            const ctx = `round ${round} ${method}`;
            const res = topologicalSort(g, method);
            assertLines(res.steps, TOPO_INFO[method].pseudocode, ctx);
            assert.equal(res.ok, !hasCycle, `${ctx}: ok iff acyclic`);
            if (hasCycle) {
                assertCycle(res.cycle, arcs, ctx);
                assert.equal(res.cycle[0], Math.min(...res.cycle), `${ctx}: cycle starts at its smallest vertex`);
                assert.deepEqual(res.steps.at(-1).cycle, res.cycle, ctx);
                continue;
            }
            const { order } = res.value;
            assert.deepEqual([...order].sort((a, b) => a - b), vs, `${ctx}: permutation`);
            const pos = new Map(order.map((v, i) => [v, i]));
            for (const a of arcs) assert.ok(pos.get(a.from) < pos.get(a.to), `${ctx}: edge ${a.from}->${a.to} forward`);
            assert.deepEqual(res.steps.at(-1).order, order, ctx);
            if (method === "kahn") {
                assert.deepEqual(order, refKahnSmallest(vs, arcs), `${ctx}: smallest-first Kahn order`);
            } else {
                assert.deepEqual(order, refDfsTopo(vs, arcs), `${ctx}: reversed DFS post-order`);
            }
            assert.equal(res.steps.at(-1).edgesChecked, arcs.length, `${ctx}: every edge examined once`);
        }
    }
    assert.ok(cyclic > 30 && acyclic > 150, `cyclic ${cyclic}, acyclic ${acyclic}`);
});

/* ---------- hand-checked examples ---------- */

function sample(directed, weighted) {
    const edges = [
        { from: 0, to: 1, weight: 4 }, { from: 0, to: 2, weight: 2 }, { from: 1, to: 2, weight: 5 },
        { from: 1, to: 3, weight: 10 }, { from: 2, to: 4, weight: 3 }, { from: 3, to: 4, weight: 4 },
        { from: 3, to: 5, weight: 11 },
    ].map((e) => (weighted ? e : { from: e.from, to: e.to }));
    return Graph.from({ directed, weighted, vertices: [0, 1, 2, 3, 4, 5], edges }).value;
}

test("Dijkstra on the page sample: exact distances, parents, settle order", () => {
    const res = dijkstra(sample(false, true), 0);
    assert.deepEqual(res.value.dist, { 0: 0, 1: 4, 2: 2, 3: 9, 4: 5, 5: 20 });
    assert.deepEqual(res.value.parent, { 0: null, 1: 0, 2: 0, 3: 4, 4: 2, 5: 3 });
    assert.deepEqual(res.value.settledOrder, [0, 2, 1, 4, 3, 5]);
    const types = res.steps.slice(0, 7).map((s) => s.type);
    assert.deepEqual(types, ["start", "init", "push", "extract-min", "settle", "relax", "relax"]);
    const r = res.steps[5];
    assert.equal(r.oldDist, Infinity);
    assert.equal(r.newDist, 4);
    assert.match(r.message, /∞ → 4/);
    // Relaxing 3 via 4 improves 14 -> 9 and leaves a stale (14, 3) entry that is later skipped.
    const imp = res.steps.find((s) => s.type === "relax" && s.edge.to === 3 && s.oldDist === 14);
    assert.ok(imp && imp.newDist === 9);
    assert.ok(imp.pq.some((e) => e.vertex === 3 && e.dist === 14 && e.stale));
    assert.ok(res.steps.some((s) => s.type === "skip-stale" && s.vertex === 3));
});

test("Dijkstra on an unweighted graph uses weight 1 and breaks ties by smaller vertex", () => {
    // Square 0-1, 0-2, 1-3, 2-3: two equal paths to 3; parent stays with the first (via 1).
    const g = Graph.from({ directed: false, weighted: false, vertices: [0, 1, 2, 3],
        edges: [{ from: 0, to: 1 }, { from: 0, to: 2 }, { from: 1, to: 3 }, { from: 2, to: 3 }] }).value;
    const res = dijkstra(g, 0);
    assert.deepEqual(res.value.dist, { 0: 0, 1: 1, 2: 1, 3: 2 });
    assert.equal(res.value.parent[3], 1, "strict < keeps the first equal-length path");
    assert.deepEqual(res.value.settledOrder, [0, 1, 2, 3]);
    const tie = res.steps.find((s) => s.type === "no-improvement" && s.edge.from === 2 && s.edge.to === 3);
    assert.ok(tie, "2 -> 3 is checked and gives no improvement (2 is not less than 2)");
    const bf = bellmanFord(g, 0);
    assert.equal(bf.value.parent[3], 1);
});

test("Dijkstra / Bellman-Ford on a directed graph: unreachable vertices stay at ∞", () => {
    const g = sample(true, true);
    for (const kind of SHORTEST_PATH_KINDS) {
        const res = traceShortestPath(kind, g, 3);
        assert.ok(res.ok);
        assert.deepEqual(res.value.dist, { 0: Infinity, 1: Infinity, 2: Infinity, 3: 0, 4: 4, 5: 11 });
        assert.equal(res.value.parent[0], null);
        assert.match(res.steps.at(-1).message, /Not reachable from 3 \(dist ∞\): 0, 1, 2/);
    }
});

test("Bellman-Ford needs all V − 1 passes on a reversed chain, then the check pass passes", () => {
    // Arcs run 1->0, 2->1, ... in ascending order, so each pass only extends the path by one edge.
    const vertices = [0, 1, 2, 3, 4, 5];
    const edges = [1, 2, 3, 4, 5].map((v) => ({ from: v, to: v - 1, weight: 1 }));
    const g = Graph.from({ directed: true, weighted: true, vertices, edges }).value;
    const res = bellmanFord(g, 5);
    assert.equal(res.value.negativeCycle, false);
    assert.equal(res.value.passes, 5);
    assert.equal(res.value.earlyExit, false);
    assert.deepEqual(res.value.dist, { 0: 5, 1: 4, 2: 3, 3: 2, 4: 1, 5: 0 });
    assert.ok(res.steps.some((s) => s.type === "check-start"));
    assert.ok(!res.steps.some((s) => s.type === "negative-cycle"));
    // Forward chain: everything is found in pass 1, pass 2 changes nothing.
    const fwd = Graph.from({ directed: true, weighted: true, vertices,
        edges: [0, 1, 2, 3, 4].map((v) => ({ from: v, to: v + 1, weight: 2 })) }).value;
    const f = bellmanFord(fwd, 0);
    assert.equal(f.value.passes, 2);
    assert.equal(f.value.earlyExit, true);
    assert.ok(f.steps.some((s) => s.type === "early-exit" && /Pass 2 changed nothing/.test(s.message)));
});

test("Bellman-Ford with negative edges but no negative cycle", () => {
    const raw = { directed: true, vertices: [0, 1, 2, 3],
        edges: [{ from: 0, to: 1, weight: 4 }, { from: 0, to: 2, weight: 5 }, { from: 2, to: 1, weight: -3 }, { from: 1, to: 3, weight: 2 }] };
    const res = bellmanFordEdges(raw, 0);
    assert.equal(res.value.negativeCycle, false);
    assert.deepEqual(res.value.dist, { 0: 0, 1: 2, 2: 5, 3: 4 });
    assert.equal(res.value.parent[1], 2);
    const dj = dijkstraEdges(raw, 0);
    assert.equal(dj.ok, false);
    assert.match(dj.error, /2 → 1 has weight -3/);
});

test("Bellman-Ford finds a hand-built negative cycle and lists it", () => {
    const raw = { directed: true, vertices: [0, 1, 2, 3, 4],
        edges: [{ from: 0, to: 1, weight: 1 }, { from: 1, to: 2, weight: 2 }, { from: 2, to: 3, weight: -4 },
            { from: 3, to: 1, weight: 1 }, { from: 3, to: 4, weight: 1 }] };
    const res = bellmanFordEdges(raw, 0);
    assert.equal(res.value.negativeCycle, true);
    assert.deepEqual(res.value.cycle, [1, 2, 3]);
    assert.match(res.steps.at(-2).message, /1 → 2 → 3 → 1 with total weight -1/);
    assert.match(res.steps.at(-1).message, /negative cycle found/);
    // Not reachable from 4: no cycle reported.
    const from4 = bellmanFordEdges(raw, 4);
    assert.equal(from4.value.negativeCycle, false);
    // Negative self-loop and a negative undirected edge are cycles too.
    assert.deepEqual(bellmanFordEdges({ directed: true, vertices: [0, 1], edges: [{ from: 0, to: 1, weight: 2 }, { from: 1, to: 1, weight: -1 }] }, 0).value.cycle, [1]);
    assert.deepEqual(bellmanFordEdges({ directed: false, vertices: [0, 1], edges: [{ from: 0, to: 1, weight: -2 }] }, 0).value.cycle, [0, 1]);
});

test("Kahn and DFS topological sort on a known DAG", () => {
    // 5->2, 5->0, 4->0, 4->1, 2->3, 3->1 (CLRS-style example)
    const g = Graph.from({ directed: true, weighted: false, vertices: [0, 1, 2, 3, 4, 5],
        edges: [[5, 2], [5, 0], [4, 0], [4, 1], [2, 3], [3, 1]].map(([from, to]) => ({ from, to })) }).value;
    const k = topologicalSort(g, "kahn");
    assert.deepEqual(k.value.order, [4, 5, 0, 2, 3, 1]);
    assert.deepEqual(k.steps[1].inDegree, { 0: 2, 1: 2, 2: 1, 3: 1, 4: 0, 5: 0 });
    assert.deepEqual(k.steps[2].ready, [4, 5]);
    const d = topologicalSort(g, "dfs");
    assert.deepEqual(d.value.order, [5, 4, 2, 3, 1, 0]);
    assert.deepEqual(d.steps.at(-1).postOrder, [0, 1, 3, 2, 4, 5]);
});

test("topological sort reports the cycle and keeps the replay steps", () => {
    const g = Graph.from({ directed: true, weighted: false, vertices: [0, 1, 2, 3, 4],
        edges: [[0, 1], [1, 2], [2, 3], [3, 1], [3, 4]].map(([from, to]) => ({ from, to })) }).value;
    for (const method of TOPO_METHODS) {
        const res = topologicalSort(g, method);
        assert.equal(res.ok, false);
        assert.deepEqual(res.cycle, [1, 2, 3]);
        assert.match(res.error, /1 → 2 → 3 → 1/);
        assert.ok(res.steps.length > 3);
        assert.equal(res.steps.at(-1).type, method === "kahn" ? "cycle" : "back-edge");
    }
    // Kahn outputs 0 first before getting stuck.
    assert.deepEqual(topologicalSort(g, "kahn").steps.at(-1).order, [0]);
});

test("single vertex and edgeless graphs", () => {
    const one = Graph.from({ directed: true, weighted: true, vertices: [7], edges: [] }).value;
    assert.deepEqual(dijkstra(one, 7).value.dist, { 7: 0 });
    const bf = bellmanFord(one, 7);
    assert.deepEqual(bf.value.dist, { 7: 0 });
    assert.equal(bf.value.passes, 0, "V − 1 = 0 passes");
    assert.deepEqual(topologicalSort(one, "kahn").value.order, [7]);
    assert.deepEqual(topologicalSort(one, "dfs").value.order, [7]);
    const iso = Graph.from({ directed: true, weighted: false, vertices: [3, 1, 2], edges: [] }).value;
    assert.deepEqual(topologicalSort(iso, "kahn").value.order, [1, 2, 3]);
    assert.deepEqual(topologicalSort(iso, "dfs").value.order, [3, 2, 1]);
    assert.equal(bellmanFord(iso, 1).value.passes, 1);
});

test("input validation", () => {
    const empty = new Graph({ directed: true });
    for (const kind of SHORTEST_PATH_KINDS) {
        assert.match(traceShortestPath(kind, empty, 0).error, /empty/);
        assert.match(traceShortestPath(kind, sample(false, true), 9).error, /not in the graph/);
        assert.match(traceShortestPath(kind, sample(false, true), "0").error, /whole number/);
        assert.match(traceShortestPath(kind, { vertices: [0] }, 0).error, /Graph/);
        assert.deepEqual(traceShortestPath(kind, empty, 0).steps, []);
    }
    assert.match(traceShortestPath("floyd", sample(false, true), 0).error, /Unknown/);
    assert.match(topologicalSort(sample(false, false), "kahn").error, /directed graph/);
    assert.match(topologicalSort(empty, "dfs").error, /empty/);
    assert.match(topologicalSort(sample(true, false), "bfs").error, /Unknown/);
    assert.match(bellmanFordEdges({ vertices: [0, 0], edges: [] }, 0).error, /twice/);
    assert.match(bellmanFordEdges({ vertices: [0, 1], edges: [{ from: 0, to: 2, weight: 1 }] }, 0).error, /not listed/);
    assert.match(bellmanFordEdges({ vertices: [0, 1], edges: [{ from: 0, to: 1, weight: NaN }] }, 0).error, /finite/);
    assert.match(bellmanFordEdges({ vertices: [0, 1], edges: [{ from: 0, to: 1, weight: 1 }, { from: 0, to: 1, weight: 2 }] }, 0).error, /twice/);
    assert.match(bellmanFordEdges({ directed: false, vertices: [0], edges: [{ from: 0, to: 0, weight: 1 }] }, 0).error, /self-loop/);
    assert.match(bellmanFordEdges({ vertices: [], edges: [] }, 0).error, /empty/);
});

test("registries: pseudocode, complexity and summaries", () => {
    for (const info of [...Object.values(SHORTEST_PATHS_INFO), ...Object.values(TOPO_INFO)]) {
        assert.ok(info.name && info.short && info.summary && info.pseudocode.length >= 8);
        for (const k of ["time", "timeList", "timeMatrix", "space"]) assert.equal(typeof info.complexity[k], "string");
    }
    assert.match(SHORTEST_PATHS_INFO.dijkstra.complexity.time, /O\(\(V \+ E\) log V\)/);
    assert.equal(SHORTEST_PATHS_INFO.bellmanFord.complexity.time, "O(V · E)");
    assert.equal(TOPO_INFO.kahn.complexity.time, "O(V + E)");
    assert.equal(TOPO_INFO.dfs.complexity.time, "O(V + E)");
    assert.match(SHORTEST_PATHS_INFO.bellmanFord.summary, /1 to 99/);
});
