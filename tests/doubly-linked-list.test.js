import { test } from "node:test";
import assert from "node:assert/strict";
import { DoublyLinkedList, DNode } from "../src/structures/doubly-linked-list.js";

function seeded(seed) {
    // mulberry32, same as the other suites, so failures are reproducible.
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Pointers in both directions, model values/addresses, and the snapshot all agree. */
function assertMatchesModel(list, model) {
    assert.equal(list.integrityError(), null);
    assert.deepEqual(list.toArray(), model.map((m) => m.value));
    assert.deepEqual(list.addresses(), model.map((m) => m.address));
    assert.deepEqual([...list.nodesBackward()].map((n) => n.address), model.map((m) => m.address).reverse());
    assert.equal(list.size, model.length);
    assert.equal(list.isEmpty(), model.length === 0);
    assert.equal(list.isFull(), model.length === list.capacity);
    const snap = list.snapshot();
    snap.nodes.forEach((n, i) => {
        assert.equal(n.prev, i > 0 ? model[i - 1].address : null);
        assert.equal(n.next, i + 1 < model.length ? model[i + 1].address : null);
    });
    assert.equal(snap.head, model.length ? model[0].address : null);
    assert.equal(snap.tail, model.length ? model.at(-1).address : null);
}

function lowestFree(model) {
    const used = new Set(model.map((m) => m.address));
    for (let i = 1; ; i++) {
        const a = `ABC${String(i).padStart(3, "0")}`;
        if (!used.has(a)) return a;
    }
}

/* ---------------- Model-based property test ---------------- */

test("doubly linked list: matches an array model over 300 random operation sequences", () => {
    const rand = seeded(7331);
    for (let round = 0; round < 300; round++) {
        const cap = 1 + Math.floor(rand() * 20);
        const unique = round % 2 === 0;
        const list = new DoublyLinkedList(cap, { uniqueValues: unique });
        let model = [];
        for (let op = 0; op < 60; op++) {
            const r = rand();
            const value = Math.floor(rand() * 21) - 5;
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
                assert.equal(list.reverse().ok, true);
                model.reverse();
            } else if (r < 0.72) {
                assert.equal(list.sort().ok, true);
                model = model.slice().sort((a, b) => a.value - b.value); // stable, like the list's
            } else if (r < 0.82 && model.length) {
                const pick = model[Math.floor(rand() * model.length)];
                const res = list.updateValue(pick.address, value);
                if (unique && value !== pick.value && model.some((m) => m.value === value)) assert.match(res.error, /already/);
                else { assert.equal(res.ok, true); pick.value = value; }
            } else if (r < 0.9 && model.length) {
                const i = Math.floor(rand() * model.length);
                const newAddress = rand() < 0.2 ? model[Math.floor(rand() * model.length)].address : `X${Math.floor(rand() * 999)}`;
                const res = list.replaceNode(model[i].address, value, newAddress);
                const taken = newAddress !== model[i].address && model.some((m) => m.address === newAddress);
                const dup = unique && value !== model[i].value && model.some((m) => m.value === value);
                if (taken) assert.match(res.error, /already used/);
                else if (dup) assert.match(res.error, /already in the list/);
                else { assert.equal(res.ok, true, res.error); model[i] = { value, address: newAddress }; }
            } else if (r < 0.95) {
                const target = model.length && rand() < 0.7 ? model[Math.floor(rand() * model.length)].address : "ZZZ999";
                const res = list.find(target);
                const idx = model.findIndex((m) => m.address === target);
                if (idx === -1) assert.match(res.error, /not in the list/);
                else assert.deepEqual(res.value, { index: idx, value: model[idx].value, address: target });
            } else {
                list.clear();
                model = [];
            }
            assertMatchesModel(list, model);
        }
    }
});

/* ---------------- What makes it doubly linked ---------------- */

test("doubly linked list: nodes carry prev and next references", () => {
    const list = new DoublyLinkedList(4);
    for (const v of [1, 2, 3]) list.append(v);
    assert.ok(list.head instanceof DNode);
    assert.equal(list.head.prev, null);
    assert.equal(list.head.next.prev, list.head);
    assert.equal(list.tail.prev.next, list.tail);
    assert.equal(list.tail.next, null);
});

test("doubly linked list: deleting the tail uses tail.prev (no walk)", () => {
    const list = new DoublyLinkedList(5);
    for (const v of [1, 2, 3, 4]) list.append(v);
    const r = list.deleteTail();
    assert.equal(r.value, 4);
    assert.deepEqual(r.steps.map((s) => s.type), ["unlink"], "no visit steps");
    assert.match(r.steps[0].message, /no walk from head needed/);
    assert.equal(list.tail.address, "ABC003");
});

test("doubly linked list: index operations walk from the nearer end", () => {
    const list = new DoublyLinkedList(10);
    for (let v = 0; v < 8; v++) list.append(v);
    const nearHead = list.deleteAt(1);
    assert.match(nearHead.steps[0].message, /Start at head/);
    assert.equal(nearHead.steps.filter((s) => s.type === "visit").length, 2);
    const nearTail = list.deleteAt(5); // 7 nodes now, index 5 is one step from the tail
    assert.match(nearTail.steps[0].message, /Start at tail .* prev lets us walk backwards/);
    assert.equal(nearTail.steps.filter((s) => s.type === "visit").length, 2);
    const ins = list.insertAt(4, 99);
    assert.match(ins.steps.at(-1).message, /four pointers/);
});

test("doubly linked list: reverse swaps pointers on the same node objects", () => {
    const list = new DoublyLinkedList(5);
    for (const v of [1, 2, 3]) list.append(v);
    const before = [...list.nodes()];
    const r = list.reverse();
    assert.deepEqual([...list.nodes()], before.slice().reverse());
    assert.deepEqual(r.steps.map((s) => s.type), ["swap-pointers", "swap-pointers", "swap-pointers", "done"]);
    assert.match(r.steps[0].message, /Swap ABC001's pointers: prev NULL ⇄ next ABC002/);
    assert.deepEqual(r.steps[1].snapshot.swapped, ["ABC001", "ABC002"]);
    assert.deepEqual(r.steps[1].snapshot.remaining, ["ABC003"]);
    assert.equal(list.integrityError(), null);
});

test("doubly linked list: sort is stable and keeps node objects", () => {
    const list = new DoublyLinkedList(6);
    for (const v of [2, 1, 2, 1]) list.append(v);
    const before = new Set(list.nodes());
    list.sort();
    assert.deepEqual(list.toArray(), [1, 1, 2, 2]);
    assert.deepEqual(list.addresses(), ["ABC002", "ABC004", "ABC001", "ABC003"]);
    assert.ok([...list.nodes()].every((n) => before.has(n)));
    assert.equal(list.integrityError(), null);
});

test("doubly linked list: replaceNode fixes both neighbours", () => {
    const list = new DoublyLinkedList(5);
    for (const v of [1, 2, 3]) list.append(v);
    const old = list.head.next;
    assert.equal(list.replaceNode("ABC002", 9, "XYZ001").ok, true);
    const fresh = list.head.next;
    assert.notEqual(fresh, old);
    assert.equal(fresh.prev, list.head);
    assert.equal(list.tail.prev, fresh);
    assert.equal(old.prev, null);
    assert.equal(old.next, null);
    list.replaceNode("ABC001", 5, "FIRST");
    list.replaceNode("ABC003", 7, "LAST");
    assert.equal(list.head.address, "FIRST");
    assert.equal(list.tail.address, "LAST");
    assert.equal(list.integrityError(), null);
});

/* ---------------- Rules and errors ---------------- */

test("doubly linked list: errors are values; bad arguments throw", () => {
    const list = new DoublyLinkedList(1, { uniqueValues: true });
    assert.match(list.deleteHead().error, /empty/);
    assert.match(list.deleteTail().error, /empty/);
    assert.equal(list.append(0).ok, true, "0 is a real value");
    assert.match(list.append(-3).error, /full/);
    assert.match(list.replaceNode("ABC001", 1, "<img>").error, /letters, digits/);
    assert.match(list.updateValue("nope", 1).error, /No node/);
    for (const cap of [0, 2.5, NaN, DoublyLinkedList.MAX_CAPACITY + 1]) assert.throws(() => new DoublyLinkedList(cap), RangeError);
    assert.throws(() => list.insertAt(0.5, 1), TypeError);
    assert.throws(() => list.append("1"), TypeError);
});

test("doubly linked list: integrityError catches a broken back pointer", () => {
    const list = new DoublyLinkedList(4);
    for (const v of [1, 2, 3]) list.append(v);
    list.tail.prev = list.head;            // should be the middle node
    assert.match(list.integrityError(), /prev does not point back/);
    list.tail.prev = list.head.next;
    list.head.prev = list.tail;
    assert.match(list.integrityError(), /head.prev must be NULL/);
});
