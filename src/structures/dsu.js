import { ok, fail } from "./result.js";

/**
 * Disjoint Set Union (Union-Find) over elements `0..n-1` (`n` in `1..16`).
 *
 * Maintains a forest of rooted trees via `parent[]` and `rank[]` arrays:
 * - Each element ID `0..n-1` is its own stable node ID across all steps and snapshots.
 * - Optional optimizations (both enabled by default):
 *   - `byRank`: Union by Rank attaches the lower-rank root under the higher-rank root
 *     (ties break in favor of the smaller root ID, incrementing its rank by 1).
 *   - `compress`: Path Compression re-parents every visited node directly to the
 *     set's representative root during `find`, emitting one `compress` step per
 *     rewired pointer with `edge: { from, to, oldParent }`.
 * - No `-1` sentinels anywhere; invalid inputs return `{ ok: false, error, steps: [] }`
 *   without mutating internal state.
 *
 * DOM-free. Every operation returns `{ ok, value?, error?, steps }`.
 * Every emitted step has the exact shape:
 *   { type, operation, ids, pathIds, edge, line, message, snapshot }
 * where `line` is a 1-based line number in `DSU_INFO.pseudocode[operation]`
 * and `snapshot` is `{ parent: [...], rank: [...], roots: [...] }`.
 */

export const DSU_LIMITS = Object.freeze({
    minSize: 1,
    maxSize: 16,
});

/** Registry entry matching the site's shared metadata pattern. */
export const DSU_INFO = Object.freeze({
    name: "Disjoint Set Union (Union-Find)",
    summary:
        "Partitions elements 0..n-1 into disjoint sets, each represented by a rooted tree " +
        "whose root is the set's representative. Union by Rank keeps trees shallow by " +
        "attaching the lower-rank root under the higher-rank root, while Path Compression " +
        "flattens traversed paths directly to the root for near-constant O(α(n)) amortised time, " +
        "where α(n) is the inverse Ackermann function (≤ 4 for all practical n).",
    complexity: Object.freeze({
        both: "O(α(n)) amortised — Union by Rank + Path Compression",
        rankOnly: "O(log n) worst case — Union by Rank only",
        compressOnly: "O(log n) amortised — Path Compression only (O(n) worst-case single find before compression)",
        neither: "O(n) worst case — neither optimization",
        makeSet: "O(n) — initialize n singleton sets (O(1) per element)",
        space: "O(n) — parent[] and rank[] arrays",
    }),
    pseudocode: Object.freeze({
        find: Object.freeze([
            "curr ← x;  path ← [x]",
            "while parent[curr] ≠ curr:  curr ← parent[curr];  path.push(curr)",
            "root ← curr  // representative found",
            "if compress:  for each v in path with parent[v] ≠ root:  parent[v] ← root",
            "return root",
        ]),
        union: Object.freeze([
            "rootA ← find(a)  // walk to root (compress if enabled)",
            "rootB ← find(b)  // walk to root (compress if enabled)",
            "if rootA = rootB:  return false  // already in same set",
            "if byRank:  childRoot, newRoot ← lower-rank root, higher-rank root  (tie → smaller root wins)",
            "parent[childRoot] ← newRoot  (if ¬byRank: rootA → rootB);  setCount ← setCount - 1",
            "if byRank and rank[rootA] = rank[rootB]:  rank[newRoot] ← rank[newRoot] + 1",
            "return newRoot",
        ]),
        connected: Object.freeze([
            "rootA ← find(a)  // walk to root (compress if enabled)",
            "rootB ← find(b)  // walk to root (compress if enabled)",
            "if rootA = rootB:  return true   // same set",
            "return false                     // different sets",
        ]),
        reset: Object.freeze([
            "setCount ← n;  for i ← 0 to n - 1:  parent[i] ← i;  rank[i] ← 0",
        ]),
    }),
});

function formatValue(v) {
    if (typeof v === "string") return `"${v}"`;
    return String(v);
}

export class DisjointSet {
    /**
     * @param {number} [n=8] Number of singleton elements (`1..16`).
     * @param {{ byRank?: boolean, compress?: boolean }} [options]
     */
    constructor(n = 8, options = {}) {
        if (typeof n !== "number") {
            throw new TypeError(
                `DisjointSet size must be a number from ${DSU_LIMITS.minSize} to ${DSU_LIMITS.maxSize} (got ${formatValue(n)})`,
            );
        }
        if (!Number.isInteger(n) || n < DSU_LIMITS.minSize || n > DSU_LIMITS.maxSize) {
            throw new RangeError(
                `DisjointSet size must be an integer from ${DSU_LIMITS.minSize} to ${DSU_LIMITS.maxSize} (got ${n})`,
            );
        }
        if (options === null || typeof options !== "object" || Array.isArray(options)) {
            throw new TypeError("DisjointSet options must be a plain object");
        }
        const { byRank = true, compress = true } = options;
        if (typeof byRank !== "boolean") {
            throw new TypeError(`DisjointSet option "byRank" must be a boolean (got ${formatValue(byRank)})`);
        }
        if (typeof compress !== "boolean") {
            throw new TypeError(`DisjointSet option "compress" must be a boolean (got ${formatValue(compress)})`);
        }

        this._size = n;
        this._byRank = byRank;
        this._compress = compress;
        this._parent = Array.from({ length: n }, (_, i) => i);
        this._rank = new Array(n).fill(0);
        this._setCount = n;
    }

    /** Total number of elements (`n`). */
    get size() {
        return this._size;
    }

    /** Current number of disjoint sets. */
    get setCount() {
        return this._setCount;
    }

    /** Whether Union by Rank is enabled. */
    get byRank() {
        return this._byRank;
    }

    /** Whether Path Compression is enabled. */
    get compress() {
        return this._compress;
    }

    /** Returns a shallow copy of the `parent` array. */
    parentArray() {
        return [...this._parent];
    }

    /** Returns a shallow copy of the `rank` array. */
    rankArray() {
        return [...this._rank];
    }

    /**
     * Pure snapshot of current forest state:
     * `{ parent: [...], rank: [...], roots: [...] }` with `roots` sorted ascending.
     */
    snapshot() {
        const roots = [];
        for (let i = 0; i < this._size; i++) {
            if (this._parent[i] === i) roots.push(i);
        }
        return {
            parent: [...this._parent],
            rank: [...this._rank],
            roots,
        };
    }

    /**
     * Pure partition view (never mutates or compresses):
     * returns an array of sets, each sorted ascending, ordered by each set's smallest element.
     */
    sets() {
        const groups = new Map();
        for (let i = 0; i < this._size; i++) {
            let curr = i;
            let hops = 0;
            while (this._parent[curr] !== curr && hops < this._size) {
                curr = this._parent[curr];
                hops++;
            }
            let members = groups.get(curr);
            if (!members) {
                members = [];
                groups.set(curr, members);
            }
            members.push(i);
        }
        return [...groups.values()];
    }

    /**
     * Verifies all structural and rank invariants.
     * Returns `null` when valid, or a descriptive error string on violation.
     */
    integrityError() {
        const n = this._size;
        if (!Number.isInteger(n) || n < DSU_LIMITS.minSize || n > DSU_LIMITS.maxSize) {
            return `Invalid size ${n}: expected integer in ${DSU_LIMITS.minSize}..${DSU_LIMITS.maxSize}.`;
        }
        if (!Array.isArray(this._parent) || this._parent.length !== n) {
            return `parent array length mismatch: expected ${n}, got ${Array.isArray(this._parent) ? this._parent.length : typeof this._parent}.`;
        }
        if (!Array.isArray(this._rank) || this._rank.length !== n) {
            return `rank array length mismatch: expected ${n}, got ${Array.isArray(this._rank) ? this._rank.length : typeof this._rank}.`;
        }

        for (let i = 0; i < n; i++) {
            const p = this._parent[i];
            if (typeof p !== "number" || !Number.isInteger(p) || p < 0 || p >= n) {
                return `parent[${i}] is invalid (${formatValue(p)}): expected integer in 0..${n - 1}.`;
            }
            const r = this._rank[i];
            if (typeof r !== "number" || !Number.isInteger(r) || r < 0) {
                return `rank[${i}] is invalid (${formatValue(r)}): expected non-negative integer.`;
            }
        }

        const setSizes = new Map();
        let rootCount = 0;

        for (let i = 0; i < n; i++) {
            if (this._parent[i] === i) rootCount++;
            let curr = i;
            let hops = 0;
            while (this._parent[curr] !== curr) {
                curr = this._parent[curr];
                hops++;
                if (hops >= n) {
                    return `Cycle detected starting from element ${i}: did not reach a root within ${n} hops.`;
                }
            }
            setSizes.set(curr, (setSizes.get(curr) || 0) + 1);
        }

        if (this._setCount !== rootCount) {
            return `setCount mismatch: stored ${this._setCount}, actual root count is ${rootCount}.`;
        }

        if (this._byRank) {
            for (let i = 0; i < n; i++) {
                const p = this._parent[i];
                if (p !== i && !(this._rank[p] > this._rank[i])) {
                    return `Rank invariant violated at element ${i}: rank[parent[${i}]] = rank[${p}] = ${this._rank[p]} must be strictly greater than rank[${i}] = ${this._rank[i]}.`;
                }
            }
            for (let r = 0; r < n; r++) {
                if (this._parent[r] === r) {
                    const rankVal = this._rank[r];
                    const actualSize = setSizes.get(r) || 0;
                    const minRequired = 2 ** rankVal;
                    if (actualSize < minRequired) {
                        return `Subtree size invariant violated at root ${r}: rank ${rankVal} requires at least ${minRequired} elements, found ${actualSize}.`;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Finds the representative root of element `x`, optionally compressing the path.
     * Returns `{ ok: true, value: root, steps }` or `{ ok: false, error, steps: [] }`.
     *
     * @param {number} x
     */
    find(x) {
        const err = this._validateElement(x, "Element");
        if (err !== null) return fail(err, []);
        const elem = x === 0 ? 0 : x;

        const steps = [];
        const { root, path } = this._findInternal(elem, {
            operation: "find",
            startLine: 1,
            walkLine: 2,
            foundLine: 3,
            compressLine: 4,
            steps,
        });
        steps.push(
            this._makeStep({
                type: "done",
                operation: "find",
                ids: [root],
                pathIds: [...path],
                edge: null,
                line: 5,
                message: `Return representative root ${root} for element ${elem}.`,
            }),
        );
        return ok(root, steps);
    }

    /**
     * Merges the sets containing `a` and `b`.
     * - If already in the same set: emits `same-set` and returns `{ ok: true, value: false, steps }`.
     * - Otherwise: links the roots (using Union by Rank if enabled, or `rootA -> rootB` if disabled)
     *   and returns `{ ok: true, value: newRoot, steps }`.
     *
     * @param {number} a
     * @param {number} b
     */
    union(a, b) {
        const errA = this._validateElement(a, "First element");
        if (errA !== null) return fail(errA, []);
        const errB = this._validateElement(b, "Second element");
        if (errB !== null) return fail(errB, []);
        const elemA = a === 0 ? 0 : a;
        const elemB = b === 0 ? 0 : b;

        const steps = [];
        const { root: rootA, path: pathA } = this._findInternal(elemA, {
            operation: "union",
            startLine: 1,
            walkLine: 1,
            foundLine: 1,
            compressLine: 1,
            steps,
        });
        const { root: rootB, path: pathB } = this._findInternal(elemB, {
            operation: "union",
            startLine: 2,
            walkLine: 2,
            foundLine: 2,
            compressLine: 2,
            steps,
        });

        const combinedPath = [...new Set([...pathA, ...pathB])];

        if (rootA === rootB) {
            steps.push(
                this._makeStep({
                    type: "same-set",
                    operation: "union",
                    ids: [elemA, elemB, rootA],
                    pathIds: combinedPath,
                    edge: null,
                    line: 3,
                    message:
                        elemA === elemB
                            ? `Element ${elemA} is already in the same set as itself (root ${rootA}) — no union needed.`
                            : `Elements ${elemA} and ${elemB} are already in the same set (root ${rootA}) — no union needed.`,
                }),
            );
            return ok(false, steps);
        }

        let newRoot;
        let childRoot;

        if (this._byRank) {
            const rankA = this._rank[rootA];
            const rankB = this._rank[rootB];
            let tied = false;

            if (rankA < rankB) {
                childRoot = rootA;
                newRoot = rootB;
            } else if (rankA > rankB) {
                childRoot = rootB;
                newRoot = rootA;
            } else {
                newRoot = Math.min(rootA, rootB);
                childRoot = Math.max(rootA, rootB);
                tied = true;
            }

            steps.push(
                this._makeStep({
                    type: "compare-rank",
                    operation: "union",
                    ids: [rootA, rootB],
                    pathIds: [rootA, rootB],
                    edge: null,
                    line: 4,
                    message: tied
                        ? `Compare ranks: rank[${rootA}] = ${rankA} equals rank[${rootB}] = ${rankB}; tie breaks to smaller root ${newRoot}.`
                        : `Compare ranks: rank[${rootA}] = ${rankA} vs rank[${rootB}] = ${rankB}; attach lower-rank root ${childRoot} under ${newRoot}.`,
                }),
            );

            this._parent[childRoot] = newRoot;
            this._setCount -= 1;

            steps.push(
                this._makeStep({
                    type: "link",
                    operation: "union",
                    ids: [childRoot, newRoot],
                    pathIds: [childRoot, newRoot],
                    edge: { from: childRoot, to: newRoot },
                    line: 5,
                    message: `Link root ${childRoot} → ${newRoot} (parent[${childRoot}] = ${newRoot}; ${this._setCount} set${this._setCount === 1 ? "" : "s"} remaining).`,
                }),
            );

            if (tied) {
                this._rank[newRoot] += 1;
                steps.push(
                    this._makeStep({
                        type: "rank-up",
                        operation: "union",
                        ids: [newRoot],
                        pathIds: [newRoot],
                        edge: { from: childRoot, to: newRoot },
                        line: 6,
                        message: `Equal ranks merged: increment rank[${newRoot}] to ${this._rank[newRoot]}.`,
                    }),
                );
            }
        } else {
            childRoot = rootA;
            newRoot = rootB;
            this._parent[rootA] = rootB;
            this._setCount -= 1;

            steps.push(
                this._makeStep({
                    type: "link",
                    operation: "union",
                    ids: [rootA, rootB],
                    pathIds: [rootA, rootB],
                    edge: { from: rootA, to: rootB },
                    line: 5,
                    message: `Link root ${rootA} → ${rootB} without rank check (parent[${rootA}] = ${rootB}; ${this._setCount} set${this._setCount === 1 ? "" : "s"} remaining).`,
                }),
            );
        }

        steps.push(
            this._makeStep({
                type: "done",
                operation: "union",
                ids: [newRoot],
                pathIds: [a, b, newRoot],
                edge: null,
                line: 7,
                message: `Merged sets of ${a} and ${b} under root ${newRoot} (${this._setCount} disjoint set${this._setCount === 1 ? "" : "s"} left).`,
            }),
        );

        return ok(newRoot, steps);
    }

    /**
     * Checks whether elements `a` and `b` belong to the same set (performing path
     * compression during the finds if enabled).
     * Returns `{ ok: true, value: boolean, steps }` or `{ ok: false, error, steps: [] }`.
     *
     * @param {number} a
     * @param {number} b
     */
    connected(a, b) {
        const errA = this._validateElement(a, "First element");
        if (errA !== null) return fail(errA, []);
        const errB = this._validateElement(b, "Second element");
        if (errB !== null) return fail(errB, []);

        const steps = [];
        const { root: rootA, path: pathA } = this._findInternal(a, {
            operation: "connected",
            startLine: 1,
            walkLine: 1,
            foundLine: 1,
            compressLine: 1,
            steps,
        });
        const { root: rootB, path: pathB } = this._findInternal(b, {
            operation: "connected",
            startLine: 2,
            walkLine: 2,
            foundLine: 2,
            compressLine: 2,
            steps,
        });

        const combinedPath = [...new Set([...pathA, ...pathB])];
        const same = rootA === rootB;

        if (same) {
            steps.push(
                this._makeStep({
                    type: "same-set",
                    operation: "connected",
                    ids: [a, b, rootA],
                    pathIds: combinedPath,
                    edge: null,
                    line: 3,
                    message: `Connected: elements ${a} and ${b} share representative root ${rootA}.`,
                }),
            );
        } else {
            steps.push(
                this._makeStep({
                    type: "done",
                    operation: "connected",
                    ids: [a, b, rootA, rootB],
                    pathIds: combinedPath,
                    edge: null,
                    line: 4,
                    message: `Not connected: ${a} has root ${rootA} while ${b} has root ${rootB}.`,
                }),
            );
        }

        return ok(same, steps);
    }

    /**
     * Resets the forest to `newN` (or the current `size` if omitted) singleton sets.
     * Returns `{ ok: true, value: n, steps }` or `{ ok: false, error, steps: [] }`.
     *
     * @param {number} [newN]
     */
    reset(newN) {
        let targetSize = this._size;
        if (newN !== undefined) {
            if (typeof newN !== "number" || !Number.isInteger(newN)) {
                return fail(
                    `Size must be an integer from ${DSU_LIMITS.minSize} to ${DSU_LIMITS.maxSize} (got ${formatValue(newN)}).`,
                    [],
                );
            }
            if (newN < DSU_LIMITS.minSize || newN > DSU_LIMITS.maxSize) {
                return fail(
                    `Size ${newN} is out of range (expected ${DSU_LIMITS.minSize} to ${DSU_LIMITS.maxSize}).`,
                    [],
                );
            }
            targetSize = newN;
        }

        this._size = targetSize;
        this._parent = Array.from({ length: targetSize }, (_, i) => i);
        this._rank = new Array(targetSize).fill(0);
        this._setCount = targetSize;

        const steps = [
            this._makeStep({
                type: "done",
                operation: "reset",
                ids: [],
                pathIds: [],
                edge: null,
                line: 1,
                message: `Reset to ${targetSize} singleton set${targetSize === 1 ? "" : "s"} (${targetSize === 1 ? "0" : `0..${targetSize - 1}`}).`,
            }),
        ];

        return ok(targetSize, steps);
    }

    /** @private */
    _validateElement(x, label) {
        if (typeof x !== "number" || !Number.isInteger(x)) {
            return `${label} must be an integer from 0 to ${this._size - 1} (got ${formatValue(x)}).`;
        }
        if (x < 0 || x >= this._size) {
            return `${label} ${x} is out of range (expected 0 to ${this._size - 1}).`;
        }
        return null;
    }

    /** @private */
    _findInternal(x, { operation, startLine, walkLine, foundLine, compressLine, steps }) {
        let curr = x === 0 ? 0 : x;
        const path = [curr];

        steps.push(
            this._makeStep({
                type: "visit",
                operation,
                ids: [curr],
                pathIds: [...path],
                edge: null,
                line: startLine,
                message:
                    this._parent[curr] === curr
                        ? `Start find(${curr}) at element ${curr} (parent[${curr}] = ${curr}, already a root).`
                        : `Start find(${curr}) at element ${curr} (parent[${curr}] = ${this._parent[curr]}).`,
            }),
        );

        while (this._parent[curr] !== curr) {
            const prev = curr;
            curr = this._parent[curr];
            path.push(curr);

            steps.push(
                this._makeStep({
                    type: "visit",
                    operation,
                    ids: [curr],
                    pathIds: [...path],
                    edge: { from: prev, to: curr },
                    line: walkLine,
                    message: `Follow parent pointer ${prev} → ${curr}.`,
                }),
            );
        }

        const root = curr;
        steps.push(
            this._makeStep({
                type: "root-found",
                operation,
                ids: [root],
                pathIds: [...path],
                edge: null,
                line: foundLine,
                message: `Found representative root ${root} for element ${x}.`,
            }),
        );

        if (this._compress) {
            for (const v of path) {
                if (this._parent[v] !== root) {
                    const oldParent = this._parent[v];
                    this._parent[v] = root;
                    steps.push(
                        this._makeStep({
                            type: "compress",
                            operation,
                            ids: [v, root],
                            pathIds: [...path],
                            edge: { from: v, to: root, oldParent },
                            line: compressLine,
                            message: `Path compression: re-parent ${v} directly to root ${root} (was ${oldParent}).`,
                        }),
                    );
                }
            }
        }

        return { root, path };
    }

    /** @private */
    _makeStep({ type, operation, ids, pathIds, edge, line, message }) {
        return {
            type,
            operation,
            ids: [...ids],
            pathIds: [...pathIds],
            edge: edge ? { ...edge } : null,
            line,
            message,
            snapshot: this.snapshot(),
        };
    }
}
