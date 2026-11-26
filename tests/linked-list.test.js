import { test } from "node:test";
import assert from "node:assert/strict";
import { SinglyLinkedList, ListNode } from "../src/structures/linked-list.js";

function seeded(seed) {
    // mulberry32, same as the other suites, so failures are reproducible.
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Full structural check: pointers, model values and addresses, snapshot agreement. */
function assertMatchesModel(list, model) {
    assert.equal(list.integrityError(), null);
    assert.deepEqual(list.toArray(), model.map((m) => m.value));
    assert.deepEqual(list.addresses(), model.map((m) => m.address));
    assert.equal(list.size, model.length);
    assert.equal(list.isEmpty(), model.length === 0);
    assert.equal(list.isFull(), model.length === list.capacity);
    assert.equal(list.head ? list.head.address : null, model.length ? model[0].address : null);
    assert.equal(list.tail ? list.tail.address : null, model.length ? model.at(-1).address : null);
    const snap = list.snapshot();
    assert.equal(snap.size, model.length);
    snap.nodes.forEach((n, i) => {
        assert.equal(n.address, model[i].address);
        assert.equal(n.next, i + 1 < model.length ? model[i + 1].address : null);
    });
}

function lowestFree(model, prefix = "abc") {
    const used = new Set(model.map((m) => m.address));
    for (let i = 1; ; i++) {
        const a = `${prefix}${String(i).padStart(3, "0")}`;
        if (!used.has(a)) return a;
    }
}

/* ---------------- Model-based property test ---------------- */

test("singly linked list: matches an array model over 300 random operation sequences", () => {
    const rand = seeded(2026);
    for (let round = 0; round < 300; round++) {
        const cap = 1 + Math.floor(rand() * 20);
        const unique = round % 2 === 0;
        const list = new SinglyLinkedList(cap, { uniqueValues: unique });
        let model = [];
        for (let op = 0; op < 60; op++) {
            const r = rand();
            const value = Math.floor(rand() * 21) - 5; // includes 0, negatives and repeats
            if (r < 0.35) {
                const index = Math.floor(rand() * (model.length + 2)) - (rand() < 0.1 ? 1 : 0);
                const res = list.insertAt(index, value);
                const dup = unique && model.some((m) => m.value === value);
                if (model.length >= cap) assert.match(res.error, /full/);
                else if (index < 0 || index > model.length) assert.match(res.error, /out of range/);
                else if (dup) assert.match(res.error, /already in the list/);
                else {
                    assert.equal(res.ok, true, res.error);
                    const address = lowestFree(model);
                    assert.equal(res.value, address);
                    model.splice(index, 0, { value, address });
                }
            } else if (r < 0.6) {
                const index = Math.floor(rand() * (model.length + 1));
                const res = list.deleteAt(index);
                if (!model.length) assert.match(res.error, /empty/);
                else if (index >= model.length) assert.match(res.error, /out of range/);
                else { assert.equal(res.ok, true); assert.equal(res.value, model.splice(index, 1)[0].value); }
            } else if (r < 0.66) {
                const res = list.reverse();
                assert.equal(res.ok, true);
                model.reverse();
            } else if (r < 0.72) {
                const res = list.sort();
                assert.equal(res.ok, true);
                model = model.slice().sort((a, b) => a.value - b.value); // Array#sort is stable, like the list's
            } else if (r < 0.82 && model.length) {
                const pick = model[Math.floor(rand() * model.length)];
                const res = list.updateValue(pick.address, value);
                if (unique && value !== pick.value && model.some((m) => m.value === value)) assert.match(res.error, /already/);
                else { assert.equal(res.ok, true); pick.value = value; }
            } else if (r < 0.9 && model.length) {
                const i = Math.floor(rand() * model.length);
                const newAddress = rand() < 0.2 ? model[Math.floor(rand() * model.length)].address : `x${Math.floor(rand() * 999)}`;
                const res = list.replaceNode(model[i].address, value, newAddress);
                const taken = newAddress !== model[i].address && model.some((m) => m.address === newAddress);
                const dup = unique && value !== model[i].value && model.some((m) => m.value === value);
                if (taken) assert.match(res.error, /already used/);
                else if (dup) assert.match(res.error, /already in the list/);
                else { assert.equal(res.ok, true, res.error); model[i] = { value, address: newAddress }; }
            } else if (r < 0.95) {
                const target = model.length && rand() < 0.7 ? model[Math.floor(rand() * model.length)].address : "zzz999";
                const res = list.find(target);
                const idx = model.findIndex((m) => m.address === target);
                if (idx === -1) { assert.equal(res.ok, false); assert.match(res.error, /not in the list/); }
                else { assert.equal(res.ok, true); assert.deepEqual(res.value, { index: idx, value: model[idx].value, address: target }); }
                assert.deepEqual(list.locate(target), idx === -1 ? null : { index: idx, value: model[idx].value, address: target });
            } else {
                list.clear();
                model = [];
            }
            assertMatchesModel(list, model);
        }
    }
});

/* ---------------- Real pointers ---------------- */

test("singly linked list: nodes are real objects linked by next, not an array", () => {
    const list = new SinglyLinkedList(5);
    list.append(10); list.append(20); list.append(30);
    assert.ok(list.head instanceof ListNode);
    assert.equal(list.head.value, 10);
    assert.equal(list.head.next.value, 20);
    assert.equal(list.head.next.next, list.tail);
    assert.equal(list.tail.next, null);
    assert.equal(Object.prototype.hasOwnProperty.call(list, "items"), false);
});

test("singly linked list: reverse and sort re-link the same node objects", () => {
    const list = new SinglyLinkedList(6);
    for (const v of [3, 1, 2]) list.append(v);
    const before = [...list.nodes()];
    list.reverse();
    const reversed = [...list.nodes()];
    assert.deepEqual(reversed, before.slice().reverse(), "same objects, new order");
    list.sort();
    const sorted = [...list.nodes()];
    assert.deepEqual(sorted.map((n) => n.value), [1, 2, 3]);
    assert.ok(sorted.every((n) => before.includes(n)), "no node was recreated");
    assert.deepEqual(sorted.map((n) => n.address), ["abc002", "abc003", "abc001"], "values keep their addresses");
});

test("singly linked list: sort is stable for equal values", () => {
    const list = new SinglyLinkedList(6);
    for (const v of [2, 1, 2, 1]) list.append(v);
    list.sort();
    assert.deepEqual(list.addresses(), ["abc002", "abc004", "abc001", "abc003"]);
});

test("singly linked list: replaceNode swaps in a new node in the same position", () => {
    const list = new SinglyLinkedList(5);
    for (const v of [1, 2, 3]) list.append(v);
    const old = list.head.next;
    const r = list.replaceNode("abc002", 9, "xyz001");
    assert.equal(r.ok, true);
    assert.notEqual(list.head.next, old, "a new node object");
    assert.equal(list.head.next.address, "xyz001");
    assert.equal(list.head.next.next, list.tail);
    assert.equal(old.next, null, "old node unlinked");
    // replacing the tail moves the tail pointer
    list.replaceNode("abc003", 7, "end");
    assert.equal(list.tail.address, "end");
    // replacing the head moves the head pointer
    list.replaceNode("abc001", 5, "start");
    assert.equal(list.head.address, "start");
    assert.equal(list.integrityError(), null);
});

/* ---------------- Rules and errors ---------------- */

test("singly linked list: addresses reuse the lowest free number", () => {
    const list = new SinglyLinkedList(4);
    for (const v of [1, 2, 3]) list.append(v);
    list.deleteAt(1); // frees abc002
    assert.equal(list.append(4).value, "abc002");
    assert.equal(list.append(5).value, "abc004");
});

test("singly linked list: errors are values with readable messages", () => {
    const list = new SinglyLinkedList(1, { uniqueValues: true });
    assert.match(list.deleteHead().error, /empty/);
    assert.match(list.deleteTail().error, /empty/);
    assert.match(list.insertAt(2, 1).error, /out of range. Use 0 to 0/);
    assert.equal(list.append(5).ok, true);
    assert.match(list.append(6).error, /full \(1 of 1/);
    assert.match(list.updateValue("nope", 1).error, /No node has address nope/);
    assert.match(list.replaceNode("abc001", 1, "<img>").error, /letters, digits/);
    assert.match(list.replaceNode("abc001", 1, "").error, /letters, digits/);
    assert.match(list.find("abc999").error, /not in the list/);
    assert.match(list.deleteAt(1).error, /out of range. Use 0 to 0/);
    for (const r of [list.deleteHead(), list.deleteAt(0)]) assert.ok(r.steps.length >= 1);
});

test("singly linked list: uniqueValues blocks duplicates but allows re-setting the same value", () => {
    const list = new SinglyLinkedList(3, { uniqueValues: true });
    list.append(1); list.append(2);
    assert.match(list.prepend(2).error, /already in the list/);
    assert.match(list.updateValue("abc001", 2).error, /already in the list/);
    assert.equal(list.updateValue("abc001", 1).ok, true);
    assert.equal(list.replaceNode("abc002", 2, "new").ok, true);
    const loose = new SinglyLinkedList(3);
    loose.append(1);
    assert.equal(loose.append(1).ok, true);
});

test("singly linked list: 0 and negative values are real values", () => {
    const list = new SinglyLinkedList(3);
    list.append(0); list.append(-4);
    assert.deepEqual(list.toArray(), [0, -4]);
    assert.equal(list.deleteHead().value, 0);
});

test("singly linked list: bad arguments throw", () => {
    for (const cap of [0, -1, 2.5, NaN, SinglyLinkedList.MAX_CAPACITY + 1]) {
        assert.throws(() => new SinglyLinkedList(cap), RangeError);
    }
    const list = new SinglyLinkedList(3);
    for (const bad of [NaN, Infinity, "3", null]) assert.throws(() => list.append(bad), TypeError);
    assert.throws(() => list.insertAt(1.5, 1), TypeError);
    assert.throws(() => list.deleteAt("0"), TypeError);
    assert.equal(list.size, 0);
});

test("singly linked list: integrityError catches broken pointers", () => {
    const list = new SinglyLinkedList(4);
    for (const v of [1, 2, 3]) list.append(v);
    list.tail.next = list.head;             // make a cycle
    assert.match(list.integrityError(), /cycle/);
    list.tail.next = null;
    list.length = 5;
    assert.match(list.integrityError(), /length/);
    list.length = 3;
    list.tail = list.head;
    assert.match(list.integrityError(), /tail/);
});

/* ---------------- Step content ---------------- */

test("singly linked list: insert in the middle walks to the previous node, then links", () => {
    const list = new SinglyLinkedList(5);
    for (const v of [10, 20, 30]) list.append(v);
    const r = list.insertAt(2, 25);
    assert.deepEqual(r.steps.map((s) => s.type), ["create", "visit", "visit", "link"]);
    assert.match(r.steps[0].message, /Create a node for 25 at address abc004/);
    assert.deepEqual(r.steps[3].addresses, ["abc002", "abc004", "abc003"]);
    assert.match(r.steps[3].message, /Point abc004's next at abc003, then point abc002's next at abc004/);
    assert.deepEqual(r.steps[3].snapshot.nodes.map((n) => n.value), [10, 20, 25, 30]);
});

test("singly linked list: deleting the tail explains the O(n) walk", () => {
    const list = new SinglyLinkedList(5);
    for (const v of [1, 2, 3]) list.append(v);
    const r = list.deleteTail();
    assert.equal(r.value, 3);
    assert.match(r.steps[0].message, /cannot step backwards/);
    assert.match(r.steps.at(-1).message, /abc002's next at NULL and make it the new tail/);
    assert.equal(list.tail.address, "abc002");
});

test("singly linked list: reverse records one relink step per node with both chains", () => {
    const list = new SinglyLinkedList(5);
    for (const v of [1, 2, 3]) list.append(v);
    const r = list.reverse();
    assert.deepEqual(r.steps.map((s) => s.type), ["relink", "relink", "relink", "done"]);
    assert.match(r.steps[0].message, /Point abc001's next back at NULL \(it pointed at abc002\)/);
    assert.deepEqual(r.steps[1].snapshot.reversed, ["abc002", "abc001"]);
    assert.deepEqual(r.steps[1].snapshot.remaining, ["abc003"]);
    assert.deepEqual(r.steps.at(-1).snapshot.nodes.map((n) => n.value), [3, 2, 1]);
});

test("singly linked list: snapshots are copies", () => {
    const list = new SinglyLinkedList(3);
    const r = list.append(1);
    list.append(2);
    assert.equal(r.steps.at(-1).snapshot.nodes.length, 1);
});
