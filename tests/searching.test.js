import { test } from "node:test";
import assert from "node:assert/strict";
import {
    SEARCHING_ALGORITHMS,
    traceSearch,
    parseArrayInput,
    parseTargetInput,
    randomSearchCase,
} from "../src/algorithms/searching.js";

const KEYS = Object.keys(SEARCHING_ALGORITHMS);
const sortedCopy = (a) => a.slice().sort((x, y) => x - y);

function seeded(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

for (const key of KEYS) {
    const algo = SEARCHING_ALGORITHMS[key];

    test(`${key}: 300 seeded random cases agree with ground truth`, () => {
        const rand = seeded(2026 + key.length * 37);
        for (let round = 0; round < 300; round++) {
            const n = 1 + Math.floor(rand() * 25);
            const input = Array.from({ length: n }, () => Math.floor(rand() * 60) - 20);
            const before = input.slice();

            // Mix targets: present (60%), absent or random (40%)
            const target = rand() < 0.6
                ? input[Math.floor(rand() * n)]
                : Math.floor(rand() * 80) - 30;

            const steps = traceSearch(key, input, target);
            assert.deepEqual(input, before, `${key}: input must not be mutated`);

            const last = steps.at(-1);
            assert.equal(last.type, "done");

            const expectedArr = algo.requiresSorted ? sortedCopy(before) : before;
            assert.deepEqual(last.array, expectedArr);

            const exists = expectedArr.indexOf(target) !== -1;
            if (exists) {
                assert.notEqual(last.foundIndex, null, `${key}: expected to find ${target} in [${expectedArr}]`);
                assert.equal(last.array[last.foundIndex], target);
            } else {
                assert.equal(last.foundIndex, null, `${key}: expected null for absent ${target} in [${expectedArr}]`);
            }

            // Invariants across every recorded step
            for (let i = 0; i < steps.length; i++) {
                const s = steps[i];
                assert.ok(s.line >= 1 && s.line <= algo.pseudocode.length, `${key}: line ${s.line} out of range`);
                if (i > 0) assert.ok(s.comparisons >= steps[i - 1].comparisons, `${key}: comparisons decreased`);
                if (s.range !== null) {
                    const [lo, hi] = s.range;
                    assert.ok(lo >= 0 && hi < n && lo <= hi, `${key}: bad range ${s.range}`);
                }
            }
        }
    });

    test(`${key}: fixed edge cases (ends, absent, single element, all-equal, empty)`, () => {
        const cases = [
            { arr: [10, 20, 30, 40, 50], target: 10, present: true },   // left end
            { arr: [10, 20, 30, 40, 50], target: 50, present: true },   // right end
            { arr: [10, 20, 30, 40, 50], target: 5, present: false },   // below min
            { arr: [10, 20, 30, 40, 50], target: 99, present: false },  // above max
            { arr: [10, 20, 30, 40, 50], target: 25, present: false },  // gap in middle
            { arr: [42], target: 42, present: true },                   // single element found
            { arr: [42], target: 7, present: false },                   // single element absent
            { arr: [7, 7, 7, 7, 7], target: 7, present: true },         // all equal found (÷0 guard!)
            { arr: [7, 7, 7, 7, 7], target: 8, present: false },        // all equal absent (above)
            { arr: [7, 7, 7, 7, 7], target: 6, present: false },        // all equal absent (below)
            { arr: [-10, -5, 0, 5, 10], target: 0, present: true },     // zero & negatives
            { arr: [], target: 5, present: false },                     // empty array
        ];

        for (const c of cases) {
            const steps = traceSearch(key, c.arr, c.target);
            const last = steps.at(-1);
            assert.equal(last.type, "done");
            if (c.present) {
                assert.notEqual(last.foundIndex, null, `${key}: ${JSON.stringify(c)}`);
                assert.equal(last.array[last.foundIndex], c.target);
            } else {
                assert.equal(last.foundIndex, null, `${key}: ${JSON.stringify(c)}`);
            }
        }
    });

    test(`${key}: does not mutate caller's unsorted array`, () => {
        const input = [40, 10, 30, 20];
        traceSearch(key, input, 30);
        assert.deepEqual(input, [40, 10, 30, 20]);
    });
}

test("binary and interpolation sort unsorted input and state so in the first step", () => {
    for (const key of ["binary", "interpolation"]) {
        const steps = traceSearch(key, [50, 10, 40, 20, 30], 40);
        assert.equal(steps[0].type, "start");
        assert.match(steps[0].message, /sorted/i);
        assert.deepEqual(steps[0].array, [10, 20, 30, 40, 50]);
        assert.equal(steps.at(-1).foundIndex, 3);
    }
});

test("interpolation search handles equal-endpoint subarray without division by zero", () => {
    // Subarray shrinks to [5, 5, 5] when searching for 5 or 6
    const stepsFound = traceSearch("interpolation", [1, 5, 5, 5, 100], 5);
    assert.equal(stepsFound.at(-1).array[stepsFound.at(-1).foundIndex], 5);

    const stepsAbsent = traceSearch("interpolation", [1, 5, 5, 5, 100], 6);
    assert.equal(stepsAbsent.at(-1).foundIndex, null);
});

test("binary search comparisons stay within floor(log2 n) + 1", () => {
    const arr = Array.from({ length: 32 }, (_, i) => i * 3);
    const maxAllowed = Math.floor(Math.log2(arr.length)) + 1; // 6
    for (const target of [0, 93, 45, -1, 100, 46]) {
        const steps = traceSearch("binary", arr, target);
        assert.ok(steps.at(-1).comparisons <= maxAllowed, `target ${target}: ${steps.at(-1).comparisons} > ${maxAllowed}`);
    }
});

test("interpolation search finds a value in a uniform arithmetic progression in 1 comparison", () => {
    const arr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const steps = traceSearch("interpolation", arr, 70);
    assert.equal(steps.at(-1).foundIndex, 6);
    assert.equal(steps.at(-1).comparisons, 1);
});

test("traceSearch rejects invalid arguments", () => {
    assert.throws(() => traceSearch("nope", [1, 2], 1), /Unknown searching algorithm/);
    assert.throws(() => traceSearch("linear", [1, "2"], 1), TypeError);
    assert.throws(() => traceSearch("binary", [1, NaN], 1), TypeError);
    assert.throws(() => traceSearch("binary", [1, 2], NaN), TypeError);
});

test("parseArrayInput and parseTargetInput validate inputs cleanly", () => {
    assert.deepEqual(parseArrayInput("42"), { ok: true, values: [42] });
    assert.deepEqual(parseArrayInput(" -5, 0 12 "), { ok: true, values: [-5, 0, 12] });
    assert.equal(parseArrayInput("").ok, false);
    assert.equal(parseArrayInput("1, abc").ok, false);
    assert.equal(parseArrayInput("1000").ok, false);

    assert.deepEqual(parseTargetInput("0"), { ok: true, value: 0 });
    assert.deepEqual(parseTargetInput("-99"), { ok: true, value: -99 });
    assert.equal(parseTargetInput("").ok, false);
    assert.equal(parseTargetInput("1.5").ok, false);
    assert.equal(parseTargetInput("1000").ok, false);
});

test("randomSearchCase generates valid integers in [1, 99]", () => {
    const c = randomSearchCase(12, seeded(42));
    assert.equal(c.values.length, 12);
    assert.ok(c.values.every(v => Number.isInteger(v) && v >= 1 && v <= 99));
    assert.ok(Number.isInteger(c.target) && c.target >= 1 && c.target <= 99);
});

test("every searching registry entry has pseudocode, complexity, and summary", () => {
    for (const [key, a] of Object.entries(SEARCHING_ALGORITHMS)) {
        assert.ok(a.name && a.summary && a.pseudocode.length > 0, key);
        for (const f of ["best", "average", "worst", "space"]) {
            assert.ok(a.complexity[f], `${key}.${f}`);
        }
        assert.equal(typeof a.complexity.requiresSorted, "boolean");
    }
});
