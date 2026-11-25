/**
 * Comparison sorts that record real execution steps.
 *
 * Each algorithm sorts an actual array and calls tracer.record() at every
 * comparison and write. A step stores a copy of the array at that moment, so
 * replaying the steps shows exactly what the algorithm did — never a
 * hand-scripted animation.
 *
 * Step shape:
 * {
 *   array: number[],        // array contents at this step
 *   type: "start" | "compare" | "swap" | "shift" | "insert" | "select" | "sorted" | "done",
 *   indices: number[],      // indices involved in this step
 *   sorted: number[],       // indices known to be in final position
 *   line: number,           // 1-based pseudocode line being executed
 *   message: string,        // plain-language explanation
 *   comparisons: number,    // running total
 *   writes: number,         // running total of array writes (swap = 2 writes)
 *   key?: number            // insertion sort: value currently held out
 * }
 */

class Tracer {
    constructor(array) {
        this.a = array;
        this.steps = [];
        this.sorted = new Set();
        this.comparisons = 0;
        this.writes = 0;
        /**
         * Context for recursive sorts, copied into every step while set:
         * range: [lo, hi] subarray being worked on, depth: recursion depth,
         * key: value held aside (insertion key / quick sort pivot).
         */
        this.ctx = {};
    }

    record(type, indices, line, message, extra = {}) {
        this.steps.push({
            array: this.a.slice(),
            type,
            indices,
            sorted: [...this.sorted].sort((x, y) => x - y),
            line,
            message,
            comparisons: this.comparisons,
            writes: this.writes,
            ...this.ctx,
            ...extra,
        });
    }

    /** Compare a[i] > a[j], counting and recording it. */
    greater(i, j, line) {
        this.comparisons++;
        const result = this.a[i] > this.a[j];
        this.record("compare", [i, j], line,
            `Compare A[${i}] = ${this.a[i]} with A[${j}] = ${this.a[j]}: ${this.a[i]} ${result ? ">" : "≤"} ${this.a[j]}.`);
        return result;
    }

    swap(i, j, line, why) {
        const a = this.a;
        [a[i], a[j]] = [a[j], a[i]];
        this.writes += 2;
        this.record("swap", [i, j], line, `Swap A[${i}] and A[${j}]${why ? ` — ${why}` : ""}. Array is now [${a.join(", ")}].`);
    }

    markSorted(i, line, message) {
        this.sorted.add(i);
        this.record("sorted", [i], line, message);
    }

    markAllSorted() {
        for (let i = 0; i < this.a.length; i++) this.sorted.add(i);
    }
}

function bubbleSort(t) {
    const a = t.a;
    const n = a.length;
    for (let i = 0; i < n - 1; i++) {
        let swapped = false;
        for (let j = 0; j < n - 1 - i; j++) {
            if (t.greater(j, j + 1, 4)) {
                // Message is built before the swap runs, so A[j] is still the larger value.
                t.swap(j, j + 1, 5, `${a[j]} was larger, so it moves right`);
                swapped = true;
            }
        }
        t.markSorted(n - 1 - i, 3, `Pass ${i + 1} complete: the largest unsorted value (${a[n - 1 - i]}) has bubbled to index ${n - 1 - i}.`);
        if (!swapped) {
            t.markAllSorted();
            t.record("sorted", [], 6, `No swaps in pass ${i + 1}, so the array is already sorted — stop early.`);
            return;
        }
    }
    t.markAllSorted();
}

function selectionSort(t) {
    const a = t.a;
    const n = a.length;
    for (let i = 0; i < n - 1; i++) {
        let min = i;
        t.record("select", [i], 2, `Pass ${i + 1}: assume A[${i}] = ${a[i]} is the minimum of the unsorted part.`, { pivot: min });
        for (let j = i + 1; j < n; j++) {
            // A[j] < A[min]  is the same comparison as  A[min] > A[j]
            if (t.greater(min, j, 4)) {
                min = j;
                t.record("select", [min], 5, `New minimum found: A[${min}] = ${a[min]}.`, { pivot: min });
            }
        }
        if (min !== i) t.swap(i, min, 6, `move the minimum ${a[min]} into position ${i}`);
        t.markSorted(i, 6, `Index ${i} now holds ${a[i]}, its final sorted position.`);
    }
    t.markAllSorted();
}

function insertionSort(t) {
    const a = t.a;
    const n = a.length;
    // The growing prefix is sorted relative to itself but NOT in final position
    // (a later key can still shift it), so nothing is marked final until the end.
    for (let i = 1; i < n; i++) {
        const key = a[i];
        let j = i - 1;
        t.record("select", [i], 2, `Take key = A[${i}] = ${key} and insert it into the sorted prefix A[0..${i - 1}].`, { key });
        while (j >= 0) {
            t.comparisons++;
            const bigger = a[j] > key;
            t.record("compare", [j], 3, `Compare A[${j}] = ${a[j]} with key ${key}: ${a[j]} ${bigger ? ">" : "≤"} ${key}.`, { key });
            if (!bigger) break;
            a[j + 1] = a[j];
            t.writes++;
            t.record("shift", [j, j + 1], 4, `Shift ${a[j]} right from index ${j} to ${j + 1} to make room.`, { key });
            j--;
        }
        a[j + 1] = key;
        t.writes++;
        t.record("insert", [j + 1], 5, `Place key ${key} at index ${j + 1}. Prefix A[0..${i}] is sorted.`, { key });
    }
    t.markAllSorted();
}

function mergeSort(t) {
    const a = t.a;

    function sort(lo, hi, depth) {
        t.ctx = { range: [lo, hi], depth };
        if (lo >= hi) {
            t.record("split", [lo], 2, `A[${lo}] = ${a[lo]} is a single element, so it is already sorted. Return.`);
            return;
        }
        const mid = Math.floor((lo + hi) / 2);
        t.record("split", [], 3,
            `Split A[${lo}..${hi}] at mid = ${mid} into A[${lo}..${mid}] and A[${mid + 1}..${hi}] (depth ${depth}).`);
        sort(lo, mid, depth + 1);
        sort(mid + 1, hi, depth + 1);

        t.ctx = { range: [lo, hi], depth };
        const left = a.slice(lo, mid + 1);
        const right = a.slice(mid + 1, hi + 1);
        t.record("select", [], 5, `Merge the sorted halves L = [${left.join(", ")}] and R = [${right.join(", ")}] back into A[${lo}..${hi}].`);

        let i = 0, j = 0, k = lo;
        while (i < left.length && j < right.length) {
            t.comparisons++;
            const takeLeft = left[i] <= right[j]; // "<=" keeps equal values in original order (stable)
            t.record("compare", [k], 6,
                `Compare fronts: L has ${left[i]}, R has ${right[j]}. Take ${takeLeft ? `${left[i]} from L` : `${right[j]} from R`}${left[i] === right[j] ? " (tie goes to L to keep the sort stable)" : ""}.`);
            a[k] = takeLeft ? left[i++] : right[j++];
            t.writes++;
            t.record("insert", [k], 7, `Write ${a[k]} into A[${k}].`);
            k++;
        }
        while (i < left.length || j < right.length) {
            const fromLeft = i < left.length;
            a[k] = fromLeft ? left[i++] : right[j++];
            t.writes++;
            t.record("insert", [k], 8, `${fromLeft ? "R" : "L"} is empty, so copy the leftover ${a[k]} from ${fromLeft ? "L" : "R"} into A[${k}].`);
            k++;
        }
    }

    sort(0, a.length - 1, 0);
    t.ctx = {};
    t.markAllSorted();
}

function quickSort(t) {
    const a = t.a;

    function sort(lo, hi, depth) {
        if (lo > hi) return;
        t.ctx = { range: [lo, hi], depth };
        if (lo === hi) {
            t.markSorted(lo, 2, `A[${lo}] = ${a[lo]} is a one-element range, so it is already in its final position.`);
            return;
        }
        const pivot = a[hi];
        t.ctx = { range: [lo, hi], depth, key: pivot };
        t.record("select", [hi], 3, `Partition A[${lo}..${hi}] using the last element ${pivot} as the pivot (depth ${depth}).`);

        let i = lo;
        for (let j = lo; j < hi; j++) {
            t.comparisons++;
            const less = a[j] < pivot;
            t.record("compare", [j, hi], 5,
                `Compare A[${j}] = ${a[j]} with pivot ${pivot}: ${a[j]} ${less ? "<" : "≥"} ${pivot}${less ? ", so it belongs on the left" : ", so leave it"}.`);
            if (less) {
                if (i !== j) t.swap(i, j, 5, `move ${a[j]} into the "less than pivot" region`);
                i++;
            }
        }
        if (i !== hi) t.swap(i, hi, 6, `put pivot ${pivot} between the smaller and larger values`);
        t.markSorted(i, 6, `Pivot ${pivot} is now at index ${i}, its final position: everything left is smaller, everything right is ≥ ${pivot}.`);

        sort(lo, i - 1, depth + 1);
        sort(i + 1, hi, depth + 1);
    }

    sort(0, a.length - 1, 0);
    t.ctx = {};
    t.markAllSorted();
}

function heapSort(t) {
    const a = t.a;
    const n = a.length;

    function siftDown(i, size) {
        while (true) {
            const l = 2 * i + 1;
            const r = l + 1;
            let largest = i;
            if (l < size && t.greater(l, largest, 6)) largest = l;
            if (r < size && t.greater(r, largest, 6)) largest = r;
            if (largest === i) return;
            t.swap(i, largest, 7, `a parent must be ≥ its children, so ${a[i]} moves down`);
            i = largest;
        }
    }

    t.ctx = { range: [0, n - 1] };
    t.record("select", [], 1, `Phase 1: build a max-heap. Sift down every parent from index ${Math.floor(n / 2) - 1} to 0.`);
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) siftDown(i, n);

    for (let end = n - 1; end >= 1; end--) {
        t.ctx = { range: [0, end] };
        t.swap(0, end, 3, `the root ${a[0]} is the largest value left, so it goes to the end`);
        t.markSorted(end, 3, `${a[end]} is final at index ${end}. The heap shrinks to A[0..${end - 1}].`);
        t.ctx = { range: [0, end - 1] };
        siftDown(0, end);
    }
    t.ctx = {};
    t.markAllSorted();
}

export const SORTING_ALGORITHMS = {
    bubble: {
        name: "Bubble Sort",
        run: bubbleSort,
        pseudocode: [
            "for i ← 0 to n − 2",
            "    swapped ← false",
            "    for j ← 0 to n − 2 − i",
            "        if A[j] > A[j + 1]",
            "            swap A[j], A[j + 1];  swapped ← true",
            "    if not swapped: stop  (already sorted)",
        ],
        complexity: { best: "O(n)", average: "O(n²)", worst: "O(n²)", space: "O(1)", stable: true },
        summary: "Repeatedly compares neighbours and swaps them when out of order. After each pass the largest remaining value has moved to the end.",
    },
    selection: {
        name: "Selection Sort",
        run: selectionSort,
        pseudocode: [
            "for i ← 0 to n − 2",
            "    min ← i",
            "    for j ← i + 1 to n − 1",
            "        if A[j] < A[min]",
            "            min ← j",
            "    swap A[i], A[min]  (if min ≠ i)",
        ],
        complexity: { best: "O(n²)", average: "O(n²)", worst: "O(n²)", space: "O(1)", stable: false },
        summary: "Finds the smallest value in the unsorted part and swaps it into place. Always makes n(n−1)/2 comparisons but at most n − 1 swaps.",
    },
    insertion: {
        name: "Insertion Sort",
        run: insertionSort,
        pseudocode: [
            "for i ← 1 to n − 1",
            "    key ← A[i];  j ← i − 1",
            "    while j ≥ 0 and A[j] > key",
            "        A[j + 1] ← A[j];  j ← j − 1",
            "    A[j + 1] ← key",
        ],
        complexity: { best: "O(n)", average: "O(n²)", worst: "O(n²)", space: "O(1)", stable: true },
        summary: "Grows a sorted prefix one element at a time by shifting larger values right and dropping the key into the gap. Fast on nearly-sorted data.",
    },
    merge: {
        name: "Merge Sort",
        run: mergeSort,
        pseudocode: [
            "mergeSort(A, lo, hi)",
            "    if lo ≥ hi: return   (one element is sorted)",
            "    mid ← ⌊(lo + hi) / 2⌋",
            "    mergeSort(A, lo, mid);  mergeSort(A, mid + 1, hi)",
            "    L ← A[lo..mid];  R ← A[mid + 1..hi]",
            "    while L and R are not empty: take the smaller front (L on a tie)",
            "        A[k] ← taken value;  k ← k + 1",
            "    copy whatever is left in L or R into A",
        ],
        complexity: { best: "O(n log n)", average: "O(n log n)", worst: "O(n log n)", space: "O(n)", stable: true },
        summary: "Divide and conquer: split the array in half until each piece has one element, then merge sorted pieces back together. Always O(n log n), at the cost of an extra O(n) buffer.",
    },
    quick: {
        name: "Quick Sort",
        run: quickSort,
        pseudocode: [
            "quickSort(A, lo, hi)",
            "    if lo ≥ hi: return",
            "    pivot ← A[hi];  i ← lo",
            "    for j ← lo to hi − 1",
            "        if A[j] < pivot: swap A[i], A[j];  i ← i + 1",
            "    swap A[i], A[hi]   (pivot lands in its final place)",
            "    quickSort(A, lo, i − 1);  quickSort(A, i + 1, hi)",
        ],
        complexity: { best: "O(n log n)", average: "O(n log n)", worst: "O(n²)", space: "O(log n) avg stack", stable: false },
        summary: "Picks a pivot (here: the last element, Lomuto scheme), moves smaller values left of it and larger values right, then sorts each side. Fast in practice, but already-sorted input with this pivot choice hits the O(n²) worst case.",
    },
    heap: {
        name: "Heap Sort",
        run: heapSort,
        pseudocode: [
            "for i ← ⌊n/2⌋ − 1 down to 0: siftDown(A, i, n)   (build max-heap)",
            "for end ← n − 1 down to 1",
            "    swap A[0], A[end]   (largest goes to its final place)",
            "    siftDown(A, 0, end)",
            "siftDown(A, i, size):",
            "    largest ← biggest of A[i], A[2i + 1], A[2i + 2] inside size",
            "    if largest ≠ i: swap A[i], A[largest];  i ← largest;  repeat",
        ],
        complexity: { best: "O(n log n)", average: "O(n log n)", worst: "O(n log n)", space: "O(1)", stable: false },
        summary: "Treats the array as a binary max-heap (children of index i are 2i + 1 and 2i + 2). Repeatedly swaps the root, the largest value, to the end and restores the heap. In-place and always O(n log n).",
    },
};

/**
 * Run a sorting algorithm on a copy of `input` and return its recorded steps.
 * The input array is never mutated.
 */
export function traceSort(algorithmKey, input) {
    const algo = SORTING_ALGORITHMS[algorithmKey];
    if (!algo) throw new Error(`Unknown sorting algorithm: ${algorithmKey}`);
    if (!Array.isArray(input) || input.some(v => typeof v !== "number" || !Number.isFinite(v))) {
        throw new TypeError("traceSort expects an array of finite numbers");
    }
    const t = new Tracer(input.slice());
    t.record("start", [], 1, `Start ${algo.name} on [${input.join(", ")}] (n = ${input.length}).`);
    if (input.length > 1) algo.run(t);
    t.markAllSorted();
    t.record("done", [], 0, `Sorted: [${t.a.join(", ")}] — ${t.comparisons} comparisons, ${t.writes} array writes.`);
    return t.steps;
}

export const INPUT_LIMITS = { minLength: 2, maxLength: 16, min: -99, max: 999 };

/**
 * Parse user text like "5, 3 8,1" into integers.
 * @returns {{ ok: true, values: number[] } | { ok: false, error: string }}
 */
export function parseArrayInput(text, limits = INPUT_LIMITS) {
    const raw = String(text ?? "").trim();
    if (raw === "") return { ok: false, error: "Enter some numbers separated by commas or spaces." };
    const tokens = raw.split(/[\s,]+/).filter(Boolean);
    const values = [];
    for (const token of tokens) {
        if (!/^-?\d+$/.test(token)) return { ok: false, error: `"${token}" is not a whole number.` };
        const v = Number(token);
        if (v < limits.min || v > limits.max) return { ok: false, error: `${v} is outside the allowed range ${limits.min} to ${limits.max}.` };
        values.push(v);
    }
    if (values.length < limits.minLength) return { ok: false, error: `Enter at least ${limits.minLength} numbers.` };
    if (values.length > limits.maxLength) return { ok: false, error: `Enter at most ${limits.maxLength} numbers so every step stays readable.` };
    return { ok: true, values };
}

/** Random integers in [1, 99]. `random` is injectable for tests. */
export function randomArray(length = 10, random = Math.random) {
    return Array.from({ length }, () => 1 + Math.floor(random() * 99));
}
