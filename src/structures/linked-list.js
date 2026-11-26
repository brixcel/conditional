import { ok, fail, assertCapacity, assertValue } from "./result.js";

/**
 * Singly linked list made of real node objects:
 *   head → { value, address, next } → { value, address, next } → … → null
 * Every operation works by re-pointing `next` references, never by shifting an
 * array, so what the page draws is the actual pointer structure.
 *
 * Each node also has a short display "address" (abc001, abc002, …) that stands in
 * for its memory location, so students can read `next` as "the address of the
 * following node". New nodes take the lowest free address.
 *
 * DOM-free. Mutating operations return { ok, value?, error?, steps } (see result.js).
 * A step is { type, addresses, message, snapshot } where `addresses` lists the nodes
 * the step is about and `snapshot` is a plain copy of the list after the step.
 * Messages that describe a change are built before the change runs.
 */

export const ADDRESS_PATTERN = /^[A-Za-z0-9_-]{1,12}$/;

export class ListNode {
    constructor(value, address, next = null) {
        this.value = value;
        this.address = address;
        this.next = next;
    }
}

export class SinglyLinkedList {
    static MAX_CAPACITY = 100;

    /**
     * @param {number} capacity integer from 1 to MAX_CAPACITY
     * @param {{ uniqueValues?: boolean, addressPrefix?: string }} [options]
     *   uniqueValues: reject a value that is already in the list (the page's rule).
     */
    constructor(capacity, { uniqueValues = false, addressPrefix = "abc" } = {}) {
        assertCapacity(capacity, 1, SinglyLinkedList.MAX_CAPACITY, "Linked list");
        this.capacity = capacity;
        this.uniqueValues = uniqueValues;
        this.addressPrefix = addressPrefix;
        this.head = null;
        this.tail = null;   // kept so append is O(1); deleting the tail still needs a walk
        this.length = 0;
    }

    /* ---------- reads ---------- */

    get size() { return this.length; }
    isEmpty() { return this.length === 0; }
    isFull() { return this.length === this.capacity; }

    /** Walks next-pointers from head. */
    *nodes() {
        for (let node = this.head; node !== null; node = node.next) yield node;
    }

    toArray() { return [...this.nodes()].map((n) => n.value); }
    addresses() { return [...this.nodes()].map((n) => n.address); }

    snapshot() {
        return {
            nodes: [...this.nodes()].map((n) => ({ value: n.value, address: n.address, next: n.next ? n.next.address : null })),
            head: this.head ? this.head.address : null,
            tail: this.tail ? this.tail.address : null,
            size: this.length,
            capacity: this.capacity
        };
    }

    /** Returns { index, value, address } for the node at `address`, or null. Does not record steps. */
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
     * Checks the pointer structure: the walk from head ends at null after exactly
     * `length` nodes, ends at `tail`, has no cycle and no repeated address.
     * Returns null when sound, otherwise a description of the first problem.
     */
    integrityError() {
        const seen = new Set();
        const addresses = new Set();
        let count = 0;
        let last = null;
        for (let node = this.head; node !== null; node = node.next) {
            if (seen.has(node)) return `cycle detected at ${node.address}`;
            if (addresses.has(node.address)) return `address ${node.address} used twice`;
            seen.add(node);
            addresses.add(node.address);
            last = node;
            if (++count > this.length) return `walk is longer than length ${this.length}`;
        }
        if (count !== this.length) return `walk found ${count} nodes but length is ${this.length}`;
        if (last !== this.tail) return "tail does not point at the last node";
        if (this.length === 0 && (this.head !== null || this.tail !== null)) return "empty list must have head = tail = null";
        return null;
    }

    /* ---------- inserts ---------- */

    append(value) { return this.insertAt(this.length, value); }
    prepend(value) { return this.insertAt(0, value); }

    insertAt(index, value) {
        assertValue(value);
        assertIndexType(index);
        const rejected = this.#rejectInsert(index, value);
        if (rejected) return rejected;

        const node = new ListNode(value, this.#freeAddress());
        const steps = [this.#step("create", [node.address],
            `Create a node for ${value} at address ${node.address}. Its next pointer starts as NULL.`)];

        if (index === 0) {
            const oldHead = this.head;
            const message = oldHead
                ? `Point the new node's next at the old head ${oldHead.address}, then move head to ${node.address}. No other node moves: O(1).`
                : `The list was empty, so ${node.address} becomes both head and tail.`;
            node.next = oldHead;
            this.head = node;
            if (!oldHead) this.tail = node;
            this.length++;
            steps.push(this.#step("link", [node.address], message));
            return ok(node.address, steps);
        }

        if (index === this.length) {
            const oldTail = this.tail;
            const message = `Point the old tail ${oldTail.address}'s next at ${node.address}, then move tail to it. ` +
                "Keeping a tail pointer makes this O(1).";
            oldTail.next = node;
            this.tail = node;
            this.length++;
            steps.push(this.#step("link", [oldTail.address, node.address], message));
            return ok(node.address, steps);
        }

        const prev = this.#walkTo(index - 1, steps, `to find the node before index ${index}`);
        const after = prev.next;
        const message = `Point ${node.address}'s next at ${after.address}, then point ${prev.address}'s next at ${node.address}. ` +
            `The new node now sits at index ${index}.`;
        node.next = after;
        prev.next = node;
        this.length++;
        steps.push(this.#step("link", [prev.address, node.address, after.address], message));
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
        if (index === 0) {
            const old = this.head;
            const message = old.next
                ? `Move head from ${old.address} to its next node ${old.next.address}. ${old.address} (${old.value}) is unlinked: O(1).`
                : `${old.address} (${old.value}) was the only node, so head and tail become NULL.`;
            this.head = old.next;
            if (this.tail === old) this.tail = null;
            old.next = null;
            this.length--;
            steps.push(this.#step("unlink", [old.address], message));
            return ok(old.value, steps);
        }
        const prev = this.#walkTo(index - 1, steps,
            index === this.length - 1
                ? "to find the node before the tail (a singly linked list cannot step backwards, so this is O(n))"
                : `to find the node before index ${index}`);
        const target = prev.next;
        const message = target.next
            ? `Point ${prev.address}'s next past ${target.address} to ${target.next.address}. ${target.address} (${target.value}) is unlinked.`
            : `Point ${prev.address}'s next at NULL and make it the new tail. ${target.address} (${target.value}) is unlinked.`;
        prev.next = target.next;
        if (this.tail === target) this.tail = prev;
        target.next = null;
        this.length--;
        steps.push(this.#step("unlink", [prev.address, target.address], message));
        return ok(target.value, steps);
    }

    clear() {
        const count = this.length;
        // Break every link so no node keeps the old chain reachable.
        let node = this.head;
        while (node) { const next = node.next; node.next = null; node = next; }
        this.head = null;
        this.tail = null;
        this.length = 0;
        return ok(count, [this.#step("clear", [], `Removed ${count} node${count === 1 ? "" : "s"}. head = tail = NULL.`)]);
    }

    /* ---------- search & edit ---------- */

    /** Walks from head comparing addresses. ok({ index, value, address }) or a failure. */
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

    /** Changes the value stored in an existing node. The node and its links stay the same. */
    updateValue(address, value) {
        assertValue(value);
        const node = this.#nodeAt(address);
        if (!node) return this.#fail("not-found", `No node has address ${address}.`);
        if (this.uniqueValues && value !== node.value && this.hasValue(value)) {
            return this.#fail("duplicate", `Value ${value} is already in the list.`);
        }
        const message = `Node ${address}: value ${node.value} → ${value}. Its address and next pointer do not change.`;
        node.value = value;
        return ok(address, [this.#step("update", [address], message)]);
    }

    /**
     * Swaps the node at `address` for a brand-new node (new value, new address) in the
     * same position: the new node takes over the old node's next, and whoever pointed
     * at the old node (head or the previous node) now points at the new one.
     */
    replaceNode(address, value, newAddress) {
        assertValue(value);
        if (typeof newAddress !== "string" || !ADDRESS_PATTERN.test(newAddress)) {
            return this.#fail("bad-address", "New address must be 1–12 letters, digits, '-' or '_' (e.g. xyz001).");
        }
        const steps = [];
        let prev = null;
        let node = this.head;
        while (node && node.address !== address) { prev = node; node = node.next; }
        if (!node) return this.#fail("not-found", `No node has address ${address}.`);
        if (newAddress !== address && this.#nodeAt(newAddress)) {
            return this.#fail("address-taken", `Address ${newAddress} is already used by another node.`);
        }
        if (this.uniqueValues && value !== node.value && this.hasValue(value)) {
            return this.#fail("duplicate", `Value ${value} is already in the list.`);
        }
        const fresh = new ListNode(value, newAddress, node.next);
        const message = `New node ${newAddress} (${value}) takes ${address}'s next (${node.next ? node.next.address : "NULL"}), and ` +
            (prev ? `${prev.address}'s next` : "head") + ` now points at ${newAddress}. ${address} (${node.value}) is unlinked.`;
        if (prev) prev.next = fresh; else this.head = fresh;
        if (this.tail === node) this.tail = fresh;
        node.next = null;
        steps.push(this.#step("replace", [newAddress], message));
        return ok(newAddress, steps);
    }

    /* ---------- reorder ---------- */

    /** In-place reversal with three pointers (prev, curr, next). O(n) time, O(1) extra space. */
    reverse() {
        if (this.length < 2) {
            return ok(this.length, [this.#step("noop", [], "A list with fewer than 2 nodes is already its own reverse.")]);
        }
        const steps = [];
        let prev = null;
        let curr = this.head;
        const oldHead = this.head;
        while (curr) {
            const next = curr.next;
            const message = `Point ${curr.address}'s next back at ${prev ? prev.address : "NULL"} ` +
                `(it pointed at ${next ? next.address : "NULL"}).`;
            curr.next = prev;
            prev = curr;
            curr = next;
            // Mid-reversal there are two chains: the reversed part (from prev) and the rest (from curr).
            steps.push({ type: "relink", addresses: [prev.address], message, snapshot: {
                phase: "reversing",
                reversed: chainAddresses(prev),
                remaining: chainAddresses(curr),
                size: this.length,
                capacity: this.capacity
            } });
        }
        this.tail = oldHead;
        this.head = prev;
        steps.push(this.#step("done", [this.head.address, this.tail.address],
            `head is now ${this.head.address} and tail is ${this.tail.address}. The list is reversed.`));
        return ok(this.length, steps);
    }

    /**
     * Ascending insertion sort that moves nodes by re-linking them (values never move
     * between nodes, so every value keeps its address). Stable. O(n²) comparisons.
     */
    sort() {
        if (this.length < 2) {
            return ok(0, [this.#step("noop", [], "A list with fewer than 2 nodes is already sorted.")]);
        }
        let comparisons = 0;
        let sortedHead = null;
        let node = this.head;
        while (node) {
            const next = node.next;            // detach `node` from the unsorted part
            let goesFirst = sortedHead === null;
            if (!goesFirst) {
                comparisons++;
                goesFirst = node.value < sortedHead.value;
            }
            if (goesFirst) {
                node.next = sortedHead;
                sortedHead = node;
            } else {
                // Walk to the last sorted node whose value is <= node.value (keeps equal values in order).
                let walk = sortedHead;
                while (walk.next) {
                    comparisons++;
                    if (walk.next.value > node.value) break;
                    walk = walk.next;
                }
                node.next = walk.next;
                walk.next = node;
            }
            node = next;
        }
        this.head = sortedHead;
        let last = sortedHead;
        while (last.next) last = last.next;
        this.tail = last;
        return ok(comparisons, [this.#step("done", [],
            `Sorted ascending by re-linking nodes (insertion sort, ${comparisons} comparisons). ` +
            "Each value kept its node and address; only next pointers changed.")]);
    }

    /* ---------- internals ---------- */

    #rejectInsert(index, value) {
        if (this.isFull()) {
            return this.#fail("overflow", `The list is full (${this.capacity} of ${this.capacity} nodes), so ${value} cannot be added.`);
        }
        if (index < 0 || index > this.length) {
            return this.#fail("bad-index", `Index ${index} is out of range. Use 0 to ${this.length}.`);
        }
        if (this.uniqueValues && this.hasValue(value)) {
            return this.#fail("duplicate", `Value ${value} is already in the list.`);
        }
        return null;
    }

    /** Lowest free address prefix001, prefix002, … (one always exists below capacity + 1 when not full). */
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

    /** Follows next from head `index` times, recording a visit step per node. */
    #walkTo(index, steps, why) {
        let node = this.head;
        steps.push(this.#step("visit", [node.address], `Start at head ${node.address} ${why}.`));
        for (let i = 0; i < index; i++) {
            node = node.next;
            steps.push(this.#step("visit", [node.address], `Follow next to ${node.address} (index ${i + 1}).`));
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

function chainAddresses(node) {
    const out = [];
    for (; node !== null; node = node.next) out.push(node.address);
    return out;
}

function assertIndexType(index) {
    if (!Number.isInteger(index)) throw new TypeError(`Index must be an integer (got ${index})`);
}
