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
