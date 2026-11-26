import { ok, fail } from "./result.js";

/**
 * Pure, DOM-free Graph data structure supporting all 4 combinations of:
 *   - undirected / directed
 *   - unweighted / weighted
 *
 * Representation:
 * - Internal adjacency list: `Map<number, Array<{ to: number, weight: number }>>`
 *   where every vertex's neighbor array is kept strictly ascending by `to`.
 * - Every vertex ID is a whole number in `0..11` (at most 12 vertices).
 * - Self-loops (`u === v`) and parallel/duplicate edges are rejected.
 * - Unweighted edges store `weight: 1`; weighted edges require integer weights in `1..99`.
 * - Absent edges are represented by `null` (in `weight()` and `toAdjacencyMatrix()`),
 *   never `0` or `-1`.
 *
 * Every mutating operation returns `{ ok, value?, error?, steps }` (see result.js).
 * Rejected operations do not mutate the graph and return `{ ok: false, error, steps: [] }`.
 * Each recorded step has the shape:
 *   `{ type, operation, vertexIds, edge, line, message, snapshot }`
 * where `line` is a 1-based line in `GRAPH_INFO.pseudocode[operation]`,
 * `edge` is `{ from, to, weight } | null`, `vertexIds` is `number[]`, and
 * `snapshot` is a plain deep copy `{ directed, weighted, vertices, edges }`.
 */

export const GRAPH_LIMITS = Object.freeze({
    minId: 0,
    maxId: 11,
    maxVertices: 12,
    minWeight: 1,
    maxWeight: 99,
});

/** Registry entry matching the site's shared metadata pattern. */
export const GRAPH_INFO = Object.freeze({
    name: "Graph",
    summary:
        "A collection of V vertices connected by E edges, supporting directed or undirected and " +
        "unweighted or weighted modes. Compare how an Adjacency List saves space on sparse graphs " +
        "(O(V + E)) while an Adjacency Matrix offers O(1) edge lookup at O(V²) space, where deg(u) " +
        "is vertex u's degree (out-degree deg⁺(u) in directed graphs).",
    complexity: Object.freeze({
        addVertex: "Adjacency List: O(1) | Adjacency Matrix: O(V²)",
        removeVertex: "Adjacency List: O(V + E) | Adjacency Matrix: O(V²)",
        addEdge: "Adjacency List: O(deg(u) + deg(v)) undirected, O(deg⁺(u)) directed | Adjacency Matrix: O(1)",
        removeEdge: "Adjacency List: O(deg(u) + deg(v)) undirected, O(deg⁺(u)) directed | Adjacency Matrix: O(1)",
        hasEdge: "Adjacency List: O(deg(u)) | Adjacency Matrix: O(1)",
        neighbors: "Adjacency List: O(deg(u)) | Adjacency Matrix: O(V)",
        space: "Adjacency List: O(V + E) | Adjacency Matrix: O(V²)",
    }),
    pseudocode: Object.freeze({
        addVertex: Object.freeze([
            "validate vertex id in 0..11",
            "if id already exists or size == 12: return error",
            "adj[id] ← []  // create empty sorted neighbor list",
            "return id",
        ]),
        removeVertex: Object.freeze([
            "validate vertex id and verify it exists",
            "for each edge incident to id (outgoing & incoming if directed):",
            "    remove incident edge from adjacency lists",
            "delete adj[id]",
            "return id",
        ]),
        addEdge: Object.freeze([
            "validate endpoints u, v (must exist and u ≠ v)",
            "validate weight (1..99 if weighted; none if unweighted)",
            "if edge (u, v) already exists: return duplicate error",
            "insert (v, w) into adj[u] in ascending order",
            "if undirected: also insert (u, w) into adj[v] in ascending order",
            "return edge { from, to, weight }",
        ]),
        removeEdge: Object.freeze([
            "validate endpoints u, v (must exist)",
            "if edge (u, v) does not exist: return error",
            "remove v from adj[u]",
            "if undirected: also remove u from adj[v]",
            "return removed edge { from, to, weight }",
        ]),
        clear: Object.freeze([
            "adj.clear();  edgeCount ← 0",
        ]),
        build: Object.freeze([
            "validate graph mode and vertex/edge lists",
            "for each id in vertices: addVertex(id)",
            "for each (from, to, weight) in edges: addEdge(from, to, weight)",
            "return built graph",
        ]),
    }),
});

export class Graph {
    /**
     * @param {{ directed?: boolean, weighted?: boolean }} [options]
     */
    constructor(options = {}) {
        if (options === null || typeof options !== "object" || Array.isArray(options)) {
            throw new TypeError("Graph options must be an object");
        }
        const { directed = false, weighted = false } = options;
        if (typeof directed !== "boolean") {
            throw new TypeError(`Graph option "directed" must be a boolean (got ${typeof directed})`);
        }
        if (typeof weighted !== "boolean") {
            throw new TypeError(`Graph option "weighted" must be a boolean (got ${typeof weighted})`);
        }
        this._directed = directed;
        this._weighted = weighted;
        /** @type {Map<number, Array<{ to: number, weight: number }>>} */
        this._adj = new Map();
        this._edgeCount = 0;
    }

    /**
     * Validates inputs and builds a `Graph` from `{ directed, weighted, vertices, edges }`.
     * Accepts edge items as `{ from, to, weight? }`.
     * Returns `{ ok: true, value: graph, steps }` or `{ ok: false, error, steps: [] }`.
     *
     * @param {{
     *   directed?: boolean,
     *   weighted?: boolean,
     *   vertices?: number[],
     *   edges?: Array<{ from: number, to: number, weight?: number }>
     * }} [config]
     */
    static from(config = {}) {
        if (config === null || typeof config !== "object" || Array.isArray(config)) {
            return fail("Graph.from() expects a configuration object.");
        }
        const { directed = false, weighted = false, vertices = [], edges = [] } = config;
        if (typeof directed !== "boolean") {
            return fail(`Graph option "directed" must be a boolean (got ${typeof directed}).`);
        }
        if (typeof weighted !== "boolean") {
            return fail(`Graph option "weighted" must be a boolean (got ${typeof weighted}).`);
        }
        if (!Array.isArray(vertices)) {
            return fail('Graph option "vertices" must be an array of vertex IDs.');
        }
        if (!Array.isArray(edges)) {
            return fail('Graph option "edges" must be an array of edge objects.');
        }

        const graph = new Graph({ directed, weighted });
        const steps = [];

        for (const id of vertices) {
            const res = graph.addVertex(id);
            if (!res.ok) return fail(res.error);
            steps.push(
                graph.#step("add-vertex", "build", {
                    vertexIds: [res.value],
                    edge: null,
                    line: 2,
                    message: `Added vertex ${res.value}.`,
                }),
            );
        }

        for (let i = 0; i < edges.length; i++) {
            const item = edges[i];
            if (item === null || typeof item !== "object" || Array.isArray(item)) {
                return fail(`Edge at index ${i} must be an object { from, to, weight? }.`);
            }
            const res = graph.addEdge(item.from, item.to, item.weight);
            if (!res.ok) return fail(res.error);
            const edge = res.value;
            steps.push(
                graph.#step("add-edge", "build", {
                    vertexIds: [edge.from, edge.to],
                    edge,
                    line: 3,
                    message: formatEdgeAction("Added", edge, directed, weighted),
                }),
            );
        }

        const vCount = graph.vertexCount;
        const eCount = graph.edgeCount;
        steps.push(
            graph.#step("done", "build", {
                vertexIds: graph.vertices(),
                edge: null,
                line: 4,
                message:
                    `Built ${directed ? "directed" : "undirected"} ${weighted ? "weighted" : "unweighted"} ` +
                    `graph with ${vCount} ${vCount === 1 ? "vertex" : "vertices"} and ` +
                    `${eCount} ${eCount === 1 ? "edge" : "edges"}.`,
            }),
        );

        return ok(graph, steps);
    }

    /* ---------- read-only getters ---------- */

    get directed() {
        return this._directed;
    }

    get weighted() {
        return this._weighted;
    }

    get size() {
        return this._adj.size;
    }

    get vertexCount() {
        return this._adj.size;
    }

    get edgeCount() {
        return this._edgeCount;
    }

    get maxVertices() {
        return GRAPH_LIMITS.maxVertices;
    }

    isEmpty() {
        return this._adj.size === 0;
    }

    isFull() {
        return this._adj.size >= GRAPH_LIMITS.maxVertices;
    }

    /* ---------- pure query methods ---------- */

    /**
     * Returns `true` if vertex `id` is present in the graph, `false` otherwise. O(1).
     *
     * @param {number} id
     * @returns {boolean}
     */
    hasVertex(id) {
        if (typeof id !== "number" || !Number.isInteger(id)) return false;
        return this._adj.has(normalizeZero(id));
    }

    /**
     * Returns `true` if edge `(u, v)` exists in the graph, `false` otherwise. O(deg(u)).
     *
     * @param {number} u
     * @param {number} v
     * @returns {boolean}
     */
    hasEdge(u, v) {
        return this.weight(u, v) !== null;
    }

    /**
     * Returns the integer weight of edge `(u, v)` (`1..99` when weighted, `1` when unweighted),
     * or `null` when either endpoint is absent or no edge exists (never `0` or `-1`). O(deg(u)).
     *
     * @param {number} u
     * @param {number} v
     * @returns {number | null}
     */
    weight(u, v) {
        if (!this.hasVertex(u) || !this.hasVertex(v)) return null;
        const list = this._adj.get(normalizeZero(u));
        const target = normalizeZero(v);
        const idx = findNeighborIndex(list, target);
        return idx === null ? null : list[idx].weight;
    }

    /**
     * Returns a new strictly ascending array of neighbor vertex IDs for `id`,
     * or `null` if vertex `id` is not in the graph (distinguishing an absent vertex
     * from an isolated vertex whose neighbors are `[]`). O(deg(id)).
     *
     * @param {number} id
     * @returns {number[] | null}
     */
    neighbors(id) {
        if (!this.hasVertex(id)) return null;
        return this._adj.get(normalizeZero(id)).map((entry) => entry.to);
    }

    /**
     * Returns the out-degree of vertex `id`, or `null` if `id` is not in the graph.
     * In undirected mode, `outDegree(id) === inDegree(id) === degree(id)`. O(1).
     *
     * @param {number} id
     * @returns {number | null}
     */
    outDegree(id) {
        if (!this.hasVertex(id)) return null;
        return this._adj.get(normalizeZero(id)).length;
    }

    /**
     * Returns the in-degree of vertex `id`, or `null` if `id` is not in the graph.
     * In undirected mode, `inDegree(id) === outDegree(id) === degree(id)` in O(1).
     * In directed mode, scans adjacency lists in O(V + E).
     *
     * @param {number} id
     * @returns {number | null}
     */
    inDegree(id) {
        if (!this.hasVertex(id)) return null;
        const v = normalizeZero(id);
        if (!this._directed) {
            return this._adj.get(v).length;
        }
        let count = 0;
        for (const list of this._adj.values()) {
            if (findNeighborIndex(list, v) !== null) count++;
        }
        return count;
    }

    /**
     * Returns the total degree of vertex `id`, or `null` if `id` is not in the graph.
     * Undirected: `degree(id) === inDegree(id) === outDegree(id)`.
     * Directed: `degree(id) === inDegree(id) + outDegree(id)`.
     *
     * @param {number} id
     * @returns {number | null}
     */
    degree(id) {
        if (!this.hasVertex(id)) return null;
        if (!this._directed) {
            return this._adj.get(normalizeZero(id)).length;
        }
        return this.inDegree(id) + this.outDegree(id);
    }

    /**
     * Returns all vertex IDs in strictly ascending order.
     *
     * @returns {number[]}
     */
    vertices() {
        return Array.from(this._adj.keys()).sort((a, b) => a - b);
    }

    /**
     * Returns all edges sorted lexicographically by `(from, to)`.
     * In undirected mode, each edge appears once with `from < to`.
     *
     * @returns {Array<{ from: number, to: number, weight: number }>}
     */
    edges() {
        const result = [];
        for (const u of this.vertices()) {
            const list = this._adj.get(u);
            for (const entry of list) {
                if (!this._directed && u >= entry.to) continue;
                result.push({ from: u, to: entry.to, weight: entry.weight });
            }
        }
        return result;
    }

    /**
     * Returns a plain deep copy of the adjacency list representation,
     * sorted ascending by vertex `id` and with each `neighbors` array ascending by `to`.
     *
     * @returns {Array<{ id: number, neighbors: Array<{ to: number, weight: number }> }>}
     */
    toAdjacencyList() {
        return this.vertices().map((id) => ({
            id,
            neighbors: this._adj.get(id).map((entry) => ({ to: entry.to, weight: entry.weight })),
        }));
    }

    /**
     * Returns the adjacency matrix representation `{ ids, matrix }` where `ids` is ascending
     * `vertices()` and `matrix[i][j]` is the edge weight (`1` when unweighted, `1..99` when
     * weighted) or `null` when no edge exists (never `0` or `-1`).
     *
     * @returns {{ ids: number[], matrix: Array<Array<number | null>> }}
     */
    toAdjacencyMatrix() {
        const ids = this.vertices();
        const indexOf = new Map(ids.map((id, idx) => [id, idx]));
        const n = ids.length;
        const matrix = Array.from({ length: n }, () => new Array(n).fill(null));

        for (let i = 0; i < n; i++) {
            const list = this._adj.get(ids[i]);
            for (const entry of list) {
                const j = indexOf.get(entry.to);
                if (j !== undefined) {
                    matrix[i][j] = entry.weight;
                }
            }
        }

        return { ids, matrix };
    }

    /**
     * Returns a plain deep copy of the graph state for step replay and rendering.
     *
     * @returns {{
     *   directed: boolean,
     *   weighted: boolean,
     *   vertices: number[],
     *   edges: Array<{ from: number, to: number, weight: number }>
     * }}
     */
    snapshot() {
        return {
            directed: this._directed,
            weighted: this._weighted,
            vertices: this.vertices(),
            edges: this.edges(),
        };
    }

    /**
     * Verifies all structural invariants of the graph:
     * 1. Valid mode flags and internal adjacency map size <= maxVertices (12).
     * 2. Every vertex ID is a whole number in `0..11`.
     * 3. Every neighbor list is strictly ascending with no duplicates, no self-loops,
     *    no dangling edges to missing vertices, and valid weights (`1..99` if weighted, `1` if unweighted).
     * 4. Undirected adjacency lists are symmetric with matching weights.
     * 5. `edgeCount` matches the actual number of stored edges.
     * 6. `toAdjacencyMatrix()` agrees 100% with the internal adjacency list, has `null`
     *    for absent edges and on the diagonal, and is symmetric in undirected mode.
     *
     * @returns {string | null} `null` when sound, otherwise a descriptive error string.
     */
    integrityError() {
        if (typeof this._directed !== "boolean" || typeof this._weighted !== "boolean") {
            return "graph mode flags (directed, weighted) must be booleans";
        }
        if (!(this._adj instanceof Map)) {
            return "internal adjacency structure is not a Map";
        }
        if (this._adj.size > GRAPH_LIMITS.maxVertices) {
            return `vertex count (${this._adj.size}) exceeds maxVertices (${GRAPH_LIMITS.maxVertices})`;
        }

        for (const [id, list] of this._adj.entries()) {
            if (typeof id !== "number" || !Number.isInteger(id) || id < GRAPH_LIMITS.minId || id > GRAPH_LIMITS.maxId) {
                return `vertex ID ${formatValue(id)} is outside ${GRAPH_LIMITS.minId}..${GRAPH_LIMITS.maxId}`;
            }
            if (!Array.isArray(list)) {
                return `adjacency list for vertex ${id} is not an array`;
            }
        }

        let directedEntries = 0;
        for (const [u, list] of this._adj.entries()) {
            let prevTo = null;
            for (const entry of list) {
                if (entry === null || typeof entry !== "object") {
                    return `malformed neighbor entry in vertex ${u}'s adjacency list`;
                }
                const { to, weight } = entry;
                if (typeof to !== "number" || !Number.isInteger(to) || to < GRAPH_LIMITS.minId || to > GRAPH_LIMITS.maxId) {
                    return `neighbor ID ${formatValue(to)} in vertex ${u}'s list is outside ${GRAPH_LIMITS.minId}..${GRAPH_LIMITS.maxId}`;
                }
                if (!this._adj.has(to)) {
                    return `edge ${u} -> ${to} points to missing vertex ${to}`;
                }
                if (to === u) {
                    return `self-loop detected at vertex ${u}`;
                }
                if (prevTo !== null && to <= prevTo) {
                    return `neighbors of vertex ${u} are not strictly ascending (${to} follows ${prevTo})`;
                }
                prevTo = to;

                if (this._weighted) {
                    if (
                        typeof weight !== "number" ||
                        !Number.isInteger(weight) ||
                        weight < GRAPH_LIMITS.minWeight ||
                        weight > GRAPH_LIMITS.maxWeight
                    ) {
                        return `invalid weighted edge ${u} -> ${to} weight ${formatValue(weight)}`;
                    }
                } else if (weight !== 1) {
                    return `unweighted edge ${u} -> ${to} must have weight 1 (got ${formatValue(weight)})`;
                }

                if (!this._directed) {
                    const reverseList = this._adj.get(to);
                    const revIdx = findNeighborIndex(reverseList, u);
                    if (revIdx === null) {
                        return `undirected symmetry violated: ${u} -> ${to} exists but ${to} -> ${u} is missing`;
                    }
                    if (reverseList[revIdx].weight !== weight) {
                        return `undirected weight mismatch: ${u} -> ${to} has weight ${weight}, but ${to} -> ${u} has ${reverseList[revIdx].weight}`;
                    }
                }

                directedEntries++;
            }
        }

        if (!this._directed && directedEntries % 2 !== 0) {
            return `undirected adjacency entry count (${directedEntries}) must be even`;
        }
        const expectedEdgeCount = this._directed ? directedEntries : directedEntries / 2;
        if (!Number.isInteger(this._edgeCount) || this._edgeCount !== expectedEdgeCount) {
            return `edgeCount (${this._edgeCount}) does not match stored edges (${expectedEdgeCount})`;
        }

        const { ids, matrix } = this.toAdjacencyMatrix();
        if (ids.length !== this._adj.size || matrix.length !== ids.length) {
            return "adjacency matrix dimensions do not match vertex count";
        }
        for (let i = 0; i < ids.length; i++) {
            if (i > 0 && ids[i] <= ids[i - 1]) {
                return `adjacency matrix ids are not strictly ascending (${ids[i]} follows ${ids[i - 1]})`;
            }
            if (!Array.isArray(matrix[i]) || matrix[i].length !== ids.length) {
                return `adjacency matrix row ${i} has invalid length`;
            }
            if (matrix[i][i] !== null) {
                return `adjacency matrix diagonal at vertex ${ids[i]} must be null (got ${matrix[i][i]})`;
            }
            const u = ids[i];
            const list = this._adj.get(u);
            for (let j = 0; j < ids.length; j++) {
                const v = ids[j];
                const idx = findNeighborIndex(list, v);
                const expected = idx === null ? null : list[idx].weight;
                if (matrix[i][j] !== expected) {
                    return `adjacency list/matrix mismatch at (${u}, ${v}): list has ${expected}, matrix has ${matrix[i][j]}`;
                }
                if (!this._directed && matrix[i][j] !== matrix[j][i]) {
                    return `undirected adjacency matrix is not symmetric at (${u}, ${v})`;
                }
            }
        }

        return null;
    }

    /* ---------- mutating operations ---------- */

    /**
     * Adds vertex `id` (`0..11`) to the graph. O(1).
     * Rejects invalid IDs, duplicates, and full capacity with `{ ok: false, error, steps: [] }`.
     *
     * @param {number} id
     */
    addVertex(id) {
        const idErr = validateVertexId(id, "Vertex ID");
        if (idErr !== null) return fail(idErr);

        const v = normalizeZero(id);
        if (this._adj.has(v)) {
            return fail(`Vertex ${v} already exists in the graph.`);
        }
        if (this.isFull()) {
            return fail(`Graph is full: maximum of ${GRAPH_LIMITS.maxVertices} vertices reached.`);
        }

        this._adj.set(v, []);
        return ok(v, [
            this.#step("add-vertex", "addVertex", {
                vertexIds: [v],
                edge: null,
                line: 3,
                message: `Added vertex ${v}.`,
            }),
        ]);
    }

    /**
     * Removes vertex `id` and every edge incident to it (outgoing & incoming if directed;
     * both symmetric directions if undirected). O(V + E).
     * Records a step for each removed incident edge followed by the vertex removal step.
     *
     * @param {number} id
     */
    removeVertex(id) {
        const idErr = validateVertexId(id, "Vertex ID");
        if (idErr !== null) return fail(idErr);

        const v = normalizeZero(id);
        if (!this._adj.has(v)) {
            return fail(`Vertex ${v} does not exist in the graph.`);
        }

        const steps = [];
        let removedEdges = 0;

        // Animate incident edge removals one step at a time so every intermediate snapshot
        // remains a valid graph (a non-animated implementation drops adj[v] directly in O(1)
        // for O(V + E) total; here V <= 12).
        if (!this._directed) {
            const incident = this._adj.get(v).slice();
            for (const { to: nbr, weight } of incident) {
                removeNeighbor(this._adj.get(v), nbr);
                removeNeighbor(this._adj.get(nbr), v);
                this._edgeCount--;
                removedEdges++;
                const edge = canonicalEdge(v, nbr, weight, false);
                steps.push(
                    this.#step("remove-edge", "removeVertex", {
                        vertexIds: [v, nbr],
                        edge,
                        line: 3,
                        message: `Removed incident edge ${edge.from} — ${edge.to}${formatWeightSuffix(weight, this._weighted)} touching vertex ${v}.`,
                    }),
                );
            }
        } else {
            const outgoing = this._adj.get(v).slice();
            for (const { to: nbr, weight } of outgoing) {
                removeNeighbor(this._adj.get(v), nbr);
                this._edgeCount--;
                removedEdges++;
                const edge = { from: v, to: nbr, weight };
                steps.push(
                    this.#step("remove-edge", "removeVertex", {
                        vertexIds: [v, nbr],
                        edge,
                        line: 3,
                        message: `Removed outgoing edge ${v} → ${nbr}${formatWeightSuffix(weight, this._weighted)} from vertex ${v}.`,
                    }),
                );
            }

            for (const u of this.vertices()) {
                if (u === v) continue;
                const list = this._adj.get(u);
                const idx = findNeighborIndex(list, v);
                if (idx !== null) {
                    const weight = list[idx].weight;
                    list.splice(idx, 1);
                    this._edgeCount--;
                    removedEdges++;
                    const edge = { from: u, to: v, weight };
                    steps.push(
                        this.#step("remove-edge", "removeVertex", {
                            vertexIds: [u, v],
                            edge,
                            line: 3,
                            message: `Removed incoming edge ${u} → ${v}${formatWeightSuffix(weight, this._weighted)} into vertex ${v}.`,
                        }),
                    );
                }
            }
        }

        this._adj.delete(v);
        steps.push(
            this.#step("remove-vertex", "removeVertex", {
                vertexIds: [v],
                edge: null,
                line: 4,
                message:
                    removedEdges > 0
                        ? `Removed vertex ${v} after removing ${removedEdges} incident ${removedEdges === 1 ? "edge" : "edges"}.`
                        : `Removed isolated vertex ${v}.`,
            }),
        );

        return ok(v, steps);
    }

    /**
     * Adds edge `(u, v)` (and symmetric `(v, u)` when undirected) in sorted neighbor order.
     * Rejects missing endpoints, self-loops, parallel/duplicate edges, and invalid weights.
     *
     * @param {number} u
     * @param {number} v
     * @param {number} [w] required integer `1..99` when weighted; disallowed when unweighted
     */
    addEdge(u, v, w) {
        const uErr = validateVertexId(u, "Source vertex");
        if (uErr !== null) return fail(uErr);
        const vErr = validateVertexId(v, "Target vertex");
        if (vErr !== null) return fail(vErr);

        const from = normalizeZero(u);
        const to = normalizeZero(v);

        if (!this._adj.has(from)) {
            return fail(`Vertex ${from} does not exist in the graph.`);
        }
        if (!this._adj.has(to)) {
            return fail(`Vertex ${to} does not exist in the graph.`);
        }
        if (from === to) {
            return fail(`Self-loops are not allowed (vertex ${from} to itself).`);
        }

        let weight;
        if (this._weighted) {
            if (w === undefined || w === null) {
                return fail(
                    `Edge weight is required in weighted mode (whole number from ${GRAPH_LIMITS.minWeight} to ${GRAPH_LIMITS.maxWeight}).`,
                );
            }
            if (
                typeof w !== "number" ||
                !Number.isInteger(w) ||
                w < GRAPH_LIMITS.minWeight ||
                w > GRAPH_LIMITS.maxWeight
            ) {
                return fail(
                    `Edge weight must be a whole number from ${GRAPH_LIMITS.minWeight} to ${GRAPH_LIMITS.maxWeight} (got ${formatValue(w)}).`,
                );
            }
            weight = w;
        } else {
            if (w !== undefined && w !== null) {
                return fail("Weights are only allowed in weighted mode.");
            }
            weight = 1;
        }

        if (findNeighborIndex(this._adj.get(from), to) !== null) {
            const label = this._directed
                ? `${from} → ${to}`
                : `${Math.min(from, to)} — ${Math.max(from, to)}`;
            return fail(`Edge ${label} already exists (parallel edges are not allowed).`);
        }

        insertNeighborSorted(this._adj.get(from), { to, weight });
        if (!this._directed) {
            insertNeighborSorted(this._adj.get(to), { to: from, weight });
        }
        this._edgeCount++;

        const edge = canonicalEdge(from, to, weight, this._directed);
        return ok({ ...edge }, [
            this.#step("add-edge", "addEdge", {
                vertexIds: [edge.from, edge.to],
                edge,
                line: this._directed ? 4 : 5,
                message: formatEdgeAction("Added", edge, this._directed, this._weighted),
            }),
        ]);
    }

    /**
     * Removes edge `(u, v)` (and symmetric `(v, u)` when undirected).
     * Rejects invalid/missing endpoints or non-existent edges cleanly.
     *
     * @param {number} u
     * @param {number} v
     */
    removeEdge(u, v) {
        const uErr = validateVertexId(u, "Source vertex");
        if (uErr !== null) return fail(uErr);
        const vErr = validateVertexId(v, "Target vertex");
        if (vErr !== null) return fail(vErr);

        const from = normalizeZero(u);
        const to = normalizeZero(v);

        if (!this._adj.has(from)) {
            return fail(`Vertex ${from} does not exist in the graph.`);
        }
        if (!this._adj.has(to)) {
            return fail(`Vertex ${to} does not exist in the graph.`);
        }

        const fromList = this._adj.get(from);
        const idx = findNeighborIndex(fromList, to);
        if (idx === null) {
            const label = this._directed
                ? `${from} → ${to}`
                : `${Math.min(from, to)} — ${Math.max(from, to)}`;
            return fail(`Edge ${label} does not exist in the graph.`);
        }

        const weight = fromList[idx].weight;
        fromList.splice(idx, 1);
        if (!this._directed) {
            removeNeighbor(this._adj.get(to), from);
        }
        this._edgeCount--;

        const edge = canonicalEdge(from, to, weight, this._directed);
        return ok({ ...edge }, [
            this.#step("remove-edge", "removeEdge", {
                vertexIds: [edge.from, edge.to],
                edge,
                line: this._directed ? 3 : 4,
                message: formatEdgeAction("Removed", edge, this._directed, this._weighted),
            }),
        ]);
    }

    /**
     * Removes all vertices and edges from the graph. O(1).
     */
    clear() {
        const prevVertices = this._adj.size;
        const prevEdges = this._edgeCount;
        this._adj.clear();
        this._edgeCount = 0;

        return ok({ vertices: prevVertices, edges: prevEdges }, [
            this.#step("clear", "clear", {
                vertexIds: [],
                edge: null,
                line: 1,
                message:
                    `Cleared ${prevVertices} ${prevVertices === 1 ? "vertex" : "vertices"} and ` +
                    `${prevEdges} ${prevEdges === 1 ? "edge" : "edges"}. The graph is now empty.`,
            }),
        ]);
    }

    /* ---------- internals ---------- */

    #step(type, operation, { vertexIds = [], edge = null, line, message } = {}) {
        const lines = GRAPH_INFO.pseudocode[operation];
        if (!lines || !Number.isInteger(line) || line < 1 || line > lines.length) {
            throw new RangeError(`Invalid pseudocode line ${line} for operation "${operation}"`);
        }
        return {
            type,
            operation,
            vertexIds: vertexIds.slice(),
            edge: edge === null ? null : { from: edge.from, to: edge.to, weight: edge.weight },
            line,
            message,
            snapshot: this.snapshot(),
        };
    }
}

/* ---------- pure module helpers ---------- */

function normalizeZero(n) {
    return n === 0 ? 0 : n;
}

function formatValue(val) {
    if (typeof val === "string") return JSON.stringify(val);
    return String(val);
}

function validateVertexId(id, label) {
    if (typeof id !== "number" || !Number.isInteger(id)) {
        return `${label} must be a whole number from ${GRAPH_LIMITS.minId} to ${GRAPH_LIMITS.maxId} (got ${formatValue(id)}).`;
    }
    if (id < GRAPH_LIMITS.minId || id > GRAPH_LIMITS.maxId) {
        return `${label} must be between ${GRAPH_LIMITS.minId} and ${GRAPH_LIMITS.maxId} (got ${id}).`;
    }
    return null;
}

function canonicalEdge(from, to, weight, directed) {
    if (directed || from < to) {
        return { from, to, weight };
    }
    return { from: to, to: from, weight };
}

function formatWeightSuffix(weight, weighted) {
    return weighted ? ` (weight ${weight})` : "";
}

function formatEdgeAction(verb, edge, directed, weighted) {
    const arrow = directed ? "→" : "—";
    const kind = directed ? "directed" : "undirected";
    return `${verb} ${kind} edge ${edge.from} ${arrow} ${edge.to}${formatWeightSuffix(edge.weight, weighted)}.`;
}

/**
 * Finds the index of `target` in a neighbor list via linear scan (O(deg(u))), or `null` if absent.
 * Linear scan also keeps `integrityError()` safe when inspecting corrupted/unsorted lists.
 */
function findNeighborIndex(list, target) {
    for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].to === target) return i;
    }
    return null;
}

function insertNeighborSorted(list, entry) {
    let i = 0;
    while (i < list.length && list[i].to < entry.to) {
        i++;
    }
    list.splice(i, 0, entry);
}

function removeNeighbor(list, target) {
    const idx = findNeighborIndex(list, target);
    if (idx !== null) {
        list.splice(idx, 1);
    }
}
