import { test } from "node:test";
import assert from "node:assert/strict";
import { PriorityQueue, QUEUE_INFO } from "../src/structures/queue.js";

function mulberry32(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Reference model: the pre-C13 PriorityQueue (sorted array, insert after every
 * item with priority >= p, dequeue = shift), copied here unchanged in behaviour.
 */
class SortedArrayPQ {
    constructor(capacity, { allowDuplicates = true } = {}) {
        this.capacity = capacity;
        this.allowDuplicates = allowDuplicates;
        this.items = [];
        this.nextId = 1;
    }
    get size() { return this.items.length; }
    isEmpty() { return this.items.length === 0; }
    isFull() { return this.items.length === this.capacity; }
    toArray() { return this.items.map(it => ({ ...it })); }
    enqueue(value, priority = 0) {
        if (this.isFull()) {
            return { ok: false, error: `Queue overflow: ${this.capacity === 1 ? "the only slot is" : `all ${this.capacity} slots are`} used, so ${value} cannot be enqueued.` };
        }
        if (!this.allowDuplicates && this.items.some(it => it.value === value)) {
            return { ok: false, error: `${value} is already in the queue. This queue does not allow duplicate values.` };
        }
        let pos = this.items.length;
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i].priority < priority) { pos = i; break; }
        }
        const item = { id: this.nextId++, value, priority };
        this.items.splice(pos, 0, item);
        return { ok: true, value: { ...item } };
    }
    dequeue() {
        if (this.isEmpty()) return { ok: false, error: "Queue underflow: the queue is empty, so there is nothing to dequeue." };
        return { ok: true, value: { ...this.items.shift() } };
    }
    peek() { return this.isEmpty() ? null : { ...this.items[0] }; }
    peekRear() { return this.isEmpty() ? null : { ...this.items.at(-1) }; }
    clear() { this.items = []; }
}

const parent = (i) => Math.floor((i - 1) / 2);

function assertSameState(pq, model, ctx) {
    assert.equal(pq.size, model.size, `${ctx}: size`);
    assert.equal(pq.isEmpty(), model.isEmpty(), `${ctx}: isEmpty`);
    assert.equal(pq.isFull(), model.isFull(), `${ctx}: isFull`);
    assert.deepEqual(pq.peek(), model.peek(), `${ctx}: peek`);
    assert.deepEqual(pq.peekRear(), model.peekRear(), `${ctx}: peekRear`);
    assert.deepEqual(pq.toArray(), model.toArray(), `${ctx}: service order`);
    assert.equal(pq.isValid(), true, `${ctx}: heap property`);
    const snap = pq.snapshot();
    assert.deepEqual(snap.items, model.toArray(), `${ctx}: snapshot.items is service order`);
    assert.equal(snap.heap.length, model.size, `${ctx}: snapshot.heap length`);
    assert.equal(PriorityQueue.isValidHeap(snap.heap), true, `${ctx}: snapshot.heap is a heap`);
}

/** Every step snapshot is plain data; swap/compare steps name a parent/child pair; the last step's heap is valid. */
function assertSteps(steps, ctx) {
    assert.ok(steps.length > 0, `${ctx}: has steps`);
    for (const s of steps) {
        assert.equal(typeof s.message, "string");
        assert.ok(Array.isArray(s.indices));
        if (s.type === "swap" || s.type === "compare") {
            const [a, b] = s.indices;
            assert.ok(parent(a) === b || parent(b) === a, `${ctx}: ${s.type} indices ${a},${b} are parent/child`);
        }
    }
    assert.equal(PriorityQueue.isValidHeap(steps.at(-1).snapshot.heap), true, `${ctx}: final step heap valid`);
}

test("C13: heap-backed priority queue matches the old sorted-array queue over 300 seeded runs", () => {
    const rand = mulberry32(0xC13);
    let dequeues = 0, ties = 0;
    for (let run = 0; run < 300; run++) {
        const cap = 1 + Math.floor(rand() * PriorityQueue.MAX_CAPACITY);
        const allowDuplicates = rand() < 0.5;
        // Few distinct priorities (often just 1-3) so ties are common; includes 0 and negatives.
        const levels = 1 + Math.floor(rand() * 4);
        const pq = new PriorityQueue(cap, { allowDuplicates });
        const model = new SortedArrayPQ(cap, { allowDuplicates });
        const ops = 20 + Math.floor(rand() * 120);
        for (let op = 0; op < ops; op++) {
            const ctx = `run ${run} op ${op}`;
            const roll = rand();
            if (roll < 0.58) {
                const v = Math.floor(rand() * 21) - 10;
                const p = Math.floor(rand() * levels) - 1;
                const got = pq.enqueue(v, p);
                const want = model.enqueue(v, p);
                assert.equal(got.ok, want.ok, `${ctx}: enqueue ok`);
                if (want.ok) {
                    assert.deepEqual(got.value, want.value, `${ctx}: enqueue value`);
                    assertSteps(got.steps, ctx);
                } else {
                    assert.equal(got.error, want.error, `${ctx}: enqueue error`);
                }
            } else if (roll < 0.97) {
                const front = model.peek();
                if (front && model.items.filter(it => it.priority === front.priority).length > 1) ties++;
                const got = pq.dequeue();
                const want = model.dequeue();
                assert.equal(got.ok, want.ok, `${ctx}: dequeue ok`);
                if (want.ok) {
                    dequeues++;
                    assert.deepEqual(got.value, want.value, `${ctx}: dequeue order`);
                    assertSteps(got.steps, ctx);
                } else {
                    assert.equal(got.error, want.error, `${ctx}: dequeue error`);
                }
            } else {
                pq.clear();
                model.clear();
            }
            assertSameState(pq, model, ctx);
        }
        // Drain: the remaining service order must also match.
        while (!model.isEmpty()) assert.deepEqual(pq.dequeue().value, model.dequeue().value, `run ${run} drain`);
        assert.equal(pq.isEmpty(), true);
    }
    assert.ok(dequeues > 3000, `enough dequeues exercised (${dequeues})`);
    assert.ok(ties > 1000, `enough tie-breaking dequeues exercised (${ties})`);
});

test("C13: all-equal priorities behave exactly like a plain FIFO queue", () => {
    const pq = new PriorityQueue(50);
    for (let v = 1; v <= 50; v++) assert.equal(pq.enqueue(v, 7).ok, true);
    const out = [];
    while (!pq.isEmpty()) out.push(pq.dequeue().value.value);
    assert.deepEqual(out, Array.from({ length: 50 }, (_, i) => i + 1));
});

test("C13: two-level mode (page) keeps high-priority FIFO ahead of normal FIFO", () => {
    const pq = new PriorityQueue(6);
    pq.enqueue(10, 0); pq.enqueue(20, 0); pq.enqueue(30, 1); pq.enqueue(40, 1); pq.enqueue(50, 0);
    assert.deepEqual(pq.toArray().map(i => i.value), [30, 40, 10, 20, 50]);
    assert.equal(pq.peekRear().value, 50);
    assert.equal(pq.isValid(), true);
});

test("C13: enqueue sift-up steps: swap messages are written before the swap", () => {
    const pq = new PriorityQueue(8);
    pq.enqueue(1, 0); pq.enqueue(2, 0); pq.enqueue(3, 0);
    const r = pq.enqueue(9, 5); // lands at index 3, parent 1, then root
    assert.deepEqual(r.steps.map(s => s.type), ["enqueue", "swap", "swap", "settled"]);
    assert.deepEqual(r.steps[0].indices, [3]);
    assert.deepEqual(r.steps[1].indices, [3, 1]);
    assert.match(r.steps[1].message, /Compare 9 \(priority 5, #4\) at index 3 with its parent 2 \(priority 0, #2\) at index 1/);
    assert.deepEqual(r.steps[2].indices, [1, 0]);
    assert.deepEqual(r.steps.at(-1).indices, [0]);
    assert.equal(r.steps.at(-1).snapshot.heap[0].value, 9);
});

test("C13: equal priority does not swap with an earlier arrival (tie-breaker in steps)", () => {
    const pq = new PriorityQueue(4);
    pq.enqueue(1, 2);
    const r = pq.enqueue(2, 2);
    assert.deepEqual(r.steps.map(s => s.type), ["enqueue", "compare", "settled"]);
    assert.match(r.steps[1].message, /same priority 2, and #1 arrived before #2/);
    assert.equal(pq.peek().value, 1);
});

test("C13: dequeue sift-down steps move the last item to the root and sink it", () => {
    const pq = new PriorityQueue(8);
    [[5, 3], [4, 2], [3, 2], [2, 1], [1, 0]].forEach(([v, p]) => pq.enqueue(v, p));
    const r = pq.dequeue();
    assert.equal(r.value.value, 5);
    assert.equal(r.steps[0].type, "dequeue");
    assert.deepEqual(r.steps[0].indices, [0]);
    assert.equal(r.steps[0].snapshot.heap[0].value, 5, "dequeue step shows the root before removal");
    assert.equal(r.steps[1].type, "move-last");
    assert.ok(r.steps.some(s => s.type === "swap"), "sifts down");
    assert.equal(r.steps.at(-1).type, "settled");
    assert.equal(pq.peek().value, 4);
    assert.equal(pq.isValid(), true);
});

test("C13: edge cases (empty, single slot, full, zero, negatives, duplicates, clear)", () => {
    const pq = new PriorityQueue(1, { allowDuplicates: false });
    assert.equal(pq.peek(), null);
    assert.equal(pq.peekRear(), null);
    const under = pq.dequeue();
    assert.equal(under.ok, false);
    assert.equal(under.steps[0].type, "underflow");
    assert.equal(pq.enqueue(0, 0).ok, true, "0 is a real value and priority");
    const over = pq.enqueue(5, 9);
    assert.equal(over.ok, false);
    assert.match(over.error, /the only slot is used/);
    assert.equal(pq.dequeue().steps.at(-1).type, "settled");
    assert.equal(pq.enqueue(0, -3).ok, true, "value is free again after it left");
    pq.clear();
    assert.equal(pq.enqueue(0, -3).ok, true, "clear forgets duplicates");
    assert.equal(pq.peek().id, 3, "clear keeps counting ids");

    const neg = new PriorityQueue(4);
    neg.enqueue(1, -5); neg.enqueue(2, 0); neg.enqueue(3, -1);
    assert.deepEqual(neg.toArray().map(i => i.value), [2, 3, 1]);

    const strict = new PriorityQueue(3, { allowDuplicates: false });
    strict.enqueue(7, 0); strict.enqueue(7, 1);
    assert.equal(strict.size, 1);
    assert.equal(strict.enqueue(7, 1).steps[0].type, "duplicate");

    assert.throws(() => new PriorityQueue(0), RangeError);
    assert.throws(() => new PriorityQueue(51), RangeError);
    assert.throws(() => pq.enqueue(NaN), TypeError);
    assert.throws(() => pq.enqueue(1, Infinity), TypeError);
});

test("C13: complexity metadata says heap", () => {
    assert.equal(QUEUE_INFO.priority.enqueue, "O(log n)");
    assert.equal(QUEUE_INFO.priority.dequeue, "O(log n)");
});
