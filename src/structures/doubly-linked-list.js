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
 * { type, operation, line, lines?, addresses, message, cursors, changes, snapshot }
 * (line is 1-based in DOUBLY_LINKED_LIST_INFO.pseudocode[operation]; changes are the
 * pointer writes { address, field: "prev" | "next" | "head" | "tail" | "value", from, to };
 * snapshot.detached lists real nodes not reachable from head), messages built before the change.
 */

export class DNode {
    constructor(value, address) {
        this.value = value;
        this.address = address;
        this.prev = null;
        this.next = null;
    }
}

const addr = (node) => (node ? node.address : null);
const view = (n) => ({ value: n.value, address: n.address, prev: addr(n.prev), next: addr(n.next) });

export class DoublyLinkedList {
    static MAX_CAPACITY = 100;

    #op = "";

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

    /** O(1) reads recorded as one step: "size" | "isEmpty" | "isFull" | "head" | "tail". */
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
            message = node ? `${name} points at ${node.address} (value ${node.value}). Reading it is O(1).` : `${name} is NULL: the list is empty.`;
        } else throw new RangeError(`Unknown query ${name}`);
        const type = name === "head" || name === "tail" ? "peek" : "check";
        return ok(value, [this.#step(type, node ? [node.address] : [], message, { line: 1, cursors: node ? { [name]: node.address } : {} })]);
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

        const node = new DNode(value, this.#freeAddress());
        const steps = [this.#step("create", [node.address],
            `Create a node for ${value} at address ${node.address}. Its prev and next start as NULL.`,
            { line: 2, cursors: { node: node.address }, detached: [node] })];

        if (this.length === 0) {
            const changes = [change(null, "head", null, node.address), change(null, "tail", null, node.address)];
            this.head = node;
            this.tail = node;
            this.length++;
            steps.push(this.#step("link", [node.address], `The list was empty, so ${node.address} becomes both head and tail.`,
                { line: 3, cursors: { node: node.address }, changes }));
            return ok(node.address, steps);
        }
        if (index === 0) {
            const old = this.head;
            const message = `Point ${node.address}.next at the old head ${old.address} and ${old.address}.prev back at ${node.address}, ` +
                `then move head to ${node.address}. O(1).`;
            const changes = [change(node, "next", null, old.address), change(old, "prev", null, node.address), change(null, "head", old.address, node.address)];
            node.next = old;
            old.prev = node;
            this.head = node;
            this.length++;
            steps.push(this.#step("link", [node.address, old.address], message, { line: 4, cursors: { node: node.address }, changes }));
            return ok(node.address, steps);
        }
        if (index === this.length) {
            const old = this.tail;
            const message = `Point the old tail ${old.address}.next at ${node.address} and ${node.address}.prev back at ${old.address}, ` +
                `then move tail to ${node.address}. O(1).`;
            const changes = [change(old, "next", null, node.address), change(node, "prev", null, old.address), change(null, "tail", old.address, node.address)];
            old.next = node;
            node.prev = old;
            this.tail = node;
            this.length++;
            steps.push(this.#step("link", [old.address, node.address], message, { line: 5, cursors: { node: node.address }, changes }));
            return ok(node.address, steps);
        }

        // New node goes between `before` (index - 1) and `after` (index).
        const after = this.#walkTo(index, steps, `to find the node now at index ${index}`,
            { line: 6, detached: [node], extra: { node: node.address } });
        const before = after.prev;
        const message = `Link ${node.address} between ${before.address} and ${after.address}: ` +
            `${node.address}.prev = ${before.address}, ${node.address}.next = ${after.address}, ` +
            `${before.address}.next = ${node.address}, ${after.address}.prev = ${node.address} (four pointers).`;
        const changes = [
            change(node, "prev", null, before.address), change(node, "next", null, after.address),
            change(before, "next", after.address, node.address), change(after, "prev", before.address, node.address)
        ];
        node.prev = before;
        node.next = after;
        before.next = node;
        after.prev = node;
        this.length++;
        steps.push(this.#step("link", [before.address, node.address, after.address], message,
            { line: 7, lines: [7, 8, 9], cursors: { before: before.address, node: node.address, after: after.address }, changes }));
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
        else target = this.#walkTo(index, steps, `to find the node at index ${index}`, { line: 2 });

        const { prev, next } = target;
        let message;
        if (!prev && !next) message = `${target.address} (${target.value}) was the only node, so head and tail become NULL.`;
        else if (!prev) message = `Move head to ${next.address} and set ${next.address}.prev = NULL. ${target.address} (${target.value}) is unlinked: O(1).`;
        else if (!next) message = `Move tail back to ${prev.address} (tail.prev) and set ${prev.address}.next = NULL. ` +
            `${target.address} (${target.value}) is unlinked: O(1), no walk from head needed.`;
        else message = `Point ${prev.address}.next at ${next.address} and ${next.address}.prev at ${prev.address}. ` +
            `${target.address} (${target.value}) is unlinked.`;

        const changes = [
            prev ? change(prev, "next", target.address, addr(next)) : change(null, "head", target.address, addr(next)),
            next ? change(next, "prev", target.address, addr(prev)) : change(null, "tail", target.address, addr(prev)),
            ...(prev ? [change(target, "prev", prev.address, null)] : []),
            ...(next ? [change(target, "next", next.address, null)] : [])
        ];
        if (prev) prev.next = next; else this.head = next;
        if (next) next.prev = prev; else this.tail = prev;
        target.prev = null;
        target.next = null;
        this.length--;
        steps.push(this.#step("unlink", [prev?.address, target.address, next?.address].filter(Boolean), message,
            { line: 3, lines: [3, 4, 5], cursors: { target: target.address }, changes, detached: [target] }));
        return ok(target.value, steps);
    }

    clear() {
        this.#op = "clear";
        const count = this.length;
        const changes = this.head ? [change(null, "head", this.head.address, null), change(null, "tail", this.tail.address, null)] : [];
        let node = this.head;
        while (node) { const next = node.next; node.prev = null; node.next = null; node = next; }
        this.head = null;
        this.tail = null;
        this.length = 0;
        return ok(count, [this.#step("clear", [], `Removed ${count} node${count === 1 ? "" : "s"}. head = tail = NULL.`, { line: 1, changes })]);
    }

    /* ---------- search & edit ---------- */

    find(address) {
        this.#op = "find";
        const steps = [];
        let index = 0;
        for (const node of this.nodes()) {
            const hit = node.address === address;
            steps.push(this.#step("visit", [node.address],
                `Index ${index}: address ${node.address} ${hit ? "matches" : `is not ${address}`}.`,
                { line: 3, cursors: { curr: node.address } }));
            if (hit) { steps.at(-1).found = true; return ok({ index, value: node.value, address }, steps); }
            index++;
        }
        return fail(`Address ${address} is not in the list (checked all ${this.length} node${this.length === 1 ? "" : "s"}).`,
            [...steps, this.#step("not-found", [], `Reached NULL without finding ${address}.`, { line: 5 })]);
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

    /** Swaps a brand-new node (new value and address) into the old node's position, fixing both neighbours. */
    replaceNode(address, value, newAddress) {
        assertValue(value);
        this.#op = "replace";
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
        const steps = [];
        this.#walkToAddress(address, steps);
        const fresh = new DNode(value, newAddress);
        steps.push(this.#step("create", [newAddress],
            `Create node ${newAddress} (${value}). Its prev and next start as NULL; nothing points at it yet.`,
            { line: 4, cursors: { curr: address }, detached: [fresh] }));
        const { prev, next } = node;
        const message = `New node ${newAddress} (${value}) takes ${address}'s place: ` +
            `${prev ? `${prev.address}.next` : "head"} and ${next ? `${next.address}.prev` : "tail"} now point at ${newAddress}. ` +
            `${address} (${node.value}) is unlinked.`;
        const changes = [
            ...(prev ? [change(fresh, "prev", null, prev.address)] : []),
            ...(next ? [change(fresh, "next", null, next.address)] : []),
            prev ? change(prev, "next", address, newAddress) : change(null, "head", address, newAddress),
            next ? change(next, "prev", address, newAddress) : change(null, "tail", address, newAddress),
            ...(prev ? [change(node, "prev", prev.address, null)] : []),
            ...(next ? [change(node, "next", next.address, null)] : [])
        ];
        fresh.prev = prev;
        fresh.next = next;
        if (prev) prev.next = fresh; else this.head = fresh;
        if (next) next.prev = fresh; else this.tail = fresh;
        node.prev = null;
        node.next = null;
        steps.push(this.#step("replace", [newAddress], message, { line: 5, lines: [5, 6, 7], changes, detached: [node] }));
        return ok(newAddress, steps);
    }

    /* ---------- reorder ---------- */

    /** Swap prev and next on every node, then swap head and tail. O(n), no extra list. */
    reverse() {
        this.#op = "reverse";
        if (this.length < 2) {
            return ok(this.length, [this.#step("noop", [], "A list with fewer than 2 nodes is already its own reverse.", { line: 1 })]);
        }
        const steps = [];
        const swapped = [];
        const order = [...this.nodes()];
        const pending = this.addresses();
        for (let node = this.head; node !== null; node = node.prev) { // after the swap, the old next is in .prev
            const message = `Swap ${node.address}'s pointers: prev ${node.prev ? node.prev.address : "NULL"} ⇄ next ${node.next ? node.next.address : "NULL"}.`;
            const changes = [change(node, "prev", addr(node.prev), addr(node.next)), change(node, "next", addr(node.next), addr(node.prev))];
            [node.prev, node.next] = [node.next, node.prev];
            swapped.push(pending.shift());
            // Mid-reversal the chain is half-swapped, so the snapshot lists which nodes are done.
            steps.push({ type: "swap-pointers", operation: "reverse", line: 4, lines: [4, 5], addresses: [node.address], message,
                cursors: { curr: node.address }, changes, snapshot: {
                    phase: "reversing", swapped: swapped.slice(), remaining: pending.slice(),
                    nodes: order.map(view), head: addr(this.head), tail: addr(this.tail),
                    size: this.length, capacity: this.capacity
                } });
        }
        const changes = [change(null, "head", addr(this.head), addr(this.tail)), change(null, "tail", addr(this.tail), addr(this.head))];
        [this.head, this.tail] = [this.tail, this.head];
        steps.push(this.#step("done", [this.head.address, this.tail.address],
            `Swap head and tail: head is now ${this.head.address}, tail is ${this.tail.address}. The list is reversed.`, { line: 6, changes }));
        return ok(this.length, steps);
    }

    /**
     * Stable ascending insertion sort that re-links nodes (values keep their nodes and addresses).
     * Records a step per node taken, per comparison and per re-link.
     */
    sort() {
        this.#op = "sort";
        if (this.length < 2) {
            return ok(0, [this.#step("noop", [], "A list with fewer than 2 nodes is already sorted.", { line: 1 })]);
        }
        const steps = [];
        const s = { head: null, tail: null };
        const comparisons = sortByRelinking(this.head, s, (type, addresses, message, line, cursors, rest, detached, changes) => {
            steps.push({ type, operation: "sort", line, addresses, message, cursors, changes,
                snapshot: sortingSnapshot(s.head, rest, detached, addr(this.head), addr(this.tail), this.length, this.capacity) });
        }, 3);
        const changes = [change(null, "head", addr(this.head), s.head.address), change(null, "tail", addr(this.tail), s.tail.address)];
        this.head = s.head;
        this.tail = s.tail;
        steps.push(this.#step("done", [],
            `Sorted ascending by re-linking nodes (insertion sort walking back from the tail, ${comparisons} comparisons). ` +
            "Each value kept its node and address; only prev/next pointers changed.", { line: 10, changes }));
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

    /** Walks to `index` from the nearer end, recording a visit step per node. */
    #walkTo(index, steps, why, { line, detached = [], extra = {} }) {
        const visit = (node, message) => steps.push(this.#step("visit", [node.address], message,
            { line, cursors: { ...extra, curr: node.address }, detached }));
        const fromTail = index > (this.length - 1) / 2;
        if (!fromTail) {
            let node = this.head;
            visit(node, `Start at head ${node.address} ${why} (index ${index} is nearer the head).`);
            for (let i = 0; i < index; i++) {
                node = node.next;
                visit(node, `Follow next to ${node.address} (index ${i + 1}).`);
            }
            return node;
        }
        let node = this.tail;
        let i = this.length - 1;
        visit(node, `Start at tail ${node.address} ${why} (index ${index} is nearer the tail, and prev lets us walk backwards).`);
        while (i > index) {
            node = node.prev;
            i--;
            visit(node, `Follow prev to ${node.address} (index ${i}).`);
        }
        return node;
    }

    /** Follows next from head until `address` (lines 2 and 3 of update/replace). */
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

    #step(type, addresses, message, { line, lines, cursors = {}, changes = [], detached = [] } = {}) {
        const snapshot = this.snapshot();
        if (detached.length) snapshot.detached = detached.map(view);
        return { type, operation: this.#op, line, ...(lines ? { lines } : {}), addresses, message, cursors, changes, snapshot };
    }

    #fail(type, error) {
        return fail(error, [this.#step(type, [], error, { line: 1 })]);
    }
}

/**
 * Shared by the doubly and circular lists: stable insertion sort on a NULL-terminated
 * prev/next chain starting at `first`. Fills sorted.head / sorted.tail, calls
 * record(type, addresses, message, line, cursors, rest, detached, changes) for every
 * step, and returns the number of comparisons. `base` is the pseudocode line of
 * "while node ≠ NULL" (the next five lines follow the DLL pseudocode layout).
 */
export function sortByRelinking(first, sorted, record, base) {
    let comparisons = 0;
    let node = first;
    while (node) {
        const next = node.next;
        const cursors = (more = {}) => ({ node: node.address, ...(next ? { next: next.address } : {}),
            ...(sorted.tail ? { sortedTail: sorted.tail.address } : {}), ...more });
        const detachChanges = [
            ...(node.prev ? [change(node, "prev", node.prev.address, null)] : []),
            ...(node.next ? [change(node, "next", node.next.address, null)] : [])
        ];
        node.prev = null;
        node.next = null;
        record("pick", [node.address], `Take ${node.address} (${node.value}) off the unsorted part (next = ${addr(next) ?? "NULL"}) and clear its prev and next.`,
            base + 1, cursors(), next, [node], detachChanges);
        if (sorted.head === null) {
            sorted.head = sorted.tail = node;
            record("relink", [node.address], `The sorted part is empty, so ${node.address} starts it (sortedHead = sortedTail = ${node.address}).`,
                base + 4, cursors(), next, [], []);
            node = next;
            continue;
        }
        // Walk back from the sorted tail to the last node with value <= node.value (keeps equal values in order).
        let walk = sorted.tail;
        record("visit", [walk.address], `walk ← sortedTail ${walk.address}.`, base + 2, cursors({ walk: walk.address }), next, [node], []);
        while (walk) {
            comparisons++;
            const stop = walk.value <= node.value;
            record("compare", [walk.address, node.address],
                `Compare ${walk.address} (${walk.value}) with ${node.value}: ` +
                (stop ? `${walk.value} ≤ ${node.value}, so ${node.address} goes after ${walk.address}.`
                    : `${walk.value} > ${node.value}, so step back${walk.prev ? ` to ${walk.prev.address}` : " to NULL"}.`),
                base + 3, cursors({ walk: walk.address }), next, [node], []);
            if (stop) break;
            walk = walk.prev;
        }
        if (walk === null) {           // smallest so far: new sorted head
            const old = sorted.head;
            const changes = [change(node, "next", null, old.address), change(old, "prev", null, node.address)];
            node.next = old;
            old.prev = node;
            sorted.head = node;
            record("relink", [node.address, old.address],
                `walk reached NULL: point ${node.address}.next at ${old.address} and ${old.address}.prev back at ${node.address}. ${node.address} is the new sorted head.`,
                base + 4, cursors(), next, [], changes);
        } else {                       // insert after `walk`
            const after = walk.next;
            const changes = [
                change(node, "prev", null, walk.address), change(node, "next", null, addr(after)),
                ...(after ? [change(after, "prev", walk.address, node.address)] : []),
                change(walk, "next", addr(after), node.address)
            ];
            node.prev = walk;
            node.next = after;
            if (after) after.prev = node; else sorted.tail = node;
            walk.next = node;
            record("relink", [walk.address, node.address, ...(after ? [after.address] : [])],
                `Link ${node.address} after ${walk.address}` + (after ? ` and before ${after.address} (four pointers).` : `: it is the new sorted tail.`),
                base + 5, cursors({ walk: walk.address }), next, [], changes);
        }
        node = next;
    }
    return comparisons;
}

/** Mid-sort snapshot: the sorted chain, then the unsorted chain from `rest`, plus any detached node. */
export function sortingSnapshot(sortedHead, rest, detached, head, tail, size, capacity) {
    const sortedNodes = [];
    for (let n = sortedHead; n; n = n.next) sortedNodes.push(n);
    const restNodes = [];
    for (let n = rest; n; n = n.next) restNodes.push(n);
    const snap = {
        phase: "sorting",
        sorted: sortedNodes.map((n) => n.address),
        remaining: restNodes.map((n) => n.address),
        nodes: [...sortedNodes, ...restNodes].map(view),
        head, tail, size, capacity
    };
    if (detached.length) snap.detached = detached.map(view);
    return snap;
}

/** Pseudocode and costs shown by the page. Each step's `line` is 1-based in pseudocode[operation]. */
export const DOUBLY_LINKED_LIST_INFO = Object.freeze({
    name: "Doubly Linked List",
    operations: Object.freeze({
        insertAt: { complexity: "O(1) at either end, O(min(i, n − i)) in the middle", description: "append = insertAt(size), prepend = insertAt(0)." },
        deleteAt: { complexity: "O(1) at either end, O(min(i, n − i)) in the middle", description: "tail.prev makes deleting the tail O(1)." },
        find: { complexity: "O(n)", description: "Walk next pointers from head." },
        reverse: { complexity: "O(n)", description: "Swap prev and next on every node, then swap head and tail." },
        sort: { complexity: "O(n²)", description: "Insertion sort walking back from the sorted tail." },
    }),
    pseudocode: Object.freeze({
        insertAt: Object.freeze([
            "if full, i out of range or x is a duplicate: stop",
            "node ← new Node(x)   // prev = next = NULL",
            "if size = 0: head ← tail ← node; stop",
            "if i = 0: node.next ← head; head.prev ← node; head ← node",
            "if i = size: tail.next ← node; node.prev ← tail; tail ← node",
            "curr ← walk to index i from the nearer end",
            "before ← curr.prev",
            "node.prev ← before; node.next ← curr",
            "before.next ← node; curr.prev ← node",
        ]),
        deleteAt: Object.freeze([
            "if empty or i out of range: stop",
            "target ← head (i = 0), tail (i = size − 1), else walk from the nearer end",
            "if target.prev: target.prev.next ← target.next  else head ← target.next",
            "if target.next: target.next.prev ← target.prev  else tail ← target.prev",
            "target.prev ← NULL; target.next ← NULL",
        ]),
        clear: Object.freeze(["head ← NULL; tail ← NULL; size ← 0"]),
        find: Object.freeze([
            "curr ← head; i ← 0",
            "while curr ≠ NULL:",
            "    if curr.address = a: return i",
            "    curr ← curr.next; i ← i + 1",
            "return not found",
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
            "fresh ← new Node(x, b)",
            "fresh.prev ← curr.prev; fresh.next ← curr.next",
            "(curr.prev.next or head) ← fresh; (curr.next.prev or tail) ← fresh",
            "curr.prev ← NULL; curr.next ← NULL",
        ]),
        reverse: Object.freeze([
            "if size < 2: stop (already reversed)",
            "curr ← head",
            "while curr ≠ NULL:",
            "    swap(curr.prev, curr.next)",
            "    curr ← curr.prev   // the old next",
            "swap(head, tail)",
        ]),
        sort: Object.freeze([
            "if size < 2: stop (already sorted)",
            "sortedHead ← sortedTail ← NULL; node ← head",
            "while node ≠ NULL:",
            "  next ← node.next; node.prev ← node.next ← NULL",
            "  walk ← sortedTail",
            "  while walk ≠ NULL and walk.value > node.value: walk ← walk.prev",
            "  if walk = NULL: link node before sortedHead (or start the sorted part)",
            "  else: link node after walk (it may become sortedTail)",
            "  node ← next",
            "head ← sortedHead; tail ← sortedTail",
        ]),
        size: Object.freeze(["return size"]),
        isEmpty: Object.freeze(["return size = 0"]),
        isFull: Object.freeze(["return size = capacity"]),
        head: Object.freeze(["return head"]),
        tail: Object.freeze(["return tail"]),
    }),
});

function change(node, field, from, to) {
    return { address: node ? node.address : null, field, from, to };
}

function assertIndexType(index) {
    if (!Number.isInteger(index)) throw new TypeError(`Index must be an integer (got ${index})`);
}
