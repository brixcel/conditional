import { ok, fail, assertCapacity, assertValue } from "./result.js";

/**
 * Binary heap (min or max) stored in a plain array, the way textbooks draw it:
 *   parent(i) = floor((i − 1) / 2)   left(i) = 2i + 1   right(i) = 2i + 2
 * Index 0 is the root. A min-heap keeps every parent ≤ its children; a max-heap
 * keeps every parent ≥ its children.
 *
 * DOM-free. Every mutating operation returns { ok, value?, error?, steps } (see result.js).
 * Each step is { type, indices, message, snapshot, comparisons, swaps } where
 * `comparisons` and `swaps` count work done so far in this operation and
 * `snapshot` is a copy of the heap after the step. Messages describing a swap are
 * built before the swap runs, so they name the values as they were.
 * peek() and extract() on an empty heap return null / a failure, never −1.
 */

export const HEAP_KINDS = Object.freeze(["min", "max"]);

export const parentIndex = (i) => Math.floor((i - 1) / 2);
export const leftIndex = (i) => 2 * i + 1;
export const rightIndex = (i) => 2 * i + 2;

/** True when `a` belongs above `b` in a heap of this kind (strict, so equal values never swap). */
function outranks(kind, a, b) {
    return kind === "min" ? a < b : a > b;
}

/** Checks the heap property for every parent/child pair. Works on any array. */
export function isValidHeap(items, kind) {
    for (let i = 1; i < items.length; i++) {
        if (outranks(kind, items[i], items[parentIndex(i)])) return false;
    }
    return true;
}

export class BinaryHeap {
    // 63 nodes = a full tree of height 5 (6 levels), which still fits on a phone screen.
    static MAX_CAPACITY = 63;

    /**
     * @param {"min"|"max"} kind
     * @param {number} capacity integer from 1 to MAX_CAPACITY
     */
    constructor(kind, capacity) {
        if (!HEAP_KINDS.includes(kind)) {
            throw new TypeError(`Heap kind must be "min" or "max" (got ${kind})`);
        }
        assertCapacity(capacity, 1, BinaryHeap.MAX_CAPACITY, "Heap");
        this.kind = kind;
        this.capacity = capacity;
        this.items = [];
    }

    /** Builds a heap from `values` with bottom-up heapify (O(n)). Returns { ok, value: heap, steps } or a failure. */
    static from(kind, values, capacity = BinaryHeap.MAX_CAPACITY) {
        const heap = new BinaryHeap(kind, capacity);
        const result = heap.build(values);
        return result.ok ? ok(heap, result.steps) : result;
    }

    get size() { return this.items.length; }
    get label() { return this.kind === "min" ? "min-heap" : "max-heap"; }
    /** "smaller" for a min-heap, "larger" for a max-heap. */
    get better() { return this.kind === "min" ? "smaller" : "larger"; }

    isEmpty() { return this.items.length === 0; }
    isFull() { return this.items.length === this.capacity; }
    peek() { return this.isEmpty() ? null : this.items[0]; }
    toArray() { return this.items.slice(); }
    isValid() { return isValidHeap(this.items, this.kind); }
    snapshot() { return { items: this.items.slice(), kind: this.kind, size: this.items.length, capacity: this.capacity }; }

    clear() { this.items = []; }

    /** Adds `value` at the next free slot, then sifts it up. O(log n). */
    insert(value) {
        assertValue(value);
        if (this.isFull()) {
            const error = `Heap overflow: ${this.capacity === 1 ? "the only slot is" : `all ${this.capacity} slots are`} used, so ${value} cannot be inserted.`;
            return fail(error, [this.#step("overflow", [], error, { comparisons: 0, swaps: 0 })]);
        }
        const counters = { comparisons: 0, swaps: 0 };
        const at = this.items.length;
        this.items.push(value);
        const steps = [this.#step("insert", [at],
            at === 0
                ? `Heap was empty, so ${value} becomes the root (index 0).`
                : `Place ${value} at the next free slot, index ${at} (bottom level, leftmost gap). Now sift it up.`,
            counters)];
        this.#siftUp(at, steps, counters);
        return ok(value, steps);
    }

    /** Removes and returns the root (min or max). O(log n). */
    extract() {
        if (this.isEmpty()) {
            const error = `Heap underflow: the heap is empty, so there is no ${this.kind === "min" ? "minimum" : "maximum"} to extract.`;
            return fail(error, [this.#step("underflow", [], error, { comparisons: 0, swaps: 0 })]);
        }
        const counters = { comparisons: 0, swaps: 0 };
        const root = this.items[0];
        const lastIndex = this.items.length - 1;
        const steps = [this.#step("extract", [0],
            `Remove the root ${root}, the ${this.kind === "min" ? "minimum" : "maximum"} of the heap.`, counters)];

        const last = this.items.pop();
        if (lastIndex === 0) {
            steps.push(this.#step("done", [], `${root} was the only element, so the heap is now empty.`, counters));
            return ok(root, steps);
        }
        this.items[0] = last;
        steps.push(this.#step("move-last", [0],
            `Move the last element ${last} (index ${lastIndex}) into the root, so the tree stays complete. Now sift it down.`,
            counters));
        this.#siftDown(0, steps, counters);
        return ok(root, steps);
    }

    /**
     * Replaces the contents with `values` and heapifies bottom-up:
     * sift down every internal node from the last parent back to the root. O(n).
     */
    build(values) {
        if (!Array.isArray(values)) throw new TypeError("build() expects an array of numbers");
        values.forEach(assertValue);
        if (values.length > this.capacity) {
            const error = `Cannot build a heap of ${values.length} values: capacity is ${this.capacity}.`;
            return fail(error, [this.#step("overflow", [], error, { comparisons: 0, swaps: 0 })]);
        }
        const counters = { comparisons: 0, swaps: 0 };
        this.items = values.slice();
        const n = this.items.length;
        const lastParent = parentIndex(n - 1);
        const steps = [this.#step("build-start", [],
            n < 2
                ? `Copied ${n} value${n === 1 ? "" : "s"}. A heap with fewer than 2 elements is already valid.`
                : `Copied ${n} values in their original order. Leaves (index ${lastParent + 1} to ${n - 1}) are already heaps; ` +
                  `sift down each parent from index ${lastParent} back to 0.`,
            counters)];
        for (let i = lastParent; i >= 0; i--) {
            steps.push(this.#step("heapify", [i], `Heapify the subtree rooted at index ${i} (value ${this.items[i]}).`, counters));
            this.#siftDown(i, steps, counters);
        }
        steps.push(this.#step("done", [], `Built a valid ${this.label} of ${n} element${n === 1 ? "" : "s"} ` +
            `with ${counters.comparisons} comparison${counters.comparisons === 1 ? "" : "s"} and ${counters.swaps} swap${counters.swaps === 1 ? "" : "s"}.`,
            counters));
        return ok(this.items.length, steps);
    }

    #siftUp(i, steps, counters) {
        while (i > 0) {
            const p = parentIndex(i);
            const child = this.items[i];
            const parent = this.items[p];
            counters.comparisons++;
            if (!outranks(this.kind, child, parent)) {
                steps.push(this.#step("compare", [i, p],
                    `Compare ${child} (index ${i}) with its parent ${parent} (index ${p}). ` +
                    `${child} is not ${this.better}, so it stays. Heap property holds.`, counters));
                break;
            }
            const message = `Compare ${child} (index ${i}) with its parent ${parent} (index ${p}). ` +
                `${child} is ${this.better}, so swap them.`;
            this.#swap(i, p, counters);
            steps.push(this.#step("swap", [i, p], message, counters));
            i = p;
        }
        if (i === 0 && this.items.length > 1 && steps.at(-1).type === "swap") {
            steps.push(this.#step("done", [0], `${this.items[0]} reached the root. Heap property holds.`, counters));
        }
    }

    #siftDown(i, steps, counters) {
        const n = this.items.length;
        for (;;) {
            const l = leftIndex(i);
            const r = rightIndex(i);
            if (l >= n) {
                steps.push(this.#step("settled", [i], `${this.items[i]} at index ${i} is a leaf, so it stops here.`, counters));
                return;
            }
            // Pick the child that belongs higher (left wins ties).
            let best = l;
            if (r < n) {
                counters.comparisons++;
                if (outranks(this.kind, this.items[r], this.items[l])) best = r;
            }
            const value = this.items[i];
            const childValue = this.items[best];
            const childText = r < n
                ? `Its children are ${this.items[l]} (index ${l}) and ${this.items[r]} (index ${r}); the ${this.better} is ${childValue}.`
                : `Its only child is ${childValue} (index ${l}).`;
            counters.comparisons++;
            if (!outranks(this.kind, childValue, value)) {
                steps.push(this.#step("compare", [i, best],
                    `${value} at index ${i}: ${childText} ${childValue} is not ${this.better} than ${value}, so it stays. Heap property holds.`,
                    counters));
                return;
            }
            const message = `${value} at index ${i}: ${childText} ${childValue} is ${this.better} than ${value}, so swap them.`;
            this.#swap(i, best, counters);
            steps.push(this.#step("swap", [i, best], message, counters));
            i = best;
        }
    }

    #swap(a, b, counters) {
        [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
        counters.swaps++;
    }

    #step(type, indices, message, counters) {
        return { type, indices, message, snapshot: this.snapshot(), comparisons: counters.comparisons, swaps: counters.swaps };
    }
}

export class MinHeap extends BinaryHeap {
    constructor(capacity) { super("min", capacity); }
}

export class MaxHeap extends BinaryHeap {
    constructor(capacity) { super("max", capacity); }
}

/** Registry entry, same shape as the algorithm registries (name, pseudocode, complexity, summary). */
export const HEAP_INFO = Object.freeze({
    name: "Binary Heap",
    summary: "A complete binary tree stored in an array. Every parent is ≤ its children (min-heap) or ≥ them (max-heap), so the root is always the minimum or maximum.",
    complexity: Object.freeze({
        peek: "O(1)",
        insert: "O(log n)",
        extract: "O(log n)",
        build: "O(n)",
        space: "O(n)"
    }),
    pseudocode: Object.freeze({
        insert: Object.freeze([
            "A[n] ← value;  i ← n;  n ← n + 1",
            "while i > 0 and A[i] beats A[parent(i)]",
            "    swap A[i], A[parent(i)]",
            "    i ← parent(i)"
        ]),
        extract: Object.freeze([
            "root ← A[0];  n ← n − 1",
            "A[0] ← A[n]",
            "siftDown(0)",
            "return root"
        ]),
        siftDown: Object.freeze([
            "loop",
            "    c ← the child of i that beats the other (left if tie)",
            "    if no child or A[c] does not beat A[i]: stop",
            "    swap A[i], A[c];  i ← c"
        ]),
        build: Object.freeze([
            "copy values into A",
            "for i ← parent(n − 1) down to 0",
            "    siftDown(i)"
        ])
    })
});
