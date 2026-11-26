import { ok, fail } from "./result.js";

/**
 * Fenwick Tree (Binary Indexed Tree) backed by:
 *   - 0-based `values[0..n-1]` (the logical array `a`)
 *   - 1-based `tree[0..n]` where `tree[0] = 0` is an unused header slot and
 *     each cell `tree[j]` (for `1 <= j <= n`) stores the sum of
 *     `a[j - lowbit(j) .. j - 1]`, where `lowbit(j) = j & -j`.
 *
 * Rules:
 * - Size `n` is an integer in `1..32` (default `8`). Out-of-range or non-integer
 *   numbers throw `RangeError` in the constructor; non-numbers throw `TypeError`.
 * - Input values and update deltas are validated as integers in `-999..999`.
 *   Invalid operation arguments return `{ ok: false, error, steps: [] }` without
 *   mutating state. On `set(i, value)`, only the target `value` is bounded to
 *   `-999..999` (prior `update` calls may have moved `a[i]` outside that range).
 * - `-0` is normalized to `0` everywhere.
 * - No `-1` sentinels anywhere: inactive index / lowbit / runningTotal fields
 *   use `null`.
 *
 * DOM-free. Every operation returns `{ ok, value?, error?, steps }`.
 * Each step has the shape:
 *   { type, operation, index, lowbit, indices, runningTotal, line, message, snapshot }
 * where `line` is a 1-based line number in `FENWICK_INFO.pseudocode[operation]`
 * and `snapshot` is a defensive copy `{ tree: [...], values: [...] }`.
 */

export const FENWICK_LIMITS = Object.freeze({
    minSize: 1,
    maxSize: 32,
    minValue: -999,
    maxValue: 999,
});

/**
 * Returns the lowest set bit (least significant 1-bit) of a positive integer `j`,
 * using two's-complement arithmetic: `j & -j`.
 *
 * @param {number} j positive integer
 * @returns {number} power of two `2^k` dividing `j`
 */
export function lowbit(j) {
    if (typeof j !== "number") {
        throw new TypeError(`lowbit(j) requires a positive integer (got ${typeof j})`);
    }
    if (!Number.isInteger(j) || j < 1 || j > 0x7fffffff) {
        throw new RangeError(`lowbit(j) requires a positive 32-bit integer in 1..2147483647 (got ${j})`);
    }
    return j & -j;
}

/**
 * Formats a non-negative integer as a zero-padded binary string of width at least `bits`.
 *
 * @param {number} value non-negative integer
 * @param {number} [bits=4] minimum binary width (integer >= 1)
 * @returns {string}
 */
export function formatBinary(value, bits = 4) {
    if (typeof value !== "number") {
        throw new TypeError(`formatBinary(value) requires a non-negative integer (got ${typeof value})`);
    }
    if (!Number.isInteger(value) || value < 0) {
        throw new RangeError(`formatBinary(value) requires a non-negative integer (got ${value})`);
    }
    if (typeof bits !== "number") {
        throw new TypeError(`formatBinary bits width must be a positive integer (got ${typeof bits})`);
    }
    if (!Number.isInteger(bits) || bits < 1) {
        throw new RangeError(`formatBinary bits width must be an integer >= 1 (got ${bits})`);
    }
    return value.toString(2).padStart(bits, "0");
}

/** Registry entry matching the site's shared metadata pattern. */
export const FENWICK_INFO = Object.freeze({
    name: "Fenwick Tree (Binary Indexed Tree)",
    summary:
        "A 1-based array tree[1..n] where each cell tree[j] stores the sum of a power-of-two " +
        "responsibility range a[j - lowbit(j) .. j - 1], with lowbit(j) = j & -j. Point updates " +
        "climb parents via j += lowbit(j) and prefix queries drop the lowest set bit via " +
        "j -= lowbit(j), giving O(log n) updates, prefix sums, and range sums, plus an O(n) " +
        "bottom-up build in O(n) space.",
    complexity: Object.freeze({
        build: "O(n)",
        update: "O(log n)",
        set: "O(log n)",
        prefixSum: "O(log n)",
        rangeSum: "O(log n)",
        space: "O(n)",
    }),
    pseudocode: Object.freeze({
        build: Object.freeze([
            "tree[1..n] ← copy of a[0..n-1]  // direct copy",
            "for j ← 1 to n:",
            "    parent ← j + lowbit(j)",
            "    if parent ≤ n: tree[parent] ← tree[parent] + tree[j]",
            "return tree  // built in O(n)",
        ]),
        update: Object.freeze([
            "a[i] ← a[i] + delta;  j ← i + 1",
            "while j ≤ n:",
            "    tree[j] ← tree[j] + delta",
            "    j ← j + lowbit(j)  // climb to parent",
            "return a[i]",
        ]),
        set: Object.freeze([
            "delta ← value - a[i];  if delta = 0: return value",
            "a[i] ← value;  j ← i + 1;  while j ≤ n:",
            "    tree[j] ← tree[j] + delta",
            "    j ← j + lowbit(j)  // climb to parent",
            "return value",
        ]),
        prefixSum: Object.freeze([
            "total ← 0;  j ← i + 1",
            "while j > 0:",
            "    total ← total + tree[j]",
            "    j ← j - lowbit(j)  // drop lowest set bit",
            "return total",
        ]),
        rangeSum: Object.freeze([
            "right ← 0;  j ← r + 1",
            "while j > 0:",
            "    right ← right + tree[j]",
            "    j ← j - lowbit(j)  // right prefix walk",
            "left ← 0;  j ← l  // (l - 1) + 1; skips loop when l = 0",
            "while j > 0:",
            "    left ← left + tree[j]",
            "    j ← j - lowbit(j)  // left prefix walk",
            "return right - left",
        ]),
        clear: Object.freeze([
            "a[0..n-1] ← 0;  tree[0..n] ← 0",
        ]),
    }),
});

function normZero(n) {
    return n === 0 ? 0 : n;
}

function formatSigned(delta) {
    return delta >= 0 ? `+${delta}` : `${delta}`;
}

function formatTerm(n) {
    return n < 0 ? `(${n})` : `${n}`;
}

function validateIndex(index, size, label = "Index") {
    if (typeof index !== "number" || !Number.isInteger(index)) {
        return `${label} must be an integer from 0 to ${size - 1} (got ${index}).`;
    }
    if (index < 0 || index >= size) {
        return `${label} ${index} is out of range (must be 0 to ${size - 1}).`;
    }
    return null;
}

function validateBoundedInt(value, label) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        return `${label} must be an integer from ${FENWICK_LIMITS.minValue} to ${FENWICK_LIMITS.maxValue} (got ${value}).`;
    }
    if (value < FENWICK_LIMITS.minValue || value > FENWICK_LIMITS.maxValue) {
        return `${label} ${value} is out of range (must be ${FENWICK_LIMITS.minValue} to ${FENWICK_LIMITS.maxValue}).`;
    }
    return null;
}

function validateValuesArray(values) {
    if (!Array.isArray(values)) {
        return "Input must be an array of integers.";
    }
    if (values.length < FENWICK_LIMITS.minSize || values.length > FENWICK_LIMITS.maxSize) {
        return `Array length must be between ${FENWICK_LIMITS.minSize} and ${FENWICK_LIMITS.maxSize} (got ${values.length}).`;
    }
    for (let i = 0; i < values.length; i++) {
        const err = validateBoundedInt(values[i], `values[${i}]`);
        if (err !== null) return err;
    }
    return null;
}

export class FenwickTree {
    /**
     * Creates a zero-initialized Fenwick Tree of size `n`.
     *
     * @param {number} [n=8] integer in `1..32`
     */
    constructor(n = 8) {
        if (typeof n !== "number") {
            throw new TypeError(`FenwickTree size must be an integer from ${FENWICK_LIMITS.minSize} to ${FENWICK_LIMITS.maxSize} (got ${typeof n})`);
        }
        if (!Number.isInteger(n) || n < FENWICK_LIMITS.minSize || n > FENWICK_LIMITS.maxSize) {
            throw new RangeError(`FenwickTree size must be an integer from ${FENWICK_LIMITS.minSize} to ${FENWICK_LIMITS.maxSize} (got ${n})`);
        }
        this._size = n;
        this._values = new Array(n).fill(0);
        this._tree = new Array(n + 1).fill(0);
    }

    /**
     * Builds a new Fenwick Tree from `values` in O(n) time.
     * Returns `{ ok: true, value: bit, steps }` or `{ ok: false, error, steps: [] }`.
     *
     * @param {number[]} values
     */
    static from(values) {
        const err = validateValuesArray(values);
        if (err !== null) return fail(err, []);
        const bit = new FenwickTree(values.length);
        const res = bit.build(values);
        return res.ok ? ok(bit, res.steps) : res;
    }

    /** Number of logical elements `n`. */
    get size() {
        return this._size;
    }

    /** Defensive copy of the underlying 0-based values array `a[0..n-1]`. */
    toArray() {
        return this._values.slice();
    }

    /** Defensive copy of the internal 1-based Fenwick array `tree[0..n]`. */
    treeArray() {
        return this._tree.slice();
    }

    /** Plain defensive deep copy used in step snapshots. */
    snapshot() {
        return {
            tree: this._tree.slice(),
            values: this._values.slice(),
        };
    }

    /**
     * Verifies all Fenwick invariants: lengths, finite integers, `tree[0] === 0`,
     * and `tree[j] === sum(values[j - lowbit(j) .. j - 1])` for every `j = 1..n`.
     *
     * @returns {string | null} `null` when sound, otherwise a descriptive error string.
     */
    integrityError() {
        if (
            typeof this._size !== "number" ||
            !Number.isInteger(this._size) ||
            this._size < FENWICK_LIMITS.minSize ||
            this._size > FENWICK_LIMITS.maxSize
        ) {
            return `Invalid FenwickTree size: ${this._size}.`;
        }
        if (!Array.isArray(this._values) || this._values.length !== this._size) {
            return `values length mismatch: expected ${this._size}, got ${this._values?.length}.`;
        }
        if (!Array.isArray(this._tree) || this._tree.length !== this._size + 1) {
            return `tree length mismatch: expected ${this._size + 1}, got ${this._tree?.length}.`;
        }
        if (this._tree[0] !== 0) {
            return `tree[0] header slot must be 0 (got ${this._tree[0]}).`;
        }
        for (let i = 0; i < this._size; i++) {
            if (typeof this._values[i] !== "number" || !Number.isInteger(this._values[i])) {
                return `values[${i}] must be a finite integer (got ${this._values[i]}).`;
            }
        }
        for (let j = 1; j <= this._size; j++) {
            if (typeof this._tree[j] !== "number" || !Number.isInteger(this._tree[j])) {
                return `tree[${j}] must be a finite integer (got ${this._tree[j]}).`;
            }
            const lb = lowbit(j);
            if (!Number.isInteger(lb) || lb < 1 || lb > j) {
                return `Invalid lowbit(${j}) = ${lb}.`;
            }
            const start = j - lb;
            let expected = 0;
            for (let k = start; k < j; k++) {
                expected += this._values[k];
            }
            if (this._tree[j] !== expected) {
                return `Fenwick invariant violated at tree[${j}]: expected ${expected} (sum of a[${start}..${j - 1}]), got ${this._tree[j]}.`;
            }
        }
        return null;
    }

    /**
     * Replaces contents with `values` using the O(n) bottom-up build.
     * Atomic: invalid inputs leave the tree untouched.
     *
     * @param {number[]} values array of `1..32` integers in `-999..999`
     */
    build(values) {
        const err = validateValuesArray(values);
        if (err !== null) return fail(err, []);

        const n = values.length;
        this._size = n;
        this._values = values.map((v) => normZero(v));
        this._tree = [0, ...this._values];

        const bits = this.#bitWidth();
        const steps = [];
        const allIndices = Array.from({ length: n }, (_, k) => k + 1);

        steps.push(this.#step({
            type: "visit",
            operation: "build",
            index: null,
            lowbit: null,
            indices: allIndices,
            runningTotal: null,
            line: 1,
            message: `Copy a[0..${n - 1}] directly into tree[1..${n}] (${n} ${n === 1 ? "element" : "elements"}).`,
        }));

        for (let j = 1; j <= n; j++) {
            const lb = lowbit(j);
            const parent = j + lb;
            if (lb > 0 && parent <= n) {
                const childVal = this._tree[j];
                this._tree[parent] = normZero(this._tree[parent] + childVal);
                steps.push(this.#step({
                    type: "add",
                    operation: "build",
                    index: j,
                    lowbit: lb,
                    indices: [j, parent],
                    runningTotal: null,
                    line: 4,
                    message:
                        `j = ${j} (${formatBinary(j, bits)}), lowbit ${lb} (${formatBinary(lb, bits)}): ` +
                        `add tree[${j}] (${childVal}) into parent tree[${parent}] (${formatBinary(parent, bits)}) → ${this._tree[parent]}.`,
                }));
            }
        }

        steps.push(this.#step({
            type: "done",
            operation: "build",
            index: null,
            lowbit: null,
            indices: [],
            runningTotal: null,
            line: 5,
            message: `O(n) build complete for ${n} ${n === 1 ? "element" : "elements"}.`,
        }));

        return ok(this.toArray(), steps);
    }

    /**
     * Adds `delta` to `a[i]` and updates all covering Fenwick cells in O(log n).
     *
     * @param {number} i 0-based index in `0..size-1`
     * @param {number} delta integer in `-999..999`
     */
    update(i, delta) {
        const idxErr = validateIndex(i, this._size, "Index");
        if (idxErr !== null) return fail(idxErr, []);
        const valErr = validateBoundedInt(delta, "Delta");
        if (valErr !== null) return fail(valErr, []);

        const normalizedDelta = normZero(delta);
        const normalizedIndex = normZero(i);
        this._values[normalizedIndex] = normZero(this._values[normalizedIndex] + normalizedDelta);

        const steps = [];
        const visited = this.#climbAndAdd(normalizedIndex, normalizedDelta, "update", steps);

        steps.push(this.#step({
            type: "done",
            operation: "update",
            index: null,
            lowbit: null,
            indices: visited.slice(),
            runningTotal: null,
            line: 5,
            message:
                `Updated a[${normalizedIndex}] by ${formatSigned(normalizedDelta)} → ${this._values[normalizedIndex]} ` +
                `(updated ${visited.length} Fenwick ${visited.length === 1 ? "cell" : "cells"}).`,
        }));

        return ok(this._values[normalizedIndex], steps);
    }

    /**
     * Sets `a[i] = value` by applying `delta = value - a[i]` up the Fenwick tree in O(log n).
     *
     * @param {number} i 0-based index in `0..size-1`
     * @param {number} value target integer in `-999..999`
     */
    set(i, value) {
        const idxErr = validateIndex(i, this._size, "Index");
        if (idxErr !== null) return fail(idxErr, []);
        const valErr = validateBoundedInt(value, "Value");
        if (valErr !== null) return fail(valErr, []);

        const normalizedIndex = normZero(i);
        const normalizedValue = normZero(value);
        const prev = this._values[normalizedIndex];
        const delta = normZero(normalizedValue - prev);
        this._values[normalizedIndex] = normalizedValue;

        const steps = [];
        if (delta === 0) {
            steps.push(this.#step({
                type: "done",
                operation: "set",
                index: null,
                lowbit: null,
                indices: [],
                runningTotal: null,
                line: 1,
                message: `a[${normalizedIndex}] is already ${normalizedValue} (delta = 0); no Fenwick cells changed.`,
            }));
            return ok(normalizedValue, steps);
        }

        const visited = this.#climbAndAdd(normalizedIndex, delta, "set", steps);

        steps.push(this.#step({
            type: "done",
            operation: "set",
            index: null,
            lowbit: null,
            indices: visited.slice(),
            runningTotal: null,
            line: 5,
            message:
                `Set a[${normalizedIndex}] from ${prev} to ${normalizedValue} (delta ${formatSigned(delta)}, ` +
                `updated ${visited.length} Fenwick ${visited.length === 1 ? "cell" : "cells"}).`,
        }));

        return ok(normalizedValue, steps);
    }

    /**
     * Computes prefix sum `a[0] + a[1] + ... + a[i]` in O(log n).
     *
     * @param {number} i 0-based inclusive right endpoint in `0..size-1`
     */
    prefixSum(i) {
        const idxErr = validateIndex(i, this._size, "Index");
        if (idxErr !== null) return fail(idxErr, []);

        const normalizedIndex = normZero(i);
        const bits = this.#bitWidth();
        const steps = [];
        const visited = [];
        let total = 0;
        let j = normalizedIndex + 1;

        while (j > 0) {
            const lb = lowbit(j);
            const cellVal = this._tree[j];
            total = normZero(total + cellVal);
            visited.push(j);

            steps.push(this.#step({
                type: "visit",
                operation: "prefixSum",
                index: j,
                lowbit: lb,
                indices: visited.slice(),
                runningTotal: total,
                line: 3,
                message:
                    `${visited.length === 1 ? `Start at j = i + 1 = ${j}` : `j = ${j}`} (${formatBinary(j, bits)}), lowbit ${lb} (${formatBinary(lb, bits)}): ` +
                    `add tree[${j}] (${cellVal}) → total = ${total}.`,
            }));

            if (lb <= 0) break;
            const next = j - lb;
            if (next > 0) {
                steps.push(this.#step({
                    type: "move-down",
                    operation: "prefixSum",
                    index: j,
                    lowbit: lb,
                    indices: visited.slice(),
                    runningTotal: total,
                    line: 4,
                    message:
                        `j = ${j} (${formatBinary(j, bits)}), lowbit ${lb} (${formatBinary(lb, bits)}): ` +
                        `next j = ${j} - ${lb} = ${next} (${formatBinary(next, bits)}).`,
                }));
            }
            j = next;
        }

        steps.push(this.#step({
            type: "done",
            operation: "prefixSum",
            index: null,
            lowbit: null,
            indices: visited.slice(),
            runningTotal: total,
            line: 5,
            message:
                `Prefix sum a[0..${normalizedIndex}] = ${total} ` +
                `(summed ${visited.length} Fenwick ${visited.length === 1 ? "cell" : "cells"}).`,
        }));

        return ok(total, steps);
    }

    /**
     * Computes range sum `a[l] + ... + a[r] = prefixSum(r) - prefixSum(l - 1)` in O(log n).
     *
     * @param {number} l 0-based inclusive left endpoint in `0..size-1`
     * @param {number} r 0-based inclusive right endpoint in `0..size-1` with `l <= r`
     */
    rangeSum(l, r) {
        const leftErr = validateIndex(l, this._size, "Left index l");
        if (leftErr !== null) return fail(leftErr, []);
        const rightErr = validateIndex(r, this._size, "Right index r");
        if (rightErr !== null) return fail(rightErr, []);

        const leftIdx = normZero(l);
        const rightIdx = normZero(r);
        if (leftIdx > rightIdx) {
            return fail(`Range bounds invalid: left index l (${leftIdx}) must be <= right index r (${rightIdx}).`, []);
        }

        const bits = this.#bitWidth();
        const steps = [];
        const visited = [];

        let rightSum = 0;
        let j = rightIdx + 1;
        while (j > 0) {
            const lb = lowbit(j);
            const cellVal = this._tree[j];
            rightSum = normZero(rightSum + cellVal);
            visited.push(j);

            steps.push(this.#step({
                type: "range-right",
                operation: "rangeSum",
                index: j,
                lowbit: lb,
                indices: visited.slice(),
                runningTotal: rightSum,
                line: 3,
                message:
                    `Right prefix (r = ${rightIdx}): j = ${j} (${formatBinary(j, bits)}), ` +
                    `lowbit ${lb} (${formatBinary(lb, bits)}): add tree[${j}] (${cellVal}) → right sum = ${rightSum}.`,
            }));

            if (lb <= 0) break;
            const next = j - lb;
            if (next > 0) {
                steps.push(this.#step({
                    type: "move-down",
                    operation: "rangeSum",
                    index: j,
                    lowbit: lb,
                    indices: visited.slice(),
                    runningTotal: rightSum,
                    line: 4,
                    message:
                        `j = ${j} (${formatBinary(j, bits)}), lowbit ${lb} (${formatBinary(lb, bits)}): ` +
                        `next j = ${j} - ${lb} = ${next} (${formatBinary(next, bits)}).`,
                }));
            }
            j = next;
        }

        let leftSum = 0;
        if (leftIdx > 0) {
            j = leftIdx;
            while (j > 0) {
                const lb = lowbit(j);
                const cellVal = this._tree[j];
                leftSum = normZero(leftSum + cellVal);
                const running = normZero(rightSum - leftSum);
                visited.push(j);

                steps.push(this.#step({
                    type: "range-left",
                    operation: "rangeSum",
                    index: j,
                    lowbit: lb,
                    indices: visited.slice(),
                    runningTotal: running,
                    line: 7,
                    message:
                        `Left prefix (l - 1 = ${leftIdx - 1}): j = ${j} (${formatBinary(j, bits)}), ` +
                        `lowbit ${lb} (${formatBinary(lb, bits)}): add tree[${j}] (${cellVal}) to left sum (= ${leftSum}), ` +
                        `subtracting from right sum → running range sum = ${rightSum} - ${formatTerm(leftSum)} = ${running}.`,
                }));

                if (lb <= 0) break;
                const next = j - lb;
                if (next > 0) {
                    steps.push(this.#step({
                        type: "move-down",
                        operation: "rangeSum",
                        index: j,
                        lowbit: lb,
                        indices: visited.slice(),
                        runningTotal: running,
                        line: 8,
                        message:
                            `j = ${j} (${formatBinary(j, bits)}), lowbit ${lb} (${formatBinary(lb, bits)}): ` +
                            `next j = ${j} - ${lb} = ${next} (${formatBinary(next, bits)}).`,
                    }));
                }
                j = next;
            }
        }

        const total = normZero(rightSum - leftSum);
        steps.push(this.#step({
            type: "done",
            operation: "rangeSum",
            index: null,
            lowbit: null,
            indices: visited.slice(),
            runningTotal: total,
            line: 9,
            message:
                leftIdx === 0
                    ? `Range sum a[0..${rightIdx}] = prefix(${rightIdx}) = ${total} (l = 0, no left prefix subtracted).`
                    : `Range sum a[${leftIdx}..${rightIdx}] = prefix(${rightIdx}) - prefix(${leftIdx - 1}) = ${rightSum} - ${formatTerm(leftSum)} = ${total}.`,
        }));

        return ok(total, steps);
    }

    /**
     * Resets all values and Fenwick tree entries to `0`, preserving the current size `n`.
     */
    clear() {
        this._values.fill(0);
        this._tree.fill(0);
        const steps = [
            this.#step({
                type: "done",
                operation: "clear",
                index: null,
                lowbit: null,
                indices: [],
                runningTotal: null,
                line: 1,
                message: `Cleared all ${this._size} values and Fenwick tree cells to 0.`,
            }),
        ];
        return ok(this._size, steps);
    }

    #bitWidth() {
        return Math.max(4, this._size.toString(2).length);
    }

    #climbAndAdd(zeroBasedIndex, delta, operation, steps) {
        const bits = this.#bitWidth();
        const visited = [];
        let j = zeroBasedIndex + 1;

        while (j <= this._size) {
            const lb = lowbit(j);
            this._tree[j] = normZero(this._tree[j] + delta);
            visited.push(j);

            steps.push(this.#step({
                type: "add",
                operation,
                index: j,
                lowbit: lb,
                indices: visited.slice(),
                runningTotal: null,
                line: 3,
                message:
                    `${visited.length === 1 ? `Start at j = i + 1 = ${j}` : `j = ${j}`} (${formatBinary(j, bits)}), lowbit ${lb} (${formatBinary(lb, bits)}): ` +
                    `add ${formatSigned(delta)} to tree[${j}] → ${this._tree[j]}.`,
            }));

            if (lb <= 0) break;
            const next = j + lb;
            if (next <= this._size) {
                steps.push(this.#step({
                    type: "move-up",
                    operation,
                    index: j,
                    lowbit: lb,
                    indices: visited.slice(),
                    runningTotal: null,
                    line: 4,
                    message:
                        `j = ${j} (${formatBinary(j, bits)}), lowbit ${lb} (${formatBinary(lb, bits)}): ` +
                        `next j = ${j} + ${lb} = ${next} (${formatBinary(next, bits)}).`,
                }));
            }
            j = next;
        }

        return visited;
    }

    #step({ type, operation, index, lowbit: lb, indices, runningTotal, line, message }) {
        return {
            type,
            operation,
            index,
            lowbit: lb,
            indices,
            runningTotal,
            line,
            message,
            snapshot: this.snapshot(),
        };
    }
}
