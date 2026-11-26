import { ok, fail, assertCapacity, assertValue } from "./result.js";
import { ADDRESS_PATTERN } from "./linked-list.js";

/**
 * Doubly linked list made of real node objects:
 *   NULL ← head ⇄ node ⇄ … ⇄ tail → NULL
 * Each node has `prev` and `next`. Every operation re-points those references;
 * nothing is stored in an array.
 *
 * What a doubly linked list adds over a singly linked one, and what the steps say:
 * - Deleting the tail is O(1): `tail.prev` is the new tail, no walk from head.
 * - Index operations walk from whichever end is closer (head forward or tail backward).
 * - Reverse just swaps each node's prev and next.
 *
 * Same conventions as src/structures/linked-list.js: display addresses (ABC001, …,
 * lowest free number), results { ok, value?, error?, steps }, steps
 * { type, addresses, message, snapshot }, messages built before the change.
 */

export class DNode {
    constructor(value, address) {
        this.value = value;
        this.address = address;
        this.prev = null;
        this.next = null;
    }
}

export class DoublyLinkedList {
    static MAX_CAPACITY = 100;

    /**
     * @param {number} capacity integer from 1 to MAX_CAPACITY
     * @param {{ uniqueValues?: boolean, addressPrefix?: string }} [options]
     */
    constructor(capacity, { uniqueValues = false, addressPrefix = "ABC" } = {}) {
        assertCapacity(capacity, 1, DoublyLinkedList.MAX_CAPACITY, "Linked list");
        this.capacity = capacity;
        this.uniqueValues = uniqueValues;
        this.addressPrefix = addressPrefix;
        this.head = null;
        this.tail = null;
        this.length = 0;
    }

    /* ---------- reads ---------- */

    get size() { return this.length; }
    isEmpty() { return this.length === 0; }
    isFull() { return this.length === this.capacity; }

    /** Head → tail via next. */
    *nodes() {
        for (let node = this.head; node !== null; node = node.next) yield node;
    }

    /** Tail → head via prev. */
    *nodesBackward() {
        for (let node = this.tail; node !== null; node = node.prev) yield node;
    }

    toArray() { return [...this.nodes()].map((n) => n.value); }
    addresses() { return [...this.nodes()].map((n) => n.address); }

    snapshot() {
        return {
            nodes: [...this.nodes()].map((n) => ({
                value: n.value,
                address: n.address,
                prev: n.prev ? n.prev.address : null,
                next: n.next ? n.next.address : null
            })),
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
     * Checks both directions: the forward walk ends at tail after `length` nodes, the
     * backward walk ends at head, every node's next.prev is itself, no cycles, no
     * repeated addresses. Returns null when sound, otherwise the first problem.
     */
    integrityError() {
        if (this.length === 0) {
            return this.head === null && this.tail === null ? null : "empty list must have head = tail = null";
        }
        if (this.head === null || this.tail === null) return "non-empty list is missing head or tail";
        if (this.head.prev !== null) return "head.prev must be NULL";
        if (this.tail.next !== null) return "tail.next must be NULL";
        const seen = new Set();
        const addresses = new Set();
        let count = 0;
        let last = null;
        for (let node = this.head; node !== null; node = node.next) {
            if (seen.has(node)) return `cycle detected at ${node.address}`;
            if (addresses.has(node.address)) return `address ${node.address} used twice`;
            if (node.next && node.next.prev !== node) return `${node.next.address}.prev does not point back at ${node.address}`;
            seen.add(node);
            addresses.add(node.address);
            last = node;
            if (++count > this.length) return `forward walk is longer than length ${this.length}`;
        }
        if (count !== this.length) return `forward walk found ${count} nodes but length is ${this.length}`;
        if (last !== this.tail) return "tail does not point at the last node";
        let back = 0;
        for (let node = this.tail; node !== null; node = node.prev) {
            if (++back > this.length) return "backward walk is longer than length";
            if (!seen.has(node)) return `backward walk reached ${node.address}, which is not in the forward chain`;
        }
        if (back !== this.length) return `backward walk found ${back} nodes but length is ${this.length}`;
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

        const node = new DNode(value, this.#freeAddress());
        const steps = [this.#step("create", [node.address],
            `Create a node for ${value} at address ${node.address}. Its prev and next start as NULL.`)];

        if (this.length === 0) {
            this.head = node;
            this.tail = node;
            this.length++;
            steps.push(this.#step("link", [node.address], `The list was empty, so ${node.address} becomes both head and tail.`));
            return ok(node.address, steps);
        }
        if (index === 0) {
            const old = this.head;
            const message = `Point ${node.address}.next at the old head ${old.address} and ${old.address}.prev back at ${node.address}, ` +
                `then move head to ${node.address}. O(1).`;
            node.next = old;
            old.prev = node;
            this.head = node;
            this.length++;
            steps.push(this.#step("link", [node.address, old.address], message));
            return ok(node.address, steps);
        }
        if (index === this.length) {
            const old = this.tail;
            const message = `Point the old tail ${old.address}.next at ${node.address} and ${node.address}.prev back at ${old.address}, ` +
                `then move tail to ${node.address}. O(1).`;
            old.next = node;
            node.prev = old;
            this.tail = node;
            this.length++;
            steps.push(this.#step("link", [old.address, node.address], message));
            return ok(node.address, steps);
        }

        // New node goes between `before` (index - 1) and `after` (index).
        const after = this.#walkTo(index, steps, `to find the node now at index ${index}`);
        const before = after.prev;
        const message = `Link ${node.address} between ${before.address} and ${after.address}: ` +
            `${node.address}.prev = ${before.address}, ${node.address}.next = ${after.address}, ` +
            `${before.address}.next = ${node.address}, ${after.address}.prev = ${node.address} (four pointers).`;
        node.prev = before;
        node.next = after;
        before.next = node;
        after.prev = node;
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

        const { prev, next } = target;
        let message;
        if (!prev && !next) message = `${target.address} (${target.value}) was the only node, so head and tail become NULL.`;
        else if (!prev) message = `Move head to ${next.address} and set ${next.address}.prev = NULL. ${target.address} (${target.value}) is unlinked: O(1).`;
        else if (!next) message = `Move tail back to ${prev.address} (tail.prev) and set ${prev.address}.next = NULL. ` +
            `${target.address} (${target.value}) is unlinked: O(1), no walk from head needed.`;
        else message = `Point ${prev.address}.next at ${next.address} and ${next.address}.prev at ${prev.address}. ` +
            `${target.address} (${target.value}) is unlinked.`;

        if (prev) prev.next = next; else this.head = next;
        if (next) next.prev = prev; else this.tail = prev;
        target.prev = null;
        target.next = null;
        this.length--;
        steps.push(this.#step("unlink", [prev?.address, target.address, next?.address].filter(Boolean), message));
        return ok(target.value, steps);
    }

    clear() {
        const count = this.length;
        let node = this.head;
        while (node) { const next = node.next; node.prev = null; node.next = null; node = next; }
        this.head = null;
        this.tail = null;
        this.length = 0;
        return ok(count, [this.#step("clear", [], `Removed ${count} node${count === 1 ? "" : "s"}. head = tail = NULL.`)]);
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
            [...steps, this.#step("not-found", [], `Reached NULL without finding ${address}.`)]);
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

    /** Swaps a brand-new node (new value and address) into the old node's position, fixing both neighbours. */
    replaceNode(address, value, newAddress) {
        assertValue(value);
        if (typeof newAddress !== "string" || !ADDRESS_PATTERN.test(newAddress)) {
            return this.#fail("bad-address", "New address must be 1–12 letters, digits, '-' or '_' (e.g. XYZ001).");
        }
        const node = this.#nodeAt(address);
        if (!node) return this.#fail("not-found", `No node has address ${address}.`);
        if (newAddress !== address && this.#nodeAt(newAddress)) {
            return this.#fail("address-taken", `Address ${newAddress} is already used by another node.`);
        }
        if (this.uniqueValues && value !== node.value && this.hasValue(value)) {
            return this.#fail("duplicate", `Value ${value} is already in the list.`);
        }
        const fresh = new DNode(value, newAddress);
        const { prev, next } = node;
        const message = `New node ${newAddress} (${value}) takes ${address}'s place: ` +
            `${prev ? `${prev.address}.next` : "head"} and ${next ? `${next.address}.prev` : "tail"} now point at ${newAddress}. ` +
            `${address} (${node.value}) is unlinked.`;
        fresh.prev = prev;
        fresh.next = next;
        if (prev) prev.next = fresh; else this.head = fresh;
        if (next) next.prev = fresh; else this.tail = fresh;
        node.prev = null;
        node.next = null;
        return ok(newAddress, [this.#step("replace", [newAddress], message)]);
    }

    /* ---------- reorder ---------- */

    /** Swap prev and next on every node, then swap head and tail. O(n), no extra list. */
    reverse() {
        if (this.length < 2) {
            return ok(this.length, [this.#step("noop", [], "A list with fewer than 2 nodes is already its own reverse.")]);
        }
        const steps = [];
        const swapped = [];
        const pending = this.addresses();
        for (let node = this.head; node !== null; node = node.prev) { // after the swap, the old next is in .prev
            const message = `Swap ${node.address}'s pointers: prev ${node.prev ? node.prev.address : "NULL"} ⇄ next ${node.next ? node.next.address : "NULL"}.`;
            [node.prev, node.next] = [node.next, node.prev];
            swapped.push(pending.shift());
            // Mid-reversal the chain is half-swapped, so the snapshot lists which nodes are done.
            steps.push({ type: "swap-pointers", addresses: [node.address], message, snapshot: {
                phase: "reversing", swapped: swapped.slice(), remaining: pending.slice(), size: this.length, capacity: this.capacity
            } });
        }
        [this.head, this.tail] = [this.tail, this.head];
        steps.push(this.#step("done", [this.head.address, this.tail.address],
            `Swap head and tail: head is now ${this.head.address}, tail is ${this.tail.address}. The list is reversed.`));
        return ok(this.length, steps);
    }

    /** Stable ascending insertion sort that re-links nodes (values keep their nodes and addresses). */
    sort() {
        if (this.length < 2) {
            return ok(0, [this.#step("noop", [], "A list with fewer than 2 nodes is already sorted.")]);
        }
        let comparisons = 0;
        let sortedHead = null;
        let sortedTail = null;
        let node = this.head;
        while (node) {
            const next = node.next;
            node.prev = null;
            node.next = null;
            if (sortedHead === null) {
                sortedHead = sortedTail = node;
            } else {
                // Walk back from the sorted tail to the last node with value <= node.value (keeps equal values in order).
                let walk = sortedTail;
                while (walk) {
                    comparisons++;
                    if (walk.value <= node.value) break;
                    walk = walk.prev;
                }
                if (walk === null) {           // smallest so far: new sorted head
                    node.next = sortedHead;
                    sortedHead.prev = node;
                    sortedHead = node;
                } else {                       // insert after `walk`
                    node.prev = walk;
                    node.next = walk.next;
                    if (walk.next) walk.next.prev = node; else sortedTail = node;
                    walk.next = node;
                }
            }
            node = next;
        }
        this.head = sortedHead;
        this.tail = sortedTail;
        return ok(comparisons, [this.#step("done", [],
            `Sorted ascending by re-linking nodes (insertion sort walking back from the tail, ${comparisons} comparisons). ` +
            "Each value kept its node and address; only prev/next pointers changed.")]);
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

    /** Walks to `index` from the nearer end, recording a visit step per node. */
    #walkTo(index, steps, why) {
        const fromTail = index > (this.length - 1) / 2;
        if (!fromTail) {
            let node = this.head;
            steps.push(this.#step("visit", [node.address], `Start at head ${node.address} ${why} (index ${index} is nearer the head).`));
            for (let i = 0; i < index; i++) {
                node = node.next;
                steps.push(this.#step("visit", [node.address], `Follow next to ${node.address} (index ${i + 1}).`));
            }
            return node;
        }
        let node = this.tail;
        let i = this.length - 1;
        steps.push(this.#step("visit", [node.address], `Start at tail ${node.address} ${why} (index ${index} is nearer the tail, and prev lets us walk backwards).`));
        while (i > index) {
            node = node.prev;
            i--;
            steps.push(this.#step("visit", [node.address], `Follow prev to ${node.address} (index ${i}).`));
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
