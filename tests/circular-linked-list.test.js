import { test } from "node:test";
import assert from "node:assert/strict";
import { CircularLinkedList, CNode } from "../src/structures/circular-linked-list.js";

function seeded(seed) {
    // mulberry32, same as the other suites, so failures are reproducible.
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Ring structure, model values/addresses, and the snapshot all agree. */
function assertMatchesModel(list, model) {
    assert.equal(list.integrityError(), null);
    assert.deepEqual(list.toArray(), model.map((m) => m.value));
    assert.deepEqual(list.addresses(), model.map((m) => m.address));
    assert.deepEqual([...list.nodesBackward()].map((n) => n.address), model.map((m) => m.address).reverse());
    assert.equal(list.size, model.length);
    assert.equal(list.isFull(), model.length === list.capacity);
    const n = model.length;
    const snap = list.snapshot();
    snap.nodes.forEach((node, i) => {
        assert.equal(node.next, model[(i + 1) % n].address, "next wraps tail → head");
        assert.equal(node.prev, model[(i - 1 + n) % n].address, "prev wraps head → tail");
    });
    assert.equal(snap.head, n ? model[0].address : null);
    assert.equal(snap.tail, n ? model[n - 1].address : null);
    if (n) {
        assert.equal(list.tail.next, list.head, "tail.next is head");
        assert.equal(list.head.prev, list.tail, "head.prev is tail");
    }
}

function lowestFree(model) {
    const used = new Set(model.map((m) => m.address));
    for (let i = 1; ; i++) {
        const a = `abc_${String(i).padStart(3, "0")}`;
        if (!used.has(a)) return a;
    }
}

/* ---------------- Model-based property test ---------------- */

test("circular linked list: matches an array model over 300 random operation sequences", () => {
    const rand = seeded(4242);
    for (let round = 0; round < 300; round++) {
        const cap = 1 + Math.floor(rand() * 20);
        const unique = round % 2 === 0;
        const list = new CircularLinkedList(cap, { uniqueValues: unique });
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
                model = model.slice().sort((a, b) => a.value - b.value);
            } else if (r < 0.82 && model.length) {
                const pick = model[Math.floor(rand() * model.length)];
                const res = list.updateValue(pick.address, value);
                if (unique && value !== pick.value && model.some((m) => m.value === value)) assert.match(res.error, /already/);
                else { assert.equal(res.ok, true); pick.value = value; }
            } else if (r < 0.9 && model.length) {
                const i = Math.floor(rand() * model.length);
                const newAddress = rand() < 0.2 ? model[Math.floor(rand() * model.length)].address : `x_${Math.floor(rand() * 999)}`;
                const res = list.replaceNode(model[i].address, value, newAddress);
                const taken = newAddress !== model[i].address && model.some((m) => m.address === newAddress);
                const dup = unique && value !== model[i].value && model.some((m) => m.value === value);
                if (taken) assert.match(res.error, /already used/);
                else if (dup) assert.match(res.error, /already in the list/);
                else { assert.equal(res.ok, true, res.error); model[i] = { value, address: newAddress }; }
            } else if (r < 0.95) {
                const target = model.length && rand() < 0.7 ? model[Math.floor(rand() * model.length)].address : "zzz_999";
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

/* ---------------- What makes it circular ---------------- */

test("circular linked list: a single node points to itself both ways", () => {
    const list = new CircularLinkedList(3);
    list.append(5);
    assert.ok(list.head instanceof CNode);
    assert.equal(list.head.next, list.head);
    assert.equal(list.head.prev, list.head);
    assert.equal(list.tail, list.head);
    assert.deepEqual(list.snapshot().nodes[0], { value: 5, address: "abc_001", prev: "abc_001", next: "abc_001" });
});

test("circular linked list: append, prepend and tail delete need no walk (tail = head.prev)", () => {
    const list = new CircularLinkedList(10);
    for (let v = 1; v <= 6; v++) list.append(v);
    for (const r of [list.append(7), list.prepend(0), list.deleteTail()]) {
        assert.equal(r.steps.filter((s) => s.type === "visit").length, 0);
    }
    assert.match(list.prepend(-1).steps.at(-1).message, /tail is head.prev, so no walk/);
    assert.match(list.deleteTail().steps.at(-1).message, /found as head.prev, so no walk/);
});

test("circular linked list: no node ever points at null", () => {
    const list = new CircularLinkedList(6);
    for (const v of [3, 1, 2, 5]) list.append(v);
    list.deleteAt(1); list.reverse(); list.sort(); list.insertAt(2, 9);
    for (const node of list.nodes()) {
        assert.ok(node.next instanceof CNode);
        assert.ok(node.prev instanceof CNode);
    }
});

test("circular linked list: middle index operations walk from the nearer end", () => {
    const list = new CircularLinkedList(10);
    for (let v = 0; v < 8; v++) list.append(v);
    assert.match(list.deleteAt(2).steps[0].message, /Start at head/);
    assert.match(list.deleteAt(5).steps[0].message, /Start at the tail .* walking backwards/);
});

test("circular linked list: reverse keeps the ring closed and the same node objects", () => {
    const list = new CircularLinkedList(5);
    for (const v of [1, 2, 3]) list.append(v);
    const before = [...list.nodes()];
    const r = list.reverse();
    assert.deepEqual([...list.nodes()], before.slice().reverse());
    assert.equal(list.tail.next, list.head);
    assert.deepEqual(r.steps.map((s) => s.type), ["swap-pointers", "swap-pointers", "swap-pointers", "done"]);
    assert.match(r.steps[0].message, /Swap abc_001's pointers: prev abc_003 ⇄ next abc_002/);
});

test("circular linked list: sort is stable, keeps nodes, closes the ring", () => {
    const list = new CircularLinkedList(6);
    for (const v of [2, 1, 2, 1]) list.append(v);
    const before = new Set(list.nodes());
    list.sort();
    assert.deepEqual(list.toArray(), [1, 1, 2, 2]);
    assert.deepEqual(list.addresses(), ["abc_002", "abc_004", "abc_001", "abc_003"]);
    assert.ok([...list.nodes()].every((n) => before.has(n)));
    assert.equal(list.integrityError(), null);
});

test("circular linked list: find on a missing address stops by counting", () => {
    const list = new CircularLinkedList(4);
    for (const v of [1, 2, 3]) list.append(v);
    const r = list.find("nope");
    assert.equal(r.ok, false);
    assert.equal(r.steps.filter((s) => s.type === "visit").length, 3);
    assert.match(r.steps.at(-1).message, /never reaches NULL/);
});

test("circular linked list: replaceNode on head, tail and a lone node", () => {
    const list = new CircularLinkedList(4);
    list.append(1);
    assert.equal(list.replaceNode("abc_001", 9, "solo").ok, true);
    assert.equal(list.head.address, "solo");
    assert.equal(list.head.next, list.head);
    list.append(2); list.append(3);
    list.replaceNode("solo", 4, "first");
    list.replaceNode("abc_002", 6, "last");
    assert.equal(list.head.address, "first");
    assert.equal(list.tail.address, "last");
    assert.equal(list.integrityError(), null);
});

/* ---------------- Rules and errors ---------------- */

test("circular linked list: errors are values; bad arguments throw", () => {
    const list = new CircularLinkedList(1, { uniqueValues: true });
    assert.match(list.deleteHead().error, /empty/);
    assert.equal(list.append(0).ok, true);
    assert.match(list.append(1).error, /full/);
    assert.match(list.replaceNode("abc_001", 1, "<img>").error, /letters, digits/);
    for (const cap of [0, 2.5, CircularLinkedList.MAX_CAPACITY + 1]) assert.throws(() => new CircularLinkedList(cap), RangeError);
    assert.throws(() => list.insertAt(0.5, 1), TypeError);
    assert.throws(() => list.append("1"), TypeError);
});

test("circular linked list: integrityError catches an early-closing or broken ring", () => {
    const list = new CircularLinkedList(5);
    for (const v of [1, 2, 3, 4]) list.append(v);
    const third = list.head.next.next;
    const savedNext = third.next;
    third.next = list.head;                 // ring closes after 3 nodes instead of 4
    assert.match(list.integrityError(), /prev does not point back|ring closed early|not back at head/);
    third.next = savedNext;
    assert.equal(list.integrityError(), null);
    list.head.prev = list.head.next;        // head.prev should be the tail
    assert.match(list.integrityError(), /prev does not point back/);
});
