// C24: shared linked-list renderer. listView is pure; the painter is checked with a
// minimal fake document (no innerHTML, no inline styles, boxes reused by address).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listView, countUpTo, describeChange, createListRenderer } from "../src/core/list-renderer.js";
import { SinglyLinkedList } from "../src/structures/linked-list.js";
import { DoublyLinkedList } from "../src/structures/doubly-linked-list.js";
import { CircularLinkedList } from "../src/structures/circular-linked-list.js";

const links = (view) => view.items.filter((i) => i.kind === "link");
const nodes = (view) => view.items.filter((i) => i.kind === "node");

test("singly: a whole list reads head → … → NULL with roles and one arrow per gap", () => {
    const list = new SinglyLinkedList(5);
    for (const v of [1, 2, 3]) list.append(v);
    const view = listView(list.query("size").steps[0], "singly");
    assert.deepEqual(links(view).map((l) => [l.next, l.prev]), [["→", null], ["→", null]]);
    assert.deepEqual(nodes(view).map((n) => n.role), ["HEAD", "", "TAIL"]);
    assert.deepEqual(view.end, { label: "TERMINAL", text: "NULL", arrow: "→", active: false, aria: "" });
    assert.equal(view.start, null);
});

test("singly: mid-reversal arrows follow the real next pointers (flipped, then broken, then forward)", () => {
    const list = new SinglyLinkedList(5);
    for (const v of [1, 2, 3, 4]) list.append(v);
    const step = list.reverse().steps[1];   // abc001 and abc002 reversed
    const view = listView(step, "singly");
    assert.deepEqual(links(view).map((l) => l.next), ["←", "", "→"]);
    assert.equal(links(view)[0].changed, true, "the link just re-pointed is marked");
    const curr = nodes(view).find((n) => n.address === "abc002");
    assert.deepEqual(curr.cursors, ["curr"]);
    assert.deepEqual(curr.fields, [{ name: "Next", value: "abc001", from: "abc003" }]);
    assert.match(curr.aria, /next changed from abc003 to abc001/);
});

test("singly: the create step shows the new node detached and tones it as new", () => {
    const list = new SinglyLinkedList(5);
    list.append(1);
    const view = listView(list.append(2).steps[0], "singly");
    assert.equal(view.detached.length, 1);
    assert.equal(view.detached[0].tone, "ht-tone-sorted");
    assert.equal(view.detached[0].role, "", "a detached node is never head or tail");
    assert.match(view.detachedLabel, /Not in the chain/);
    const del = listView(list.deleteHead().steps[0], "singly");
    assert.equal(del.detached[0].removed, true);
    assert.match(del.detachedLabel, /Unlinked/);
    assert.deepEqual(del.changes, ["head: abc001 → abc002", "abc001.next: abc002 → NULL"]);
});

test("doubly: gaps carry a next row and a prev row; NULL caps at both ends", () => {
    const list = new DoublyLinkedList(5);
    for (const v of [1, 2]) list.append(v);
    const view = listView(list.query("head").steps[0], "doubly");
    assert.deepEqual(links(view).map((l) => [l.next, l.prev]), [["→", "←"]]);
    assert.equal(view.start.arrow, "←");
    assert.equal(view.end.arrow, "→");
    assert.equal(nodes(view)[0].tone, "node-highlight");
    assert.deepEqual(nodes(view)[0].fields.map((f) => f.name), ["Prev", "Next"]);
});

test("circular: the end cap points back to head, and a wrap step marks it", () => {
    const list = new CircularLinkedList(5);
    for (const v of [1, 2, 3]) list.append(v);
    const miss = listView(list.find("nope").steps.at(-1), "circular");
    assert.equal(miss.end.label, "BACK TO HEAD");
    assert.equal(miss.end.text, "↺ abc_001");
    assert.equal(miss.end.active, true);
    const open = listView(list.sort().steps[0], "circular");
    assert.equal(open.end.label, "RING OPEN");
});

test("circular: a two-node ring has next and prev both ways", () => {
    const list = new CircularLinkedList(3);
    list.append(1); list.append(2);
    const view = listView(list.query("size").steps[0], "circular");
    assert.deepEqual(links(view).map((l) => [l.next, l.prev]), [["⇄", "⇄"]]);
});

test("describeChange and countUpTo", () => {
    assert.equal(describeChange({ address: null, field: "head", from: null, to: "a" }), "head: NULL → a");
    assert.equal(describeChange({ address: "a", field: "prev", from: "b", to: null }), "a.prev: b → NULL");
    const list = new SinglyLinkedList(6);
    for (const v of [3, 1, 2]) list.append(v);
    const steps = list.sort().steps;
    const total = countUpTo(steps, steps.length - 1);
    assert.equal(total.comparisons, steps.filter((s) => s.type === "compare").length);
    assert.equal(total.writes, steps.reduce((n, s) => n + s.changes.filter((c) => c.field !== "value").length, 0));
    assert.deepEqual(countUpTo(steps, -1), { visits: 0, comparisons: 0, writes: 0 });
});

/* ---------------- painter with a minimal fake DOM ---------------- */

class FakeClassList {
    constructor(el) { this.el = el; }
    get set() { return new Set(this.el.className.split(/\s+/).filter(Boolean)); }
    add(c) { const s = this.set; s.add(c); this.el.className = [...s].join(" "); }
    remove(c) { const s = this.set; s.delete(c); this.el.className = [...s].join(" "); }
    contains(c) { return this.set.has(c); }
    toggle(c, on) { (on ?? !this.contains(c)) ? this.add(c) : this.remove(c); }
}

class FakeEl {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.className = ""; this.hidden = false; this.parent = null; this._text = ""; this.classList = new FakeClassList(this); }
    get isConnected() { return this.parent !== null; }
    set textContent(t) { this.children.forEach((c) => { if (c instanceof FakeEl) c.parent = null; }); this.children = []; this._text = String(t); }
    get textContent() { return this._text + this.children.map((c) => (c instanceof FakeEl ? c.textContent : String(c))).join(""); }
    append(...kids) { for (const k of kids) { if (k instanceof FakeEl) { k.parent?.removeChild(k); k.parent = this; } this.children.push(k); } }
    removeChild(k) { this.children = this.children.filter((c) => c !== k); k.parent = null; }
    replaceChildren(...kids) { this.children.forEach((c) => { if (c instanceof FakeEl) c.parent = null; }); this.children = []; this._text = ""; this.append(...kids); }
    setAttribute(n, v) { this.attrs[n] = String(v); }
    getBoundingClientRect() { return { left: 0, top: 0 }; }
    get innerHTML() { throw new Error("innerHTML must not be used"); }
    set innerHTML(v) { throw new Error("innerHTML must not be used"); }
    get style() { throw new Error(".style must not be used"); }
}
const fakeDoc = { createElement: (tag) => new FakeEl(tag) };
const boxesIn = (el) => el.children.filter((c) => c instanceof FakeEl && c.classList.contains("ll-node"));

test("painter: keeps node elements by address across frames and moves a node from the detached row into the chain", () => {
    const els = { chain: new FakeEl("div"), detached: new FakeEl("div"), changes: new FakeEl("p") };
    const r = createListRenderer(els, { kind: "singly", doc: fakeDoc, reduceMotion: () => true });
    r.clear();
    assert.equal(els.chain.textContent, "List is empty");
    assert.equal(els.detached.hidden, true);

    const list = new SinglyLinkedList(5);
    list.append(1);
    const [create, link] = list.append(2).steps;
    r.render(create);
    const floating = boxesIn(els.detached)[0];
    assert.match(floating.textContent, /abc002/);
    assert.equal(els.detached.hidden, false);
    const firstBox = boxesIn(els.chain)[0];

    r.render(link);
    assert.equal(els.detached.hidden, true);
    const chainBoxes = boxesIn(els.chain);
    assert.equal(chainBoxes[0], firstBox, "abc001 kept its element");
    assert.equal(chainBoxes[1], floating, "abc002 is the same element that was detached");
    assert.match(chainBoxes[0].textContent, /Next: NULL → abc002/);
    assert.equal(chainBoxes[0].attrs["aria-label"], "head, address abc001, value 1, next changed from NULL to abc002");
    assert.match(els.changes.textContent, /abc001\.next: NULL → abc002 · tail: abc001 → abc002/);
    assert.equal(els.changes.hidden, false);
});

test("painter: doubly links render as two aria-hidden rows; the circular cap names head", () => {
    const els = { chain: new FakeEl("div"), detached: new FakeEl("div"), changes: new FakeEl("p") };
    const r = createListRenderer(els, { kind: "doubly", doc: fakeDoc, reduceMotion: () => true });
    const list = new DoublyLinkedList(4);
    list.append(1); list.append(2);
    r.render(list.query("size").steps[0]);
    const link = els.chain.children.find((c) => c.classList.contains("ll-link-double"));
    assert.equal(link.attrs["aria-hidden"], "true");
    assert.deepEqual(link.children.map((c) => c.textContent), ["→", "←"]);

    const cels = { chain: new FakeEl("div"), detached: new FakeEl("div"), changes: new FakeEl("p") };
    const cr = createListRenderer(cels, { kind: "circular", doc: fakeDoc, reduceMotion: () => true });
    const ring = new CircularLinkedList(3);
    ring.append(5);
    cr.render(ring.query("size").steps[0]);
    const cap = cels.chain.children.at(-1);
    assert.equal(cap.attrs["aria-label"], "tail.next points back to head abc_001");
    assert.match(cap.textContent, /BACK TO HEAD↺ abc_001/);
});

test("list-renderer.js uses no innerHTML, inline styles or dialogs", () => {
    const src = readFileSync(new URL("../src/core/list-renderer.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, /innerHTML|\.style\b|style=|alert\(|confirm\(|prompt\(/);
});
