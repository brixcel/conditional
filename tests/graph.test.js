import { test } from "node:test";
import assert from "node:assert/strict";
import { Graph, GRAPH_LIMITS, GRAPH_INFO } from "../src/structures/graph.js";

/** Seeded mulberry32 PRNG for reproducible property tests. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randInt(rng, lo, hi) {
    return lo + Math.floor(rng() * (hi - lo + 1));
}

function edgeKey(u, v, directed) {
    if (directed || u < v) return `${u},${v}`;
    return `${v},${u}`;
}

/**
 * Independent reference model backed by Set<number> + Map<"u,v", weight>.
 */
class GraphModel {
    constructor(directed, weighted) {
        this.directed = directed;
        this.weighted = weighted;
        this.vertices = new Set();
        this.edges = new Map();
    }

    addVertex(id) {
        this.vertices.add(id);
    }

    removeVertex(id) {
        this.vertices.delete(id);
        for (const key of Array.from(this.edges.keys())) {
            const [u, v] = key.split(",").map(Number);
            if (u === id || v === id) {
                this.edges.delete(key);
            }
        }
    }

    hasEdge(u, v) {
        if (!this.vertices.has(u) || !this.vertices.has(v)) return false;
        return this.edges.has(edgeKey(u, v, this.directed));
    }

    weight(u, v) {
        if (!this.vertices.has(u) || !this.vertices.has(v)) return null;
        const val = this.edges.get(edgeKey(u, v, this.directed));
        return val === undefined ? null : val;
    }

    addEdge(u, v, w) {
        this.edges.set(edgeKey(u, v, this.directed), this.weighted ? w : 1);
    }

    removeEdge(u, v) {
        this.edges.delete(edgeKey(u, v, this.directed));
    }

    clear() {
        this.vertices.clear();
        this.edges.clear();
    }

    sortedVertices() {
        return Array.from(this.vertices).sort((a, b) => a - b);
    }

    sortedEdges() {
        const list = [];
        for (const [key, weight] of this.edges.entries()) {
            const [from, to] = key.split(",").map(Number);
            list.push({ from, to, weight });
        }
        list.sort((a, b) => (a.from !== b.from ? a.from - b.from : a.to - b.to));
        return list;
    }

    neighbors(id) {
        if (!this.vertices.has(id)) return null;
        const out = [];
        for (const [key] of this.edges.entries()) {
            const [u, v] = key.split(",").map(Number);
            if (this.directed) {
                if (u === id) out.push(v);
            } else {
                if (u === id) out.push(v);
                else if (v === id) out.push(u);
            }
        }
        return out.sort((a, b) => a - b);
    }

    inDegree(id) {
        if (!this.vertices.has(id)) return null;
        if (!this.directed) return this.neighbors(id).length;
        let count = 0;
        for (const key of this.edges.keys()) {
            const [, v] = key.split(",").map(Number);
            if (v === id) count++;
        }
        return count;
    }

    outDegree(id) {
        if (!this.vertices.has(id)) return null;
        return this.neighbors(id).length;
    }

    degree(id) {
        if (!this.vertices.has(id)) return null;
        return this.directed ? this.inDegree(id) + this.outDegree(id) : this.outDegree(id);
    }
}

function assertStepsValid(steps, graph, label) {
    assert.ok(Array.isArray(steps), `${label}: steps must be an array`);
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        assert.equal(typeof step.type, "string", `${label} step[${i}]: type`);
        assert.equal(typeof step.operation, "string", `${label} step[${i}]: operation`);
        const lines = GRAPH_INFO.pseudocode[step.operation];
        assert.ok(Array.isArray(lines), `${label} step[${i}]: pseudocode exists for ${step.operation}`);
        assert.ok(
            Number.isInteger(step.line) && step.line >= 1 && step.line <= lines.length,
            `${label} step[${i}]: line ${step.line} outside 1..${lines.length}`,
        );
        assert.ok(Array.isArray(step.vertexIds), `${label} step[${i}]: vertexIds array`);
        assert.ok(
            step.edge === null ||
                (typeof step.edge === "object" &&
                    Number.isInteger(step.edge.from) &&
                    Number.isInteger(step.edge.to) &&
                    Number.isInteger(step.edge.weight)),
            `${label} step[${i}]: valid edge or null`,
        );
        assert.equal(typeof step.message, "string", `${label} step[${i}]: message`);
        assert.ok(step.message.length > 0, `${label} step[${i}]: non-empty message`);
        assert.equal(step.snapshot.directed, graph.directed, `${label} step[${i}]: snapshot.directed`);
        assert.equal(step.snapshot.weighted, graph.weighted, `${label} step[${i}]: snapshot.weighted`);
        assert.ok(Array.isArray(step.snapshot.vertices), `${label} step[${i}]: snapshot.vertices`);
        assert.ok(Array.isArray(step.snapshot.edges), `${label} step[${i}]: snapshot.edges`);
    }
    if (steps.length > 0) {
        assert.deepEqual(steps.at(-1).snapshot, graph.snapshot(), `${label}: final snapshot matches graph`);
    }
}

function assertMatchesModel(graph, model, label) {
    assert.equal(graph.integrityError(), null, `${label}: integrityError() should be null`);
    assert.equal(graph.directed, model.directed, `${label}: directed`);
    assert.equal(graph.weighted, model.weighted, `${label}: weighted`);

    const expectedVerts = model.sortedVertices();
    const expectedEdges = model.sortedEdges();

    assert.deepEqual(graph.vertices(), expectedVerts, `${label}: vertices()`);
    assert.equal(graph.size, expectedVerts.length, `${label}: size`);
    assert.equal(graph.vertexCount, expectedVerts.length, `${label}: vertexCount`);
    assert.equal(graph.edgeCount, expectedEdges.length, `${label}: edgeCount`);
    assert.equal(graph.isEmpty(), expectedVerts.length === 0, `${label}: isEmpty()`);
    assert.equal(graph.isFull(), expectedVerts.length === GRAPH_LIMITS.maxVertices, `${label}: isFull()`);
    assert.deepEqual(graph.edges(), expectedEdges, `${label}: edges()`);
    assert.deepEqual(
        graph.snapshot(),
        {
            directed: model.directed,
            weighted: model.weighted,
            vertices: expectedVerts,
            edges: expectedEdges,
        },
        `${label}: snapshot()`,
    );

    // Check vertex-level queries across full ID range 0..11.
    for (let id = 0; id < GRAPH_LIMITS.maxVertices; id++) {
        const present = model.vertices.has(id);
        assert.equal(graph.hasVertex(id), present, `${label}: hasVertex(${id})`);

        const nbrs = graph.neighbors(id);
        const expectedNbrs = model.neighbors(id);
        assert.deepEqual(nbrs, expectedNbrs, `${label}: neighbors(${id})`);
        if (nbrs !== null) {
            for (let k = 1; k < nbrs.length; k++) {
                assert.ok(nbrs[k] > nbrs[k - 1], `${label}: neighbors(${id}) must be strictly ascending`);
            }
        }

        assert.equal(graph.inDegree(id), model.inDegree(id), `${label}: inDegree(${id})`);
        assert.equal(graph.outDegree(id), model.outDegree(id), `${label}: outDegree(${id})`);
        assert.equal(graph.degree(id), model.degree(id), `${label}: degree(${id})`);
        if (present) {
            if (!model.directed) {
                assert.equal(graph.degree(id), graph.inDegree(id), `${label}: undirected degree === inDegree`);
                assert.equal(graph.degree(id), graph.outDegree(id), `${label}: undirected degree === outDegree`);
            } else {
                assert.equal(
                    graph.degree(id),
                    graph.inDegree(id) + graph.outDegree(id),
                    `${label}: directed degree === in + out`,
                );
            }
        }
    }

    // Check adjacency list representation.
    const adjList = graph.toAdjacencyList();
    assert.equal(adjList.length, expectedVerts.length, `${label}: toAdjacencyList length`);
    for (let i = 0; i < expectedVerts.length; i++) {
        const u = expectedVerts[i];
        assert.equal(adjList[i].id, u, `${label}: adjList[${i}].id`);
        const expectedNbrObjs = model.neighbors(u).map((to) => ({ to, weight: model.weight(u, to) }));
        assert.deepEqual(adjList[i].neighbors, expectedNbrObjs, `${label}: adjList[${u}].neighbors`);
    }

    // Check adjacency matrix representation + pairwise hasEdge/weight.
    const { ids, matrix } = graph.toAdjacencyMatrix();
    assert.deepEqual(ids, expectedVerts, `${label}: matrix.ids`);
    assert.equal(matrix.length, expectedVerts.length, `${label}: matrix rows`);
    for (let i = 0; i < ids.length; i++) {
        const u = ids[i];
        assert.equal(matrix[i].length, ids.length, `${label}: matrix row ${i} length`);
        assert.equal(matrix[i][i], null, `${label}: diagonal matrix[${i}][${i}] must be null`);
        for (let j = 0; j < ids.length; j++) {
            const v = ids[j];
            const expectedW = model.weight(u, v);
            assert.equal(graph.hasEdge(u, v), expectedW !== null, `${label}: hasEdge(${u}, ${v})`);
            assert.equal(graph.weight(u, v), expectedW, `${label}: weight(${u}, ${v})`);
            assert.equal(matrix[i][j], expectedW, `${label}: matrix[${i}][${j}]`);
            assert.notEqual(matrix[i][j], 0, `${label}: matrix never uses 0 sentinel`);
            assert.notEqual(matrix[i][j], -1, `${label}: matrix never uses -1 sentinel`);
            if (!model.directed) {
                assert.equal(matrix[i][j], matrix[j][i], `${label}: undirected matrix symmetry (${u}, ${v})`);
            }
        }
    }
}

/* ---------------- metadata & constructor ---------------- */

test("GRAPH_LIMITS and GRAPH_INFO expose required metadata and List vs Matrix complexities", () => {
    assert.deepEqual(GRAPH_LIMITS, {
        minId: 0,
        maxId: 11,
        maxVertices: 12,
        minWeight: 1,
        maxWeight: 99,
    });
    assert.ok(Object.isFrozen(GRAPH_LIMITS));
    assert.ok(Object.isFrozen(GRAPH_INFO));
    assert.equal(GRAPH_INFO.name, "Graph");
    assert.equal(typeof GRAPH_INFO.summary, "string");

    for (const key of ["addVertex", "removeVertex", "addEdge", "removeEdge", "hasEdge", "neighbors", "space"]) {
        const text = GRAPH_INFO.complexity[key];
        assert.equal(typeof text, "string", `complexity.${key}`);
        assert.match(text, /Adjacency List/i, `complexity.${key} compares Adjacency List`);
        assert.match(text, /Adjacency Matrix/i, `complexity.${key} compares Adjacency Matrix`);
    }
    assert.match(GRAPH_INFO.complexity.space, /O\(V \+ E\)/);
    assert.match(GRAPH_INFO.complexity.space, /O\(V²\)/);

    for (const op of ["addVertex", "removeVertex", "addEdge", "removeEdge", "clear", "build"]) {
        assert.ok(Array.isArray(GRAPH_INFO.pseudocode[op]) && GRAPH_INFO.pseudocode[op].length >= 1, `pseudocode.${op}`);
    }
});

test("Graph constructor validates options and initializes read-only defaults", () => {
    const g = new Graph();
    assert.equal(g.directed, false);
    assert.equal(g.weighted, false);
    assert.equal(g.size, 0);
    assert.equal(g.vertexCount, 0);
    assert.equal(g.edgeCount, 0);
    assert.equal(g.maxVertices, 12);
    assert.equal(g.isEmpty(), true);
    assert.equal(g.isFull(), false);
    assert.equal(g.integrityError(), null);

    assert.throws(() => new Graph(null), TypeError);
    assert.throws(() => new Graph("directed"), TypeError);
    assert.throws(() => new Graph([]), TypeError);
    assert.throws(() => new Graph({ directed: 1 }), TypeError);
    assert.throws(() => new Graph({ directed: "true" }), TypeError);
    assert.throws(() => new Graph({ weighted: 0 }), TypeError);
    assert.throws(() => new Graph({ weighted: null }), TypeError);
});

/* ---------------- 300 seeded property-test sequences across all 4 modes ---------------- */

const MODES = [
    { directed: false, weighted: false, name: "undirected-unweighted" },
    { directed: false, weighted: true, name: "undirected-weighted" },
    { directed: true, weighted: false, name: "directed-unweighted" },
    { directed: true, weighted: true, name: "directed-weighted" },
];

for (let m = 0; m < MODES.length; m++) {
    const mode = MODES[m];
    test(`Graph property suite (${mode.name}): 75 seeded sequences verified against independent Map model`, () => {
        for (let seq = 0; seq < 75; seq++) {
            const seed = (m + 1) * 100000 + seq * 997 + 13;
            const rng = mulberry32(seed);
            const g = new Graph({ directed: mode.directed, weighted: mode.weighted });
            const model = new GraphModel(mode.directed, mode.weighted);
            const seqLabel = `${mode.name}#${seq}`;

            for (let stepIdx = 0; stepIdx < 45; stepIdx++) {
                const label = `${seqLabel}@${stepIdx}`;
                const roll = rng();

                if (roll < 0.28) {
                    // addVertex
                    const id = randInt(rng, 0, 11);
                    const existed = model.vertices.has(id);
                    const res = g.addVertex(id);
                    if (existed) {
                        assert.equal(res.ok, false, `${label}: duplicate addVertex(${id})`);
                        assert.deepEqual(res.steps, [], `${label}: rejected addVertex returns [] steps`);
                    } else {
                        assert.equal(res.ok, true, `${label}: addVertex(${id}) succeeded`);
                        assert.equal(res.value, id);
                        model.addVertex(id);
                        assertStepsValid(res.steps, g, label);
                    }
                } else if (roll < 0.42) {
                    // removeVertex
                    const verts = model.sortedVertices();
                    const id = verts.length > 0 && rng() < 0.75 ? verts[randInt(rng, 0, verts.length - 1)] : randInt(rng, 0, 11);
                    const existed = model.vertices.has(id);
                    const res = g.removeVertex(id);
                    if (!existed) {
                        assert.equal(res.ok, false, `${label}: missing removeVertex(${id})`);
                        assert.deepEqual(res.steps, []);
                    } else {
                        assert.equal(res.ok, true, `${label}: removeVertex(${id}) succeeded`);
                        assert.equal(res.value, id);
                        model.removeVertex(id);
                        assertStepsValid(res.steps, g, label);
                    }
                } else if (roll < 0.76) {
                    // addEdge
                    const verts = model.sortedVertices();
                    const pickExisting = verts.length >= 2 && rng() < 0.85;
                    const u = pickExisting ? verts[randInt(rng, 0, verts.length - 1)] : randInt(rng, 0, 11);
                    const v = pickExisting ? verts[randInt(rng, 0, verts.length - 1)] : randInt(rng, 0, 11);
                    const w = mode.weighted ? randInt(rng, 1, 99) : undefined;
                    const shouldFail =
                        !model.vertices.has(u) || !model.vertices.has(v) || u === v || model.hasEdge(u, v);

                    const res = mode.weighted ? g.addEdge(u, v, w) : g.addEdge(u, v);
                    if (shouldFail) {
                        assert.equal(res.ok, false, `${label}: rejected addEdge(${u}, ${v})`);
                        assert.deepEqual(res.steps, []);
                    } else {
                        assert.equal(res.ok, true, `${label}: addEdge(${u}, ${v})`);
                        model.addEdge(u, v, w);
                        assertStepsValid(res.steps, g, label);
                    }
                } else if (roll < 0.96) {
                    // removeEdge
                    const edges = model.sortedEdges();
                    let u;
                    let v;
                    if (edges.length > 0 && rng() < 0.75) {
                        const chosen = edges[randInt(rng, 0, edges.length - 1)];
                        // In undirected mode, frequently test removing via reversed (v, u) order!
                        if (!mode.directed && rng() < 0.5) {
                            u = chosen.to;
                            v = chosen.from;
                        } else {
                            u = chosen.from;
                            v = chosen.to;
                        }
                    } else {
                        u = randInt(rng, 0, 11);
                        v = randInt(rng, 0, 11);
                    }
                    const existed = model.hasEdge(u, v);
                    const res = g.removeEdge(u, v);
                    if (!existed) {
                        assert.equal(res.ok, false, `${label}: rejected removeEdge(${u}, ${v})`);
                        assert.deepEqual(res.steps, []);
                    } else {
                        assert.equal(res.ok, true, `${label}: removeEdge(${u}, ${v})`);
                        model.removeEdge(u, v);
                        assertStepsValid(res.steps, g, label);
                    }
                } else {
                    // clear
                    const res = g.clear();
                    assert.equal(res.ok, true, `${label}: clear()`);
                    model.clear();
                    assertStepsValid(res.steps, g, label);
                }

                assertMatchesModel(g, model, label);
            }
        }
    });
}

/* ---------------- explicit edge cases ---------------- */

test("removeVertex removes all incident edges in undirected and directed modes with step trace", () => {
    // Undirected weighted graph: vertex 2 connected to 0, 5, 9
    const ug = Graph.from({
        directed: false,
        weighted: true,
        vertices: [0, 2, 5, 9],
        edges: [
            { from: 2, to: 0, weight: 10 },
            { from: 2, to: 5, weight: 20 },
            { from: 2, to: 9, weight: 30 },
            { from: 0, to: 9, weight: 40 },
        ],
    }).value;

    const uRes = ug.removeVertex(2);
    assert.equal(uRes.ok, true);
    assert.equal(uRes.value, 2);
    // 3 incident edge removals + 1 vertex removal = 4 steps
    assert.equal(uRes.steps.length, 4);
    assert.deepEqual(
        uRes.steps.map((s) => s.type),
        ["remove-edge", "remove-edge", "remove-edge", "remove-vertex"],
    );
    assertStepsValid(uRes.steps, ug, "undirected removeVertex");
    assert.equal(ug.vertexCount, 3);
    assert.equal(ug.edgeCount, 1);
    assert.deepEqual(ug.edges(), [{ from: 0, to: 9, weight: 40 }]);
    assert.equal(ug.integrityError(), null);

    // Directed weighted graph: vertex 3 has outgoing (3->1, 3->4) and incoming (0->3, 4->3)
    const dg = Graph.from({
        directed: true,
        weighted: true,
        vertices: [0, 1, 3, 4],
        edges: [
            { from: 3, to: 1, weight: 5 },
            { from: 3, to: 4, weight: 7 },
            { from: 0, to: 3, weight: 9 },
            { from: 4, to: 3, weight: 11 },
            { from: 0, to: 1, weight: 2 },
        ],
    }).value;

    const dRes = dg.removeVertex(3);
    assert.equal(dRes.ok, true);
    assert.equal(dRes.steps.length, 5);
    assert.deepEqual(
        dRes.steps.map((s) => s.type),
        ["remove-edge", "remove-edge", "remove-edge", "remove-edge", "remove-vertex"],
    );
    assertStepsValid(dRes.steps, dg, "directed removeVertex");
    assert.equal(dg.vertexCount, 3);
    assert.equal(dg.edgeCount, 1);
    assert.deepEqual(dg.edges(), [{ from: 0, to: 1, weight: 2 }]);
    assert.equal(dg.inDegree(1), 1);
    assert.equal(dg.outDegree(4), 0);
    assert.equal(dg.integrityError(), null);
});

test("duplicate/parallel edges and reverse edge behavior in undirected vs directed modes", () => {
    const ug = new Graph({ directed: false, weighted: false });
    ug.addVertex(1);
    ug.addVertex(4);
    assert.equal(ug.addEdge(1, 4).ok, true);
    // Exact duplicate
    const dup1 = ug.addEdge(1, 4);
    assert.equal(dup1.ok, false);
    assert.deepEqual(dup1.steps, []);
    // Reverse duplicate in undirected mode
    const dup2 = ug.addEdge(4, 1);
    assert.equal(dup2.ok, false);
    assert.deepEqual(dup2.steps, []);
    assert.equal(ug.edgeCount, 1);

    // Directed mode allows reverse edge (4 -> 1) with independent weight, rejects duplicate (1 -> 4)
    const dg = new Graph({ directed: true, weighted: true });
    dg.addVertex(1);
    dg.addVertex(4);
    assert.equal(dg.addEdge(1, 4, 12).ok, true);
    assert.equal(dg.addEdge(1, 4, 99).ok, false);
    assert.equal(dg.addEdge(4, 1, 34).ok, true);
    assert.equal(dg.edgeCount, 2);
    assert.equal(dg.weight(1, 4), 12);
    assert.equal(dg.weight(4, 1), 34);
    assert.equal(dg.inDegree(1), 1);
    assert.equal(dg.outDegree(1), 1);
    assert.equal(dg.degree(1), 2);
    assert.equal(dg.integrityError(), null);
});

test("self-loops, invalid weights, missing endpoints, and invalid vertex IDs are rejected cleanly", () => {
    // Self-loops in all 4 modes
    for (const mode of MODES) {
        const g = new Graph({ directed: mode.directed, weighted: mode.weighted });
        g.addVertex(0);
        const res = mode.weighted ? g.addEdge(0, 0, 5) : g.addEdge(0, 0);
        assert.equal(res.ok, false, `${mode.name}: self-loop rejected`);
        assert.match(res.error, /self-loop/i);
        assert.deepEqual(res.steps, []);
        assert.equal(g.edgeCount, 0);
    }

    // Weighted mode weight boundaries & bad weights
    const wg = new Graph({ directed: false, weighted: true });
    wg.addVertex(0);
    wg.addVertex(1);
    wg.addVertex(2);
    for (const badW of [undefined, null, 0, -1, 100, 1.5, NaN, Infinity, "5"]) {
        const res = wg.addEdge(0, 1, badW);
        assert.equal(res.ok, false, `weighted rejects weight ${String(badW)}`);
        assert.deepEqual(res.steps, []);
    }
    assert.equal(wg.addEdge(0, 1, 1).ok, true);
    assert.equal(wg.addEdge(1, 2, 99).ok, true);
    assert.equal(wg.weight(0, 1), 1);
    assert.equal(wg.weight(1, 2), 99);
    assert.equal(wg.weight(0, 2), null);

    // Unweighted mode rejects supplied weights and stores weight 1 internally
    const uwg = new Graph({ directed: false, weighted: false });
    uwg.addVertex(0);
    uwg.addVertex(1);
    for (const extraW of [1, 5, 0, -1, "1"]) {
        const res = uwg.addEdge(0, 1, extraW);
        assert.equal(res.ok, false, `unweighted rejects weight ${String(extraW)}`);
        assert.equal(res.error, "Weights are only allowed in weighted mode.");
        assert.deepEqual(res.steps, []);
    }
    assert.equal(uwg.addEdge(0, 1).ok, true);
    assert.equal(uwg.weight(0, 1), 1);
    assert.equal(uwg.weight(1, 0), 1);
    assert.deepEqual(uwg.toAdjacencyMatrix(), {
        ids: [0, 1],
        matrix: [
            [null, 1],
            [1, null],
        ],
    });

    // Missing endpoints on addEdge / removeEdge / removeVertex
    assert.equal(uwg.addEdge(0, 5).ok, false);
    assert.equal(uwg.addEdge(5, 0).ok, false);
    assert.equal(uwg.removeEdge(0, 5).ok, false);
    assert.equal(uwg.removeEdge(5, 0).ok, false);
    assert.equal(uwg.removeVertex(5).ok, false);

    // Invalid vertex IDs
    for (const badId of [-1, 12, 1.5, "2", NaN, Infinity, null, undefined]) {
        assert.equal(uwg.addVertex(badId).ok, false, `addVertex(${String(badId)})`);
        assert.equal(uwg.removeVertex(badId).ok, false, `removeVertex(${String(badId)})`);
        assert.equal(uwg.addEdge(badId, 0).ok, false, `addEdge(${String(badId)}, 0)`);
        assert.equal(uwg.addEdge(0, badId).ok, false, `addEdge(0, ${String(badId)})`);
        assert.equal(uwg.removeEdge(badId, 0).ok, false, `removeEdge(${String(badId)}, 0)`);
        assert.equal(uwg.hasVertex(badId), false);
        assert.equal(uwg.neighbors(badId), null);
        assert.equal(uwg.degree(badId), null);
        assert.equal(uwg.inDegree(badId), null);
        assert.equal(uwg.outDegree(badId), null);
        assert.equal(uwg.weight(badId, 0), null);
        assert.equal(uwg.hasEdge(badId, 0), false);
    }

    // Isolated vertex returns [] for neighbors, absent returns null
    const iso = new Graph();
    iso.addVertex(0);
    assert.deepEqual(iso.neighbors(0), []);
    assert.equal(iso.neighbors(1), null);
    assert.equal(iso.degree(0), 0);
    assert.equal(iso.degree(1), null);
});

test("12-vertex capacity limit, clear(), and deep-copy immutability", () => {
    const g = new Graph();
    for (let id = 11; id >= 0; id--) {
        const res = g.addVertex(id);
        assert.equal(res.ok, true);
    }
    assert.equal(g.size, 12);
    assert.equal(g.vertexCount, 12);
    assert.equal(g.isFull(), true);
    assert.deepEqual(g.vertices(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.equal(g.addVertex(12).ok, false);
    assert.equal(g.addVertex(0).ok, false);

    // Mutating returned copies does not affect internal state
    g.addEdge(0, 5);
    const verts = g.vertices();
    verts.push(99);
    assert.equal(g.size, 12);

    const nbrs = g.neighbors(0);
    nbrs.push(99);
    assert.deepEqual(g.neighbors(0), [5]);

    const edges = g.edges();
    edges[0].weight = 999;
    assert.equal(g.weight(0, 5), 1);

    const adj = g.toAdjacencyList();
    adj[0].neighbors[0].weight = 888;
    assert.equal(g.weight(0, 5), 1);

    const mat = g.toAdjacencyMatrix();
    mat.matrix[0][5] = 777;
    assert.equal(g.weight(0, 5), 1);

    const cleared = g.clear();
    assert.equal(cleared.ok, true);
    assert.deepEqual(cleared.value, { vertices: 12, edges: 1 });
    assert.equal(g.isEmpty(), true);
    assert.equal(g.size, 0);
    assert.equal(g.edgeCount, 0);
    assert.equal(g.integrityError(), null);
});

test("Graph.from() validates and builds graphs cleanly across valid and invalid inputs", () => {
    const built = Graph.from({
        directed: true,
        weighted: true,
        vertices: [5, 0, 2],
        edges: [
            { from: 5, to: 0, weight: 15 },
            { from: 0, to: 2, weight: 3 },
        ],
    });
    assert.equal(built.ok, true);
    const g = built.value;
    assert.equal(g.directed, true);
    assert.equal(g.weighted, true);
    assert.deepEqual(g.vertices(), [0, 2, 5]);
    assert.deepEqual(g.edges(), [
        { from: 0, to: 2, weight: 3 },
        { from: 5, to: 0, weight: 15 },
    ]);
    assertStepsValid(built.steps, g, "Graph.from valid");
    assert.equal(g.integrityError(), null);

    // Default empty Graph.from()
    const emptyRes = Graph.from();
    assert.equal(emptyRes.ok, true);
    assert.equal(emptyRes.value.isEmpty(), true);
    assertStepsValid(emptyRes.steps, emptyRes.value, "Graph.from empty");

    // Invalid Graph.from() inputs return { ok: false, error, steps: [] }
    const badConfigs = [
        null,
        "invalid",
        [],
        { directed: "yes" },
        { weighted: 1 },
        { vertices: "012" },
        { edges: "bad" },
        { vertices: [-1] },
        { vertices: [0, 0] },
        { vertices: [0, 1], edges: ["bad-edge"] },
        { vertices: [0, 1], edges: [{ from: 0, to: 0 }] },
        { vertices: [0, 1], edges: [{ from: 0, to: 2 }] },
        { weighted: true, vertices: [0, 1], edges: [{ from: 0, to: 1 }] },
        { weighted: false, vertices: [0, 1], edges: [{ from: 0, to: 1, weight: 5 }] },
        { directed: false, vertices: [0, 1], edges: [{ from: 0, to: 1 }, { from: 1, to: 0 }] },
    ];
    for (const cfg of badConfigs) {
        const res = Graph.from(cfg);
        assert.equal(res.ok, false, `Graph.from rejects ${JSON.stringify(cfg)}`);
        assert.equal(typeof res.error, "string");
        assert.deepEqual(res.steps, []);
    }
});

test("integrityError() detects internal corruption violations", () => {
    const makeBase = (opts = {}) =>
        Graph.from({
            directed: opts.directed ?? false,
            weighted: opts.weighted ?? false,
            vertices: [0, 1, 2],
            edges: opts.weighted
                ? [
                      { from: 0, to: 1, weight: 5 },
                      { from: 1, to: 2, weight: 8 },
                  ]
                : [
                      { from: 0, to: 1 },
                      { from: 1, to: 2 },
                  ],
        }).value;

    // 1. Out-of-range vertex ID
    const g1 = makeBase();
    g1._adj.set(12, []);
    assert.match(g1.integrityError(), /outside 0\.\.11/i);

    // 2. Dangling edge to missing vertex
    const g2 = makeBase({ directed: true });
    g2._adj.get(0).push({ to: 9, weight: 1 });
    g2._edgeCount++;
    assert.match(g2.integrityError(), /missing vertex/i);

    // 3. Self-loop
    const g3 = makeBase({ directed: true });
    g3._adj.get(0).unshift({ to: 0, weight: 1 });
    g3._edgeCount++;
    assert.match(g3.integrityError(), /self-loop/i);

    // 4. Unsorted neighbor list
    const g4 = makeBase({ directed: true });
    g4._adj.get(0).push({ to: 2, weight: 1 });
    g4._adj.get(0).reverse();
    g4._edgeCount++;
    assert.match(g4.integrityError(), /not strictly ascending/i);

    // 5. Duplicate neighbor entry
    const g5 = makeBase({ directed: true });
    g5._adj.get(0).push({ to: 1, weight: 1 });
    g5._edgeCount++;
    assert.match(g5.integrityError(), /not strictly ascending/i);

    // 6. Invalid weighted edge weight
    const g6 = makeBase({ directed: true, weighted: true });
    g6._adj.get(0)[0].weight = 0;
    assert.match(g6.integrityError(), /invalid weighted edge/i);

    // 7. Invalid unweighted edge weight
    const g7 = makeBase({ directed: true, weighted: false });
    g7._adj.get(0)[0].weight = 2;
    assert.match(g7.integrityError(), /must have weight 1/i);

    // 8. Missing reverse edge in undirected mode
    const g8 = makeBase({ directed: false });
    g8._adj.set(1, g8._adj.get(1).filter((e) => e.to !== 0));
    assert.match(g8.integrityError(), /symmetry violated/i);

    // 9. Mismatched reverse weight in undirected weighted mode
    const g9 = makeBase({ directed: false, weighted: true });
    g9._adj.get(1).find((e) => e.to === 0).weight = 99;
    assert.match(g9.integrityError(), /weight mismatch/i);

    // 10. edgeCount mismatch
    const g10 = makeBase();
    g10._edgeCount = 99;
    assert.match(g10.integrityError(), /edgeCount/i);
});
