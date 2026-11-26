import { ok, fail, assertCapacity, assertValue } from "./result.js";
import { ADDRESS_PATTERN } from "./linked-list.js";
import { sortByRelinking, sortingSnapshot } from "./doubly-linked-list.js";

/**
 * Circular doubly linked list made of real node objects. There is no NULL anywhere:
 *   head ⇄ node ⇄ … ⇄ tail, and tail.next = head, head.prev = tail.
 * Only `head` is stored. The tail is always `head.prev`, so append, prepend and
 * deleting the tail are all O(1) without a separate tail pointer.
 * A single node points to itself in both directions (node.next = node.prev = node).
 *
 * Because the ring never reaches NULL, every walk counts nodes (or stops when it is
 * back at head); a loop that waits for NULL would never end. That is the classic
 * circular-list bug, and the steps mention it.
 *
 * Same conventions as linked-list.js / doubly-linked-list.js: display addresses
 * (abc_001, lowest free number), results { ok, value?, error?, steps }, steps
 * { type, operation, line, lines?, addresses, message, cursors, changes, snapshot, wrap? }
 * (line is 1-based in CIRCULAR_LINKED_LIST_INFO.pseudocode[operation]; `wrap` marks a
 * step that crosses the tail → head link), messages built before the change.
 * Sort opens the ring (tail.next and head.prev become NULL for the duration of the sort),
 * sorts the chain by re-linking, then closes the ring again.
 */

export class CNode {
    constructor(value, address) {
        this.value = value;
        this.address = address;
        this.prev = this;   // a lone node is a ring of one
        this.next = this;
    }
}

const addr = (node) => (node ? node.address : null);
const view = (n) => ({ value: n.value, address: n.address, prev: addr(n.prev), next: addr(n.next) });

export class CircularLinkedList {
    static MAX_CAPACITY = 100;

    #op = "";

    /**
     * @param {number} capacity integer from 1 to MAX_CAPACITY
     * @param {{ uniqueValues?: boolean, addressPrefix?: string }} [options]
     */
    constructor(capacity, { uniqueValues = false, addressPrefix = "abc_" } = {}) {
        assertCapacity(capacity, 1, CircularLinkedList.MAX_CAPACITY, "Linked list");
        this.capacity = capacity;
        this.uniqueValues = uniqueValues;
        this.addressPrefix = addressPrefix;
        this.head = null;
        this.length = 0;
    }

    /* ---------- reads ---------- */

    get size() { return this.length; }
    get tail() { return this.head ? this.head.prev : null; }
    isEmpty() { return this.length === 0; }
    isFull() { return this.length === this.capacity; }

    /** Head → tail via next, exactly `length` nodes (the ring has no NULL to stop at). */
    *nodes() {
        let node = this.head;
        for (let i = 0; i < this.length; i++) { yield node; node = node.next; }
    }

    /** Tail → head via prev, exactly `length` nodes. */
    *nodesBackward() {
        let node = this.tail;
        for (let i = 0; i < this.length; i++) { yield node; node = node.prev; }
    }

    toArray() { return [...this.nodes()].map((n) => n.value); }
    addresses() { return [...this.nodes()].map((n) => n.address); }

    snapshot() {
        return {
            nodes: [...this.nodes()].map(view),
            head: addr(this.head),
            tail: addr(this.tail),
            size: this.length,
            capacity: this.capacity
        };
    }

    locate(address) {
        let index = 0;
        for (const node of this.nodes()) {
            if (node.address === address) return { index, value: node.value, address };
            index++;
        }
        return null;
    }

    hasValue(value) {
        for (const node of this.nodes()) if (node.value === value) return true;
        return false;
    }

    /**
     * Ring check: following next from head returns to head after exactly `length`
     * nodes (and not earlier), every node's next.prev is itself, the prev walk also
     * closes after `length` nodes, and no address repeats. null when sound.
     */
    integrityError() {
        if (this.length === 0) return this.head === null ? null : "empty list must have head = null";
        if (this.head === null) return "non-empty list has no head";
        const seen = new Set();
        const addresses = new Set();
        let node = this.head;
        for (let i = 0; i < this.length; i++) {
            if (node === null || node === undefined) return `next is missing after ${i} nodes`;
            if (seen.has(node)) return `ring closed early after ${i} nodes (length is ${this.length})`;
            if (addresses.has(node.address)) return `address ${node.address} used twice`;
            if (node.next.prev !== node) return `${node.next.address}.prev does not point back at ${node.address}`;
            seen.add(node);
            addresses.add(node.address);
            node = node.next;
        }
        if (node !== this.head) return `after ${this.length} nodes the next-walk is not back at head`;
        node = this.head;
        for (let i = 0; i < this.length; i++) node = node.prev;
        if (node !== this.head) return `after ${this.length} nodes the prev-walk is not back at head`;
        return null;
    }

    /** O(1) reads recorded as one step: "size" | "isEmpty" | "isFull" | "head" | "tail" (tail = head.prev). */
    query(name) {
        this.#op = name;
        const node = name === "head" ? this.head : name === "tail" ? this.tail : null;
        let value;
        let message;
        if (name === "size") { value = this.length; message = `size is stored, so reading it is O(1): ${this.length} of ${this.capacity}.`; }
        else if (name === "isEmpty") { value = this.length === 0; message = `size = ${this.length}, so isEmpty is ${value ? "true" : "false"}.`; }
        else if (name === "isFull") { value = this.length === this.capacity; message = `size = ${this.length} and capacity = ${this.capacity}, so isFull is ${value ? "true" : "false"}.`; }
        else if (name === "head" || name === "tail") {
            value = node ? { address: node.address, value: node.value } : null;
            message = !node ? "head is NULL: the ring is empty."
                : name === "head" ? `head points at ${node.address} (value ${node.value}). O(1).`
                    : `The tail is head.prev = ${node.address} (value ${node.value}). No walk needed: O(1).`;
        } else throw new RangeError(`Unknown query ${name}`);
        const type = name === "head" || name === "tail" ? "peek" : "check";
        return ok(value, [this.#step(type, node ? [node.address] : [], message,
            { line: 1, cursors: node ? { [name]: node.address } : {}, wrap: name === "tail" && Boolean(node) })]);
    }

    /* ---------- inserts ---------- */

    append(value) { return this.insertAt(this.length, value); }
    prepend(value) { return this.insertAt(0, value); }

    insertAt(index, value) {
        assertValue(value);
        assertIndexType(index);
        this.#op = "insertAt";
        if (this.isFull()) {
            return this.#fail("overflow", `The list is full (${this.capacity} of ${this.capacity} nodes), so ${value} cannot be added.`);
        }
        if (index < 0 || index > this.length) {
            return this.#fail("bad-index", `Index ${index} is out of range. Use 0 to ${this.length}.`);
        }
        if (this.uniqueValues && this.hasValue(value)) {
            return this.#fail("duplicate", `Value ${value} is already in the list.`);
        }

        const node = new CNode(value, this.#freeAddress());
        const steps = [this.#step("create", [node.address],
            `Create a node for ${value} at address ${node.address}.`, { line: 2, cursors: { node: node.address }, detached: [node] })];

        if (this.length === 0) {
            this.head = node;   // node.next = node.prev = node already
            this.length++;
            steps.push(this.#step("link", [node.address],
                `The list was empty: ${node.address} becomes head, and its prev and next point at itself (a ring of one).`,
                { line: 3, cursors: { node: node.address }, changes: [change(null, "head", null, node.address)], wrap: true }));
            return ok(node.address, steps);
        }

        // Insert between `before` and `after`. At index 0 or length, that is between tail and head.
        let after;
        if (index === 0 || index === this.length) after = this.head;
        else after = this.#walkTo(index, steps, `to find the node now at index ${index}`, { detached: [node], extra: { node: node.address } });
        const before = after.prev;
        const atEnd = index === 0 || index === this.length;
        const message = atEnd
            ? `Link ${node.address} between the tail ${before.address} and the head ${after.address} ` +
              `(tail is head.prev, so no walk: O(1)). ${index === 0 ? `Then move head to ${node.address}.` : `${node.address} is the new tail.`}`
            : `Link ${node.address} between ${before.address} and ${after.address} (four pointers).`;
        const changes = [
            change(node, "prev", node.address, before.address), change(node, "next", node.address, after.address),
            change(before, "next", after.address, node.address), change(after, "prev", before.address, node.address),
            ...(index === 0 ? [change(null, "head", after.address, node.address)] : [])
        ];
        node.prev = before;
        node.next = after;
        before.next = node;
        after.prev = node;
        if (index === 0) this.head = node;
        this.length++;
        steps.push(this.#step("link", [before.address, node.address, after.address], message,
            { line: 5, lines: index === 0 ? [5, 6, 7, 8] : [5, 6, 7], cursors: { before: before.address, node: node.address, after: after.address },
              changes, wrap: atEnd }));
        return ok(node.address, steps);
    }

    /* ---------- deletes ---------- */

    deleteHead() { return this.deleteAt(0); }
    deleteTail() { return this.deleteAt(this.length - 1); }

    deleteAt(index) {
        assertIndexType(index);
        this.#op = "deleteAt";
        if (this.isEmpty()) return this.#fail("underflow", "The list is empty, so there is nothing to delete.");
        if (index < 0 || index >= this.length) {
            return this.#fail("bad-index", `Index ${index} is out of range. Use 0 to ${this.length - 1}.`);
        }
        const steps = [];
        let target;
        if (index === 0) target = this.head;
        else if (index === this.length - 1) target = this.tail;
        else target = this.#walkTo(index, steps, `to find the node at index ${index}`);

        let message;
        let changes;
        let lines;
        if (this.length === 1) {
            message = `${target.address} (${target.value}) was the only node, so head becomes NULL and the ring is empty.`;
            changes = [change(null, "head", target.address, null)];
            lines = [3];
            this.head = null;
        } else {
            const { prev, next } = target;
            message = `Point ${prev.address}.next at ${next.address} and ${next.address}.prev at ${prev.address}, closing the ring. ` +
                (target === this.head ? `Head moves to ${next.address}. ` : "") +
                (index === this.length - 1 ? `The tail was found as head.prev, so no walk: O(1). ` : "") +
                `${target.address} (${target.value}) is unlinked.`;
            changes = [
                change(prev, "next", target.address, next.address), change(next, "prev", target.address, prev.address),
                ...(target === this.head ? [change(null, "head", target.address, next.address)] : []),
                change(target, "prev", prev.address, target.address), change(target, "next", next.address, target.address)
            ];
            lines = target === this.head ? [4, 5, 6] : [4, 6];
            prev.next = next;
            next.prev = prev;
            if (target === this.head) this.head = next;
        }
        target.prev = target;
        target.next = target;
        this.length--;
        steps.push(this.#step("unlink", [target.address], message,
            { line: lines[0], lines, cursors: { target: target.address }, changes, detached: [target], wrap: index === 0 || index === this.length }));
        return ok(target.value, steps);
    }

    clear() {
        this.#op = "clear";
        const count = this.length;
        const changes = this.head ? [change(null, "head", this.head.address, null)] : [];
        const all = [...this.nodes()];
        for (const node of all) { node.prev = node; node.next = node; }
        this.head = null;
        this.length = 0;
        return ok(count, [this.#step("clear", [], `Removed ${count} node${count === 1 ? "" : "s"}. head = NULL.`, { line: 1, changes })]);
    }

    /* ---------- search & edit ---------- */

    find(address) {
        this.#op = "find";
        const steps = [];
        let index = 0;
        for (const node of this.nodes()) {
            const hit = node.address === address;
            steps.push(this.#step("visit", [node.address],
                `Index ${index}: address ${node.address} ${hit ? "matches" : `is not ${address}`}.`, { line: 3, cursors: { curr: node.address } }));
            if (hit) { steps.at(-1).found = true; return ok({ index, value: node.value, address }, steps); }
            index++;
        }
        return fail(`Address ${address} is not in the list (checked all ${this.length} node${this.length === 1 ? "" : "s"}).`,
            [...steps, this.#step("not-found", this.head ? [this.head.address] : [],
                `Back at head after ${this.length} node${this.length === 1 ? "" : "s"} without finding ${address}. ` +
                "The walk stops by counting, because a circular list never reaches NULL.",
                { line: 5, cursors: this.head ? { curr: this.head.address } : {}, wrap: Boolean(this.head) })]);
    }

    updateValue(address, value) {
        assertValue(value);
        this.#op = "update";
        const node = this.#nodeAt(address);
        if (!node) return this.#fail("not-found", `No node has address ${address}.`);
        if (this.uniqueValues && value !== node.value && this.hasValue(value)) {
            return this.#fail("duplicate", `Value ${value} is already in the list.`);
        }
        const steps = [];
        this.#walkToAddress(address, steps);
        const message = `Node ${address}: value ${node.value} → ${value}. Its address and both pointers do not change.`;
        const changes = [change(node, "value", node.value, value)];
        node.value = value;
        steps.push(this.#step("update", [address], message, { line: 4, cursors: { curr: address }, changes }));
        return ok(address, steps);
    }

    replaceNode(address, value, newAddress) {
        assertValue(value);
        this.#op = "replace";
        if (typeof newAddress !== "string" || !ADDRESS_PATTERN.test(newAddress)) {
            return this.#fail("bad-address", "New address must be 1–12 letters, digits, '-' or '_' (e.g. xyz_001).");
        }
        const node = this.#nodeAt(address);
        if (!node) return this.#fail("not-found", `No node has address ${address}.`);
        if (newAddress !== address && this.#nodeAt(newAddress)) {
            return this.#fail("address-taken", `Address ${newAddress} is already used by another node.`);
        }
        if (this.uniqueValues && value !== node.value && this.hasValue(value)) {
            return this.#fail("duplicate", `Value ${value} is already in the list.`);
        }
        const steps = [];
        this.#walkToAddress(address, steps);
        const fresh = new CNode(value, newAddress);
        steps.push(this.#step("create", [newAddress],
            `Create node ${newAddress} (${value}). Its prev and next point at itself; nothing points at it yet.`,
            { line: 4, cursors: { curr: address }, detached: [fresh] }));
        let message;
        let changes;
        let lines;
        if (this.length === 1) {
            message = `New node ${newAddress} (${value}) replaces the only node ${address}; it points at itself both ways and becomes head.`;
            changes = [change(null, "head", address, newAddress)];
            lines = [5];
        } else {
            const { prev, next } = node;
            message = `New node ${newAddress} (${value}) takes ${address}'s place: ${prev.address}.next and ${next.address}.prev now point at it` +
                `${node === this.head ? `, and head moves to ${newAddress}` : ""}. ${address} (${node.value}) is unlinked.`;
            changes = [
                change(fresh, "prev", newAddress, prev.address), change(fresh, "next", newAddress, next.address),
                change(prev, "next", address, newAddress), change(next, "prev", address, newAddress),
                ...(node === this.head ? [change(null, "head", address, newAddress)] : []),
                change(node, "prev", prev.address, address), change(node, "next", next.address, address)
            ];
            lines = [6, 7, 8];
            fresh.prev = prev;
            fresh.next = next;
            prev.next = fresh;
            next.prev = fresh;
        }
        if (node === this.head) this.head = fresh;
        node.prev = node;
        node.next = node;
        steps.push(this.#step("replace", [newAddress], message, { line: lines[0], lines, changes, detached: [node] }));
        return ok(newAddress, steps);
    }

    /* ---------- reorder ---------- */

    /** Swap prev and next on every node (exactly `length` of them), then head moves to the old tail. */
    reverse() {
        this.#op = "reverse";
        if (this.length < 2) {
            return ok(this.length, [this.#step("noop", [], "A list with fewer than 2 nodes is already its own reverse.", { line: 1 })]);
        }
        const steps = [];
        const oldTail = this.tail;
        const all = [...this.nodes()];
        const order = this.addresses();
        let node = this.head;
        for (let i = 0; i < this.length; i++) {
            const next = node.next;
            const message = `Swap ${node.address}'s pointers: prev ${node.prev.address} ⇄ next ${node.next.address}.`;
            const changes = [change(node, "prev", node.prev.address, node.next.address), change(node, "next", node.next.address, node.prev.address)];
            [node.prev, node.next] = [node.next, node.prev];
            steps.push({ type: "swap-pointers", operation: "reverse", line: 4, lines: [4, 5], addresses: [node.address], message,
                cursors: { curr: node.address }, changes, snapshot: {
                    phase: "reversing", swapped: order.slice(0, i + 1), remaining: order.slice(i + 1),
                    nodes: all.map(view), head: addr(this.head), tail: addr(this.head.prev),
                    size: this.length, capacity: this.capacity
                } });
            node = next;
        }
        const changes = [change(null, "head", this.head.address, oldTail.address)];
        this.head = oldTail;
        steps.push(this.#step("done", [this.head.address],
            `Move head to the old tail ${oldTail.address}. The ring now runs the other way; it is still closed.`, { line: 6, changes }));
        return ok(this.length, steps);
    }

    /** Stable ascending insertion sort that re-links nodes: open the ring, sort the chain, close the ring. */
    sort() {
        this.#op = "sort";
        if (this.length < 2) {
            return ok(0, [this.#step("noop", [], "A list with fewer than 2 nodes is already sorted.", { line: 1 })]);
        }
        const steps = [];
        const first = this.head;
        const last = this.tail;
        const all = [...this.nodes()];
        const openChanges = [change(last, "next", first.address, null), change(first, "prev", last.address, null)];
        last.next = null;   // open the ring so the sort can stop at NULL
        first.prev = null;
        steps.push({ type: "open", operation: "sort", line: 2, addresses: [last.address, first.address],
            message: `Open the ring: ${last.address}.next ← NULL and ${first.address}.prev ← NULL, so the sort can stop at NULL.`,
            cursors: {}, changes: openChanges, wrap: true,
            snapshot: { phase: "sorting", sorted: [], remaining: all.map((n) => n.address), nodes: all.map(view),
                head: first.address, tail: null, size: this.length, capacity: this.capacity } });
        const s = { head: null, tail: null };
        const comparisons = sortByRelinking(first, s, (type, addresses, message, line, cursors, rest, detached, changes) => {
            steps.push({ type, operation: "sort", line, addresses, message, cursors, changes,
                snapshot: sortingSnapshot(s.head, rest, detached, addr(this.head), addr(this.head.prev), this.length, this.capacity) });
        }, 4);
        const closeChanges = [
            change(s.tail, "next", null, s.head.address), change(s.head, "prev", null, s.tail.address),
            ...(this.head !== s.head ? [change(null, "head", this.head.address, s.head.address)] : [])
        ];
        s.tail.next = s.head;
        s.head.prev = s.tail;
        this.head = s.head;
        steps.push(this.#step("done", [],
            `Sorted ascending (insertion sort, ${comparisons} comparisons) by re-linking the nodes in order, then closed the ring ` +
            `(tail ${this.tail.address}.next = head ${this.head.address}). Each value kept its node and address.`,
            { line: 11, changes: closeChanges, wrap: true }));
        return ok(comparisons, steps);
    }

    /* ---------- internals ---------- */

    #freeAddress() {
        const used = new Set(this.addresses());
        for (let i = 1; ; i++) {
            const candidate = `${this.addressPrefix}${String(i).padStart(3, "0")}`;
            if (!used.has(candidate)) return candidate;
        }
    }

    #nodeAt(address) {
        for (const node of this.nodes()) if (node.address === address) return node;
        return null;
    }

    /** Walks to `index` from the nearer end of the ring (line 4 of insertAt, line 2 of deleteAt). */
    #walkTo(index, steps, why, { detached = [], extra = {} } = {}) {
        const line = this.#op === "insertAt" ? 4 : 2;
        const backward = index > (this.length - 1) / 2;
        let node = backward ? this.tail : this.head;
        let i = backward ? this.length - 1 : 0;
        steps.push(this.#step("visit", [node.address], backward
            ? `Start at the tail ${node.address} (head.prev) ${why}, walking backwards because index ${index} is nearer the tail.`
            : `Start at head ${node.address} ${why}.`, { line, cursors: { ...extra, curr: node.address }, detached, wrap: backward }));
        while (i !== index) {
            node = backward ? node.prev : node.next;
            i += backward ? -1 : 1;
            steps.push(this.#step("visit", [node.address], `Follow ${backward ? "prev" : "next"} to ${node.address} (index ${i}).`,
                { line, cursors: { ...extra, curr: node.address }, detached }));
        }
        return node;
    }

    /** Follows next from head until `address`, counting (lines 2 and 3 of update/replace). */
    #walkToAddress(address, steps) {
        let node = this.head;
        steps.push(this.#step("visit", [node.address],
            `Start at head ${node.address}${node.address === address ? `: it is ${address}.` : ` and walk to ${address}.`}`,
            { line: 2, cursors: { curr: node.address } }));
        while (node.address !== address) {
            node = node.next;
            steps.push(this.#step("visit", [node.address],
                `Follow next to ${node.address}${node.address === address ? `: found ${address}.` : "."}`, { line: 3, cursors: { curr: node.address } }));
        }
        return node;
    }

    #step(type, addresses, message, { line, lines, cursors = {}, changes = [], detached = [], wrap = false } = {}) {
        const snapshot = this.snapshot();
        if (detached.length) snapshot.detached = detached.map(view);
        return { type, operation: this.#op, line, ...(lines ? { lines } : {}), addresses, message, cursors, changes,
            ...(wrap ? { wrap: true } : {}), snapshot };
    }

    #fail(type, error) {
        return fail(error, [this.#step(type, [], error, { line: 1 })]);
    }
}

/** Pseudocode and costs shown by the page. Each step's `line` is 1-based in pseudocode[operation]. */
export const CIRCULAR_LINKED_LIST_INFO = Object.freeze({
    name: "Circular Linked List",
    operations: Object.freeze({
        insertAt: { complexity: "O(1) at head or tail, O(min(i, n − i)) in the middle", description: "The tail is head.prev." },
        deleteAt: { complexity: "O(1) at head or tail, O(min(i, n − i)) in the middle", description: "Close the ring around the removed node." },
        find: { complexity: "O(n)", description: "Count nodes: the ring never reaches NULL." },
        reverse: { complexity: "O(n)", description: "Swap prev and next on every node, head ← old tail." },
        sort: { complexity: "O(n²)", description: "Open the ring, insertion sort by re-linking, close the ring." },
    }),
    pseudocode: Object.freeze({
        insertAt: Object.freeze([
            "if full, i out of range or x is a duplicate: stop",
            "node ← new Node(x)   // prev = next = node itself",
            "if size = 0: head ← node; stop   // a ring of one",
            "after ← head if i = 0 or i = size, else walk from the nearer end",
            "before ← after.prev   // the tail when after = head",
            "node.prev ← before; node.next ← after",
            "before.next ← node; after.prev ← node",
            "if i = 0: head ← node",
        ]),
        deleteAt: Object.freeze([
            "if empty or i out of range: stop",
            "target ← head (i = 0), head.prev (i = size − 1), else walk from the nearer end",
            "if size = 1: head ← NULL; stop",
            "target.prev.next ← target.next; target.next.prev ← target.prev",
            "if target = head: head ← target.next",
            "target.prev ← target.next ← target   // unlinked",
        ]),
        clear: Object.freeze(["head ← NULL; size ← 0"]),
        find: Object.freeze([
            "curr ← head; count ← 0",
            "while count < size:   // never wait for NULL",
            "    if curr.address = a: return count",
            "    curr ← curr.next; count ← count + 1",
            "return not found   // curr is back at head",
        ]),
        update: Object.freeze([
            "if no node has address a, or x is a duplicate: stop",
            "curr ← head",
            "while curr.address ≠ a: curr ← curr.next",
            "curr.value ← x",
        ]),
        replace: Object.freeze([
            "if b is invalid or taken, a is missing, or x is a duplicate: stop",
            "curr ← head",
            "while curr.address ≠ a: curr ← curr.next",
            "fresh ← new Node(x, b)   // points at itself",
            "if size = 1: head ← fresh; stop",
            "fresh.prev ← curr.prev; fresh.next ← curr.next",
            "curr.prev.next ← fresh; curr.next.prev ← fresh; if curr = head: head ← fresh",
            "curr.prev ← curr.next ← curr   // unlinked",
        ]),
        reverse: Object.freeze([
            "if size < 2: stop (already reversed)",
            "curr ← head",
            "repeat size times:",
            "    swap(curr.prev, curr.next)",
            "    curr ← curr.prev   // the old next",
            "head ← old tail",
        ]),
        sort: Object.freeze([
            "if size < 2: stop (already sorted)",
            "open the ring: tail.next ← NULL; head.prev ← NULL",
            "sortedHead ← sortedTail ← NULL; node ← head",
            "while node ≠ NULL:",
            "  next ← node.next; node.prev ← node.next ← NULL",
            "  walk ← sortedTail",
            "  while walk ≠ NULL and walk.value > node.value: walk ← walk.prev",
            "  if walk = NULL: link node before sortedHead (or start the sorted part)",
            "  else: link node after walk (it may become sortedTail)",
            "  node ← next",
            "close the ring: sortedTail.next ← sortedHead; sortedHead.prev ← sortedTail; head ← sortedHead",
        ]),
        size: Object.freeze(["return size"]),
        isEmpty: Object.freeze(["return size = 0"]),
        isFull: Object.freeze(["return size = capacity"]),
        head: Object.freeze(["return head"]),
        tail: Object.freeze(["return head.prev   // no tail pointer needed"]),
    }),
});

function change(node, field, from, to) {
    return { address: node ? node.address : null, field, from, to };
}

function assertIndexType(index) {
    if (!Number.isInteger(index)) throw new TypeError(`Index must be an integer (got ${index})`);
}
