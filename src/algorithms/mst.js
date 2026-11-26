/**
 * Minimum spanning tree algorithms (Kruskal, Prim) that record real execution steps.
 *
 * Both run on a real `Graph` (src/structures/graph.js) and never mutate it. The graph is
 * read once: `graph.snapshot()` is stored in `value.graph`. Only UNDIRECTED graphs are
 * accepted (a minimum spanning tree is not defined the same way for directed graphs; that
 * problem is the "minimum arborescence"). Unweighted graphs are treated as every edge
 * having weight 1, which is exactly what `Graph` stores for them.
 *
 * Kruskal
 * - Sorts every edge by (weight, from, to) ascending (from < to for undirected edges), so
 *   the order is fully deterministic.
 * - Uses the shared `DisjointSet` (src/structures/dsu.js) with Union by Rank and Path
 *   Compression. The DSU is sized `maxVertexId + 1` because DSU elements are `0..n-1`;
 *   ids that are not graph vertices stay singleton sets and are hidden from snapshots.
 * - Stops early once the tree has V − 1 edges. On a disconnected graph it scans every edge
 *   and returns a minimum spanning FOREST (V − components edges).
 *
 * Prim
 * - Binary min-heap with lazy deletion ("lazy decrease-key"): when a cheaper edge to a
 *   waiting vertex is found, a new heap entry is pushed and the old one becomes stale;
 *   stale entries are skipped when popped. key[v] holds the cheapest known edge to v.
 *   Time O(E log V) (the heap holds at most E entries, and log E ≤ 2 log V).
 * - Heap order is (weight, vertex, from) ascending, so ties go to the smaller vertex.
 * - Grows a single tree from `start`. On a disconnected graph it only covers start's
 *   connected component; `done` and `value.uncovered` say so.
 *
 * Result shape:
 *   { ok: true, value, steps } | { ok: false, error, steps: [] }
 * Kruskal value:
 *   { kind: "kruskal", treeEdges, totalWeight, edgeCount, vertexCount, componentCount,
 *     isSpanningTree, sortedEdges, components, graph }
 *   `components`: vertex id -> smallest vertex id in its component (from the final DSU).
 * Prim value:
 *   { kind: "prim", start, treeEdges, totalWeight, edgeCount, vertexCount, covered,
 *     uncovered, isSpanningTree, parent, graph }
 *
 * Shared step fields (compatible in spirit with graph-traversal.js):
 * {
 *   type, vertex: number | null, edge: { from, to, weight } | null,
 *   frontier: number[],          // Prim: waiting (not-in-tree) vertices by (key, id); Kruskal: []
 *   visited: number[],           // Prim: tree vertices; Kruskal: vertices touched by a tree edge (ascending)
 *   treeEdges: Array<{ from, to, weight }>,
 *   totalWeight: number,
 *   line: number,                // 1-based line in MST_INFO[kind].pseudocode
 *   message: string,
 * }
 * Kruskal extra fields:
 *   cursor (index into sortedEdges of the edge being handled, or null), roots ({ u, v } or
 *   null, filled on find/accept/reject), dsu ({ parent: {id: p}, rank: {id: r} } for graph
 *   vertices only), considered, accepted, rejected, findCalls, components (set count among
 *   graph vertices), sortComparisons.
 * Kruskal step types: "start" | "sort" | "make-set" | "consider" | "find" | "accept" |
 *   "reject" | "stop-early" | "done".
 * Prim extra fields:
 *   key ({ id: weight } for vertices with a candidate edge, not in the tree), heap (heap
 *   array, entries { weight, vertex, from, stale }), edgesExamined, pushes, pops.
 * Prim step types: "start" | "add-vertex" | "push" | "update" | "keep" | "pop" | "skip" |
 *   "accept" | "done".
 *   "skip" is used both when an examined edge leads back into the tree and when a stale
 *   heap entry is popped; in both cases both ends are already in the tree.
 */

import { Graph } from "../structures/graph.js";
import { DisjointSet } from "../structures/dsu.js";
import { parseInteger } from "../core/validate.js";

const KRUSKAL_CODE = [
    "Kruskal(G):",
    "    sort edges by (weight, from, to) ascending",
    "    for each vertex v: make-set(v);  T ← ∅;  total ← 0",
    "    for each edge (u, v, w) in sorted order",
    "        ru ← find(u);  rv ← find(v)",
    "        if ru = rv: reject (u and v already connected; edge would form a cycle)",
    "        else: union(ru, rv);  add (u, v) to T;  total ← total + w",
    "        if |T| = V − 1: stop early",
    "    return T, total   (a spanning forest if G is disconnected)",
];

const PRIM_CODE = [
    "Prim(G, s):",
    "    key[v] ← ∞ for every v;  H ← empty min-heap;  T ← ∅",
    "    AddVertex(s)",
    "    while H is not empty",
    "        (w, v, u) ← pop-min(H)   (ties: smaller w, then smaller v)",
    "        if v is in the tree: skip (stale entry, both ends in tree)",
    "        add edge u–v to T;  total ← total + w;  AddVertex(v)",
    "    return T, total   (covers only s's component)",
    "AddVertex(u):",
    "    put u in the tree",
    "    for each neighbour v of u (ascending)",
    "        if v is in the tree: skip",
    "        if w(u, v) < key[v]: key[v] ← w(u, v);  push (w, v, u) into H",
    "        else: keep key[v]",
];

export const MST_INFO = Object.freeze({
    kruskal: Object.freeze({
        name: "Kruskal's algorithm",
        short: "Kruskal",
        pseudocode: Object.freeze(KRUSKAL_CODE),
        complexity: Object.freeze({
            time: "O(E log E) = O(E log V): sorting the edges dominates; DSU finds are O(α(V)) amortised",
            sort: "O(E log E)",
            dsu: "O(E · α(V)) with union by rank + path compression",
            space: "O(V + E) (sorted edge list + DSU arrays)",
        }),
        summary:
            "Sort all edges from cheapest to most expensive, then walk the list and keep an edge only " +
            "if its two ends are in different trees so far (checked with Union-Find). An edge whose ends " +
            "are already connected would close a cycle, so it is rejected. On a disconnected graph the " +
            "result is a minimum spanning forest. Kruskal and Prim always reach the same total weight; " +
            "when several edges have equal weight they may pick different (equally cheap) trees.",
    }),
    prim: Object.freeze({
        name: "Prim's algorithm",
        short: "Prim",
        pseudocode: Object.freeze(PRIM_CODE),
        complexity: Object.freeze({
            time: "O(E log V) with a binary heap (this implementation, lazy deletion); O(V²) with a plain key array",
            heap: "O(E log V)",
            array: "O(V²) (better for dense graphs)",
            space: "O(V + E) (heap may hold up to E entries with lazy deletion)",
        }),
        summary:
            "Grow one tree from a start vertex. Keep a min-heap of candidate edges that leave the tree; " +
            "repeatedly take the cheapest one whose far end is not yet in the tree, and add that vertex. " +
            "Prim only reaches the start vertex's connected component. Kruskal and Prim always reach the " +
            "same total weight; when several edges have equal weight they may pick different (equally " +
            "cheap) trees.",
    }),
});

export const MST_KINDS = Object.freeze(Object.keys(MST_INFO));

/* ---------- helpers ---------- */

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fail = (error) => ({ ok: false, error, steps: [] });
const cloneEdges = (edges) => edges.map((e) => ({ from: e.from, to: e.to, weight: e.weight }));
const fmtEdge = (e) => `${e.from}–${e.to} (w ${e.weight})`;

function checkGraph(graph) {
    if (!(graph instanceof Graph)) {
        return "Minimum spanning tree needs a Graph from src/structures/graph.js.";
    }
    if (graph.directed) {
        return (
            "Minimum spanning trees are defined for undirected graphs. This graph is directed; " +
            "switch the graph to undirected to run Kruskal or Prim."
        );
    }
    if (graph.isEmpty()) {
        return "The graph is empty. Add at least one vertex before building a spanning tree.";
    }
    return null;
}

/** Kruskal edge order: (weight, from, to) ascending. */
export function compareEdges(a, b) {
    return a.weight - b.weight || a.from - b.from || a.to - b.to;
}

/* ---------- Kruskal ---------- */

export function kruskal(graph) {
    const err = checkGraph(graph);
    if (err) return fail(err);

    const snap = graph.snapshot();
    const vertices = snap.vertices;
    const V = vertices.length;
    const dsu = new DisjointSet(vertices[vertices.length - 1] + 1);

    const steps = [];
    const treeEdges = [];
    const touched = new Set();
    let totalWeight = 0;
    let considered = 0;
    let accepted = 0;
    let rejected = 0;
    let findCalls = 0;
    let sortComparisons = 0;
    let sorted = [];

    const dsuView = () => {
        const s = dsu.snapshot();
        const parent = {};
        const rank = {};
        for (const v of vertices) {
            parent[v] = s.parent[v];
            rank[v] = s.rank[v];
        }
        return { parent, rank };
    };
    const setCount = () => {
        // Graph vertices only; the DSU's non-vertex ids are permanent singletons.
        let c = 0;
        const p = dsu.parentArray();
        for (const v of vertices) if (p[v] === v) c++;
        return c;
    };
    const record = (type, { vertex = null, edge = null, cursor = null, roots = null, line, message }) => {
        steps.push({
            type,
            vertex,
            edge: edge ? { ...edge } : null,
            frontier: [],
            visited: Array.from(touched).sort((a, b) => a - b),
            treeEdges: cloneEdges(treeEdges),
            totalWeight,
            cursor,
            roots: roots ? { ...roots } : null,
            dsu: dsuView(),
            considered,
            accepted,
            rejected,
            findCalls,
            components: setCount(),
            sortComparisons,
            line,
            message,
        });
    };

    record("start", {
        line: 1,
        message:
            `Start Kruskal on an undirected ${snap.weighted ? "weighted" : "unweighted"} graph with ` +
            `${plural(V, "vertex", "vertices")} and ${plural(snap.edges.length, "edge", "edges")}.` +
            (snap.weighted ? `` : ` The graph is unweighted, so every edge counts as weight 1.`),
    });

    sorted = snap.edges.slice().sort((a, b) => {
        sortComparisons++;
        return compareEdges(a, b);
    });
    record("sort", {
        line: 2,
        message:
            sorted.length === 0
                ? `There are no edges to sort.`
                : `Sort the edges by weight (ties: smaller from, then smaller to): ` +
                  `${sorted.map(fmtEdge).join(", ")}.`,
    });

    record("make-set", {
        line: 3,
        message:
            `Put every vertex in its own set: ${plural(V, "set", "sets")}, each vertex is its own root. ` +
            `The tree T starts empty with total weight 0.`,
    });

    const target = V - 1;
    let stoppedEarly = false;
    for (let i = 0; i < sorted.length; i++) {
        if (accepted === target) {
            stoppedEarly = true;
            record("stop-early", {
                cursor: i,
                line: 8,
                message:
                    `T already has V − 1 = ${target} ${target === 1 ? "edge" : "edges"}, so it spans every vertex. ` +
                    `Stop early; the remaining ${plural(sorted.length - i, "edge is", "edges are")} not needed.`,
            });
            break;
        }
        const e = sorted[i];
        const { from: u, to: v } = e;
        considered++;
        record("consider", {
            edge: e,
            cursor: i,
            line: 4,
            message: `Consider the next cheapest edge ${fmtEdge(e)} (edge ${i + 1} of ${sorted.length}).`,
        });

        const fu = dsu.find(u);
        const fv = dsu.find(v);
        findCalls += 2;
        const ru = fu.value;
        const rv = fv.value;
        const compressed = [...fu.steps, ...fv.steps].filter((s) => s.type === "compress").length;
        record("find", {
            edge: e,
            cursor: i,
            roots: { u: ru, v: rv },
            line: 5,
            message:
                `find(${u}) = ${ru}, find(${v}) = ${rv}. ` +
                (ru === rv ? `Same root.` : `Different roots, so ${u} and ${v} are in different trees.`) +
                (compressed > 0
                    ? ` Path compression re-pointed ${plural(compressed, "vertex", "vertices")} straight to the root.`
                    : ``),
        });

        if (ru === rv) {
            rejected++;
            record("reject", {
                edge: e,
                cursor: i,
                roots: { u: ru, v: rv },
                line: 6,
                message:
                    `Reject ${fmtEdge(e)}: it would form a cycle: ${u} and ${v} already connected through root ${ru}.`,
            });
            continue;
        }

        const un = dsu.union(ru, rv);
        const newRoot = un.value;
        treeEdges.push({ from: u, to: v, weight: e.weight });
        touched.add(u);
        touched.add(v);
        totalWeight += e.weight;
        accepted++;
        record("accept", {
            edge: e,
            cursor: i,
            roots: { u: ru, v: rv },
            line: 7,
            message:
                `Accept ${fmtEdge(e)}: union the sets of roots ${ru} and ${rv} (new root ${newRoot}). ` +
                `T now has ${plural(accepted, "edge", "edges")}, total weight ${totalWeight}.`,
        });
    }

    const componentCount = setCount();
    const isSpanningTree = componentCount === 1;
    const p = vertices.map((x) => dsu.find(x).value);
    const smallest = new Map();
    vertices.forEach((x, idx) => {
        if (!smallest.has(p[idx])) smallest.set(p[idx], x);
    });
    const components = {};
    vertices.forEach((x, idx) => (components[x] = smallest.get(p[idx])));

    record("done", {
        line: 9,
        message: isSpanningTree
            ? `Done. Minimum spanning tree: ${plural(accepted, "edge", "edges")} (V − 1 = ${target}), ` +
              `total weight ${totalWeight}.` +
              (stoppedEarly ? ` (Stopped early once V − 1 edges were chosen.)` : ``)
            : `Done. The graph is disconnected (${componentCount} components), so no single tree can span it. ` +
              `Result is a minimum spanning FOREST: ${plural(accepted, "edge", "edges")} ` +
              `(V − components = ${V} − ${componentCount}), total weight ${totalWeight}.`,
    });

    return {
        ok: true,
        value: {
            kind: "kruskal",
            treeEdges: cloneEdges(treeEdges),
            totalWeight,
            edgeCount: treeEdges.length,
            vertexCount: V,
            componentCount,
            isSpanningTree,
            sortedEdges: cloneEdges(sorted),
            components,
            graph: snap,
        },
        steps,
    };
}

/* ---------- Prim ---------- */

/** Heap order: (weight, vertex, from) ascending. */
function heapBefore(a, b) {
    if (a.weight !== b.weight) return a.weight < b.weight;
    if (a.vertex !== b.vertex) return a.vertex < b.vertex;
    return a.from < b.from;
}

class MinHeap {
    constructor() {
        this.a = [];
    }
    get size() {
        return this.a.length;
    }
    push(x) {
        const a = this.a;
        a.push(x);
        let i = a.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (!heapBefore(a[i], a[p])) break;
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
                if (l < a.length && heapBefore(a[l], a[m])) m = l;
                if (r < a.length && heapBefore(a[r], a[m])) m = r;
                if (m === i) break;
                [a[i], a[m]] = [a[m], a[i]];
                i = m;
            }
        }
        return top;
    }
}

function checkStart(graph, start) {
    const choices = graph.vertices().join(", ");
    if (typeof start !== "number" || !Number.isInteger(start)) {
        return `Start vertex must be a whole number (got ${JSON.stringify(start) ?? String(start)}). Choose one of: ${choices}.`;
    }
    if (!graph.hasVertex(start)) {
        return `Start vertex ${start} is not in the graph. Choose one of: ${choices}.`;
    }
    return null;
}

export function prim(graph, start) {
    const err = checkGraph(graph);
    if (err) return fail(err);
    const sErr = checkStart(graph, start);
    if (sErr) return fail(sErr);
    start = start === 0 ? 0 : start; // normalise -0

    const snap = graph.snapshot();
    const vertices = snap.vertices;
    const adj = new Map(vertices.map((id) => [id, graph.neighbors(id).map((to) => ({ to, weight: graph.weight(id, to) }))]));

    const steps = [];
    const inTree = new Set();
    const key = new Map(); // waiting vertex -> cheapest known edge weight
    const best = new Map(); // waiting vertex -> from
    const heap = new MinHeap();
    const treeEdges = [];
    const parent = {};
    let totalWeight = 0;
    let edgesExamined = 0;
    let pushes = 0;
    let pops = 0;

    const record = (type, { vertex = null, edge = null, line, message }) => {
        const waiting = Array.from(key.keys()).sort((a, b) => key.get(a) - key.get(b) || a - b);
        const keyObj = {};
        for (const v of waiting) keyObj[v] = key.get(v);
        steps.push({
            type,
            vertex,
            edge: edge ? { ...edge } : null,
            frontier: waiting,
            visited: Array.from(inTree).sort((a, b) => a - b),
            treeEdges: cloneEdges(treeEdges),
            totalWeight,
            key: keyObj,
            heap: heap.a.map((h) => ({ ...h, stale: inTree.has(h.vertex) || key.get(h.vertex) !== h.weight || best.get(h.vertex) !== h.from })),
            edgesExamined,
            pushes,
            pops,
            line,
            message,
        });
    };
    const heapText = () =>
        heap.size === 0 ? "empty" : heap.a.slice().sort((x, y) => (heapBefore(x, y) ? -1 : 1)).map((h) => `(${h.weight}, ${h.vertex})`).join(", ");

    const addVertex = (u) => {
        inTree.add(u);
        key.delete(u);
        best.delete(u);
        record("add-vertex", {
            vertex: u,
            line: 10,
            message:
                `Put ${u} in the tree (${plural(inTree.size, "vertex", "vertices")} in the tree). ` +
                (adj.get(u).length === 0 ? `${u} has no neighbours.` : `Look at its neighbours in ascending order.`),
        });
        for (const { to: v, weight: w } of adj.get(u)) {
            edgesExamined++;
            const e = { from: u, to: v, weight: w };
            if (inTree.has(v)) {
                record("skip", {
                    vertex: v,
                    edge: e,
                    line: 12,
                    message: `Edge ${fmtEdge(e)}: ${v} is already in the tree (both ends in tree), skip.`,
                });
                continue;
            }
            const old = key.has(v) ? key.get(v) : null;
            const oldFrom = old === null ? null : best.get(v);
            if (old === null || w < old) {
                key.set(v, w);
                best.set(v, u);
                heap.push({ weight: w, vertex: v, from: u });
                pushes++;
                if (old === null) {
                    record("push", {
                        vertex: v,
                        edge: e,
                        line: 13,
                        message: `Edge ${fmtEdge(e)}: ${v} has no candidate edge yet. Set key[${v}] = ${w} and push (${w}, ${v}). Heap: ${heapText()}.`,
                    });
                } else {
                    record("update", {
                        vertex: v,
                        edge: e,
                        line: 13,
                        message:
                            `Edge ${fmtEdge(e)} is cheaper than ${v}'s old candidate ${oldFrom}–${v} (w ${old}). ` +
                            `Lower key[${v}] from ${old} to ${w} and push (${w}, ${v}); the old entry is now stale. Heap: ${heapText()}.`,
                    });
                }
            } else {
                record("keep", {
                    vertex: v,
                    edge: e,
                    line: 14,
                    message: `Edge ${fmtEdge(e)} is not cheaper than ${v}'s current candidate ${oldFrom}–${v} (w ${old}). Keep key[${v}] = ${old}.`,
                });
            }
        }
    };

    parent[start] = null;
    record("start", {
        vertex: start,
        line: 2,
        message:
            `Start Prim from vertex ${start} on an undirected ${snap.weighted ? "weighted" : "unweighted"} graph with ` +
            `${plural(vertices.length, "vertex", "vertices")}. Every key starts at ∞ and the heap is empty.` +
            (snap.weighted ? `` : ` Unweighted, so every edge counts as weight 1.`),
    });
    addVertex(start);

    while (heap.size > 0) {
        const before = heapText();
        const top = heap.pop();
        pops++;
        const e = { from: top.from, to: top.vertex, weight: top.weight };
        record("pop", {
            vertex: top.vertex,
            edge: e,
            line: 5,
            message: `Pop the cheapest heap entry (${top.weight}, ${top.vertex}) from [${before}]: edge ${fmtEdge(e)}.`,
        });
        if (inTree.has(top.vertex)) {
            record("skip", {
                vertex: top.vertex,
                edge: e,
                line: 6,
                message: `${top.vertex} is already in the tree, so this is a stale entry (both ends in tree). Skip it.`,
            });
            continue;
        }
        treeEdges.push(e);
        parent[top.vertex] = top.from;
        totalWeight += top.weight;
        record("accept", {
            vertex: top.vertex,
            edge: e,
            line: 7,
            message: `Accept ${fmtEdge(e)}: it is the cheapest edge leaving the tree. Total weight ${totalWeight}.`,
        });
        addVertex(top.vertex);
    }

    const covered = Array.from(inTree).sort((a, b) => a - b);
    const uncovered = vertices.filter((v) => !inTree.has(v));
    const isSpanningTree = uncovered.length === 0;
    record("done", {
        line: 8,
        message: isSpanningTree
            ? `Done. Heap is empty. Minimum spanning tree: ${plural(treeEdges.length, "edge", "edges")} ` +
              `(V − 1 = ${vertices.length - 1}), total weight ${totalWeight}.`
            : `Done. Heap is empty. The graph is disconnected: Prim only covers start ${start}'s component ` +
              `(${covered.join(", ")}) with ${plural(treeEdges.length, "edge", "edges")}, total weight ${totalWeight}. ` +
              `Not reached: ${uncovered.join(", ")} (use Kruskal for a spanning forest).`,
    });

    return {
        ok: true,
        value: {
            kind: "prim",
            start,
            treeEdges: cloneEdges(treeEdges),
            totalWeight,
            edgeCount: treeEdges.length,
            vertexCount: vertices.length,
            covered,
            uncovered,
            isSpanningTree,
            parent,
            graph: snap,
        },
        steps,
    };
}

/** Dispatch helper for the page. `start` is ignored by Kruskal. */
export function traceMst(kind, graph, start) {
    if (kind === "kruskal") return kruskal(graph);
    if (kind === "prim") return prim(graph, start);
    return fail(`Unknown MST algorithm "${kind}". Use one of: ${MST_KINDS.join(", ")}.`);
}

/**
 * Parse the start vertex typed by the user and check it exists in `graph`.
 * @returns {{ ok: true, value: number } | { ok: false, error: string }}
 */
export function parseMstStart(text, graph) {
    const gErr = checkGraph(graph);
    if (gErr) return { ok: false, error: gErr };
    const res = parseInteger(text, { min: 0, max: 11, label: "Start vertex" });
    if (!res.ok) return res;
    const sErr = checkStart(graph, res.value);
    return sErr ? { ok: false, error: sErr } : res;
}
