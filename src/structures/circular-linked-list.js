import { ok, fail, assertCapacity, assertValue } from "./result.js";
import { ADDRESS_PATTERN } from "./linked-list.js";

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
 * { type, addresses, message, snapshot }, messages built before the change.
 */

export class CNode {
    constructor(value, address) {
        this.value = value;
        this.address = address;
        this.prev = this;   // a lone node is a ring of one
        this.next = this;
    }
}

export class CircularLinkedList {
    static MAX_CAPACITY = 100;

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
            nodes: [...this.nodes()].map((n) => ({ value: n.value, address: n.address, prev: n.prev.address, next: n.next.address })),
            head: this.head ? this.head.address : null,
            tail: this.tail ? this.tail.address : null,
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

    /* ---------- inserts ---------- */

    append(value) { return this.insertAt(this.length, value); }
    prepend(value) { return this.insertAt(0, value); }

    insertAt(index, value) {
        assertValue(value);
        assertIndexType(index);
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
            `Create a node for ${value} at address ${node.address}.`)];

        if (this.length === 0) {
            this.head = node;   // node.next = node.prev = node already
            this.length++;
            steps.push(this.#step("link", [node.address],
                `The list was empty: ${node.address} becomes head, and its prev and next point at itself (a ring of one).`));
            return ok(node.address, steps);
        }

        // Insert between `before` and `after`. At index 0 or length, that is between tail and head.
        let after;
        if (index === 0 || index === this.length) after = this.head;
        else after = this.#walkTo(index, steps, `to find the node now at index ${index}`);
        const before = after.prev;
        const atEnd = index === 0 || index === this.length;
        const message = atEnd
            ? `Link ${node.address} between the tail ${before.address} and the head ${after.address} ` +
              `(tail is head.prev, so no walk: O(1)). ${index === 0 ? `Then move head to ${node.address}.` : `${node.address} is the new tail.`}`
            : `Link ${node.address} between ${before.address} and ${after.address} (four pointers).`;
        node.prev = before;
        node.next = after;
        before.next = node;
        after.prev = node;
        if (index === 0) this.head = node;
        this.length++;
        steps.push(this.#step("link", [before.address, node.address, after.address], message));
        return ok(node.address, steps);
    }

    /* ---------- deletes ---------- */

    deleteHead() { return this.deleteAt(0); }
    deleteTail() { return this.deleteAt(this.length - 1); }

    deleteAt(index) {
        assertIndexType(index);
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
        if (this.length === 1) {
            message = `${target.address} (${target.value}) was the only node, so head becomes NULL and the ring is empty.`;
            this.head = null;
        } else {
            const { prev, next } = target;
            message = `Point ${prev.address}.next at ${next.address} and ${next.address}.prev at ${prev.address}, closing the ring. ` +
                (target === this.head ? `Head moves to ${next.address}. ` : "") +
                (index === this.length - 1 ? `The tail was found as head.prev, so no walk: O(1). ` : "") +
                `${target.address} (${target.value}) is unlinked.`;
            prev.next = next;
            next.prev = prev;
            if (target === this.head) this.head = next;
        }
        target.prev = target;
        target.next = target;
        this.length--;
        steps.push(this.#step("unlink", [target.address], message));
        return ok(target.value, steps);
    }

    clear() {
        const count = this.length;
        const all = [...this.nodes()];
        for (const node of all) { node.prev = node; node.next = node; }
        this.head = null;
        this.length = 0;
        return ok(count, [this.#step("clear", [], `Removed ${count} node${count === 1 ? "" : "s"}. head = NULL.`)]);
    }

    /* ---------- search & edit ---------- */

    find(address) {
        const steps = [];
        let index = 0;
        for (const node of this.nodes()) {
            const hit = node.address === address;
            steps.push(this.#step("visit", [node.address],
                `Index ${index}: address ${node.address} ${hit ? "matches" : `is not ${address}`}.`));
            if (hit) return ok({ index, value: node.value, address }, steps);
            index++;
        }
        return fail(`Address ${address} is not in the list (checked all ${this.length} node${this.length === 1 ? "" : "s"}).`,
            [...steps, this.#step("not-found", [],
                `Back at head after ${this.length} node${this.length === 1 ? "" : "s"} without finding ${address}. ` +
                "The walk stops by counting, because a circular list never reaches NULL.")]);
    }

    updateValue(address, value) {
        assertValue(value);
        const node = this.#nodeAt(address);
        if (!node) return this.#fail("not-found", `No node has address ${address}.`);
        if (this.uniqueValues && value !== node.value && this.hasValue(value)) {
            return this.#fail("duplicate", `Value ${value} is already in the list.`);
        }
        const message = `Node ${address}: value ${node.value} → ${value}. Its address and both pointers do not change.`;
        node.value = value;
        return ok(address, [this.#step("update", [address], message)]);
    }

    replaceNode(address, value, newAddress) {
        assertValue(value);
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
        const fresh = new CNode(value, newAddress);
        let message;
        if (this.length === 1) {
            message = `New node ${newAddress} (${value}) replaces the only node ${address}; it points at itself both ways and becomes head.`;
        } else {
            const { prev, next } = node;
            message = `New node ${newAddress} (${value}) takes ${address}'s place: ${prev.address}.next and ${next.address}.prev now point at it` +
                `${node === this.head ? `, and head moves to ${newAddress}` : ""}. ${address} (${node.value}) is unlinked.`;
            fresh.prev = prev;
            fresh.next = next;
            prev.next = fresh;
            next.prev = fresh;
        }
        if (node === this.head) this.head = fresh;
        node.prev = node;
        node.next = node;
        return ok(newAddress, [this.#step("replace", [newAddress], message)]);
    }

    /* ---------- reorder ---------- */

    /** Swap prev and next on every node (exactly `length` of them), then head moves to the old tail. */
    reverse() {
        if (this.length < 2) {
            return ok(this.length, [this.#step("noop", [], "A list with fewer than 2 nodes is already its own reverse.")]);
        }
        const steps = [];
        const oldTail = this.tail;
        const order = this.addresses();
        let node = this.head;
        for (let i = 0; i < this.length; i++) {
            const next = node.next;
            const message = `Swap ${node.address}'s pointers: prev ${node.prev.address} ⇄ next ${node.next.address}.`;
            [node.prev, node.next] = [node.next, node.prev];
            steps.push({ type: "swap-pointers", addresses: [node.address], message, snapshot: {
                phase: "reversing", swapped: order.slice(0, i + 1), remaining: order.slice(i + 1), size: this.length, capacity: this.capacity
            } });
            node = next;
        }
        this.head = oldTail;
        steps.push(this.#step("done", [this.head.address],
            `Move head to the old tail ${oldTail.address}. The ring now runs the other way; it is still closed.`));
        return ok(this.length, steps);
    }

    /** Stable ascending insertion sort that re-links nodes, then closes the ring again. */
    sort() {
        if (this.length < 2) {
            return ok(0, [this.#step("noop", [], "A list with fewer than 2 nodes is already sorted.")]);
        }
        const nodes = [...this.nodes()];          // detach in head order
        let comparisons = 0;
        const sorted = [];                         // built as a chain: we only re-link at the end
        for (const node of nodes) {
            let i = sorted.length;
            while (i > 0) {
                comparisons++;
                if (sorted[i - 1].value <= node.value) break;
                i--;
            }
            sorted.splice(i, 0, node);
        }
        for (let i = 0; i < sorted.length; i++) {
            sorted[i].next = sorted[(i + 1) % sorted.length];
            sorted[i].prev = sorted[(i - 1 + sorted.length) % sorted.length];
        }
        this.head = sorted[0];
        return ok(comparisons, [this.#step("done", [],
            `Sorted ascending (insertion sort, ${comparisons} comparisons), then re-linked the nodes in order and closed the ring ` +
            `(tail ${this.tail.address}.next = head ${this.head.address}). Each value kept its node and address.`)]);
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

    /** Walks to `index` from the nearer end of the ring, recording a visit step per node. */
    #walkTo(index, steps, why) {
        const backward = index > (this.length - 1) / 2;
        let node = backward ? this.tail : this.head;
        let i = backward ? this.length - 1 : 0;
        steps.push(this.#step("visit", [node.address], backward
            ? `Start at the tail ${node.address} (head.prev) ${why}, walking backwards because index ${index} is nearer the tail.`
            : `Start at head ${node.address} ${why}.`));
        while (i !== index) {
            node = backward ? node.prev : node.next;
            i += backward ? -1 : 1;
            steps.push(this.#step("visit", [node.address], `Follow ${backward ? "prev" : "next"} to ${node.address} (index ${i}).`));
        }
        return node;
    }

    #step(type, addresses, message) {
        return { type, addresses, message, snapshot: this.snapshot() };
    }

    #fail(type, error) {
        return fail(error, [this.#step(type, [], error)]);
    }
}

function assertIndexType(index) {
    if (!Number.isInteger(index)) throw new TypeError(`Index must be an integer (got ${index})`);
}
