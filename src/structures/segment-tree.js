import { ok, fail } from "./result.js";

/**
 * Segment Tree over a fixed-length integer array supporting two aggregate modes:
 *   - "sum": range sum queries and point updates
 *   - "min": range minimum queries and point updates
 *
 * Nodes are indexed 0-based like a complete binary tree:
 *   root = 0,  left(idx) = 2 * idx + 1,  right(idx) = 2 * idx + 2
 * Each node covers a contiguous interval [lo, hi] split at mid = Math.floor((lo + hi) / 2),
 * so `layoutCompleteTree(tree.maxIndex + 1)` from `src/core/tree-layout.js` can place
 * every populated node directly.
 *
 * Pure, DOM-free ES module. Every operation returns `{ ok, value?, error?, steps }`
 * with no `-1` sentinels (`null` when a field does not apply) and `-0` normalized to `0`.
 */

const DEFAULT_VALUES = Object.freeze([2, 5, 1, 4, 9, 3, 6, 8]);

export const SEGMENT_TREE_LIMITS = Object.freeze({
    minSize: 1,
    maxSize: 16,
    minValue: -999,
    maxValue: 999,
    modes: Object.freeze(["sum", "min"]),
});

export const SEGMENT_TREE_INFO = Object.freeze({
    name: "Segment Tree",
    summary:
        "A binary tree over an array where each node stores an associative aggregate (range sum or range minimum) " +
        "of a contiguous interval [lo..hi]. Building all 2n − 1 nodes takes O(n) time, range queries combine " +
        "O(log n) non-overlapping full segments, and point updates recompute one leaf-to-root path in O(log n) time.",
    complexity: Object.freeze({
        build: "O(n)",
        query: "O(log n)",
        update: "O(log n)",
        setMode: "O(n)",
        space: "O(n)",
    }),
    pseudocode: Object.freeze({
        build: Object.freeze([
            "build(node, lo, hi):",
            "    if lo == hi: tree[node] ← A[lo]; return",
            "    mid ← ⌊(lo + hi) / 2⌋",
            "    build(2·node + 1, lo, mid)",
            "    build(2·node + 2, mid + 1, hi)",
            "    tree[node] ← combine(tree[2·node + 1], tree[2·node + 2])",
            "return tree[0]",
        ]),
        query: Object.freeze([
            "query(node, lo, hi, l, r):",
            "    if hi < l or lo > r: return identity  // disjoint",
            "    if l ≤ lo and hi ≤ r: return tree[node]  // full overlap",
            "    mid ← ⌊(lo + hi) / 2⌋  // partial overlap",
            "    left  ← query(2·node + 1, lo, mid, l, r)",
            "    right ← query(2·node + 2, mid + 1, hi, l, r)",
            "    return combine(left, right)",
        ]),
        update: Object.freeze([
            "update(node, lo, hi, i, value):",
            "    if lo == hi: A[i] ← value; tree[node] ← value; return",
            "    mid ← ⌊(lo + hi) / 2⌋",
            "    if i ≤ mid: update(2·node + 1, lo, mid, i, value)",
            "    else:       update(2·node + 2, mid + 1, hi, i, value)",
            "    tree[node] ← combine(tree[2·node + 1], tree[2·node + 2])",
        ]),
        setMode: Object.freeze([
            "mode ← newMode",
            "build(node, lo, hi):",
            "    if lo == hi: tree[node] ← A[lo]; return",
            "    mid ← ⌊(lo + hi) / 2⌋; build(2·node + 1, lo, mid) & build(2·node + 2, mid + 1, hi)",
            "    tree[node] ← combine(tree[2·node + 1], tree[2·node + 2])",
            "return tree[0]",
        ]),
    }),
});

/** Normalizes IEEE-754 -0 to +0. */
function normalizeZero(n) {
    return Object.is(n, -0) ? 0 : n;
}

/** Combines two finite integer child aggregates according to `mode`. */
function combineValues(mode, a, b) {
    return mode === "sum" ? normalizeZero(a + b) : normalizeZero(Math.min(a, b));
}

function modeLabel(mode) {
    return mode === "sum" ? "range sum" : "range minimum";
}

function identityLabel(mode) {
    return mode === "sum" ? "0 (sum identity)" : "+∞ (min identity)";
}

function formatCombineExpr(mode, a, b, result) {
    return mode === "sum" ? `${a} + ${b < 0 ? `(${b})` : b} = ${result}` : `min(${a}, ${b}) = ${result}`;
}

/**
 * Validates `mode` for constructor (throws TypeError / RangeError).
 * @param {unknown} mode
 */
function assertValidMode(mode) {
    if (typeof mode !== "string") {
        throw new TypeError(`SegmentTree mode must be a string ("sum" or "min"), got ${typeof mode}.`);
    }
    if (!SEGMENT_TREE_LIMITS.modes.includes(mode)) {
        throw new RangeError(`Unsupported SegmentTree mode "${mode}". Expected "sum" or "min".`);
    }
}

/**
 * Validates `values` for constructor (throws TypeError / RangeError).
 * Returns a fresh normalized integer array.
 * @param {unknown} values
 * @returns {number[]}
 */
function assertValidValues(values) {
    if (!Array.isArray(values)) {
        throw new TypeError(`SegmentTree values must be an array of integers (got ${typeof values}).`);
    }
    const { minSize, maxSize, minValue, maxValue } = SEGMENT_TREE_LIMITS;
    if (values.length < minSize || values.length > maxSize) {
        throw new RangeError(
            `SegmentTree size must be between ${minSize} and ${maxSize} (got ${values.length}).`,
        );
    }
    const copy = new Array(values.length);
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (typeof v !== "number") {
            throw new TypeError(`Value at index ${i} must be a number (got ${typeof v}).`);
        }
        if (!Number.isInteger(v) || v < minValue || v > maxValue) {
            throw new RangeError(
                `Value at index ${i} must be an integer between ${minValue} and ${maxValue} (got ${v}).`,
            );
        }
        copy[i] = normalizeZero(v);
    }
    return copy;
}

/**
 * Non-throwing validation of `values` for `build()`.
 * @param {unknown} values
 * @returns {{ ok: true, values: number[] } | { ok: false, error: string }}
 */
function validateValuesSoft(values) {
    if (!Array.isArray(values)) {
        return { ok: false, error: "Values must be an array of integers." };
    }
    const { minSize, maxSize, minValue, maxValue } = SEGMENT_TREE_LIMITS;
    if (values.length < minSize || values.length > maxSize) {
        return {
            ok: false,
            error: `Array length must be between ${minSize} and ${maxSize} (got ${values.length}).`,
        };
    }
    const copy = new Array(values.length);
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (typeof v !== "number" || !Number.isInteger(v) || v < minValue || v > maxValue) {
            return {
                ok: false,
                error: `Value at index ${i} must be an integer between ${minValue} and ${maxValue} (got ${v}).`,
            };
        }
        copy[i] = normalizeZero(v);
    }
    return { ok: true, values: copy };
}

/**
 * Non-throwing validation of `mode` for `setMode()`.
 * @param {unknown} mode
 * @returns {{ ok: true, mode: "sum" | "min" } | { ok: false, error: string }}
 */
function validateModeSoft(mode) {
    if (typeof mode !== "string" || !SEGMENT_TREE_LIMITS.modes.includes(mode)) {
        return {
            ok: false,
            error: `Unsupported mode "${String(mode)}". Expected "sum" or "min".`,
        };
    }
    return { ok: true, mode };
}

export class SegmentTree {
    /**
     * @param {number[]} [values=[2, 5, 1, 4, 9, 3, 6, 8]] 1..16 integers in -999..999
     * @param {{ mode?: "sum" | "min" }} [options]
     */
    constructor(values = DEFAULT_VALUES.slice(), options = {}) {
        if (options === null || typeof options !== "object" || Array.isArray(options)) {
            throw new TypeError("SegmentTree options must be a plain object.");
        }
        const { mode = "sum" } = options;
        assertValidMode(mode);
        const normalized = assertValidValues(values);

        /** @type {"sum" | "min"} */
        this._mode = mode;
        /** @type {number[]} */
        this._values = normalized;
        /** @type {Map<number, { index: number, lo: number, hi: number, value: number | null }>} */
        this._nodes = new Map();

        this._populateSilent(0, 0, this._values.length - 1);
    }

    /** Number of elements in the backing array. */
    get size() {
        return this._values.length;
    }

    /** Current aggregate mode ("sum" or "min"). */
    get mode() {
        return this._mode;
    }

    /** Total number of populated tree nodes (always 2 * size - 1 for valid trees). */
    get nodeCount() {
        return this._nodes.size;
    }

    /** Highest populated 0-based node index (useful for `layoutCompleteTree(maxIndex + 1)`). */
    get maxIndex() {
        let max = null;
        for (const idx of this._nodes.keys()) {
            if (max === null || idx > max) max = idx;
        }
        return max;
    }

    /** Returns a defensive copy of the backing array. */
    toArray() {
        return this._values.slice();
    }

    /**
     * Returns a plain defensive snapshot of the tree:
     * `{ nodes: [{ index, lo, hi, value }], values: [...], mode }`,
     * with `nodes` sorted ascending by `index`.
     */
    snapshot() {
        const nodes = Array.from(this._nodes.values())
            .map((n) => ({ index: n.index, lo: n.lo, hi: n.hi, value: n.value }))
            .sort((a, b) => a.index - b.index);
        return {
            nodes,
            values: this._values.slice(),
            mode: this._mode,
        };
    }

    /**
     * Verifies all segment-tree structural and aggregate invariants.
     * Returns `null` when sound, or a descriptive error string otherwise.
     * @returns {string | null}
     */
    integrityError() {
        if (typeof this._mode !== "string" || !SEGMENT_TREE_LIMITS.modes.includes(this._mode)) {
            return `Invalid mode "${String(this._mode)}".`;
        }
        if (!Array.isArray(this._values)) {
            return "Backing values array is missing or not an array.";
        }
        const n = this._values.length;
        const { minSize, maxSize, minValue, maxValue } = SEGMENT_TREE_LIMITS;
        if (n < minSize || n > maxSize) {
            return `Backing values length ${n} is outside [${minSize}, ${maxSize}].`;
        }
        for (let i = 0; i < n; i++) {
            const v = this._values[i];
            if (typeof v !== "number" || !Number.isInteger(v) || v < minValue || v > maxValue) {
                return `Backing value at index ${i} is invalid (${v}).`;
            }
            if (Object.is(v, -0)) {
                return `Backing value at index ${i} is negative zero (-0).`;
            }
        }
        if (!(this._nodes instanceof Map)) {
            return "Internal node map is missing or corrupted.";
        }

        const visited = new Set();
        const checkNode = (idx, lo, hi) => {
            const node = this._nodes.get(idx);
            if (!node || typeof node !== "object") {
                return `Missing node at index ${idx} for range [${lo}..${hi}].`;
            }
            if (node.index !== idx) {
                return `Node at key ${idx} has mismatched index field ${node.index}.`;
            }
            if (node.lo !== lo || node.hi !== hi) {
                return `Node ${idx} has range [${node.lo}..${node.hi}], expected [${lo}..${hi}].`;
            }
            if (typeof node.value !== "number" || !Number.isInteger(node.value)) {
                return `Node ${idx} [${lo}..${hi}] has non-integer value (${node.value}).`;
            }
            if (Object.is(node.value, -0)) {
                return `Node ${idx} [${lo}..${hi}] has negative zero (-0) value.`;
            }
            visited.add(idx);

            if (lo === hi) {
                if (node.value !== this._values[lo]) {
                    return `Leaf node ${idx} [${lo}..${lo}] has value ${node.value}, expected A[${lo}] = ${this._values[lo]}.`;
                }
                return null;
            }

            const mid = Math.floor((lo + hi) / 2);
            const leftIdx = 2 * idx + 1;
            const rightIdx = 2 * idx + 2;

            const leftErr = checkNode(leftIdx, lo, mid);
            if (leftErr !== null) return leftErr;
            const rightErr = checkNode(rightIdx, mid + 1, hi);
            if (rightErr !== null) return rightErr;

            const leftVal = this._nodes.get(leftIdx).value;
            const rightVal = this._nodes.get(rightIdx).value;
            const expected = combineValues(this._mode, leftVal, rightVal);
            if (node.value !== expected) {
                return (
                    `Internal node ${idx} [${lo}..${hi}] has ${this._mode} value ${node.value}, ` +
                    `expected ${formatCombineExpr(this._mode, leftVal, rightVal, expected)}.`
                );
            }
            return null;
        };

        const rootErr = checkNode(0, 0, n - 1);
        if (rootErr !== null) return rootErr;

        if (this._nodes.size !== visited.size) {
            for (const key of this._nodes.keys()) {
                if (!visited.has(key)) {
                    return `Stray unreachable node found at index ${key}.`;
                }
            }
        }
        return null;
    }

    /**
     * Replaces the backing array with `values` and rebuilds the segment tree recursively. O(n).
     * Atomic: invalid input returns `{ ok: false, error, steps: [] }` without mutating state.
     * @param {number[]} values
     */
    build(values) {
        const check = validateValuesSoft(values);
        if (!check.ok) return fail(check.error, []);

        this._values = check.values;
        return this._rebuildWithSteps("build", {
            visitLine: 3,
            leafLine: 2,
            combineLine: 6,
            doneLine: 7,
        });
    }

    /**
     * Switches aggregate mode ("sum" | "min") and rebuilds the tree recursively. O(n).
     * Atomic: invalid mode returns `{ ok: false, error, steps: [] }` without mutating state.
     * @param {"sum" | "min"} mode
     */
    setMode(mode) {
        const check = validateModeSoft(mode);
        if (!check.ok) return fail(check.error, []);

        this._mode = check.mode;
        return this._rebuildWithSteps("setMode", {
            visitLine: 4,
            leafLine: 3,
            combineLine: 5,
            doneLine: 6,
        });
    }

    /**
     * Computes the range aggregate over `[l..r]` (inclusive). O(log n).
     * Atomic: invalid bounds return `{ ok: false, error, steps: [] }`.
     * @param {number} l start index (0 <= l <= r < size)
     * @param {number} r end index (0 <= l <= r < size)
     */
    query(l, r) {
        const n = this._values.length;
        if (typeof l !== "number" || !Number.isInteger(l)) {
            return fail(`Query start index l must be an integer (got ${l}).`, []);
        }
        if (typeof r !== "number" || !Number.isInteger(r)) {
            return fail(`Query end index r must be an integer (got ${r}).`, []);
        }
        const ql = normalizeZero(l);
        const qr = normalizeZero(r);
        if (ql < 0 || ql >= n) {
            return fail(`Query start index l=${ql} is out of bounds for size ${n} (expected 0..${n - 1}).`, []);
        }
        if (qr < 0 || qr >= n) {
            return fail(`Query end index r=${qr} is out of bounds for size ${n} (expected 0..${n - 1}).`, []);
        }
        if (ql > qr) {
            return fail(`Invalid query range [${ql}..${qr}]: start index l must be ≤ end index r.`, []);
        }

        const steps = [];
        const counters = { nodesVisited: 0, combines: 0 };

        const walk = (idx, lo, hi) => {
            const node = this._nodes.get(idx);
            counters.nodesVisited++;

            if (hi < ql || lo > qr) {
                steps.push(this._makeStep({
                    type: "disjoint",
                    operation: "query",
                    node: idx,
                    range: [lo, hi],
                    overlap: "disjoint",
                    queryRange: [ql, qr],
                    value: null,
                    counters,
                    line: 2,
                    message:
                        `Node ${idx} [${lo}..${hi}] is disjoint from [${ql}..${qr}]; ` +
                        `skip and return ${identityLabel(this._mode)}.`,
                }));
                return { hasValue: false, value: null };
            }

            if (ql <= lo && hi <= qr) {
                const val = normalizeZero(node.value);
                steps.push(this._makeStep({
                    type: "full",
                    operation: "query",
                    node: idx,
                    range: [lo, hi],
                    overlap: "full",
                    queryRange: [ql, qr],
                    value: val,
                    counters,
                    line: 3,
                    message:
                        `Node ${idx} [${lo}..${hi}] lies completely inside [${ql}..${qr}] (full overlap); ` +
                        `return stored ${this._mode} ${val} without descending.`,
                }));
                return { hasValue: true, value: val };
            }

            const mid = Math.floor((lo + hi) / 2);
            steps.push(this._makeStep({
                type: "partial",
                operation: "query",
                node: idx,
                range: [lo, hi],
                overlap: "partial",
                queryRange: [ql, qr],
                value: null,
                counters,
                line: 4,
                message:
                    `Node ${idx} [${lo}..${hi}] partially overlaps [${ql}..${qr}]; ` +
                    `split at mid = ${mid} and query [${lo}..${mid}] and [${mid + 1}..${hi}].`,
            }));

            const leftRes = walk(2 * idx + 1, lo, mid);
            const rightRes = walk(2 * idx + 2, mid + 1, hi);

            let combined;
            let combineMsg;
            if (leftRes.hasValue && rightRes.hasValue) {
                combined = combineValues(this._mode, leftRes.value, rightRes.value);
                combineMsg =
                    `Combine at node ${idx} [${lo}..${hi}]: ` +
                    `left = ${leftRes.value}, right = ${rightRes.value} → ` +
                    `${formatCombineExpr(this._mode, leftRes.value, rightRes.value, combined)}.`;
            } else if (leftRes.hasValue) {
                combined = normalizeZero(leftRes.value);
                combineMsg =
                    `Combine at node ${idx} [${lo}..${hi}]: ` +
                    `left [${lo}..${mid}] = ${leftRes.value}, right [${mid + 1}..${hi}] was disjoint (ignored) → ${combined}.`;
            } else {
                combined = normalizeZero(rightRes.value);
                combineMsg =
                    `Combine at node ${idx} [${lo}..${hi}]: ` +
                    `left [${lo}..${mid}] was disjoint (ignored), right [${mid + 1}..${hi}] = ${rightRes.value} → ${combined}.`;
            }

            counters.combines++;
            steps.push(this._makeStep({
                type: "combine",
                operation: "query",
                node: idx,
                range: [lo, hi],
                overlap: "partial",
                queryRange: [ql, qr],
                value: combined,
                counters,
                line: 7,
                message: combineMsg,
            }));

            return { hasValue: true, value: combined };
        };

        const finalRes = walk(0, 0, n - 1);
        const answer = normalizeZero(finalRes.value);

        steps.push(this._makeStep({
            type: "done",
            operation: "query",
            node: null,
            range: [ql, qr],
            overlap: null,
            queryRange: [ql, qr],
            value: answer,
            counters,
            line: counters.combines > 0 ? 7 : 3,
            message:
                `Query complete: ${modeLabel(this._mode)} over [${ql}..${qr}] = ${answer} ` +
                `(${counters.nodesVisited} node${counters.nodesVisited === 1 ? "" : "s"} visited, ` +
                `${counters.combines} combine${counters.combines === 1 ? "" : "s"}).`,
        }));

        return ok(answer, steps);
    }

    /**
     * Sets `A[i] = value` and recomputes every ancestor along the leaf-to-root path. O(log n).
     * Atomic: invalid index or value returns `{ ok: false, error, steps: [] }` without mutating state.
     * @param {number} i element index in `0..size - 1`
     * @param {number} value integer in `-999..999`
     */
    update(i, value) {
        const n = this._values.length;
        const { minValue, maxValue } = SEGMENT_TREE_LIMITS;

        if (typeof i !== "number" || !Number.isInteger(i)) {
            return fail(`Update index must be an integer (got ${i}).`, []);
        }
        const idxTarget = normalizeZero(i);
        if (idxTarget < 0 || idxTarget >= n) {
            return fail(`Update index ${idxTarget} is out of bounds for size ${n} (expected 0..${n - 1}).`, []);
        }
        if (typeof value !== "number" || !Number.isInteger(value) || value < minValue || value > maxValue) {
            return fail(`Update value must be an integer between ${minValue} and ${maxValue} (got ${value}).`, []);
        }
        const nextVal = normalizeZero(value);
        const oldLeafVal = this._values[idxTarget];

        const steps = [];
        const counters = { nodesVisited: 0, combines: 0 };

        const walk = (nodeIdx, lo, hi) => {
            const node = this._nodes.get(nodeIdx);
            counters.nodesVisited++;

            if (lo === hi) {
                const prev = node.value;
                this._values[idxTarget] = nextVal;
                node.value = nextVal;
                steps.push(this._makeStep({
                    type: "update-leaf",
                    operation: "update",
                    node: nodeIdx,
                    range: [lo, hi],
                    overlap: null,
                    queryRange: null,
                    value: nextVal,
                    counters,
                    line: 2,
                    message: `Update leaf node ${nodeIdx} [${lo}..${lo}]: A[${idxTarget}] changes from ${prev} to ${nextVal}.`,
                }));
                return;
            }

            const mid = Math.floor((lo + hi) / 2);
            const goLeft = idxTarget <= mid;
            const childIdx = goLeft ? 2 * nodeIdx + 1 : 2 * nodeIdx + 2;
            const childRange = goLeft ? `[${lo}..${mid}]` : `[${mid + 1}..${hi}]`;

            steps.push(this._makeStep({
                type: "visit",
                operation: "update",
                node: nodeIdx,
                range: [lo, hi],
                overlap: null,
                queryRange: null,
                value: node.value,
                counters,
                line: goLeft ? 4 : 5,
                message:
                    `Visit node ${nodeIdx} [${lo}..${hi}] (value ${node.value}): ` +
                    `index ${idxTarget} ${goLeft ? "≤" : ">"} mid ${mid}, descend ${goLeft ? "left" : "right"} to node ${childIdx} ${childRange}.`,
            }));

            if (goLeft) {
                walk(2 * nodeIdx + 1, lo, mid);
            } else {
                walk(2 * nodeIdx + 2, mid + 1, hi);
            }

            const prev = node.value;
            const leftVal = this._nodes.get(2 * nodeIdx + 1).value;
            const rightVal = this._nodes.get(2 * nodeIdx + 2).value;
            const recomputed = combineValues(this._mode, leftVal, rightVal);
            node.value = recomputed;
            counters.combines++;

            steps.push(this._makeStep({
                type: "recompute",
                operation: "update",
                node: nodeIdx,
                range: [lo, hi],
                overlap: null,
                queryRange: null,
                value: recomputed,
                counters,
                line: 6,
                message:
                    `Recompute ancestor node ${nodeIdx} [${lo}..${hi}]: ` +
                    `${formatCombineExpr(this._mode, leftVal, rightVal, recomputed)} (was ${prev}).`,
            }));
        };

        walk(0, 0, n - 1);

        const rootVal = this._nodes.get(0).value;
        steps.push(this._makeStep({
            type: "done",
            operation: "update",
            node: null,
            range: [idxTarget, idxTarget],
            overlap: null,
            queryRange: null,
            value: nextVal,
            counters,
            line: counters.combines > 0 ? 6 : 2,
            message:
                `Update complete: A[${idxTarget}] = ${nextVal} (was ${oldLeafVal}); ` +
                `root [0..${n - 1}] = ${rootVal} (${counters.nodesVisited} node${counters.nodesVisited === 1 ? "" : "s"} visited, ` +
                `${counters.combines} ancestor${counters.combines === 1 ? "" : "s"} recomputed).`,
        }));

        return ok(
            {
                index: idxTarget,
                oldValue: oldLeafVal,
                value: nextVal,
                root: rootVal,
            },
            steps,
        );
    }

    /** Builds all nodes silently (used by constructor). */
    _populateSilent(idx, lo, hi) {
        if (lo === hi) {
            const val = this._values[lo];
            this._nodes.set(idx, { index: idx, lo, hi, value: val });
            return val;
        }
        const mid = Math.floor((lo + hi) / 2);
        const leftVal = this._populateSilent(2 * idx + 1, lo, mid);
        const rightVal = this._populateSilent(2 * idx + 2, mid + 1, hi);
        const val = combineValues(this._mode, leftVal, rightVal);
        this._nodes.set(idx, { index: idx, lo, hi, value: val });
        return val;
    }

    /** Seeds the empty tree skeleton with `value: null` so bottom-up build steps fill nodes in place. */
    _seedSkeleton(idx, lo, hi) {
        this._nodes.set(idx, { index: idx, lo, hi, value: null });
        if (lo === hi) return;
        const mid = Math.floor((lo + hi) / 2);
        this._seedSkeleton(2 * idx + 1, lo, mid);
        this._seedSkeleton(2 * idx + 2, mid + 1, hi);
    }

    /** Shared traced bottom-up build for `build()` and `setMode()`. */
    _rebuildWithSteps(operation, lines) {
        const n = this._values.length;
        this._nodes = new Map();
        this._seedSkeleton(0, 0, n - 1);

        const steps = [];
        const counters = { nodesVisited: 0, combines: 0 };

        const walk = (idx, lo, hi) => {
            const node = this._nodes.get(idx);
            counters.nodesVisited++;

            if (lo === hi) {
                const val = this._values[lo];
                node.value = val;
                steps.push(this._makeStep({
                    type: "update-leaf",
                    operation,
                    node: idx,
                    range: [lo, hi],
                    overlap: null,
                    queryRange: null,
                    value: val,
                    counters,
                    line: lines.leafLine,
                    message: `Populate leaf node ${idx} [${lo}..${lo}] ← A[${lo}] = ${val}.`,
                }));
                return val;
            }

            const mid = Math.floor((lo + hi) / 2);
            steps.push(this._makeStep({
                type: "visit",
                operation,
                node: idx,
                range: [lo, hi],
                overlap: null,
                queryRange: null,
                value: null,
                counters,
                line: lines.visitLine,
                message:
                    `Visit internal node ${idx} [${lo}..${hi}]; split at mid = ${mid} ` +
                    `into [${lo}..${mid}] and [${mid + 1}..${hi}].`,
            }));

            const leftVal = walk(2 * idx + 1, lo, mid);
            const rightVal = walk(2 * idx + 2, mid + 1, hi);
            const combined = combineValues(this._mode, leftVal, rightVal);
            node.value = combined;
            counters.combines++;

            steps.push(this._makeStep({
                type: "combine",
                operation,
                node: idx,
                range: [lo, hi],
                overlap: null,
                queryRange: null,
                value: combined,
                counters,
                line: lines.combineLine,
                message:
                    `Combine node ${idx} [${lo}..${hi}]: ` +
                    `${formatCombineExpr(this._mode, leftVal, rightVal, combined)}.`,
            }));

            return combined;
        };

        const rootVal = walk(0, 0, n - 1);
        const verb = operation === "setMode" ? `Mode switched to ${modeLabel(this._mode)}` : `Build complete (${modeLabel(this._mode)})`;

        steps.push(this._makeStep({
            type: "done",
            operation,
            node: null,
            range: [0, n - 1],
            overlap: null,
            queryRange: null,
            value: rootVal,
            counters,
            line: lines.doneLine,
            message:
                `${verb}: root [0..${n - 1}] = ${rootVal} ` +
                `(${counters.nodesVisited} node${counters.nodesVisited === 1 ? "" : "s"}, ` +
                `${counters.combines} combine${counters.combines === 1 ? "" : "s"}).`,
        }));

        const payload = operation === "setMode"
            ? { mode: this._mode, root: rootVal }
            : { size: n, mode: this._mode, root: rootVal };
        return ok(payload, steps);
    }

    _makeStep({ type, operation, node, range, overlap, queryRange, value = null, counters, line, message }) {
        return {
            type,
            operation,
            node,
            range: [range[0], range[1]],
            overlap,
            queryRange: queryRange === null ? null : [queryRange[0], queryRange[1]],
            value: value === null ? null : normalizeZero(value),
            nodesVisited: counters.nodesVisited,
            combines: counters.combines,
            line,
            message,
            snapshot: this.snapshot(),
        };
    }
}
