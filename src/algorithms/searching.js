/**
 * Searching algorithms that record real execution steps.
 *
 * Each algorithm searches an actual array and calls tracer.record() at every
 * comparison and bound update. Binary and Interpolation search sort a copy of
 * unsorted input first and explicitly state that in the opening step.
 *
 * Step shape:
 * {
 *   array: number[],
 *   type: "start" | "compare" | "narrow" | "found" | "not-found" | "done",
 *   indices: number[],
 *   low: number | null,
 *   high: number | null,
 *   mid: number | null,
 *   range: [number, number] | null,
 *   line: number,
 *   message: string,
 *   comparisons: number,
 *   foundIndex: number | null
 * }
 */

import { parseInteger } from "../core/validate.js";
import { parseArrayInput as parseNumberList } from "./sorting.js";

function isSortedAscending(arr) {
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] < arr[i - 1]) return false;
    }
    return true;
}

class SearchTracer {
    constructor(array, target) {
        this.a = array;
        this.target = target;
        this.steps = [];
        this.comparisons = 0;
        this.foundIndex = null;
    }

    record(type, { indices = [], low = null, high = null, mid = null, line = 1, message = "" } = {}) {
        const range = low !== null && high !== null && low <= high ? [low, high] : null;
        this.steps.push({
            array: this.a.slice(),
            type,
            indices: indices.slice(),
            low,
            high,
            mid,
            range,
            line,
            message,
            comparisons: this.comparisons,
            foundIndex: this.foundIndex,
        });
    }
}

function linearSearch(t) {
    const a = t.a;
    const n = a.length;
    const target = t.target;

    for (let i = 0; i < n; i++) {
        t.comparisons++;
        const match = a[i] === target;
        t.record("compare", {
            indices: [i],
            low: i,
            high: n - 1,
            mid: i,
            line: 2,
            message: `Compare A[${i}] = ${a[i]} with target ${target}: ${match ? "match!" : `${a[i]} ≠ ${target}, move to index ${i + 1}.`}`,
        });
        if (match) {
            t.foundIndex = i;
            t.record("found", {
                indices: [i],
                low: i,
                high: n - 1,
                mid: i,
                line: 3,
                message: `Found target ${target} at index ${i} after ${t.comparisons} comparison${t.comparisons === 1 ? "" : "s"}.`,
            });
            return;
        }
    }

    t.record("not-found", {
        indices: [],
        low: null,
        high: null,
        mid: null,
        line: 4,
        message: `Reached the end of the array: target ${target} is not present (${t.comparisons} comparison${t.comparisons === 1 ? "" : "s"}).`,
    });
}

function binarySearch(t) {
    const a = t.a;
    const target = t.target;
    let low = 0;
    let high = a.length - 1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        t.comparisons++;
        const val = a[mid];
        const cmpText = val === target
            ? `${val} = ${target} (match!)`
            : val < target
                ? `${val} < ${target}`
                : `${val} > ${target}`;

        t.record("compare", {
            indices: [mid],
            low,
            high,
            mid,
            line: 4,
            message: `Mid = ⌊(${low} + ${high}) / 2⌋ = ${mid}. Compare A[${mid}] = ${val} with target ${target}: ${cmpText}.`,
        });

        if (val === target) {
            t.foundIndex = mid;
            t.record("found", {
                indices: [mid],
                low,
                high,
                mid,
                line: 4,
                message: `Found target ${target} at index ${mid} after ${t.comparisons} comparison${t.comparisons === 1 ? "" : "s"}.`,
            });
            return;
        }

        if (val < target) {
            const nextLow = mid + 1;
            const msg = nextLow <= high
                ? `A[${mid}] = ${val} < ${target}, so discard A[${low}..${mid}] and narrow to A[${nextLow}..${high}].`
                : `A[${mid}] = ${val} < ${target}, so set low ← ${nextLow} (> high = ${high}); search window is now empty.`;
            low = nextLow;
            t.record("narrow", {
                indices: low <= high ? [low, high] : [],
                low,
                high,
                mid,
                line: 5,
                message: msg,
            });
        } else {
            const nextHigh = mid - 1;
            const msg = low <= nextHigh
                ? `A[${mid}] = ${val} > ${target}, so discard A[${mid}..${high}] and narrow to A[${low}..${nextHigh}].`
                : `A[${mid}] = ${val} > ${target}, so set high ← ${nextHigh} (< low = ${low}); search window is now empty.`;
            high = nextHigh;
            t.record("narrow", {
                indices: low <= high ? [low, high] : [],
                low,
                high,
                mid,
                line: 6,
                message: msg,
            });
        }
    }

    t.record("not-found", {
        indices: [],
        low,
        high,
        mid: null,
        line: 7,
        message: `Search window is empty (low = ${low} > high = ${high}): target ${target} is not in the array.`,
    });
}

function interpolationSearch(t) {
    const a = t.a;
    const target = t.target;
    let low = 0;
    let high = a.length - 1;

    while (low <= high && target >= a[low] && target <= a[high]) {
        const span = a[high] - a[low];
        let pos;
        let lineForProbe;
        let formulaNote;

        if (span === 0) {
            // Guard against division by zero when A[high] === A[low].
            pos = low;
            lineForProbe = 3;
            formulaNote = `A[${high}] = A[${low}] = ${a[low]} (avoid ÷ 0), so probe pos = low = ${pos}.`;
        } else {
            pos = low + Math.floor(((target - a[low]) * (high - low)) / span);
            pos = Math.max(low, Math.min(high, pos));
            lineForProbe = 5;
            formulaNote = `Interpolate pos = ${low} + ⌊(${target} − ${a[low]}) × (${high} − ${low}) / (${a[high]} − ${a[low]})⌋ = ${pos}.`;
        }

        t.comparisons++;
        const val = a[pos];
        const cmpText = val === target
            ? `${val} = ${target} (match!)`
            : val < target
                ? `${val} < ${target}`
                : `${val} > ${target}`;

        t.record("compare", {
            indices: [pos],
            low,
            high,
            mid: pos,
            line: lineForProbe,
            message: `${formulaNote} Compare A[${pos}] = ${val} with target ${target}: ${cmpText}.`,
        });

        if (val === target) {
            t.foundIndex = pos;
            t.record("found", {
                indices: [pos],
                low,
                high,
                mid: pos,
                line: 5,
                message: `Found target ${target} at index ${pos} after ${t.comparisons} comparison${t.comparisons === 1 ? "" : "s"}.`,
            });
            return;
        }

        if (val < target) {
            const nextLow = pos + 1;
            const msg = nextLow <= high
                ? `A[${pos}] = ${val} < ${target}, so discard A[${low}..${pos}] and set low ← ${nextLow}.`
                : `A[${pos}] = ${val} < ${target}, so set low ← ${nextLow} (> high = ${high}); search window is now empty.`;
            low = nextLow;
            t.record("narrow", {
                indices: low <= high ? [low, high] : [],
                low,
                high,
                mid: pos,
                line: 6,
                message: msg,
            });
        } else {
            const nextHigh = pos - 1;
            const msg = low <= nextHigh
                ? `A[${pos}] = ${val} > ${target}, so discard A[${pos}..${high}] and set high ← ${nextHigh}.`
                : `A[${pos}] = ${val} > ${target}, so set high ← ${nextHigh} (< low = ${low}); search window is now empty.`;
            high = nextHigh;
            t.record("narrow", {
                indices: low <= high ? [low, high] : [],
                low,
                high,
                mid: pos,
                line: 7,
                message: msg,
            });
        }
    }

    const reason = low <= high && a.length > 0
        ? `Target ${target} is outside the remaining sorted bounds [${a[low]}..${a[high]}]`
        : `Search window is empty (low = ${low}, high = ${high})`;

    t.record("not-found", {
        indices: [],
        low: low <= high ? low : null,
        high: low <= high ? high : null,
        mid: null,
        line: 8,
        message: `${reason}: target ${target} is not in the array.`,
    });
}

export const SEARCHING_ALGORITHMS = {
    linear: {
        name: "Linear Search",
        run: linearSearch,
        requiresSorted: false,
        pseudocode: [
            "for i ← 0 to n − 1",
            "    if A[i] = target",
            "        return i   (found)",
            "return not found",
        ],
        complexity: {
            best: "O(1)",
            average: "O(n)",
            worst: "O(n)",
            space: "O(1)",
            requiresSorted: false,
        },
        summary: "Checks elements one by one from left to right until it finds the target or reaches the end. Works on unsorted data with no preprocessing.",
    },
    binary: {
        name: "Binary Search",
        run: binarySearch,
        requiresSorted: true,
        pseudocode: [
            "low ← 0;  high ← n − 1",
            "while low ≤ high",
            "    mid ← ⌊(low + high) / 2⌋",
            "    if A[mid] = target: return mid   (found)",
            "    else if A[mid] < target: low ← mid + 1",
            "    else: high ← mid − 1",
            "return not found",
        ],
        complexity: {
            best: "O(1)",
            average: "O(log n)",
            worst: "O(log n)",
            space: "O(1)",
            requiresSorted: true,
        },
        summary: "Repeatedly compares the target against the middle element of a sorted range, discarding half of the remaining candidates on every step.",
    },
    interpolation: {
        name: "Interpolation Search",
        run: interpolationSearch,
        requiresSorted: true,
        pseudocode: [
            "low ← 0;  high ← n − 1",
            "while low ≤ high and A[low] ≤ target ≤ A[high]",
            "    if A[high] = A[low]:  pos ← low   (avoid ÷ 0)",
            "    else: pos ← low + ⌊((target − A[low]) · (high − low)) / (A[high] − A[low])⌋",
            "    if A[pos] = target: return pos   (found)",
            "    else if A[pos] < target: low ← pos + 1",
            "    else: high ← pos − 1",
            "return not found",
        ],
        complexity: {
            best: "O(1)",
            average: "O(log log n)",
            worst: "O(n)",
            space: "O(1)",
            requiresSorted: true,
        },
        summary: "Estimates where the target should lie within a sorted range using linear interpolation — like opening a dictionary near the letter you want. Very fast on uniformly distributed values, O(n) on highly skewed data.",
    },
};

/**
 * Run a searching algorithm on a copy of `input` and return its recorded steps.
 * The caller's `input` array is never mutated.
 */
export function traceSearch(algorithmKey, input, target) {
    const algo = SEARCHING_ALGORITHMS[algorithmKey];
    if (!algo) throw new Error(`Unknown searching algorithm: ${algorithmKey}`);
    if (!Array.isArray(input) || input.some(v => typeof v !== "number" || !Number.isFinite(v))) {
        throw new TypeError("traceSearch expects an array of finite numbers");
    }
    if (typeof target !== "number" || !Number.isFinite(target)) {
        throw new TypeError("traceSearch expects a finite numeric target");
    }

    const wasSorted = isSortedAscending(input);
    const working = algo.requiresSorted && !wasSorted
        ? input.slice().sort((x, y) => x - y)
        : input.slice();

    const t = new SearchTracer(working, target);
    const n = working.length;
    const initLow = n > 0 ? 0 : null;
    const initHigh = n > 0 ? n - 1 : null;

    let startMsg;
    if (n === 0) {
        startMsg = `Start ${algo.name} for target ${target} on an empty array.`;
    } else if (algo.requiresSorted && !wasSorted) {
        startMsg = `${algo.name} requires sorted input. Sorted the array ascending to [${working.join(", ")}] before searching for target ${target}.`;
    } else {
        startMsg = `Start ${algo.name} for target ${target} on [${working.join(", ")}] (n = ${n}).`;
    }

    t.record("start", {
        indices: [],
        low: initLow,
        high: initHigh,
        mid: null,
        line: 1,
        message: startMsg,
    });

    if (n === 0) {
        t.record("not-found", {
            indices: [],
            low: null,
            high: null,
            mid: null,
            line: algo.pseudocode.length,
            message: `Array is empty, so target ${target} cannot be found.`,
        });
    } else {
        algo.run(t);
    }

    const lastBeforeDone = t.steps.at(-1);
    const doneMsg = t.foundIndex !== null
        ? `Done: target ${target} found at index ${t.foundIndex} (A[${t.foundIndex}] = ${t.a[t.foundIndex]}) in ${t.comparisons} comparison${t.comparisons === 1 ? "" : "s"}.`
        : `Done: target ${target} was not found after ${t.comparisons} comparison${t.comparisons === 1 ? "" : "s"}.`;

    t.record("done", {
        indices: t.foundIndex !== null ? [t.foundIndex] : [],
        low: lastBeforeDone.low,
        high: lastBeforeDone.high,
        mid: t.foundIndex !== null ? t.foundIndex : lastBeforeDone.mid,
        line: lastBeforeDone.line,
        message: doneMsg,
    });

    return t.steps;
}

export const INPUT_LIMITS = { minLength: 1, maxLength: 16, min: -99, max: 999 };

/**
 * Parse user text like "5, 3 8,1" into integers, reusing sorting.js's parser.
 * @returns {{ ok: true, values: number[] } | { ok: false, error: string }}
 */
export function parseArrayInput(text, limits = INPUT_LIMITS) {
    return parseNumberList(text, limits);
}

/**
 * Parse the search target integer using the shared core validator.
 * @returns {{ ok: true, value: number } | { ok: false, error: string }}
 */
export function parseTargetInput(text, limits = INPUT_LIMITS) {
    return parseInteger(text, { min: limits.min, max: limits.max, label: "Target" });
}

/**
 * Generate a random array + target case (70% present, 30% absent).
 * `random` is injectable for deterministic tests.
 */
export function randomSearchCase(length = 10, random = Math.random) {
    const values = Array.from({ length }, () => 1 + Math.floor(random() * 99));
    let target;
    if (random() < 0.7 && values.length > 0) {
        target = values[Math.floor(random() * values.length)];
    } else {
        target = 1 + Math.floor(random() * 99);
    }
    return { values, target };
}
