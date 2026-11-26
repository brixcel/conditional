/**
 * Shortest paths (Dijkstra, Bellman-Ford) and topological sort (Kahn, DFS) that record
 * real execution steps. C26, same conventions as graph-traversal.js (C23).
 *
 * Inputs
 * - The page passes a real `Graph` (src/structures/graph.js). It is read once per run and
 *   never mutated. Unweighted graphs store weight 1 on every edge, so Dijkstra and
 *   Bellman-Ford treat them as "every edge costs 1".
 * - The Graph module only allows weights 1..99, so a negative edge (and therefore a negative
 *   cycle) can never come from the page. `dijkstraEdges` / `bellmanFordEdges` accept a raw
 *   edge list `{ directed, vertices, edges: [{ from, to, weight }] }` with any finite weight,
 *   so negative-edge refusal (Dijkstra) and negative-cycle detection (Bellman-Ford) are real
 *   code paths that the tests exercise.
 * - Undirected edges are expanded into two arcs u → v and v → u with the same weight.
 *
 * Determinism
 * - Arcs are always processed in ascending (from, to) order.
 * - Dijkstra uses a BINARY MIN-HEAP with lazy deletion: an improved vertex is pushed again
 *   and the old entry is skipped as "stale" when it is popped. Heap entries are compared by
 *   (distance, vertex id), so equal distances are extracted smallest vertex first.
 * - Relaxation uses a strict `<`: an equally short path never replaces the first one found.
 * - Kahn always removes the SMALLEST ready vertex (in-degree 0), so the order it returns is
 *   the lexicographically smallest topological order.
 * - DFS topological sort starts roots in ascending order and scans out-edges ascending.
 *
 * Distances use `Infinity` for "not reached" (shown as ∞).
 *
 * Results
 *   dijkstra / bellmanFord:
 *     { ok: true, value: { kind, source, dist, parent, treeEdges, settledOrder, graph,
 *                          negativeCycle, cycle, passes, earlyExit, relaxations }, steps }
 *   topologicalSort:
 *     { ok: true, value: { kind, method, order, graph }, steps }
 *     { ok: false, error, cycle: number[], steps }   (cycle: cycle[i] → cycle[i+1] → … → cycle[0])
 *   invalid input: { ok: false, error, steps: [] }
 *
 * Shortest-path step shape:
 * {
 *   type: "start" | "init" | "push" | "extract-min" | "skip-stale" | "settle" | "relax" |
 *         "no-improvement" | "skip-unreached" | "pass-start" | "pass-end" | "early-exit" |
 *         "check-start" | "check-ok" | "negative-cycle" | "done",
 *   vertex, edge: { from, to, weight } | null,
 *   oldDist, newDist,          // relax / no-improvement: dist[v] before, and dist[u] + w
 *   dist: { [id]: number },    // Infinity = not reached yet
 *   parent: { [id]: number | null },
 *   treeEdges: [{ from: parent, to: v, weight }],   // current shortest-path tree
 *   settled: number[],         // Dijkstra: settled vertices in settle order; Bellman-Ford: []
 *   pq: [{ vertex, dist, stale }],  // Dijkstra heap contents in priority order; else []
 *   pass: number | null, changed: number,  // Bellman-Ford pass number and relaxations this pass
 *   edgesChecked, relaxations, // running counters
 *   cycle: number[] | null, line, message
 * }
 *
 * Topological-sort step shape:
 * {
 *   type: "start" | "in-degree" | "ready-init" | "output" | "decrement" | "ready" |
 *         "new-root" | "enter" | "tree-edge" | "skip-done" | "back-edge" | "finish" |
 *         "cycle" | "done",
 *   vertex, edge,
 *   inDegree: { [id]: number } | null,   // Kahn: remaining in-degree
 *   ready: number[],                     // Kahn: ready set, smallest first
 *   status: { [id]: string },            // Kahn: "waiting" | "ready" | "output";
 *                                        // DFS: "unvisited" | "active" | "finished"
 *   callStack: number[],                 // DFS: active Visit frames, top first
 *   postOrder: number[],                 // DFS: finish order
 *   order: number[],                     // topological order built so far
 *   removedEdges: [{ from, to, weight }],// Kahn: arcs already removed
 *   treeEdges: [{ from, to, weight }],   // DFS tree edges
 *   edgesChecked, cycle: number[] | null, line, message
 * }
 */

import { Graph } from "../structures/graph.js";

/* ---------- registries ---------- */

const DIJKSTRA_CODE = [
    "Dijkstra(G, s):",
    "    for each vertex v: dist[v] ← ∞; parent[v] ← none;   dist[s] ← 0",
    "    PQ ← binary min-heap;  push (0, s)",
    "    while PQ is not empty",
    "        (d, u) ← extract-min(PQ)   (tie: smaller vertex)",
    "        if u is already settled: skip (stale entry)",
    "        mark u settled (dist[u] is final)",
    "        for each edge u → v with weight w (ascending v)",
    "            if dist[u] + w < dist[v]",
    "                dist[v] ← dist[u] + w;  parent[v] ← u;  push (dist[v], v)",
    "    return dist, parent",
];

const BELLMAN_FORD_CODE = [
    "Bellman-Ford(G, s):",
    "    for each vertex v: dist[v] ← ∞; parent[v] ← none;   dist[s] ← 0",
    "    for pass ← 1 to V − 1",
    "        changed ← false",
    "        for each edge u → v with weight w (fixed order)",
    "            if dist[u] ≠ ∞ and dist[u] + w < dist[v]",
    "                dist[v] ← dist[u] + w;  parent[v] ← u;  changed ← true",
    "        if not changed: stop early (every distance is final)",
    "    for each edge u → v with weight w (check pass)",
    "        if dist[u] ≠ ∞ and dist[u] + w < dist[v]: negative cycle! relax it; x ← v",
    "    if a negative cycle was found: follow parent V times from x, then around the cycle",
    "    return dist, parent",
];

const KAHN_CODE = [
    "Topo-Kahn(G):",
    "    for each vertex v: in[v] ← number of edges into v",
    "    R ← every vertex with in[v] = 0   (ready set, smallest first)",
    "    while R is not empty",
    "        u ← remove the smallest vertex from R;  append u to order",
    "        for each edge u → v (ascending v)",
    "            in[v] ← in[v] − 1   (remove the edge)",
    "            if in[v] = 0: add v to R",
    "    if |order| < V: the vertices left over contain a cycle",
    "    return order",
];

const TOPO_DFS_CODE = [
    "Topo-DFS(G):",
    "    for each vertex s ascending: if s is unvisited: Visit(s)",
    "Visit(u):",
    "    mark u active (on the call stack)",
    "    for each edge u → v (ascending v)",
    "        if v is active: back edge u → v, so there is a cycle",
    "        if v is unvisited: Visit(v)   (finished v: skip)",
    "    mark u finished;  append u to post-order",
    "    order ← post-order reversed",
];

export const SHORTEST_PATHS_INFO = Object.freeze({
    dijkstra: Object.freeze({
        name: "Dijkstra's algorithm",
        short: "Dijkstra",
        frontierName: "priority queue (binary min-heap)",
        pseudocode: Object.freeze(DIJKSTRA_CODE),
        complexity: Object.freeze({
            time: "O((V + E) log V) with a binary heap",
            timeList: "O((V + E) log V)",
            timeMatrix: "O(V² + E log V)",
            space: "O(V + E)",
            note:
                "This version uses a binary min-heap with lazy deletion, so the heap can hold up to " +
                "E entries (log E ≤ 2 log V). An O(V²) array scan instead of a heap is better on dense graphs.",
        }),
        negativeWeights: false,
        summary:
            "Finds the cheapest path from one source to every vertex when no edge weight is negative. " +
            "It repeatedly takes the unsettled vertex with the smallest known distance from a priority " +
            "queue, marks it final, and relaxes its out-edges. Ties go to the smaller vertex ID.",
    }),
    bellmanFord: Object.freeze({
        name: "Bellman-Ford algorithm",
        short: "Bellman-Ford",
        frontierName: "edge list",
        pseudocode: Object.freeze(BELLMAN_FORD_CODE),
        complexity: Object.freeze({
            time: "O(V · E)",
            timeList: "O(V · E)",
            timeMatrix: "O(V³)",
            space: "O(V)",
            best: "O(E): early exit after a pass that changes nothing (2 passes when edges are already in path order)",
            note: "Early exit stops as soon as a whole pass changes nothing.",
        }),
        negativeWeights: true,
        summary:
            "Relaxes every edge in a fixed order, V − 1 times, which is enough for any shortest path " +
            "(it has at most V − 1 edges). It works with negative edge weights, stops early when a " +
            "pass changes nothing, and a final check pass detects negative cycles. This page only " +
            "allows weights 1 to 99, so a negative cycle cannot be built here; the detection code is " +
            "still real and is tested with hand-built negative edge lists.",
    }),
});

export const TOPO_INFO = Object.freeze({
    kahn: Object.freeze({
        name: "Topological sort (Kahn's algorithm)",
        short: "Topo (Kahn)",
        frontierName: "ready set",
        pseudocode: Object.freeze(KAHN_CODE),
        complexity: Object.freeze({
            time: "O(V + E)",
            timeList: "O(V + E)",
            timeMatrix: "O(V²)",
            space: "O(V)",
            note: "Keeping the ready set sorted adds a log V factor with a heap; with V ≤ 12 a sorted list is used.",
        }),
        summary:
            "Orders the vertices of a directed graph so every edge points forward. Count each vertex's " +
            "incoming edges, then repeatedly output a vertex with none left (the smallest one) and " +
            "remove its out-edges. If vertices remain that never reach in-degree 0, the graph has a cycle.",
    }),
    dfs: Object.freeze({
        name: "Topological sort (DFS post-order)",
        short: "Topo (DFS)",
        frontierName: "call stack",
        pseudocode: Object.freeze(TOPO_DFS_CODE),
        complexity: Object.freeze({
            time: "O(V + E)",
            timeList: "O(V + E)",
            timeMatrix: "O(V²)",
            space: "O(V)",
            note: "Recursion depth is at most V.",
        }),
        summary:
            "Runs depth-first search and records each vertex when it finishes (after everything it " +
            "points to has finished). Reversing that post-order puts every edge forward. Reaching a " +
            "vertex that is still on the call stack is a back edge, which means a cycle.",
    }),
});

export const SHORTEST_PATH_KINDS = Object.freeze(Object.keys(SHORTEST_PATHS_INFO));
export const TOPO_METHODS = Object.freeze(Object.keys(TOPO_INFO));

/* ---------- helpers ---------- */

const fail = (error) => ({ ok: false, error, steps: [] });
const fmt = (d) => (d === Infinity ? "∞" : String(d));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const list = (a) => (a.length ? a.join(", ") : "empty");

/**
 * Network = the read-only view every algorithm uses.
 * { directed, weighted, vertices (ascending), out: Map<id, [{to, weight}] ascending>,
 *   arcs: [{from, to, weight}] ascending (from, to), snap }
 */
function buildNetwork(directed, weighted, vertices, arcs, snap) {
    const out = new Map(vertices.map((v) => [v, []]));
    for (const a of arcs) out.get(a.from).push({ to: a.to, weight: a.weight });
    for (const l of out.values()) l.sort((x, y) => x.to - y.to);
    const sorted = arcs.slice().sort((x, y) => x.from - y.from || x.to - y.to);
    const weight = new Map(sorted.map((a) => [`${a.from}->${a.to}`, a.weight]));
    return { directed, weighted, vertices, out, arcs: sorted, weight, snap };
}

function networkFromGraph(graph) {
    if (!(graph instanceof Graph)) return { error: "This algorithm needs a Graph from src/structures/graph.js." };
    if (graph.isEmpty()) return { error: "The graph is empty. Add at least one vertex first." };
    const snap = graph.snapshot();
    const arcs = [];
    for (const e of graph.edges()) {
        arcs.push({ from: e.from, to: e.to, weight: e.weight });
        if (!graph.directed) arcs.push({ from: e.to, to: e.from, weight: e.weight });
    }
    return { net: buildNetwork(graph.directed, graph.weighted, snap.vertices, arcs, snap) };
}

/**
 * Validate a raw edge list (any finite weights, used for negative-weight tests).
 * Directed self-loops are allowed (a negative self-loop is the smallest negative cycle);
 * duplicate arcs are rejected.
 */
function networkFromRaw(raw) {
    if (raw === null || typeof raw !== "object") return { error: "Expected { directed, vertices, edges }." };
    const { directed = true, vertices, edges = [] } = raw;
    if (typeof directed !== "boolean") return { error: `"directed" must be a boolean.` };
    if (!Array.isArray(vertices) || !Array.isArray(edges)) return { error: `"vertices" and "edges" must be arrays.` };
    if (vertices.length === 0) return { error: "The graph is empty. Add at least one vertex first." };
    const ids = new Set();
    for (const v of vertices) {
        if (typeof v !== "number" || !Number.isInteger(v)) return { error: `Vertex ${String(v)} must be an integer.` };
        if (ids.has(v)) return { error: `Vertex ${v} is listed twice.` };
        ids.add(v);
    }
    const arcs = [];
    const seen = new Set();
    const addArc = (from, to, weight) => {
        const key = `${from}->${to}`;
        if (seen.has(key)) return `Edge ${from} → ${to} appears twice.`;
        seen.add(key);
        arcs.push({ from, to, weight });
        return null;
    };
    for (const [i, e] of edges.entries()) {
        if (e === null || typeof e !== "object") return { error: `Edge at index ${i} must be { from, to, weight }.` };
        const { from, to, weight } = e;
        if (!ids.has(from) || !ids.has(to)) return { error: `Edge at index ${i} uses a vertex that is not listed.` };
        if (typeof weight !== "number" || !Number.isFinite(weight)) {
            return { error: `Edge ${from} → ${to} needs a finite numeric weight.` };
        }
        if (!directed && from === to) return { error: `Undirected self-loop ${from}–${to} is not allowed.` };
        const err = addArc(from, to, weight) ?? (directed ? null : addArc(to, from, weight));
        if (err) return { error: err };
    }
    const sortedIds = [...ids].sort((a, b) => a - b);
    const undirectedEdges = directed ? arcs : arcs.filter((a) => a.from < a.to);
    const snap = {
        directed,
        weighted: true,
        vertices: sortedIds,
        edges: undirectedEdges
            .map((a) => ({ ...a }))
            .sort((x, y) => x.from - y.from || x.to - y.to),
    };
    return { net: buildNetwork(directed, true, sortedIds, arcs, snap) };
}

function checkSource(net, source) {
    const choices = net.vertices.join(", ");
    if (typeof source !== "number" || !Number.isInteger(source)) {
        return `Source vertex must be a whole number (got ${JSON.stringify(source) ?? String(source)}). Choose one of: ${choices}.`;
    }
    if (!net.out.has(source)) return `Source vertex ${source} is not in the graph. Choose one of: ${choices}.`;
    return null;
}

/** Binary min-heap of { d, v } ordered by (d, v). */
class MinHeap {
    constructor() {
        this.a = [];
    }
    get size() {
        return this.a.length;
    }
    static less(x, y) {
        return x.d < y.d || (x.d === y.d && x.v < y.v);
    }
    push(item) {
        const a = this.a;
        a.push(item);
        let i = a.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (!MinHeap.less(a[i], a[p])) break;
            [a[i], a[p]] = [a[p], a[i]];
            i = p;
        }
    }
    pop() {
        const a = this.a;
        const top = a[0];
        const last = a.pop();
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                const r = l + 1;
                let m = i;
                if (l < a.length && MinHeap.less(a[l], a[m])) m = l;
                if (r < a.length && MinHeap.less(a[r], a[m])) m = r;
                if (m === i) break;
                [a[i], a[m]] = [a[m], a[i]];
                i = m;
            }
        }
        return top;
    }
    /** Contents in priority order (for display only). */
    sorted() {
        return this.a.slice().sort((x, y) => (MinHeap.less(x, y) ? -1 : 1));
    }
}

/* ---------- shortest-path tracer ---------- */

class PathTracer {
    constructor(net, kind) {
        this.net = net;
        this.kind = kind;
        this.steps = [];
        this.dist = {};
        this.parent = {};
        for (const v of net.vertices) {
            this.dist[v] = Infinity;
            this.parent[v] = null;
        }
        this.settled = [];
        this.settledSet = new Set();
        this.heap = null;
        this.pass = null;
        this.changed = 0;
        this.edgesChecked = 0;
        this.relaxations = 0;
        this.cycle = null;
    }

    arrow(u, v) {
        return this.net.directed ? `${u} → ${v}` : `${u}–${v}`;
    }

    treeEdges() {
        const out = [];
        for (const v of this.net.vertices) {
            const p = this.parent[v];
            if (p !== null) out.push({ from: p, to: v, weight: this.net.weight.get(`${p}->${v}`) });
        }
        return out;
    }

    pqSnapshot() {
        if (!this.heap) return [];
        return this.heap.sorted().map(({ d, v }) => ({
            vertex: v,
            dist: d,
            stale: this.settledSet.has(v) || d > this.dist[v],
        }));
    }

    /** Record a snapshot AFTER the event has happened. */
    record(type, { vertex = null, edge = null, oldDist = null, newDist = null, line, message }) {
        this.steps.push({
            type,
            vertex,
            edge: edge ? { ...edge } : null,
            oldDist,
            newDist,
            dist: { ...this.dist },
            parent: { ...this.parent },
            treeEdges: this.treeEdges(),
            settled: this.settled.slice(),
            pq: this.pqSnapshot(),
            pass: this.pass,
            changed: this.changed,
            edgesChecked: this.edgesChecked,
            relaxations: this.relaxations,
            cycle: this.cycle ? this.cycle.slice() : null,
            line,
            message,
        });
    }
}

const pqText = (t) => {
    const items = t.pqSnapshot();
    return items.length
        ? items.map((x) => `(${x.dist}, ${x.vertex})${x.stale ? " stale" : ""}`).join(" ")
        : "empty";
};

function describeNet(net) {
    const edgeCount = net.directed ? net.arcs.length : net.arcs.length / 2;
    return (
        `${net.directed ? "a directed" : "an undirected"} ${net.weighted ? "weighted" : "unweighted"} graph with ` +
        `${plural(net.vertices.length, "vertex", "vertices")} and ${plural(edgeCount, "edge", "edges")}`
    );
}

function initStep(t, s) {
    t.dist[s] = 0;
    t.record("init", {
        vertex: s,
        line: 2,
        message:
            `Set every distance to ∞ (not reached) and every parent to none, then set dist[${s}] = 0 ` +
            `because the source costs nothing to reach.`,
    });
}

function runDijkstra(net, s) {
    const t = new PathTracer(net, "dijkstra");
    t.record("start", {
        vertex: s,
        line: 1,
        message:
            `Start Dijkstra from vertex ${s} on ${describeNet(net)}.` +
            (net.weighted ? `` : ` Unweighted: every edge costs 1.`) +
            (net.directed ? ` Only out-edges are followed.` : ` Each edge can be used in both directions.`),
    });
    initStep(t, s);
    t.heap = new MinHeap();
    t.heap.push({ d: 0, v: s });
    t.record("push", {
        vertex: s,
        line: 3,
        message: `Push (0, ${s}) into the min-heap. Entries are (distance, vertex); the smallest distance comes out first.`,
    });

    while (t.heap.size > 0) {
        const before = pqText(t);
        const { d, v: u } = t.heap.pop();
        t.record("extract-min", {
            vertex: u,
            line: 5,
            message: `Extract the minimum (${d}, ${u}) from the heap [${before}].`,
        });
        if (t.settledSet.has(u)) {
            t.record("skip-stale", {
                vertex: u,
                line: 6,
                message:
                    `${u} is already settled with dist[${u}] = ${t.dist[u]}. This (${d}, ${u}) entry is stale ` +
                    `(pushed before a shorter path was found), so skip it.`,
            });
            continue;
        }
        t.settledSet.add(u);
        t.settled.push(u);
        const outs = net.out.get(u);
        t.record("settle", {
            vertex: u,
            line: 7,
            message:
                `Settle ${u}: dist[${u}] = ${t.dist[u]} is now final, because every other vertex still waiting ` +
                `is at least this far away and no edge is negative.` +
                (outs.length === 0 ? ` ${u} has no ${net.directed ? "outgoing edges" : "edges"} to relax.` : ``),
        });
        for (const { to: v, weight: w } of outs) {
            t.edgesChecked++;
            const edge = { from: u, to: v, weight: w };
            const old = t.dist[v];
            const cand = t.dist[u] + w;
            if (cand < old) {
                t.dist[v] = cand;
                t.parent[v] = u;
                t.relaxations++;
                t.heap.push({ d: cand, v });
                t.record("relax", {
                    vertex: v,
                    edge,
                    oldDist: old,
                    newDist: cand,
                    line: 10,
                    message:
                        `Relax ${t.arrow(u, v)} (weight ${w}): dist[${u}] + ${w} = ${cand} < ${fmt(old)}, so ` +
                        `dist[${v}] improves ${fmt(old)} → ${cand} and parent[${v}] = ${u}. Push (${cand}, ${v}).`,
                });
            } else {
                const why = t.settledSet.has(v) ? ` ${v} is already settled.` : ``;
                t.record("no-improvement", {
                    vertex: v,
                    edge,
                    oldDist: old,
                    newDist: cand,
                    line: 9,
                    message:
                        `Check ${t.arrow(u, v)} (weight ${w}): dist[${u}] + ${w} = ${cand} is not less than ` +
                        `dist[${v}] = ${fmt(old)}. No improvement.${why}`,
                });
            }
        }
    }

    const unreached = net.vertices.filter((v) => t.dist[v] === Infinity);
    t.record("done", {
        vertex: null,
        line: 11,
        message:
            `Done. Settle order: ${t.settled.join(", ")}. The parent edges form the shortest-path tree. ` +
            (unreached.length ? `Not reachable from ${s} (dist ∞): ${unreached.join(", ")}.` : `Every vertex was reached.`),
    });
    return t;
}

function runBellmanFord(net, s) {
    const t = new PathTracer(net, "bellmanFord");
    const V = net.vertices.length;
    const passLimit = V - 1;
    t.record("start", {
        vertex: s,
        line: 1,
        message:
            `Start Bellman-Ford from vertex ${s} on ${describeNet(net)}: up to V − 1 = ${V - 1} ` +
            `${V - 1 === 1 ? "pass" : "passes"} over all ${plural(net.arcs.length, "directed edge", "directed edges")} ` +
            `in ascending (from, to) order.` +
            (net.directed ? `` : ` Each undirected edge is tried in both directions.`),
    });
    initStep(t, s);

    let earlyExit = false;
    let passes = 0;
    for (let pass = 1; pass <= passLimit; pass++) {
        t.pass = pass;
        t.changed = 0;
        passes = pass;
        t.record("pass-start", {
            line: 4,
            message: `Pass ${pass} of at most ${V - 1}: set changed = false and try every edge once.`,
        });
        for (const a of net.arcs) {
            const { from: u, to: v, weight: w } = a;
            t.edgesChecked++;
            const old = t.dist[v];
            if (t.dist[u] === Infinity) {
                t.record("skip-unreached", {
                    vertex: v,
                    edge: a,
                    oldDist: old,
                    newDist: Infinity,
                    line: 6,
                    message: `Edge ${t.arrow(u, v)}: dist[${u}] = ∞ (${u} not reached yet), so it cannot improve ${v}.`,
                });
                continue;
            }
            const cand = t.dist[u] + w;
            if (cand < old) {
                t.dist[v] = cand;
                t.parent[v] = u;
                t.relaxations++;
                t.changed++;
                t.record("relax", {
                    vertex: v,
                    edge: a,
                    oldDist: old,
                    newDist: cand,
                    line: 7,
                    message:
                        `Relax ${t.arrow(u, v)} (weight ${w}): ${t.dist[u]} + ${w} = ${cand} < ${fmt(old)}, so ` +
                        `dist[${v}] improves ${fmt(old)} → ${cand} and parent[${v}] = ${u}. changed = true.`,
                });
            } else {
                t.record("no-improvement", {
                    vertex: v,
                    edge: a,
                    oldDist: old,
                    newDist: cand,
                    line: 6,
                    message:
                        `Check ${t.arrow(u, v)} (weight ${w}): ${t.dist[u]} + ${w} = ${cand} is not less than ` +
                        `dist[${v}] = ${fmt(old)}. No improvement.`,
                });
            }
        }
        if (t.changed === 0) {
            earlyExit = true;
            t.record("early-exit", {
                line: 8,
                message:
                    `Pass ${pass} changed nothing, so no later pass can change anything either: stop early. ` +
                    `A full pass with no improvement also proves there is no negative cycle reachable from ${s}.`,
            });
            break;
        }
        t.record("pass-end", {
            line: 8,
            message:
                `Pass ${pass} improved ${plural(t.changed, "distance", "distances")}` +
                (pass < passLimit ? `, so run another pass.` : `. That was the last of the V − 1 passes.`),
        });
    }

    let negativeCycle = false;
    if (!earlyExit) {
        t.pass = null;
        t.changed = 0;
        t.record("check-start", {
            line: 9,
            message:
                `Check pass: try every edge once more. After V − 1 passes every shortest path is final, so ` +
                `any edge that still improves a distance proves a negative cycle.`,
        });
        let x = null;
        for (const a of net.arcs) {
            const { from: u, to: v, weight: w } = a;
            t.edgesChecked++;
            const old = t.dist[v];
            if (t.dist[u] !== Infinity && t.dist[u] + w < old) {
                const cand = t.dist[u] + w;
                t.dist[v] = cand;
                t.parent[v] = u;
                t.changed++;
                x = v;
                negativeCycle = true;
                t.record("negative-cycle", {
                    vertex: v,
                    edge: a,
                    oldDist: old,
                    newDist: cand,
                    line: 10,
                    message:
                        `Edge ${t.arrow(u, v)} (weight ${w}) still improves dist[${v}] from ${fmt(old)} to ${cand}: ` +
                        `a negative cycle is reachable from ${s}. Relax it anyway and remember ${v}.`,
                });
            } else {
                t.record("check-ok", {
                    vertex: v,
                    edge: a,
                    oldDist: old,
                    newDist: t.dist[u] === Infinity ? Infinity : t.dist[u] + w,
                    line: 10,
                    message: `Check ${t.arrow(u, v)}: no improvement, as expected.`,
                });
            }
        }
        if (negativeCycle) {
            // Walking parent pointers V times from the last relaxed vertex lands on the cycle.
            let y = x;
            for (let i = 0; i < V; i++) y = t.parent[y];
            const back = [y];
            for (let z = t.parent[y]; z !== y; z = t.parent[z]) back.push(z);
            back.reverse(); // parent pointers run backwards; reverse to forward edge order
            const k = back.indexOf(Math.min(...back));
            t.cycle = [...back.slice(k), ...back.slice(0, k)];
            const total = t.cycle.reduce(
                (sum, c, i) => sum + net.weight.get(`${c}->${t.cycle[(i + 1) % t.cycle.length]}`),
                0,
            );
            t.record("negative-cycle", {
                vertex: t.cycle[0],
                line: 11,
                message:
                    `Follow parent pointers back from ${x} to land on the cycle: ` +
                    `${[...t.cycle, t.cycle[0]].join(" → ")} with total weight ${total} (< 0). ` +
                    `Going around it again keeps lowering the cost, so shortest paths through it do not exist.`,
            });
        }
    }

    const unreached = net.vertices.filter((v) => t.dist[v] === Infinity);
    t.record("done", {
        vertex: null,
        line: 12,
        message: negativeCycle
            ? `Done: negative cycle found, so the distances shown are not shortest paths.`
            : `Done after ${plural(passes, "pass", "passes")}${earlyExit ? " (early exit)" : ""}. ` +
              `The parent edges form the shortest-path tree. ` +
              (unreached.length ? `Not reachable from ${s} (dist ∞): ${unreached.join(", ")}.` : `Every vertex was reached.`),
    });
    t.passes = passes;
    t.earlyExit = earlyExit;
    t.negativeCycle = negativeCycle;
    return t;
}

function pathResult(t, kind, s) {
    return {
        ok: true,
        value: {
            kind,
            source: s,
            dist: { ...t.dist },
            parent: { ...t.parent },
            treeEdges: t.treeEdges(),
            settledOrder: t.settled.slice(),
            negativeCycle: t.negativeCycle ?? false,
            cycle: t.cycle ? t.cycle.slice() : null,
            passes: t.passes ?? null,
            earlyExit: t.earlyExit ?? null,
            relaxations: t.relaxations,
            graph: t.net.snap,
        },
        steps: t.steps,
    };
}

function dijkstraOn(built, source) {
    if (built.error) return fail(built.error);
    const { net } = built;
    const sErr = checkSource(net, source);
    if (sErr) return fail(sErr);
    const neg = net.arcs.find((a) => a.weight < 0);
    if (neg) {
        return fail(
            `Dijkstra refuses negative edge weights (edge ${neg.from} → ${neg.to} has weight ${neg.weight}): ` +
                `a settled distance could still get shorter later. Use Bellman-Ford instead.`,
        );
    }
    return pathResult(runDijkstra(net, source), "dijkstra", source);
}

function bellmanFordOn(built, source) {
    if (built.error) return fail(built.error);
    const { net } = built;
    const sErr = checkSource(net, source);
    if (sErr) return fail(sErr);
    return pathResult(runBellmanFord(net, source), "bellmanFord", source);
}

/** Dijkstra from `source` on a Graph (binary min-heap, lazy deletion). */
export function dijkstra(graph, source) {
    return dijkstraOn(networkFromGraph(graph), source);
}

/** Dijkstra on a raw edge list; refuses negative weights with ok:false. */
export function dijkstraEdges(raw, source) {
    return dijkstraOn(networkFromRaw(raw), source);
}

/** Bellman-Ford from `source` on a Graph. */
export function bellmanFord(graph, source) {
    return bellmanFordOn(networkFromGraph(graph), source);
}

/**
 * Bellman-Ford on a raw edge list `{ directed = true, vertices, edges: [{ from, to, weight }] }`.
 * Weights may be negative. If a negative cycle is reachable from `source`, the result is still
 * ok:true with `value.negativeCycle === true` and `value.cycle` listing its vertices in edge order.
 */
export function bellmanFordEdges(raw, source) {
    return bellmanFordOn(networkFromRaw(raw), source);
}

/** Page dispatcher. */
export function traceShortestPath(kind, graph, source) {
    if (kind === "dijkstra") return dijkstra(graph, source);
    if (kind === "bellmanFord") return bellmanFord(graph, source);
    return fail(`Unknown shortest-path algorithm "${kind}". Use one of: ${SHORTEST_PATH_KINDS.join(", ")}.`);
}

/* ---------- topological sort ---------- */

class TopoTracer {
    constructor(net, method) {
        this.net = net;
        this.method = method;
        this.steps = [];
        this.inDegree = null;
        this.ready = [];
        this.status = {};
        this.callStack = [];
        this.postOrder = [];
        this.order = [];
        this.removedEdges = [];
        this.treeEdges = [];
        this.edgesChecked = 0;
        this.cycle = null;
    }

    record(type, { vertex = null, edge = null, line, message }) {
        this.steps.push({
            type,
            vertex,
            edge: edge ? { ...edge } : null,
            inDegree: this.inDegree ? { ...this.inDegree } : null,
            ready: this.ready.slice(),
            status: { ...this.status },
            callStack: this.callStack.slice(),
            postOrder: this.postOrder.slice(),
            order: this.order.slice(),
            removedEdges: this.removedEdges.map((e) => ({ ...e })),
            treeEdges: this.treeEdges.map((e) => ({ ...e })),
            edgesChecked: this.edgesChecked,
            cycle: this.cycle ? this.cycle.slice() : null,
            line,
            message,
        });
    }
}

const rotateToMin = (c) => {
    const k = c.indexOf(Math.min(...c));
    return [...c.slice(k), ...c.slice(0, k)];
};
const cycleText = (c) => [...c, c[0]].join(" → ");

function runKahn(net) {
    const t = new TopoTracer(net, "kahn");
    for (const v of net.vertices) t.status[v] = "waiting";
    t.record("start", {
        line: 1,
        message: `Start Kahn's topological sort on ${describeNet(net)}. Ties go to the smallest vertex.`,
    });
    t.inDegree = Object.fromEntries(net.vertices.map((v) => [v, 0]));
    for (const a of net.arcs) t.inDegree[a.to]++;
    t.record("in-degree", {
        line: 2,
        message:
            `Count incoming edges: ` +
            net.vertices.map((v) => `in[${v}] = ${t.inDegree[v]}`).join(", ") + `.`,
    });
    for (const v of net.vertices) {
        if (t.inDegree[v] === 0) {
            t.ready.push(v);
            t.status[v] = "ready";
        }
    }
    t.record("ready-init", {
        line: 3,
        message:
            t.ready.length
                ? `Vertices with no incoming edges can go first. Ready set: [${t.ready.join(", ")}].`
                : `No vertex has in-degree 0, so nothing can go first: there must be a cycle.`,
    });

    while (t.ready.length > 0) {
        const before = t.ready.slice();
        const u = t.ready.shift();
        t.order.push(u);
        t.status[u] = "output";
        const outs = net.out.get(u);
        t.record("output", {
            vertex: u,
            line: 5,
            message:
                `Remove the smallest ready vertex ${u} from [${list(before)}] and append it. ` +
                `Order so far: ${t.order.join(", ")}.` +
                (outs.length === 0 ? ` ${u} has no outgoing edges.` : ``),
        });
        for (const { to: v, weight } of outs) {
            t.edgesChecked++;
            const old = t.inDegree[v];
            t.inDegree[v]--;
            const edge = { from: u, to: v, weight };
            t.removedEdges.push(edge);
            if (t.inDegree[v] === 0) {
                let i = 0;
                while (i < t.ready.length && t.ready[i] < v) i++;
                t.ready.splice(i, 0, v);
                t.status[v] = "ready";
                t.record("ready", {
                    vertex: v,
                    edge,
                    line: 8,
                    message:
                        `Remove edge ${u} → ${v}: in[${v}] goes ${old} → 0, so ${v} has nothing left before it. ` +
                        `Add ${v} to the ready set: [${t.ready.join(", ")}].`,
                });
            } else {
                t.record("decrement", {
                    vertex: v,
                    edge,
                    line: 7,
                    message:
                        `Remove edge ${u} → ${v}: in[${v}] goes ${old} → ${t.inDegree[v]}. ` +
                        `${v} still waits for ${plural(t.inDegree[v], "edge", "edges")}.`,
                });
            }
        }
    }

    if (t.order.length < net.vertices.length) {
        // Every left-over vertex still has an incoming edge from another left-over vertex,
        // so walking backwards along those edges must repeat a vertex: that loop is a cycle.
        const left = new Set(net.vertices.filter((v) => t.status[v] !== "output"));
        const pred = new Map([...left].map((v) => [v, []]));
        for (const a of net.arcs) if (left.has(a.from) && left.has(a.to)) pred.get(a.to).push(a.from);
        const pos = new Map();
        const walk = [];
        let x = Math.min(...left);
        while (!pos.has(x)) {
            pos.set(x, walk.length);
            walk.push(x);
            x = Math.min(...pred.get(x));
        }
        t.cycle = rotateToMin(walk.slice(pos.get(x)).reverse());
        t.record("cycle", {
            line: 9,
            message:
                `The ready set is empty but ${plural(left.size, "vertex is", "vertices are")} left ` +
                `(${[...left].join(", ")}), each still waiting for an edge. Following those edges backwards ` +
                `finds the cycle ${cycleText(t.cycle)}, so no topological order exists.`,
        });
        return t;
    }
    t.record("done", {
        line: 10,
        message: `Done. Topological order: ${t.order.join(", ")}. Every edge points from earlier to later.`,
    });
    return t;
}

function runTopoDfs(net) {
    const t = new TopoTracer(net, "dfs");
    for (const v of net.vertices) t.status[v] = "unvisited";
    t.record("start", {
        line: 1,
        message:
            `Start DFS topological sort on ${describeNet(net)}. A vertex is added when it finishes; ` +
            `the reversed finish order is the answer.`,
    });

    const visit = (u, from) => {
        t.status[u] = "active";
        t.callStack.unshift(u);
        t.record("enter", {
            vertex: u,
            edge: from === null ? null : { from, to: u, weight: net.weight.get(`${from}->${u}`) },
            line: 4,
            message: `Call Visit(${u}): mark ${u} active (on the call stack, depth ${t.callStack.length}).`,
        });
        for (const { to: v, weight } of net.out.get(u)) {
            t.edgesChecked++;
            const edge = { from: u, to: v, weight };
            if (t.status[v] === "active") {
                const idx = t.callStack.indexOf(v);
                t.cycle = rotateToMin(t.callStack.slice(0, idx + 1).reverse());
                t.record("back-edge", {
                    vertex: v,
                    edge,
                    line: 6,
                    message:
                        `Edge ${u} → ${v}: ${v} is still active (on the call stack), so this is a back edge. ` +
                        `Cycle: ${cycleText(t.cycle)}. No topological order exists.`,
                });
                return true;
            }
            if (t.status[v] === "finished") {
                t.record("skip-done", {
                    vertex: v,
                    edge,
                    line: 7,
                    message: `Edge ${u} → ${v}: ${v} already finished, so it will end up after ${u}. Skip.`,
                });
                continue;
            }
            t.treeEdges.push(edge);
            t.record("tree-edge", {
                vertex: v,
                edge,
                line: 7,
                message: `Edge ${u} → ${v}: ${v} is unvisited. Pause Visit(${u}) and recurse into ${v}.`,
            });
            if (visit(v, u)) return true;
        }
        t.status[u] = "finished";
        t.callStack.shift();
        t.postOrder.push(u);
        t.order = t.postOrder.slice().reverse();
        t.record("finish", {
            vertex: u,
            line: 8,
            message:
                `Everything ${u} points to is finished, so finish ${u} (post-order #${t.postOrder.length}). ` +
                `Reversed post-order so far: ${t.order.join(", ")}.`,
        });
        return false;
    };

    for (const s of net.vertices) {
        if (t.status[s] !== "unvisited") continue;
        t.record("new-root", {
            vertex: s,
            line: 2,
            message: `${s} is the smallest unvisited vertex: start a DFS from it.`,
        });
        if (visit(s, null)) return t;
    }
    t.record("done", {
        line: 9,
        message:
            `Done. Post-order ${t.postOrder.join(", ")} reversed gives the topological order ` +
            `${t.order.join(", ")}. Every edge points from earlier to later.`,
    });
    return t;
}

/**
 * Topological sort of a directed Graph.
 * @param {Graph} graph
 * @param {"kahn" | "dfs"} method
 */
export function topologicalSort(graph, method = "kahn") {
    if (!Object.hasOwn(TOPO_INFO, method)) {
        return fail(`Unknown topological sort method "${method}". Use one of: ${TOPO_METHODS.join(", ")}.`);
    }
    const built = networkFromGraph(graph);
    if (built.error) return fail(built.error);
    if (!built.net.directed) {
        return fail(
            "Topological sort needs a directed graph: an undirected edge points both ways, so it would " +
                "need each endpoint to come before the other. Turn on Directed first.",
        );
    }
    const t = method === "kahn" ? runKahn(built.net) : runTopoDfs(built.net);
    if (t.cycle) {
        return {
            ok: false,
            error: `The graph has a cycle (${cycleText(t.cycle)}), so no topological order exists.`,
            cycle: t.cycle.slice(),
            steps: t.steps,
        };
    }
    return { ok: true, value: { kind: "topo", method, order: t.order.slice(), graph: built.net.snap }, steps: t.steps };
}

