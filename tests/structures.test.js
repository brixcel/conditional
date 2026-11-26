import { test } from "node:test";
import assert from "node:assert/strict";
import { Stack } from "../src/structures/stack.js";
import { LinearQueue, CircularQueue, PriorityQueue } from "../src/structures/queue.js";
import { parseInteger } from "../src/core/validate.js";

function seeded(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ---------------- Stack ---------------- */

test("stack: matches a reference array over random operations", () => {
    const rand = seeded(1);
    for (let round = 0; round < 100; round++) {
        const cap = 1 + Math.floor(rand() * Stack.MAX_CAPACITY);
        const s = new Stack(cap);
        const model = [];
        for (let op = 0; op < 60; op++) {
            if (rand() < 0.55) {
                const v = Math.floor(rand() * 200) - 100;
                const r = s.push(v);
                if (model.length < cap) { assert.equal(r.ok, true); model.push(v); }
                else assert.match(r.error, /overflow/);
            } else {
                const r = s.pop();
                if (model.length) { assert.equal(r.ok, true); assert.equal(r.value, model.pop()); }
                else assert.match(r.error, /underflow/);
            }
            assert.deepEqual(s.toArray(), model);
            assert.equal(s.size, model.length);
            assert.equal(s.top, model.length - 1);
            assert.equal(s.peek(), model.length ? model.at(-1) : null);
            assert.equal(s.isEmpty(), model.length === 0);
            assert.equal(s.isFull(), model.length === cap);
        }
    }
});

test("stack: stores 0 and negatives; peek on empty is null, not a sentinel", () => {
    const s = new Stack(3);
    assert.equal(s.peek(), null);
    s.push(0); s.push(-1);
    assert.equal(s.peek(), -1);
    assert.equal(s.pop().value, -1);
    assert.equal(s.pop().value, 0);
});

test("stack: every result carries a step with a snapshot", () => {
    const s = new Stack(1);
    const r = s.push(5);
    assert.equal(r.steps.length, 1);
    assert.deepEqual(r.steps[0].snapshot, { items: [5], top: 0, capacity: 1 });
    assert.equal(s.push(6).steps[0].type, "overflow");
});

test("stack: constructor and push validate input", () => {
    for (const bad of [0, -1, 13, 2.5, NaN, "4"]) assert.throws(() => new Stack(bad), RangeError);
    assert.throws(() => new Stack(2).push("x"), TypeError);
    assert.throws(() => new Stack(2).push(Infinity), TypeError);
});

test("stack: starts empty and clear() empties it (ported from legacy suite 1)", () => {
    const s = new Stack(5);
    assert.equal(s.isEmpty(), true);
    assert.equal(s.isFull(), false);
    assert.equal(s.size, 0);
    assert.equal(s.peek(), null);
    s.push(10); s.push(20);
    s.clear();
    assert.equal(s.isEmpty(), true);
    assert.equal(s.size, 0);
    assert.equal(s.top, -1);
    assert.equal(s.peek(), null);
    assert.equal(s.push(30).ok, true, "space is usable again after clear");
});

/* ---------------- Linear queue ---------------- */

test("linear queue: FIFO order and pointer bookkeeping over random operations", () => {
    const rand = seeded(2);
    for (let round = 0; round < 100; round++) {
        const cap = 1 + Math.floor(rand() * 12);
        const q = new LinearQueue(cap);
        const model = [];
        let front = 0, rear = -1;
        for (let op = 0; op < 60; op++) {
            if (rand() < 0.6) {
                const v = Math.floor(rand() * 100);
                const r = q.enqueue(v);
                if (rear < cap - 1) { assert.equal(r.ok, true); model.push(v); rear++; }
                else { assert.equal(r.ok, false); assert.match(r.error, front > 0 ? /false overflow/ : /overflow/); }
            } else {
                const r = q.dequeue();
                if (model.length) {
                    assert.equal(r.value, model.shift());
                    if (model.length === 0) { front = 0; rear = -1; } else front++;
                } else assert.match(r.error, /underflow/);
            }
            assert.deepEqual(q.toArray(), model);
            assert.equal(q.front, front);
            assert.equal(q.rear, rear);
            assert.equal(q.size, model.length);
            assert.equal(q.peek(), model[0] ?? null);
            assert.equal(q.peekRear(), model.at(-1) ?? null);
            // Slots outside [front, rear] are always empty.
            q.slots.forEach((v, i) => { if (i < q.front || i > q.rear) assert.equal(v, null); });
        }
    }
});

test("linear queue: false overflow is explained when front slots are free", () => {
    const q = new LinearQueue(3);
    q.enqueue(1); q.enqueue(2); q.enqueue(3);
    q.dequeue();
    assert.equal(q.isFull(), false, "only 2 of 3 slots hold values");
    assert.equal(q.wastedSlots, 1);
    const r = q.enqueue(4);
    assert.equal(r.ok, false);
    assert.equal(r.steps[0].type, "false-overflow");
    assert.match(r.error, /1 slot at the front is free/);
});

test("linear queue: emptying resets the pointers so space is usable again", () => {
    const q = new LinearQueue(2);
    q.enqueue(1); q.enqueue(2); q.dequeue(); q.dequeue();
    assert.deepEqual([q.front, q.rear], [0, -1]);
    assert.equal(q.enqueue(3).ok, true);
});

test("linear queue: isFull at capacity; plain overflow and underflow at the boundaries (ported from legacy suite 2)", () => {
    const q = new LinearQueue(2);
    assert.equal(q.enqueue(1).ok, true);
    assert.equal(q.enqueue(2).ok, true);
    assert.equal(q.isFull(), true);
    const over = q.enqueue(3);
    assert.equal(over.ok, false);
    assert.equal(over.steps[0].type, "overflow", "front is 0, so this is a real overflow, not a false one");
    assert.equal(q.size, 2);
    assert.equal(q.dequeue().value, 1);
    assert.equal(q.dequeue().value, 2);
    const under = q.dequeue();
    assert.equal(under.ok, false);
    assert.match(under.error, /underflow/);
});

/* ---------------- Circular queue ---------------- */

test("circular queue: FIFO, wrap-around and size over random operations", () => {
    const rand = seeded(3);
    for (let round = 0; round < 100; round++) {
        const cap = 2 + Math.floor(rand() * 10);
        const q = new CircularQueue(cap);
        const model = [];
        for (let op = 0; op < 80; op++) {
            if (rand() < 0.55) {
                const v = Math.floor(rand() * 100) - 50;
                const r = q.enqueue(v);
                if (model.length < cap) { assert.equal(r.ok, true); model.push(v); }
                else assert.match(r.error, /overflow/);
            } else {
                const r = q.dequeue();
                if (model.length) assert.equal(r.value, model.shift());
                else assert.match(r.error, /underflow/);
            }
            assert.deepEqual(q.toArray(), model);
            assert.equal(q.size, model.length);
            assert.equal(q.isFull(), model.length === cap);
            assert.equal(q.isEmpty(), model.length === 0);
            assert.equal(q.peek(), model[0] ?? null);
            assert.equal(q.peekRear(), model.at(-1) ?? null);
            if (q.isEmpty()) assert.deepEqual([q.front, q.rear], [-1, -1]);
            assert.equal(q.slots.filter(v => v !== null).length, model.length);
        }
    }
});

test("circular queue: reuses freed slots where a linear queue cannot", () => {
    const c = new CircularQueue(3);
    const l = new LinearQueue(3);
    for (const q of [c, l]) { q.enqueue(1); q.enqueue(2); q.enqueue(3); q.dequeue(); }
    assert.equal(l.enqueue(4).ok, false);
    const r = c.enqueue(4);
    assert.equal(r.ok, true);
    assert.equal(c.rear, 0);
    assert.match(r.steps[0].message, /wrapped around/);
    assert.deepEqual(c.toArray(), [2, 3, 4]);
    assert.equal(c.isFull(), true);
});

test("circular queue: capacity limits", () => {
    for (const bad of [1, 0, 101, 3.5]) assert.throws(() => new CircularQueue(bad), RangeError);
});

test("circular queue: exact front/rear indices over two wrap-around cycles (ported from legacy suite 3)", () => {
    const q = new CircularQueue(4);
    for (const v of [1, 2, 3, 4]) q.enqueue(v);
    assert.equal(q.isFull(), true);
    assert.deepEqual([q.front, q.rear], [0, 3]);
    assert.equal(q.dequeue().value, 1);
    assert.equal(q.dequeue().value, 2);
    assert.equal(q.dequeue().value, 3);
    assert.deepEqual([q.front, q.rear, q.size], [3, 3, 1]);
    for (const [v, rear] of [[5, 0], [6, 1], [7, 2]]) {
        assert.equal(q.enqueue(v).ok, true);
        assert.equal(q.rear, rear, `enqueue ${v} wraps rear to ${rear}`);
    }
    assert.equal(q.isFull(), true);
    assert.deepEqual([q.front, q.rear], [3, 2]);
    for (const [v, slot] of [[4, 3], [5, 0], [6, 1], [7, 2]]) {
        const r = q.dequeue();
        assert.equal(r.value, v);
        assert.deepEqual(r.steps[0].indices, [slot], `${v} leaves from slot ${slot}`);
    }
    assert.equal(q.isEmpty(), true);
    assert.deepEqual([q.front, q.rear], [-1, -1]);
});

/* ---------------- Priority queue ---------------- */

test("priority queue: dequeues highest priority first, FIFO among ties", () => {
    const rand = seeded(4);
    for (let round = 0; round < 100; round++) {
        const cap = 1 + Math.floor(rand() * 15);
        const pq = new PriorityQueue(cap);
        const model = []; // { value, priority, seq }
        let seq = 0;
        for (let op = 0; op < 60; op++) {
            if (rand() < 0.6) {
                const v = Math.floor(rand() * 50);
                const p = Math.floor(rand() * 3);
                const r = pq.enqueue(v, p);
                if (model.length < cap) { assert.equal(r.ok, true); model.push({ value: v, priority: p, seq: seq++ }); }
                else assert.match(r.error, /overflow/);
            } else {
                const r = pq.dequeue();
                if (model.length) {
                    model.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
                    const expected = model.shift();
                    assert.equal(r.value.value, expected.value);
                    assert.equal(r.value.priority, expected.priority);
                } else assert.match(r.error, /underflow/);
            }
            const ordered = [...model].sort((a, b) => b.priority - a.priority || a.seq - b.seq);
            assert.deepEqual(pq.toArray().map(i => [i.value, i.priority]), ordered.map(i => [i.value, i.priority]));
        }
    }
});

test("priority queue: two-level mode matches the existing page (high priority jumps the line)", () => {
    const pq = new PriorityQueue(5);
    pq.enqueue(10, 0); pq.enqueue(20, 0); pq.enqueue(30, 1); pq.enqueue(40, 1);
    assert.deepEqual(pq.toArray().map(i => i.value), [30, 40, 10, 20]);
});

test("priority queue: duplicate rejection is opt-in", () => {
    const strict = new PriorityQueue(3, { allowDuplicates: false });
    strict.enqueue(7);
    assert.match(strict.enqueue(7).error, /already in the queue/);
    const loose = new PriorityQueue(3);
    loose.enqueue(7);
    assert.equal(loose.enqueue(7).ok, true);
});

test("priority queue: returned items are copies (callers cannot corrupt the queue)", () => {
    const pq = new PriorityQueue(2);
    pq.enqueue(1, 1);
    pq.peek().priority = -99;
    assert.equal(pq.peek().priority, 1);
});

/* ---------------- parseInteger ---------------- */

test("parseInteger accepts valid whole numbers including 0 and negatives", () => {
    assert.deepEqual(parseInteger(" 42 "), { ok: true, value: 42 });
    assert.deepEqual(parseInteger("0"), { ok: true, value: 0 });
    assert.deepEqual(parseInteger("-7"), { ok: true, value: -7 });
});

test("parseInteger rejects bad input with readable messages", () => {
    const cases = [
        ["", {}, /is required/],
        ["  ", {}, /is required/],
        ["abc", {}, /whole number/],
        ["1.5", {}, /whole number/],
        ["1e3", {}, /whole number/],
        ["007", {}, /should not start with 0/],
        ["0", { min: 1 }, /at least 1/],
        ["101", { min: 1, max: 100 }, /between 1 and 100/],
        ["-5", { max: -10 }, /at most -10/],
        [null, { label: "Capacity" }, /Capacity is required/],
    ];
    for (const [text, opts, pattern] of cases) {
        const r = parseInteger(text, opts);
        assert.equal(r.ok, false, String(text));
        assert.match(r.error, pattern);
    }
});
