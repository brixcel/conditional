import { test } from "node:test";
import assert from "node:assert/strict";
import {
    BinaryHeap, MinHeap, MaxHeap, isValidHeap, parentIndex, leftIndex, rightIndex, HEAP_INFO
} from "../src/structures/heap.js";

function seeded(seed) {
    // mulberry32, same as the other suites, so failures are reproducible.
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const asc = (a, b) => a - b;
const desc = (a, b) => b - a;
const floorLog2 = (n) => (n <= 1 ? 0 : Math.floor(Math.log2(n)));

/** Checks every step's snapshot: valid shape, and a heap at the end of each operation. */
function assertStepsWellFormed(steps, kind) {
    assert.ok(steps.length >= 1);
    for (const s of steps) {
        assert.equal(typeof s.type, "string");
        assert.ok(Array.isArray(s.indices));
        assert.equal(typeof s.message, "string");
        assert.ok(s.message.length > 0);
        assert.equal(s.snapshot.kind, kind);
        assert.equal(s.snapshot.size, s.snapshot.items.length);
        assert.ok(Number.isInteger(s.comparisons) && s.comparisons >= 0);
        assert.ok(Number.isInteger(s.swaps) && s.swaps >= 0);
        for (const i of s.indices) assert.ok(i >= 0 && i < Math.max(1, s.snapshot.size + 1));
    }
    for (let k = 1; k < steps.length; k++) {
        assert.ok(steps[k].comparisons >= steps[k - 1].comparisons, "comparison counter never goes down");
        assert.ok(steps[k].swaps >= steps[k - 1].swaps, "swap counter never goes down");
    }
}

/* ---------------- Index helpers ---------------- */

test("heap: parent/left/right index formulas agree with each other", () => {
    for (let i = 0; i < 100; i++) {
        assert.equal(parentIndex(leftIndex(i)), i);
        assert.equal(parentIndex(rightIndex(i)), i);
        assert.equal(rightIndex(i), leftIndex(i) + 1);
    }
});

test("heap: isValidHeap accepts and rejects the right arrays", () => {
    assert.equal(isValidHeap([], "min"), true);
    assert.equal(isValidHeap([1, 3, 2, 7, 4], "min"), true);
    assert.equal(isValidHeap([1, 3, 2, 0], "min"), false);
    assert.equal(isValidHeap([9, 4, 8, 1, 3], "max"), true);
    assert.equal(isValidHeap([9, 4, 8, 5, 10], "max"), false);
    assert.equal(isValidHeap([2, 2, 2], "min"), true);
    assert.equal(isValidHeap([2, 2, 2], "max"), true);
});

/* ---------------- Model-based property tests ---------------- */

for (const kind of ["min", "max"]) {
    test(`${kind}-heap: matches a sorted reference model over 300 random operation sequences`, () => {
        const rand = seeded(kind === "min" ? 11 : 22);
        const cmp = kind === "min" ? asc : desc;
        for (let round = 0; round < 300; round++) {
            const cap = 1 + Math.floor(rand() * BinaryHeap.MAX_CAPACITY);
            const h = new BinaryHeap(kind, cap);
            const model = [];
            for (let op = 0; op < 80; op++) {
                if (rand() < 0.6) {
                    // Small range so duplicates, 0 and negatives are common.
                    const v = Math.floor(rand() * 41) - 20;
                    const r = h.insert(v);
                    if (model.length < cap) {
                        assert.equal(r.ok, true);
                        assert.equal(r.value, v);
                        model.push(v);
                        model.sort(cmp);
                        assert.ok(r.steps.at(-1).comparisons <= floorLog2(model.length), "insert compares at most floor(log2 n) times");
                    } else {
                        assert.equal(r.ok, false);
                        assert.match(r.error, /overflow/);
                        assert.equal(r.steps[0].type, "overflow");
                    }
                    assertStepsWellFormed(r.steps, kind);
                } else {
                    const r = h.extract();
                    if (model.length) {
                        const before = model.length;
                        assert.equal(r.ok, true);
                        assert.equal(r.value, model.shift());
                        assert.ok(r.steps.at(-1).comparisons <= 2 * floorLog2(before), "extract compares at most 2·floor(log2 n) times");
                    } else {
                        assert.equal(r.ok, false);
                        assert.match(r.error, /underflow/);
                        assert.equal(r.steps[0].type, "underflow");
                    }
                    assertStepsWellFormed(r.steps, kind);
                }
                assert.equal(h.isValid(), true, `heap property broken: [${h.toArray()}]`);
                assert.deepEqual([...h.toArray()].sort(cmp), model, "same multiset as the model");
                assert.equal(h.size, model.length);
                assert.equal(h.peek(), model.length ? model[0] : null);
                assert.equal(h.isEmpty(), model.length === 0);
                assert.equal(h.isFull(), model.length === cap);
            }
        }
    });

    test(`${kind}-heap: build() heapifies 300 random arrays in O(n)`, () => {
        const rand = seeded(kind === "min" ? 33 : 44);
        const cmp = kind === "min" ? asc : desc;
        for (let round = 0; round < 300; round++) {
            const n = Math.floor(rand() * (BinaryHeap.MAX_CAPACITY + 1));
            const values = Array.from({ length: n }, () => Math.floor(rand() * 199) - 99);
            const input = values.slice();
            const r = BinaryHeap.from(kind, values);
            assert.equal(r.ok, true);
            const h = r.value;
            assert.deepEqual(values, input, "build() must not mutate the caller's array");
            assert.equal(h.isValid(), true, `not a heap: [${h.toArray()}]`);
            assert.deepEqual([...h.toArray()].sort(cmp), [...input].sort(cmp));
            assertStepsWellFormed(r.steps, kind);
            const last = r.steps.at(-1);
            assert.equal(last.type, "done");
            // Bottom-up heapify: each swap moves a value down one level, and the sum of
            // node heights in a complete tree is < n, so swaps < n and comparisons ≤ 2n.
            assert.ok(last.swaps <= Math.max(0, n - 1), `swaps ${last.swaps} for n=${n}`);
            assert.ok(last.comparisons <= 2 * n, `comparisons ${last.comparisons} for n=${n}`);
        }
    });

    test(`${kind}-heap: extracting everything returns values in heap-sort order`, () => {
        const rand = seeded(kind === "min" ? 55 : 66);
        const cmp = kind === "min" ? asc : desc;
        for (let round = 0; round < 100; round++) {
            const n = 1 + Math.floor(rand() * 40);
            const values = Array.from({ length: n }, () => Math.floor(rand() * 21) - 10);
            const h = new BinaryHeap(kind, n);
            for (const v of values) assert.equal(h.insert(v).ok, true);
            const out = [];
            while (!h.isEmpty()) out.push(h.extract().value);
            assert.deepEqual(out, [...values].sort(cmp));
        }
    });
}

/* ---------------- Edge cases ---------------- */

test("heap: empty heap peeks null and extract fails with a readable error, not a sentinel", () => {
    const h = new MinHeap(3);
    assert.equal(h.peek(), null);
    const r = h.extract();
    assert.equal(r.ok, false);
    assert.equal(r.value, undefined);
    assert.match(r.error, /empty/);
    assert.match(new MaxHeap(1).extract().error, /maximum/);
});

test("heap: 0 and negatives are real values", () => {
    const h = new MaxHeap(4);
    h.insert(-5); h.insert(0); h.insert(-1);
    assert.equal(h.peek(), 0);
    assert.equal(h.extract().value, 0);
    assert.equal(h.extract().value, -1);
    assert.equal(h.extract().value, -5);
    assert.equal(h.peek(), null);
});

test("heap: capacity 1 accepts one value then overflows", () => {
    const h = new MinHeap(1);
    const first = h.insert(7);
    assert.equal(first.ok, true);
    assert.match(first.steps[0].message, /root/);
    const second = h.insert(8);
    assert.equal(second.ok, false);
    assert.match(second.error, /only slot/);
    const out = h.extract();
    assert.equal(out.value, 7);
    assert.equal(out.steps.at(-1).type, "done");
    assert.equal(h.isEmpty(), true);
});

test("heap: equal values never swap", () => {
    const h = new MinHeap(7);
    for (let i = 0; i < 7; i++) h.insert(4);
    const r = h.extract();
    assert.equal(r.value, 4);
    assert.equal(r.steps.at(-1).swaps, 0);
    assert.equal(h.isValid(), true);
});

test("heap: constructor and inputs reject bad arguments", () => {
    assert.throws(() => new BinaryHeap("middle", 5), TypeError);
    assert.throws(() => new BinaryHeap(undefined, 5), TypeError);
    for (const cap of [0, -1, 1.5, NaN, BinaryHeap.MAX_CAPACITY + 1, "5"]) {
        assert.throws(() => new MinHeap(cap), RangeError, `capacity ${cap}`);
    }
    const h = new MinHeap(3);
    for (const bad of [NaN, Infinity, "3", null, undefined]) {
        assert.throws(() => h.insert(bad), TypeError, `value ${bad}`);
    }
    assert.equal(h.size, 0, "rejected inserts leave the heap unchanged");
    assert.throws(() => h.build("1,2,3"), TypeError);
    assert.throws(() => h.build([1, "2"]), TypeError);
});

test("heap: build() larger than capacity fails and keeps the old contents", () => {
    const h = new MaxHeap(3);
    h.insert(1);
    const r = h.build([1, 2, 3, 4]);
    assert.equal(r.ok, false);
    assert.match(r.error, /capacity is 3/);
    assert.deepEqual(h.toArray(), [1]);
});

test("heap: build() of 0 or 1 values is trivially valid", () => {
    for (const values of [[], [42]]) {
        const r = BinaryHeap.from("min", values);
        assert.equal(r.ok, true);
        assert.deepEqual(r.value.toArray(), values);
        assert.equal(r.steps.at(-1).swaps, 0);
    }
});

/* ---------------- Step content ---------------- */

test("heap: sift-up swap messages describe the state before the swap", () => {
    const h = new MinHeap(7);
    h.insert(5); h.insert(8);
    const r = h.insert(1); // goes to index 2, parent is 5 at index 0
    const types = r.steps.map((s) => s.type);
    assert.deepEqual(types, ["insert", "swap", "done"]);
    assert.deepEqual(r.steps[0].snapshot.items, [5, 8, 1]);
    const swap = r.steps[1];
    assert.deepEqual(swap.indices, [2, 0]);
    assert.match(swap.message, /Compare 1 \(index 2\) with its parent 5 \(index 0\)/);
    assert.deepEqual(swap.snapshot.items, [1, 8, 5]);
    assert.equal(swap.comparisons, 1);
    assert.equal(swap.swaps, 1);
});

test("heap: extract moves the last element up and sifts it down toward the better child", () => {
    const r = BinaryHeap.from("max", [50, 30, 40, 10, 20, 35]);
    const h = r.value;
    assert.deepEqual(h.toArray(), [50, 30, 40, 10, 20, 35]);
    const out = h.extract();
    assert.equal(out.value, 50);
    assert.deepEqual(out.steps.map((s) => s.type), ["extract", "move-last", "swap", "settled"]);
    assert.deepEqual(out.steps[1].snapshot.items, [35, 30, 40, 10, 20]);
    assert.match(out.steps[2].message, /children are 30 \(index 1\) and 40 \(index 2\); the larger is 40/);
    assert.deepEqual(out.steps[2].snapshot.items, [40, 30, 35, 10, 20]);
    assert.deepEqual(h.toArray(), [40, 30, 35, 10, 20]);
});

test("heap: step snapshots are copies, not live references", () => {
    const h = new MinHeap(5);
    const r = h.insert(3);
    h.insert(1);
    assert.deepEqual(r.steps[0].snapshot.items, [3]);
    r.steps[0].snapshot.items.push(99);
    assert.deepEqual(h.toArray(), [1, 3]);
});

test("heap: HEAP_INFO registry has the expected shape", () => {
    assert.equal(HEAP_INFO.name, "Binary Heap");
    assert.equal(typeof HEAP_INFO.summary, "string");
    assert.deepEqual(Object.keys(HEAP_INFO.complexity).sort(), ["build", "extract", "insert", "peek", "space"]);
    for (const lines of Object.values(HEAP_INFO.pseudocode)) {
        assert.ok(Array.isArray(lines) && lines.length > 0);
    }
});
