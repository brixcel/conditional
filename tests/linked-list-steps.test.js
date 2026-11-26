// C24: recorded steps of the three linked lists, as the step player replays them.
// - every step names an operation with pseudocode and a valid 1-based line (and lines);
// - applying a step's recorded pointer writes to the previous frame gives this frame;
// - cursors and addresses name nodes that are on screen in that frame;
// - the last frame of a successful mutation equals the live list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SinglyLinkedList, LINKED_LIST_INFO } from "../src/structures/linked-list.js";
import { DoublyLinkedList, DOUBLY_LINKED_LIST_INFO } from "../src/structures/doubly-linked-list.js";
import { CircularLinkedList, CIRCULAR_LINKED_LIST_INFO } from "../src/structures/circular-linked-list.js";

function seeded(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const KINDS = [
    { name: "singly", Cls: SinglyLinkedList, info: LINKED_LIST_INFO, fields: ["next"], derivedTail: false },
    { name: "doubly", Cls: DoublyLinkedList, info: DOUBLY_LINKED_LIST_INFO, fields: ["prev", "next"], derivedTail: false },
    { name: "circular", Cls: CircularLinkedList, info: CIRCULAR_LINKED_LIST_INFO, fields: ["prev", "next"], derivedTail: true },
];

/** address -> { next, prev, value } for every node in the frame (chain + detached); null when an address repeats. */
function pointerMap(snap) {
    const map = new Map();
    for (const n of [...(snap.nodes ?? []), ...(snap.detached ?? [])]) {
        if (map.has(n.address)) return null;
        map.set(n.address, { next: n.next, prev: n.prev, value: n.value });
    }
    return map;
}

function checkSteps(kind, before, steps, label) {
    let prev = before;
    for (const [i, step] of steps.entries()) {
        const where = `${label} step ${i} (${step.type})`;
        const code = kind.info.pseudocode[step.operation];
        assert.ok(code, `${where}: no pseudocode for operation "${step.operation}"`);
        assert.ok(Number.isInteger(step.line) && step.line >= 1 && step.line <= code.length, `${where}: bad line ${step.line}`);
        for (const l of step.lines ?? []) assert.ok(Number.isInteger(l) && l >= 1 && l <= code.length, `${where}: bad lines entry ${l}`);
        if (step.lines) assert.ok(step.lines.includes(step.line), `${where}: line must be one of lines`);
        assert.equal(typeof step.message, "string");
        assert.ok(step.message.length > 0);
        assert.ok(Array.isArray(step.changes) && typeof step.cursors === "object");

        const onScreen = new Set([...(step.snapshot.nodes ?? []), ...(step.snapshot.detached ?? [])].map((n) => n.address));
        for (const [name, a] of Object.entries(step.cursors)) assert.ok(onScreen.has(a), `${where}: cursor ${name} → ${a} not on screen`);
        for (const a of step.addresses) assert.ok(onScreen.has(a), `${where}: address ${a} not on screen`);

        // Replaying the recorded writes on the previous frame must give this frame.
        const from = pointerMap(prev);
        const to = pointerMap(step.snapshot);
        if (from && to) {
            let head = prev.head;
            let tail = prev.tail;
            for (const c of step.changes) {
                if (c.field === "head") { assert.equal(c.from, head, `${where}: head change from`); head = c.to; continue; }
                if (c.field === "tail") { assert.equal(c.from, tail, `${where}: tail change from`); tail = c.to; continue; }
                const node = from.get(c.address) ?? to.get(c.address);
                assert.ok(node, `${where}: change on unknown node ${c.address}`);
                if (from.has(c.address)) assert.deepEqual(from.get(c.address)[c.field], c.from, `${where}: ${c.address}.${c.field} from`);
                if (from.has(c.address)) from.get(c.address)[c.field] = c.to;
            }
            if (step.type !== "clear") {
                assert.equal(step.snapshot.head, head, `${where}: head after replaying changes`);
                if (!kind.derivedTail) assert.equal(step.snapshot.tail, tail, `${where}: tail after replaying changes`);
            }
            for (const [a, after] of to) {
                if (!from.has(a)) continue;
                for (const f of [...kind.fields, "value"]) {
                    assert.deepEqual(from.get(a)[f], after[f], `${where}: ${a}.${f} changed without a recorded write`);
                }
            }
        }
        prev = step.snapshot;
    }
}

const sameState = (snap, live) => {
    assert.deepEqual(snap.nodes, live.nodes);
    assert.equal(snap.head, live.head);
    assert.equal(snap.tail, live.tail);
    assert.equal(snap.size, live.size);
};

for (const kind of KINDS) {
    test(`${kind.name}: 300 random runs, every step replays consistently and ends on the live list`, () => {
        const rand = seeded(2424 + kind.name.length);
        for (let round = 0; round < 300; round++) {
            const cap = 1 + Math.floor(rand() * 20);
            const list = new kind.Cls(cap, { uniqueValues: round % 2 === 0 });
            for (let op = 0; op < 40; op++) {
                const r = rand();
                const value = Math.floor(rand() * 15) - 3;
                const addresses = list.addresses();
                const pick = () => addresses[Math.floor(rand() * addresses.length)];
                const before = list.snapshot();
                let res;
                let label;
                let mutates = true;
                if (r < 0.3) { const i = Math.floor(rand() * (list.size + 2)) - (rand() < 0.1 ? 1 : 0); label = `insertAt(${i})`; res = list.insertAt(i, value); }
                else if (r < 0.5) { const i = Math.floor(rand() * (list.size + 1)); label = `deleteAt(${i})`; res = list.deleteAt(i); }
                else if (r < 0.57) { label = "reverse"; res = list.reverse(); }
                else if (r < 0.64) { label = "sort"; res = list.sort(); }
                else if (r < 0.72 && addresses.length) { label = "update"; res = list.updateValue(pick(), value); }
                else if (r < 0.8 && addresses.length) {
                    const b = rand() < 0.2 ? pick() : `x${Math.floor(rand() * 99)}`;
                    label = "replace"; res = list.replaceNode(pick(), value, b);
                }
                else if (r < 0.9) { label = "find"; mutates = false; res = list.find(addresses.length && rand() < 0.7 ? pick() : "nope"); }
                else if (r < 0.97) {
                    const q = ["size", "isEmpty", "isFull", "head", "tail"][Math.floor(rand() * 5)];
                    label = q; mutates = false; res = list.query(q);
                }
                else { label = "clear"; res = list.clear(); }
                label = `${kind.name} round ${round} op ${op} ${label}`;
                assert.ok(res.steps.length >= 1, `${label}: no steps`);
                checkSteps(kind, before, res.steps, label);
                const live = list.snapshot();
                if (res.ok || !mutates) sameState(res.steps.at(-1).snapshot, live);
                if (!res.ok && mutates) assert.deepEqual(live, before, `${label}: a failed operation changed the list`);
                assert.equal(list.integrityError(), null, label);
            }
        }
    });
}

/* ---------------- per-operation step content ---------------- */

test("singly: insert in the middle records create (detached), walk with prev cursor, then two next writes", () => {
    const list = new SinglyLinkedList(5);
    for (const v of [10, 20, 30]) list.append(v);
    const r = list.insertAt(2, 25);
    const [create, v0, v1, link] = r.steps;
    assert.deepEqual(create.snapshot.detached, [{ value: 25, address: "abc004", next: null }]);
    assert.deepEqual(create.snapshot.nodes.map((n) => n.value), [10, 20, 30], "before: the chain is unchanged");
    assert.deepEqual([v0.cursors.prev, v1.cursors.prev], ["abc001", "abc002"]);
    assert.deepEqual([v0.line, v1.line, link.line], [5, 6, 7]);
    assert.deepEqual(link.changes, [
        { address: "abc004", field: "next", from: null, to: "abc003" },
        { address: "abc002", field: "next", from: "abc003", to: "abc004" },
    ]);
    assert.equal(link.snapshot.detached, undefined);
});

test("singly: prepend and append write next then move head / tail", () => {
    const list = new SinglyLinkedList(5);
    const first = list.append(1).steps.at(-1);
    assert.deepEqual(first.changes.map((c) => c.field), ["next", "head", "tail"]);
    const head = list.prepend(0).steps.at(-1);
    assert.deepEqual(head.changes, [
        { address: "abc002", field: "next", from: null, to: "abc001" },
        { address: null, field: "head", from: "abc001", to: "abc002" },
    ]);
    const tail = list.append(2).steps.at(-1);
    assert.equal(tail.line, 4);
    assert.deepEqual(tail.changes.map((c) => `${c.address}.${c.field}`), ["abc001.next", "null.tail"]);
});

test("singly: deleting the tail walks with prev, unlinks, moves tail and shows the removed node detached", () => {
    const list = new SinglyLinkedList(5);
    for (const v of [1, 2, 3]) list.append(v);
    const r = list.deleteTail();
    const last = r.steps.at(-1);
    assert.deepEqual(r.steps.map((s) => s.type), ["visit", "visit", "unlink"]);
    assert.deepEqual(last.lines, [5, 6]);
    assert.deepEqual(last.changes, [
        { address: "abc002", field: "next", from: "abc003", to: null },
        { address: null, field: "tail", from: "abc003", to: "abc002" },
    ]);
    assert.deepEqual(last.snapshot.detached, [{ value: 3, address: "abc003", next: null }]);
});

test("singly: reverse keeps display order and flips one next per step with prev/curr/next cursors", () => {
    const list = new SinglyLinkedList(5);
    for (const v of [1, 2, 3]) list.append(v);
    const r = list.reverse();
    const mid = r.steps[1];
    assert.deepEqual(mid.snapshot.nodes.map((n) => n.address), ["abc001", "abc002", "abc003"]);
    assert.deepEqual(mid.cursors, { prev: "abc001", curr: "abc002", next: "abc003" });
    assert.deepEqual(mid.changes, [{ address: "abc002", field: "next", from: "abc003", to: "abc001" }]);
    assert.deepEqual(mid.snapshot.nodes.map((n) => n.next), [null, "abc001", null]);
    assert.deepEqual(r.steps.at(-1).changes.map((c) => c.field), ["head", "tail"]);
});

test("singly: sort records picks, comparisons and relinks; the comparison count matches the compare steps", () => {
    const list = new SinglyLinkedList(6);
    for (const v of [3, 1, 2]) list.append(v);
    const r = list.sort();
    assert.equal(r.steps.filter((s) => s.type === "compare").length, r.value);
    assert.equal(r.steps.filter((s) => s.type === "pick").length, 3);
    assert.equal(r.steps.filter((s) => s.type === "relink").length, 3);
    const mid = r.steps.find((s) => s.type === "relink" && s.cursors.node === "abc002");
    assert.deepEqual(mid.snapshot.sorted, ["abc002", "abc001"]);
    assert.deepEqual(mid.snapshot.remaining, ["abc003"]);
    assert.match(r.steps.at(-1).message, /insertion sort, \d+ comparisons/);
});

test("singly: find marks the hit; update and replace walk first", () => {
    const list = new SinglyLinkedList(5);
    for (const v of [1, 2, 3]) list.append(v);
    const f = list.find("abc002");
    assert.equal(f.steps.at(-1).found, true);
    assert.equal(f.steps[0].found, undefined);
    const u = list.updateValue("abc003", 9);
    assert.deepEqual(u.steps.map((s) => s.type), ["visit", "visit", "visit", "update"]);
    assert.deepEqual(u.steps.at(-1).changes, [{ address: "abc003", field: "value", from: 3, to: 9 }]);
    const rp = list.replaceNode("abc002", 7, "new");
    assert.deepEqual(rp.steps.map((s) => s.type), ["visit", "visit", "create", "replace"]);
    assert.deepEqual(rp.steps[2].snapshot.detached, [{ value: 7, address: "new", next: "abc003" }]);
    assert.deepEqual(rp.steps.at(-1).changes[0], { address: "abc001", field: "next", from: "abc002", to: "new" });
});

test("doubly: middle insert writes four pointers in order; tail delete needs no walk", () => {
    const list = new DoublyLinkedList(6);
    for (const v of [1, 2, 3, 4]) list.append(v);
    const ins = list.insertAt(2, 9).steps.at(-1);
    assert.deepEqual(ins.changes.map((c) => `${c.address}.${c.field}:${c.from}->${c.to}`), [
        "ABC005.prev:null->ABC002", "ABC005.next:null->ABC003", "ABC002.next:ABC003->ABC005", "ABC003.prev:ABC002->ABC005",
    ]);
    assert.deepEqual(ins.lines, [7, 8, 9]);
    const del = list.deleteTail();
    assert.equal(del.steps.length, 1);
    assert.deepEqual(del.steps[0].changes.slice(0, 2).map((c) => c.field), ["next", "tail"]);
});

test("doubly: reverse swaps both pointers per node; sort detaches the picked node", () => {
    const list = new DoublyLinkedList(5);
    for (const v of [2, 1]) list.append(v);
    const rev = list.reverse();
    assert.deepEqual(rev.steps[0].changes, [
        { address: "ABC001", field: "prev", from: null, to: "ABC002" },
        { address: "ABC001", field: "next", from: "ABC002", to: null },
    ]);
    list.reverse();
    const s = list.sort();
    const pick = s.steps.find((st) => st.type === "pick" && st.cursors.node === "ABC002");
    assert.deepEqual(pick.snapshot.detached.map((n) => n.address), ["ABC002"]);
    assert.equal(s.steps.filter((st) => st.type === "compare").length, s.value);
});

test("circular: append and prepend wrap between tail and head; the tail query reads head.prev", () => {
    const list = new CircularLinkedList(5);
    const first = list.append(1).steps.at(-1);
    assert.equal(first.wrap, true);
    list.append(2);
    const pre = list.prepend(0).steps.at(-1);
    assert.equal(pre.wrap, true);
    assert.deepEqual(pre.changes.map((c) => `${c.address}.${c.field}`),
        ["abc_003.prev", "abc_003.next", "abc_002.next", "abc_001.prev", "null.head"]);
    const t = list.query("tail");
    assert.equal(t.value.address, "abc_002");
    assert.match(t.steps[0].message, /head\.prev/);
});

test("circular: a missed find ends back at head; sort opens then closes the ring", () => {
    const list = new CircularLinkedList(5);
    for (const v of [3, 1, 2]) list.append(v);
    const f = list.find("nope");
    const last = f.steps.at(-1);
    assert.equal(last.wrap, true);
    assert.deepEqual(last.cursors, { curr: "abc_001" });
    const s = list.sort();
    assert.equal(s.steps[0].type, "open");
    assert.deepEqual(s.steps[0].changes, [
        { address: "abc_003", field: "next", from: "abc_001", to: null },
        { address: "abc_001", field: "prev", from: "abc_003", to: null },
    ]);
    const done = s.steps.at(-1);
    assert.deepEqual(done.changes.slice(0, 2).map((c) => `${c.address}.${c.field}`), ["abc_001.next", "abc_002.prev"]);
    assert.equal(s.steps.filter((st) => st.type === "compare").length, s.value);
    assert.deepEqual(list.toArray(), [1, 2, 3]);
});
