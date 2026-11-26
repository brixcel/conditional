// C20: step recording for the stack and queue modules that drive the step players on
// stack.html, regular-queue.html, circular-queue.html and priority-queue.html.
// Every step: { type, operation, line, indices, message, snapshot }, where `line` is
// 1-based in the module's pseudocode registry and `snapshot` is the state after that line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Stack, STACK_INFO, checkPopConfirm } from "../src/structures/stack.js";
import { LinearQueue, CircularQueue, PriorityQueue, QUEUE_INFO } from "../src/structures/queue.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function mulberry32(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const types = (steps) => steps.map(s => s.type);
const lines = (steps) => steps.map(s => s.line);

/** Shape + pseudocode-line validity for every step of one result. */
function assertStepShape(steps, pseudocode, ctx) {
    assert.ok(steps.length > 0, `${ctx}: at least one step`);
    for (const s of steps) {
        assert.equal(typeof s.type, "string", ctx);
        assert.equal(typeof s.message, "string", ctx);
        assert.ok(s.message.length > 0, `${ctx}: message not empty`);
        assert.ok(Array.isArray(s.indices), ctx);
        const code = pseudocode[s.operation];
        assert.ok(code, `${ctx}: operation "${s.operation}" has pseudocode`);
        assert.ok(Number.isInteger(s.line) && s.line >= 1 && s.line <= code.length, `${ctx}: line ${s.line} in 1..${code.length}`);
        assert.equal(typeof s.snapshot, "object", ctx);
    }
}

/* ---------------- Stack ---------------- */

test("stack push: check (state before) then write (state after), with top index", () => {
    const s = new Stack(3);
    s.push(10);
    const before = s.snapshot();
    const r = s.push(20);
    assert.equal(r.ok, true);
    assert.deepEqual(types(r.steps), ["check", "push"]);
    assert.deepEqual(lines(r.steps), [1, 2]);
    assert.deepEqual(r.steps[0].snapshot, before, "check frame shows the stack before the push");
    assert.deepEqual(r.steps[1].snapshot, { items: [10, 20], top: 1, capacity: 3 });
    assert.deepEqual(r.steps[1].indices, [1]);
    assert.match(r.steps[0].message, /top = 0, capacity − 1 = 2/);
    assert.match(r.steps[1].message, /top ← 0 \+ 1 = 1, then A\[1\] ← 20/);
});

test("stack overflow / underflow: one step on line 1, nothing changes", () => {
    const s = new Stack(1);
    const under = s.pop();
    assert.equal(under.ok, false);
    assert.deepEqual(types(under.steps), ["underflow"]);
    assert.equal(under.steps[0].line, 1);
    assert.deepEqual(under.steps[0].snapshot, { items: [], top: -1, capacity: 1 });
    s.push(7);
    const over = s.push(8);
    assert.equal(over.ok, false);
    assert.deepEqual(types(over.steps), ["overflow"]);
    assert.equal(over.steps[0].operation, "push");
    assert.match(over.steps[0].message, /full/);
    assert.deepEqual(s.toArray(), [7]);
});

test("stack pop: check, read (both before), pop (after); messages name the value", () => {
    const s = new Stack(4);
    [5, 0, -3].forEach(v => s.push(v));
    const before = s.snapshot();
    const r = s.pop();
    assert.equal(r.value, -3);
    assert.deepEqual(types(r.steps), ["check", "read", "pop"]);
    assert.deepEqual(lines(r.steps), [1, 2, 3]);
    assert.deepEqual(r.steps[0].snapshot, before);
    assert.deepEqual(r.steps[1].snapshot, before, "the value is read before top moves");
    assert.deepEqual(r.steps[1].indices, [2]);
    assert.match(r.steps[1].message, /A\[2\] = -3/);
    assert.deepEqual(r.steps[2].snapshot, { items: [5, 0], top: 1, capacity: 4 });
    assert.match(r.steps[2].message, /top ← 2 − 1 = 1; return -3\. 0 is the new top/);
    s.pop(); const last = s.pop();
    assert.match(last.steps.at(-1).message, /now empty/);
});

test("stack queries record steps and never mutate", () => {
    const s = new Stack(2);
    assert.deepEqual(types(s.query("peek").steps), ["empty"]);
    assert.equal(s.query("peek").value, null);
    s.push(4);
    const peek = s.query("peek");
    assert.equal(peek.value, 4);
    assert.deepEqual(types(peek.steps), ["check", "peek"]);
    assert.deepEqual(peek.steps[1].indices, [0]);
    assert.equal(s.query("isEmpty").value, false);
    assert.equal(s.query("isFull").value, false);
    assert.equal(s.query("size").value, 1);
    assert.deepEqual(s.toArray(), [4]);
    assert.throws(() => s.query("nope"), RangeError);
});

test("stack: snapshots are copies (later operations do not rewrite earlier frames)", () => {
    const s = new Stack(3);
    const r = s.push(1);
    s.push(2); s.pop(); s.pop();
    assert.deepEqual(r.steps[1].snapshot.items, [1]);
});

/* ---------------- Pop confirm (stack page) ---------------- */

test("checkPopConfirm: only a whole number equal to the top confirms", () => {
    assert.deepEqual(checkPopConfirm("12", 12), { ok: true });
    assert.deepEqual(checkPopConfirm(" 12 ", 12), { ok: true });
    assert.deepEqual(checkPopConfirm("", 12), { ok: false, reason: "empty" });
    assert.deepEqual(checkPopConfirm("   ", 12), { ok: false, reason: "empty" });
    // type="number" fields report letters as "" with validity.badInput = true.
    assert.deepEqual(checkPopConfirm("", 12, { badInput: true }), { ok: false, reason: "invalid" });
    assert.deepEqual(checkPopConfirm("abc", 12), { ok: false, reason: "invalid" });
    assert.deepEqual(checkPopConfirm("1.5", 12), { ok: false, reason: "invalid" });
    assert.deepEqual(checkPopConfirm("012", 12), { ok: false, reason: "invalid" });
    assert.deepEqual(checkPopConfirm("13", 12), { ok: false, reason: "mismatch" });
    assert.deepEqual(checkPopConfirm("0", 0), { ok: true }, "0 is a real value");
});

test("stack page wires the confirm check with the field's badInput flag", () => {
    const src = readFileSync(join(ROOT, "src", "pages", "stack-page.js"), "utf8");
    assert.match(src, /checkPopConfirm\(\s*typed,\s*top,\s*\{\s*badInput:[^}]*validity\?*\.badInput/);
    assert.match(src, /Empty \(null\)/);
    assert.doesNotMatch(src, /Empty \(None\)|Top is null/);
    assert.doesNotMatch(readFileSync(join(ROOT, "stack.html"), "utf8"), /Empty \(None\)/);
});

/* ---------------- Linear queue ---------------- */

test("linear enqueue: check, move rear (slot still empty), store", () => {
    const q = new LinearQueue(3);
    const r = q.enqueue(8);
    assert.deepEqual(types(r.steps), ["check", "move-rear", "enqueue"]);
    assert.deepEqual(lines(r.steps), [1, 2, 3]);
    assert.deepEqual(r.steps[0].snapshot, { slots: [null, null, null], front: 0, rear: -1, count: 0, capacity: 3 });
    assert.deepEqual(r.steps[1].snapshot, { slots: [null, null, null], front: 0, rear: 0, count: 0, capacity: 3 });
    assert.deepEqual(r.steps[2].snapshot, { slots: [8, null, null], front: 0, rear: 0, count: 1, capacity: 3 });
    assert.deepEqual(r.steps[2].indices, [0]);
    assert.match(r.steps[1].message, /rear ← -1 \+ 1 = 0/);
});

test("linear dequeue: front moves forward and leaves a freed slot; emptying resets", () => {
    const q = new LinearQueue(3);
    q.enqueue(1); q.enqueue(2);
    const r = q.dequeue();
    assert.deepEqual(types(r.steps), ["check", "dequeue", "move-front", "done"]);
    assert.deepEqual(lines(r.steps), [1, 2, 4, 5]);
    assert.deepEqual(r.steps[1].snapshot.slots, [null, 2, null]);
    assert.equal(r.steps[1].snapshot.front, 0, "slot cleared before front moves");
    assert.equal(r.steps[2].snapshot.front, 1);
    assert.deepEqual(r.steps[2].indices, [1]);
    const last = q.dequeue();
    assert.deepEqual(types(last.steps), ["check", "dequeue", "reset", "done"]);
    assert.deepEqual(lines(last.steps), [1, 2, 3, 5]);
    assert.deepEqual([last.steps[2].snapshot.front, last.steps[2].snapshot.rear], [0, -1]);
});

test("linear false overflow keeps its single step on line 1", () => {
    const q = new LinearQueue(2);
    q.enqueue(1); q.enqueue(2); q.dequeue();
    const r = q.enqueue(3);
    assert.deepEqual(types(r.steps), ["false-overflow"]);
    assert.equal(r.steps[0].line, 1);
    assert.deepEqual(r.steps[0].indices, [1], "highlights rear at the last index");
});

test("linear queries: peek / rear read the right index", () => {
    const q = new LinearQueue(3);
    assert.deepEqual(types(q.query("rear").steps), ["empty"]);
    q.enqueue(4); q.enqueue(9);
    assert.deepEqual(q.query("peek").steps[1].indices, [0]);
    assert.deepEqual(q.query("rear").steps[1].indices, [1]);
    assert.equal(q.query("rear").value, 9);
    assert.equal(q.query("isFull").value, false);
    assert.equal(q.query("size").value, 2);
});

/* ---------------- Circular queue ---------------- */

test("circular enqueue: first item sets both pointers (line 2); wrap uses mod (line 3)", () => {
    const q = new CircularQueue(3);
    const first = q.enqueue(1);
    assert.deepEqual(types(first.steps), ["check", "move-rear", "enqueue"]);
    assert.deepEqual(lines(first.steps), [1, 2, 4]);
    assert.deepEqual([first.steps[1].snapshot.front, first.steps[1].snapshot.rear], [0, 0]);
    assert.deepEqual(first.steps[1].snapshot.slots, [null, null, null], "pointer set before the write");
    q.enqueue(2); q.enqueue(3); q.dequeue();
    const wrap = q.enqueue(4);
    assert.deepEqual(lines(wrap.steps), [1, 3, 4]);
    assert.match(wrap.steps[0].message, /\(2 \+ 1\) mod 3 = 0, which is not front \(1\)/);
    assert.match(wrap.steps[1].message, /rear ← \(2 \+ 1\) mod 3 = 0 \(wrapped around/);
    assert.deepEqual(wrap.steps[1].indices, [0]);
    assert.deepEqual(wrap.steps[2].snapshot.slots, [4, 2, 3]);
});

test("circular dequeue: front wraps with mod; last item resets both to −1", () => {
    const q = new CircularQueue(2);
    q.enqueue(1); q.enqueue(2); q.dequeue(); q.enqueue(3); // front 1, rear 0
    const r = q.dequeue();
    assert.deepEqual(types(r.steps), ["check", "dequeue", "move-front", "done"]);
    assert.deepEqual(r.steps[0].indices, [1]);
    assert.match(r.steps[2].message, /front ← \(1 \+ 1\) mod 2 = 0 \(wrapped around/);
    const last = q.dequeue();
    assert.deepEqual(types(last.steps), ["check", "dequeue", "reset", "done"]);
    assert.deepEqual([last.steps[2].snapshot.front, last.steps[2].snapshot.rear], [-1, -1]);
});

test("circular overflow is one step that points at front", () => {
    const q = new CircularQueue(2);
    q.enqueue(1); q.enqueue(2);
    const r = q.enqueue(3);
    assert.deepEqual(types(r.steps), ["overflow"]);
    assert.deepEqual(r.steps[0].indices, [0]);
    assert.match(r.steps[0].message, /\(1 \+ 1\) mod 2 = 0, which is front \(0\)/);
});

/* ---------------- Property runs: every step is well formed ---------------- */

test("300 seeded runs: every step has a valid pseudocode line, and the last snapshot is the live state", () => {
    const rand = mulberry32(0xC20);
    for (let run = 0; run < 300; run++) {
        const kind = run % 4;
        const cap = 2 + Math.floor(rand() * 10);
        const ds = kind === 0 ? new Stack(Math.min(cap, Stack.MAX_CAPACITY))
            : kind === 1 ? new LinearQueue(cap)
            : kind === 2 ? new CircularQueue(cap)
            : new PriorityQueue(cap);
        const code = kind === 0 ? STACK_INFO.pseudocode
            : kind === 1 ? QUEUE_INFO.linear.pseudocode
            : kind === 2 ? QUEUE_INFO.circular.pseudocode
            : QUEUE_INFO.priority.pseudocode;
        for (let op = 0; op < 40; op++) {
            const ctx = `run ${run} op ${op}`;
            const roll = rand();
            const v = Math.floor(rand() * 21) - 10;
            let res;
            if (roll < 0.5) res = kind === 0 ? ds.push(v) : kind === 3 ? ds.enqueue(v, Math.floor(rand() * 3)) : ds.enqueue(v);
            else if (roll < 0.85 || kind === 3) res = kind === 0 ? ds.pop() : ds.dequeue();
            else res = ds.query(["peek", "isEmpty", "isFull", "size", kind === 0 ? "peek" : "rear"][Math.floor(rand() * 5)]);
            assertStepShape(res.steps, code, ctx);
            assert.deepEqual(res.steps.at(-1).snapshot, ds.snapshot(), `${ctx}: final frame = live state`);
        }
    }
});
