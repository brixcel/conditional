/**
 * Graph traversals (BFS, iterative DFS, recursive DFS) that record real execution steps.
 *
 * Every traversal runs on a real `Graph` (src/structures/graph.js). The graph is read
 * once per run: `graph.snapshot()` is stored in `value.graph`, and the adjacency lists
 * are captured from `graph.neighbors(id)` (always ascending). The graph is never mutated.
 *
 * Directed graphs follow out-edges only. Ties are always broken by the smallest vertex ID:
 * - BFS enqueues neighbours in ascending order.
 * - Recursive DFS scans neighbours in ascending order.
 * - Iterative DFS pushes neighbours in DESCENDING order, so they pop off the stack in
 *   ascending order. Combined with "mark visited on pop", this makes the iterative visit
 *   order (and parent pointers) identical to recursive DFS. Because a vertex may be pushed
 *   more than once before it is popped, the stack can hold duplicates; a stale copy is
 *   skipped on pop with a "skip-visited" step.
 * - BFS marks a vertex visited when it is ENQUEUED (not when dequeued), so the queue never
 *   holds a duplicate and every vertex enters the queue at most once.
 *
 * Result shape (every function):
 *   { ok: true, value: { order, parent, treeEdges, components?, componentCount?, distance?,
 *                        graph, kind, mode }, steps }
 *   { ok: false, error, steps: [] }
 * - `order`: vertex IDs in visit order.
 * - `parent`: plain object, vertex ID -> parent vertex ID, or `null` for a root.
 *   Only visited vertices appear as keys.
 * - `treeEdges`: `[{ from: parent, to: child, weight }]` in the order they were added.
 * - `components` (traverseAll only): vertex ID -> 1-based component (search tree) number.
 * - `distance` (BFS only): vertex ID -> number of edges on the BFS tree path from its root.
 *
 * Step shape:
 * {
 *   type: "start" | "enqueue" | "dequeue" | "push" | "pop" | "visit" | "discover" |
 *         "skip-visited" | "dead-end" | "enter" | "tree-edge" | "return" | "new-component" |
 *         "done",
 *   vertex: number | null,          // vertex the step is about
 *   edge: { from, to, weight } | null, // edge being examined / added (from -> to direction)
 *   frontier: number[],             // queue (front first) or stack (top first); for recursive
 *                                   // DFS this is the call stack vertices, top first
 *   visited: number[],              // ascending
 *   callStack: number[],            // recursive DFS: active Visit(u) frames, top first; else []
 *   depth: number,                  // recursive DFS: callStack.length; else 0
 *   order: number[],                // visit order so far
 *   treeEdges: Array<{ from, to, weight }>, // so far
 *   component: number | null,       // current component number (traverseAll), else null
 *   edgesExamined: number,          // running count of neighbour checks
 *   line: number,                   // 1-based line in the run's pseudocode listing
 *   message: string
 * }
 * `line` refers to `GRAPH_TRAVERSAL_INFO[kind].pseudocode` for single-source runs and to
 * `GRAPH_TRAVERSAL_INFO[kind].pseudocodeAll` for traverseAll (outer loop + same body).
 */

import { Graph } from "../structures/graph.js";
import { parseInteger } from "../core/validate.js";

const BFS_CODE = [
    "BFS(G, s):",
    "    mark s visited;  Q ← [s]",
    "    while Q is not empty",
    "        u ← dequeue(Q);  append u to order",
    "        for each neighbour v of u (ascending)",
    "            if v is visited: skip",
    "            mark v visited;  parent[v] ← u",
    "            enqueue(Q, v)",
    "    return order, parent",
];

const DFS_ITER_CODE = [
    "DFS-Iterative(G, s):",
    "    S ← [s]   (stack)",
    "    while S is not empty",
    "        u ← pop(S)",
    "        if u is visited: skip",
    "        mark u visited;  append u to order",
    "        for each neighbour v of u (DESCENDING)",
    "            if v is not visited: push(S, v)",
    "    return order, parent",
];

const DFS_REC_CODE = [
    "DFS(G, s):  Visit(s)",
    "Visit(u):",
    "    mark u visited;  append u to order",
    "    for each neighbour v of u (ascending)",
    "        if v is visited: skip",
    "        parent[v] ← u   (tree edge u → v)",
    "        Visit(v)",
    "    return from Visit(u)",
];

/** Number of outer-loop lines placed before the algorithm body in `pseudocodeAll`. */
const ALL_PREFIX = 3;

function withOuterLoop(callName, body) {
    return [
        "TraverseAll(G):",
        "    for each vertex s in ascending order",
        `        if s is not visited: component ← component + 1;  ${callName}(G, s)`,
        ...body,
    ];
}

const COMPLEXITY = Object.freeze({
    time: "O(V + E) with an adjacency list; O(V²) with an adjacency matrix",
    timeList: "O(V + E)",
    timeMatrix: "O(V²)",
    space: "O(V)",
});

export const GRAPH_TRAVERSAL_INFO = Object.freeze({
    bfs: Object.freeze({
        name: "Breadth-First Search",
        short: "BFS",
        frontierName: "queue",
        pseudocode: Object.freeze(BFS_CODE),
        doneLine: 9,
        pseudocodeAll: Object.freeze(withOuterLoop("BFS", BFS_CODE)),
        complexity: COMPLEXITY,
        summary:
            "Explores the graph in rings: first the start vertex, then every vertex one edge away, " +
            "then two edges away, and so on, using a FIFO queue. Vertices are marked visited when " +
            "they are enqueued, so each enters the queue once. The BFS tree gives shortest paths " +
            "measured in number of edges.",
    }),
    dfsIterative: Object.freeze({
        name: "Depth-First Search (iterative)",
        short: "DFS (stack)",
        frontierName: "stack",
        pseudocode: Object.freeze(DFS_ITER_CODE),
        doneLine: 9,
        pseudocodeAll: Object.freeze(withOuterLoop("DFS-Iterative", DFS_ITER_CODE)),
        complexity: COMPLEXITY,
        summary:
            "Goes as deep as possible before backing up, using an explicit LIFO stack. Neighbours " +
            "are pushed in descending order so the smallest pops first, giving exactly the same " +
            "order as recursive DFS. A vertex can sit on the stack more than once; stale copies " +
            "are skipped when popped.",
    }),
    dfsRecursive: Object.freeze({
        name: "Depth-First Search (recursive)",
        short: "DFS (recursive)",
        frontierName: "call stack",
        pseudocode: Object.freeze(DFS_REC_CODE),
        doneLine: 1,
        pseudocodeAll: Object.freeze(withOuterLoop("DFS", DFS_REC_CODE)),
        complexity: COMPLEXITY,
        summary:
            "Goes as deep as possible before backing up, letting the program's call stack remember " +
            "where to return. Each Visit(u) call scans u's neighbours in ascending order and " +
            "recurses into the first unvisited one.",
    }),
});

export const TRAVERSAL_KINDS = Object.freeze(Object.keys(GRAPH_TRAVERSAL_INFO));

/* ---------- tracer ---------- */

class TraversalTracer {
    constructor(adj, offset, directed) {
        this.adj = adj;
        this.offset = offset;
        this.directed = directed;
        this.steps = [];
        this.visited = new Set();
        this.order = [];
        this.parent = {};
        this.treeEdges = [];
        this.frontier = [];
        this.callStack = [];
        this.component = null;
        this.edgesExamined = 0;
    }

    /** Record a snapshot AFTER the event has happened. */
    record(type, { vertex = null, edge = null, line, message }) {
        this.steps.push({
            type,
            vertex,
            edge: edge ? { ...edge } : null,
            frontier: this.frontier.slice(),
            visited: Array.from(this.visited).sort((a, b) => a - b),
            callStack: this.callStack.slice(),
            depth: this.callStack.length,
            order: this.order.slice(),
            treeEdges: this.treeEdges.map((e) => ({ ...e })),
            component: this.component,
            edgesExamined: this.edgesExamined,
            line: line + this.offset,
            message,
        });
    }

    edge(u, v) {
        return { from: u, to: v, weight: this.adj.get(u).weight.get(v) };
    }

    arrow(u, v) {
        return this.directed ? `${u} → ${v}` : `${u}–${v}`;
    }
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const describe = (g) =>
    `${g.directed ? "a directed" : "an undirected"} graph with ${plural(g.vertexCount, "vertex", "vertices")} ` +
    `and ${plural(g.edgeCount, "edge", "edges")}`;
const list = (a) => (a.length ? a.join(", ") : "empty");

/* ---------- algorithm bodies (shared by single-source and traverseAll) ---------- */

function bfsBody(t, s) {
    t.visited.add(s);
    t.parent[s] = null;
    t.distance[s] = 0;
    t.frontier.push(s);
    t.record("enqueue", {
        vertex: s,
        line: 2,
        message: `Mark start vertex ${s} visited and put it in the queue. Queue: [${s}].`,
    });

    while (t.frontier.length > 0) {
        const u = t.frontier[0];
        const before = t.frontier.slice();
        t.frontier.shift();
        t.order.push(u);
        t.record("dequeue", {
            vertex: u,
            line: 4,
            message:
                `Dequeue ${u} from the front of the queue [${list(before)}] and visit it ` +
                `(distance ${t.distance[u]} from the start). Visit order: ${t.order.join(", ")}.`,
        });

        const nbrs = t.adj.get(u).ids;
        if (nbrs.length === 0) {
            t.record("dead-end", {
                vertex: u,
                line: 5,
                message: `${u} has no ${t.directed ? "outgoing edges" : "neighbours"}, nothing to enqueue.`,
            });
        }
        for (const v of nbrs) {
            t.edgesExamined++;
            const e = t.edge(u, v);
            if (t.visited.has(v)) {
                const why = t.frontier.includes(v)
                    ? `it is already waiting in the queue`
                    : `it was already dequeued and visited`;
                t.record("skip-visited", {
                    vertex: v,
                    edge: e,
                    line: 6,
                    message: `Check edge ${t.arrow(u, v)}: ${v} is already visited (${why}), skip.`,
                });
                continue;
            }
            t.visited.add(v);
            t.parent[v] = u;
            t.distance[v] = t.distance[u] + 1;
            t.treeEdges.push(e);
            t.record("discover", {
                vertex: v,
                edge: e,
                line: 7,
                message:
                    `Check edge ${t.arrow(u, v)}: ${v} is new. Mark it visited and set parent[${v}] = ${u}; ` +
                    `edge ${t.arrow(u, v)} joins the BFS tree (distance ${t.distance[v]}).`,
            });
            t.frontier.push(v);
            t.record("enqueue", {
                vertex: v,
                edge: e,
                line: 8,
                message: `Enqueue ${v} at the back. Queue: [${t.frontier.join(", ")}].`,
            });
        }
    }
}

function dfsIterativeBody(t, s) {
    // Stack entries carry the vertex that pushed them, so the tree edge is known on pop.
    // t.frontier mirrors the stack, top first.
    const stack = [{ v: s, from: null }];
    t.frontier = [s];
    t.record("push", {
        vertex: s,
        line: 2,
        message: `Push start vertex ${s} onto the stack. Stack (top first): [${s}].`,
    });

    while (stack.length > 0) {
        const before = t.frontier.slice();
        const { v: u, from } = stack.pop();
        t.frontier.shift();
        t.record("pop", {
            vertex: u,
            line: 4,
            message: `Pop ${u} from the top of the stack [${list(before)}].`,
        });

        if (t.visited.has(u)) {
            t.record("skip-visited", {
                vertex: u,
                line: 5,
                message:
                    `${u} is already visited (it was pushed more than once and an earlier copy was ` +
                    `popped first), skip this stale copy.`,
            });
            continue;
        }

        t.visited.add(u);
        t.order.push(u);
        t.parent[u] = from;
        let e = null;
        if (from !== null) {
            e = t.edge(from, u);
            t.treeEdges.push(e);
        }
        t.record("visit", {
            vertex: u,
            edge: e,
            line: 6,
            message:
                from === null
                    ? `${u} is not visited yet: mark it visited. It is the root (parent = none). Visit order: ${t.order.join(", ")}.`
                    : `${u} is not visited yet: mark it visited with parent[${u}] = ${from}; edge ${t.arrow(from, u)} ` +
                      `joins the DFS tree. Visit order: ${t.order.join(", ")}.`,
        });

        const nbrs = t.adj.get(u).ids;
        if (nbrs.length === 0) {
            t.record("dead-end", {
                vertex: u,
                line: 7,
                message: `${u} has no ${t.directed ? "outgoing edges" : "neighbours"}, nothing to push.`,
            });
        }
        // DESCENDING push order so the smallest neighbour ends up on top and pops first.
        for (let i = nbrs.length - 1; i >= 0; i--) {
            const v = nbrs[i];
            t.edgesExamined++;
            const ev = t.edge(u, v);
            if (t.visited.has(v)) {
                t.record("skip-visited", {
                    vertex: v,
                    edge: ev,
                    line: 8,
                    message: `Check edge ${t.arrow(u, v)}: ${v} is already visited, so do not push it.`,
                });
                continue;
            }
            const already = t.frontier.includes(v);
            stack.push({ v, from: u });
            t.frontier.unshift(v);
            t.record("push", {
                vertex: v,
                edge: ev,
                line: 8,
                message:
                    `Check edge ${t.arrow(u, v)}: ${v} is not visited, push it` +
                    (already ? ` (an older copy is still lower in the stack; it will be skipped later)` : ``) +
                    `. Neighbours are pushed largest first so the smallest pops first. ` +
                    `Stack (top first): [${t.frontier.join(", ")}].`,
            });
        }
    }
}

function dfsRecursiveBody(t, s) {
    const visit = (u, from) => {
        // Entering Visit(u): the frame goes on the call stack and u is marked visited.
        t.callStack.unshift(u);
        t.frontier = t.callStack.slice();
        t.visited.add(u);
        t.order.push(u);
        t.parent[u] = from;
        t.record("enter", {
            vertex: u,
            edge: from === null ? null : t.edge(from, u),
            line: 3,
            message:
                (from === null ? `Call Visit(${u}).` : `Call Visit(${u}) from Visit(${from}).`) +
                ` Mark ${u} visited. Call stack depth ${t.callStack.length}. Visit order: ${t.order.join(", ")}.`,
        });

        for (const v of t.adj.get(u).ids) {
            t.edgesExamined++;
            const e = t.edge(u, v);
            if (t.visited.has(v)) {
                const why = t.callStack.includes(v)
                    ? `Visit(${v}) is still on the call stack`
                    : `Visit(${v}) already finished`;
                t.record("skip-visited", {
                    vertex: v,
                    edge: e,
                    line: 5,
                    message: `Check edge ${t.arrow(u, v)}: ${v} is already visited (${why}), skip.`,
                });
                continue;
            }
            t.treeEdges.push(e);
            t.record("tree-edge", {
                vertex: v,
                edge: e,
                line: 6,
                message:
                    `Check edge ${t.arrow(u, v)}: ${v} is not visited. Set parent[${v}] = ${u}; edge ` +
                    `${t.arrow(u, v)} joins the DFS tree. Pause Visit(${u}) and recurse into ${v}.`,
            });
            visit(v, u);
        }

        const caller = t.callStack.length > 1 ? t.callStack[1] : null;
        t.callStack.shift();
        t.frontier = t.callStack.slice();
        t.record("return", {
            vertex: u,
            line: 8,
            message:
                `All ${t.directed ? "out-" : ""}neighbours of ${u} are done. Return from Visit(${u})` +
                (caller === null ? `; the call stack is now empty.` : ` back to Visit(${caller}).`),
        });
    };
    visit(s, null);
}

const BODIES = { bfs: bfsBody, dfsIterative: dfsIterativeBody, dfsRecursive: dfsRecursiveBody };

/* ---------- validation & setup ---------- */

function checkGraph(graph) {
    if (!(graph instanceof Graph)) {
        return "Traversal needs a Graph from src/structures/graph.js.";
    }
    if (graph.isEmpty()) {
        return "The graph is empty. Add at least one vertex before running a traversal.";
    }
    return null;
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

function readAdjacency(graph) {
    const adj = new Map();
    for (const id of graph.vertices()) {
        const ids = graph.neighbors(id);
        adj.set(id, { ids, weight: new Map(ids.map((v) => [v, graph.weight(id, v)])) });
    }
    return adj;
}

const fail = (error) => ({ ok: false, error, steps: [] });

function finish(t, kind, mode, snap, extra) {
    const value = {
        kind,
        mode,
        order: t.order.slice(),
        parent: { ...t.parent },
        treeEdges: t.treeEdges.map((e) => ({ ...e })),
        graph: snap,
        ...extra,
    };
    if (kind === "bfs") value.distance = { ...t.distance };
    return { ok: true, value, steps: t.steps };
}

function runSingle(kind, graph, start) {
    const gErr = checkGraph(graph);
    if (gErr) return fail(gErr);
    const sErr = checkStart(graph, start);
    if (sErr) return fail(sErr);

    const info = GRAPH_TRAVERSAL_INFO[kind];
    const snap = graph.snapshot();
    const t = new TraversalTracer(readAdjacency(graph), 0, graph.directed);
    t.distance = {};
    t.record("start", {
        vertex: start,
        line: 1,
        message:
            `Start ${info.name} from vertex ${start} on ${describe(graph)}. Ties go to the smallest vertex.` +
            (graph.directed ? ` Only out-edges are followed.` : ``),
    });

    BODIES[kind](t, start);

    const unreached = snap.vertices.filter((v) => !t.visited.has(v));
    t.record("done", {
        vertex: null,
        line: info.doneLine,
        message:
            `Done. Visit order: ${t.order.join(", ")}. ` +
            (unreached.length === 0
                ? `Every vertex was reached from ${start}.`
                : `Not reachable from ${start}: ${unreached.join(", ")} (try "all components").`),
    });
    return finish(t, kind, "single", snap, {});
}

/** Breadth-first search from `start`. */
export function bfs(graph, start) {
    return runSingle("bfs", graph, start);
}

/** Iterative depth-first search from `start` (explicit stack, descending pushes). */
export function dfsIterative(graph, start) {
    return runSingle("dfsIterative", graph, start);
}

/** Recursive depth-first search from `start` (records enter/return call frames). */
export function dfsRecursive(graph, start) {
    return runSingle("dfsRecursive", graph, start);
}

/**
 * Traverse every vertex, restarting at the smallest unvisited vertex each time.
 * `components[v]` is the 1-based number of the restart that reached `v`. In undirected
 * graphs these are exactly the connected components. In directed graphs they are the
 * trees of the search forest (a later tree may have edges into an earlier one).
 * @param {Graph} graph
 * @param {"bfs" | "dfsIterative" | "dfsRecursive"} kind
 */
export function traverseAll(graph, kind) {
    if (!Object.hasOwn(GRAPH_TRAVERSAL_INFO, kind)) {
        return fail(`Unknown traversal "${kind}". Use one of: ${TRAVERSAL_KINDS.join(", ")}.`);
    }
    const gErr = checkGraph(graph);
    if (gErr) return fail(gErr);

    const info = GRAPH_TRAVERSAL_INFO[kind];
    const snap = graph.snapshot();
    const t = new TraversalTracer(readAdjacency(graph), ALL_PREFIX, graph.directed);
    t.distance = {};
    const components = {};
    const word = graph.directed ? "search tree" : "component";

    t.offset = 0;
    t.record("start", {
        vertex: null,
        line: 1,
        message:
            `Start ${info.name} over every vertex of ${describe(graph)}: whenever the traversal runs out, ` +
            `restart from the smallest unvisited vertex.`,
    });

    let count = 0;
    for (const s of snap.vertices) {
        if (t.visited.has(s)) continue;
        count++;
        t.component = count;
        t.frontier = [];
        t.offset = 0;
        t.record("new-component", {
            vertex: s,
            line: 3,
            message:
                count === 1
                    ? `${s} is the smallest unvisited vertex: start ${word} 1 from ${s}.`
                    : `The previous ${word} is finished. ${s} is the smallest vertex not visited yet: ` +
                      `start ${word} ${count} from ${s}.`,
        });
        t.offset = ALL_PREFIX;
        const before = new Set(t.visited);
        BODIES[kind](t, s);
        for (const v of t.visited) if (!before.has(v)) components[v] = count;
    }

    t.offset = 0;
    t.component = null;
    t.record("done", {
        vertex: null,
        line: 2,
        message:
            `Done. All ${plural(snap.vertices.length, "vertex", "vertices")} visited in ${count} ${word}${count === 1 ? "" : "s"}. ` +
            `Visit order: ${t.order.join(", ")}.`,
    });
    return finish(t, kind, "all", snap, { components, componentCount: count });
}

/** Dispatch helper used by the page: `allComponents` selects traverseAll. */
export function traceTraversal(kind, graph, start, { allComponents = false } = {}) {
    if (!Object.hasOwn(GRAPH_TRAVERSAL_INFO, kind)) {
        return fail(`Unknown traversal "${kind}". Use one of: ${TRAVERSAL_KINDS.join(", ")}.`);
    }
    if (allComponents) return traverseAll(graph, kind);
    return runSingle(kind, graph, start);
}

/**
 * Parse the start vertex typed by the user and check it exists in `graph`.
 * @returns {{ ok: true, value: number } | { ok: false, error: string }}
 */
export function parseStartVertex(text, graph) {
    const gErr = checkGraph(graph);
    if (gErr) return { ok: false, error: gErr };
    const res = parseInteger(text, { min: 0, max: 11, label: "Start vertex" });
    if (!res.ok) return res;
    const sErr = checkStart(graph, res.value);
    return sErr ? { ok: false, error: sErr } : res;
}
