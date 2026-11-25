import { test } from "node:test";
import assert from "node:assert/strict";
import { SORTING_ALGORITHMS, traceSort, parseArrayInput, randomArray } from "../src/algorithms/sorting.js";

const KEYS = Object.keys(SORTING_ALGORITHMS);
const sortedCopy = (a) => a.slice().sort((x, y) => x - y);

function seeded(seed) {
    // Small deterministic PRNG (mulberry32) so failures are reproducible.
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

for (const key of KEYS) {
    test(`${key}: final step is correctly sorted on fixed and edge-case inputs`, () => {
        const cases = [
            [5, 1, 4, 2, 8],
            [1, 2, 3, 4, 5],
            [5, 4, 3, 2, 1],
            [3, 3, 1, 3, 2],
            [-5, 0, 999, -99, 7],
            [42],
            [],
            [2, 1],
        ];
        for (const input of cases) {
            const steps = traceSort(key, input);
            const last = steps.at(-1);
            assert.equal(last.type, "done");
            assert.deepEqual(last.array, sortedCopy(input), `input ${JSON.stringify(input)}`);
            assert.deepEqual(last.sorted, input.map((_, i) => i));
        }
    });

    test(`${key}: 200 random arrays sort correctly and every step is a permutation of the input`, () => {
        const rand = seeded(1234 + key.length);
        for (let round = 0; round < 200; round++) {
            const n = 2 + Math.floor(rand() * 15);
            const input = Array.from({ length: n }, () => Math.floor(rand() * 40) - 10);
            const steps = traceSort(key, input);
            const target = sortedCopy(input);
            assert.deepEqual(steps.at(-1).array, target);
            // Insertion and merge sort overwrite slots from a held-aside copy, so mid-step snapshots can
            // contain duplicates; swap-based sorts must always hold a permutation of the input.
            if (!["insertion", "merge", "counting", "radix"].includes(key)) {
                for (const s of steps) assert.deepEqual(sortedCopy(s.array), target);
            }
        }
    });

    test(`${key}: does not mutate the caller's array`, () => {
        const input = [9, 8, 7];
        traceSort(key, input);
        assert.deepEqual(input, [9, 8, 7]);
    });

    test(`${key}: every step's pseudocode line exists`, () => {
        const lines = SORTING_ALGORITHMS[key].pseudocode.length;
        for (const s of traceSort(key, [4, 2, 5, 1, 3])) {
            assert.ok(s.line >= 0 && s.line <= lines, `line ${s.line} out of range for ${key}`);
        }
    });

    test(`${key}: counters never decrease`, () => {
        const steps = traceSort(key, [6, 5, 4, 3, 2, 1]);
        for (let i = 1; i < steps.length; i++) {
            assert.ok(steps[i].comparisons >= steps[i - 1].comparisons);
            assert.ok(steps[i].writes >= steps[i - 1].writes);
        }
    });
}

test("comparison counts match textbook formulas", () => {
    const n = 6;
    const reversed = [6, 5, 4, 3, 2, 1];
    const ascending = [1, 2, 3, 4, 5, 6];
    const full = (n * (n - 1)) / 2; // 15

    assert.equal(traceSort("selection", ascending).at(-1).comparisons, full, "selection always n(n-1)/2");
    assert.equal(traceSort("selection", reversed).at(-1).comparisons, full);
    assert.equal(traceSort("bubble", ascending).at(-1).comparisons, n - 1, "bubble best case: one pass");
    assert.equal(traceSort("bubble", reversed).at(-1).comparisons, full);
    assert.equal(traceSort("insertion", ascending).at(-1).comparisons, n - 1, "insertion best case");
    assert.equal(traceSort("insertion", reversed).at(-1).comparisons, full);
});

test("bubble swap message names the larger value", () => {
    const swap = traceSort("bubble", [43, 3]).find(s => s.type === "swap");
    assert.match(swap.message, /43 was larger/);
});

test("selection swap message names the minimum", () => {
    const swap = traceSort("selection", [9, 4, 1]).find(s => s.type === "swap");
    assert.match(swap.message, /move the minimum 1 into position 0/);
});

test("selection sort makes at most n-1 swaps", () => {
    const steps = traceSort("selection", [5, 4, 3, 2, 1, 0]);
    assert.ok(steps.filter(s => s.type === "swap").length <= 5);
});

test("traceSort rejects bad input", () => {
    assert.throws(() => traceSort("nope", [1, 2]), /Unknown sorting algorithm/);
    assert.throws(() => traceSort("bubble", [1, "2"]), TypeError);
    assert.throws(() => traceSort("bubble", [1, NaN]), TypeError);
});

test("parseArrayInput accepts commas, spaces, negatives and zero", () => {
    assert.deepEqual(parseArrayInput(" 5, 3 0,-2  8 "), { ok: true, values: [5, 3, 0, -2, 8] });
});

test("parseArrayInput rejects bad input with a readable message", () => {
    for (const [text, pattern] of [
        ["", /Enter some numbers/],
        ["1, 2, x", /"x" is not a whole number/],
        ["1.5, 2", /not a whole number/],
        ["5", /at least 2/],
        ["1000, 2", /outside the allowed range/],
        [Array.from({ length: 17 }, (_, i) => i).join(","), /at most 16/],
    ]) {
        const r = parseArrayInput(text);
        assert.equal(r.ok, false, text);
        assert.match(r.error, pattern);
    }
});

test("randomArray returns integers in [1, 99]", () => {
    const r = randomArray(50, seeded(7));
    assert.equal(r.length, 50);
    assert.ok(r.every(v => Number.isInteger(v) && v >= 1 && v <= 99));
});

test("an index marked final never changes value afterwards", () => {
    for (const key of KEYS) {
        const steps = traceSort(key, [7, 3, 9, 1, 5, 8, 2]);
        const finalArray = steps.at(-1).array;
        for (const s of steps) {
            for (const i of s.sorted) assert.equal(s.array[i], finalArray[i], `${key}: index ${i} marked final too early`);
        }
    }
});

test("recursive sorts report a valid range and depth on every step", () => {
    for (const key of ["merge", "quick", "heap"]) {
        const n = 9;
        for (const s of traceSort(key, [5, 2, 9, 1, 7, 3, 8, 6, 4])) {
            if (!s.range) continue;
            const [lo, hi] = s.range;
            assert.ok(lo >= 0 && hi < n && lo <= hi, `${key}: bad range ${s.range}`);
            if (s.depth !== undefined) assert.ok(s.depth >= 0);
            for (const i of s.indices) assert.ok(i >= lo && i <= hi, `${key}: index ${i} outside range ${s.range}`);
        }
    }
});

test("quick sort: when a pivot is placed, its range is correctly partitioned", () => {
    const rand = seeded(99);
    for (let round = 0; round < 100; round++) {
        const input = Array.from({ length: 2 + Math.floor(rand() * 14) }, () => Math.floor(rand() * 30));
        for (const s of traceSort("quick", input)) {
            if (s.type !== "sorted" || s.key === undefined) continue;
            const [lo, hi] = s.range;
            const p = s.indices[0];
            for (let i = lo; i < p; i++) assert.ok(s.array[i] < s.array[p]);
            for (let i = p + 1; i <= hi; i++) assert.ok(s.array[i] >= s.array[p]);
        }
    }
});

test("quick sort with last-element pivot hits the O(n²) worst case on sorted input", () => {
    const n = 8;
    const ascending = Array.from({ length: n }, (_, i) => i + 1);
    assert.equal(traceSort("quick", ascending).at(-1).comparisons, (n * (n - 1)) / 2);
});

test("heap sort: after the build phase the array is a valid max-heap", () => {
    const rand = seeded(5);
    for (let round = 0; round < 100; round++) {
        const input = Array.from({ length: 2 + Math.floor(rand() * 14) }, () => Math.floor(rand() * 50));
        const firstExtract = traceSort("heap", input).find(s => s.type === "swap" && s.line === 3);
        if (!firstExtract) continue;
        // Undo the extract swap to see the heap exactly as the build phase left it.
        const heap = firstExtract.array.slice();
        const end = firstExtract.indices[1];
        [heap[0], heap[end]] = [heap[end], heap[0]];
        for (let i = 0; i < heap.length; i++) {
            for (const c of [2 * i + 1, 2 * i + 2]) if (c < heap.length) assert.ok(heap[i] >= heap[c], `heap property at ${i}`);
        }
    }
});

test("merge sort comparisons stay within n·⌈log2 n⌉", () => {
    const rand = seeded(11);
    for (let round = 0; round < 100; round++) {
        const n = 2 + Math.floor(rand() * 15);
        const input = Array.from({ length: n }, () => Math.floor(rand() * 100));
        assert.ok(traceSort("merge", input).at(-1).comparisons <= n * Math.ceil(Math.log2(n)));
    }
});

test("every registry entry has pseudocode, complexity and summary", () => {
    for (const [key, a] of Object.entries(SORTING_ALGORITHMS)) {
        assert.ok(a.name && a.summary && a.pseudocode.length > 0, key);
        for (const f of ["best", "average", "worst", "space"]) assert.ok(a.complexity[f], `${key}.${f}`);
        assert.equal(typeof a.complexity.stable, "boolean");
    }
});

test("counting and radix sort never compare elements", () => {
    for (const key of ["counting", "radix"]) {
        assert.equal(traceSort(key, [9, 3, 7, 3, 1]).at(-1).comparisons, 0);
    }
});

test("counting sort writes each element once; radix writes once per digit pass", () => {
    const input = [170, 45, 75, 90, 802, 24, 2, 66];
    assert.equal(traceSort("counting", input).at(-1).writes, input.length);
    const radix = traceSort("radix", input);
    const passes = radix.filter(s => /^Pass \d+:/.test(s.message)).length;
    assert.equal(passes, 3, "max 802 has 3 digits");
    assert.equal(radix.at(-1).writes, input.length * passes);
});

test("radix sort handles negatives by shifting, and says so", () => {
    const steps = traceSort("radix", [-5, 3, -99, 0]);
    assert.match(steps[1].message, /shifted by \+99/);
    assert.deepEqual(steps.at(-1).array, [-99, -5, 0, 3]);
});

test("counting placement is stable: among equal values, later input lands later", () => {
    const rand = seeded(21);
    for (const key of ["counting", "radix"]) {
        for (let round = 0; round < 100; round++) {
            const input = Array.from({ length: 2 + Math.floor(rand() * 14) }, () => Math.floor(rand() * 6));
            const steps = traceSort(key, input);
            // Check each counting pass separately (radix runs one pass per digit).
            let pass = [];
            const passes = [];
            for (const s of steps) {
                if (s.type === "insert" && s.from !== undefined) pass.push({ pos: s.indices[0], from: s.from, v: s.array[s.indices[0]] });
                else if (pass.length) { passes.push(pass); pass = []; }
            }
            if (pass.length) passes.push(pass);
            for (const p of passes) {
                for (const x of p) for (const y of p) {
                    if (x.v === y.v && x.from < y.from) assert.ok(x.pos < y.pos, `${key}: equal ${x.v} reordered`);
                }
            }
        }
    }
});
