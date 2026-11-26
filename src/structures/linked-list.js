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
 * A step is
 *   { type, operation, line, lines?, addresses, message, cursors, changes, snapshot }
 * - operation / line: 1-based line in LINKED_LIST_INFO.pseudocode[operation]; `lines`
 *   lists every line the step covers when one recorded frame runs several at once.
 * - addresses: the nodes the step is about.
 * - cursors: named walk pointers at this moment, e.g. { prev: "abc002", curr: "abc003" }.
 * - changes: the pointer writes this step made, in order:
 *   { address, field: "next" | "head" | "tail" | "value", from, to } (address is null for head/tail).
 * - snapshot: plain copy of the state after the step. `nodes` is in display order
 *   (head → tail when the list is whole); `detached` lists real nodes that exist but
 *   are not reachable from head (a node just created, or one just unlinked). Mid-reverse
 *   and mid-sort snapshots also carry `phase` and the chains they are building.
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

const addr = (node) => (node ? node.address : null);
const view = (n) => ({ value: n.value, address: n.address, next: addr(n.next) });

export class SinglyLinkedList {
    static MAX_CAPACITY = 100;

    #op = "";

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
            nodes: [...this.nodes()].map(view),
            head: addr(this.head),
            tail: addr(this.tail),
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

    /**
     * O(1) reads recorded as one step so the page can show them on the player.
     * name: "size" | "isEmpty" | "isFull" | "head" | "tail".
     * head/tail return { address, value } or null.
     */
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
        const rejected = this.#rejectInsert(index, value);
        if (rejected) return rejected;

        const node = new ListNode(value, this.#freeAddress());
        const steps = [this.#step("create", [node.address],
            `Create a node for ${value} at address ${node.address}. Its next pointer starts as NULL.`,
            { line: 2, cursors: { node: node.address }, detached: [node] })];

        if (index === 0) {
            const oldHead = this.head;
            const message = oldHead
                ? `Point the new node's next at the old head ${oldHead.address}, then move head to ${node.address}. No other node moves: O(1).`
                : `The list was empty, so ${node.address} becomes both head and tail.`;
            const changes = [
                change(node, "next", null, addr(oldHead)),
                change(null, "head", addr(oldHead), node.address),
                ...(oldHead ? [] : [change(null, "tail", null, node.address)])
            ];
            node.next = oldHead;
            this.head = node;
            if (!oldHead) this.tail = node;
            this.length++;
            steps.push(this.#step("link", [node.address], message, { line: 3, cursors: { node: node.address }, changes }));
            return ok(node.address, steps);
        }

        if (index === this.length) {
            const oldTail = this.tail;
            const message = `Point the old tail ${oldTail.address}'s next at ${node.address}, then move tail to it. ` +
                "Keeping a tail pointer makes this O(1).";
            const changes = [change(oldTail, "next", null, node.address), change(null, "tail", oldTail.address, node.address)];
            oldTail.next = node;
            this.tail = node;
            this.length++;
            steps.push(this.#step("link", [oldTail.address, node.address], message, { line: 4, cursors: { node: node.address }, changes }));
            return ok(node.address, steps);
        }

        const prev = this.#walkTo(index - 1, steps, `to find the node before index ${index}`,
            { cursor: "prev", start: 5, follow: 6, detached: [node], extra: { node: node.address } });
        const after = prev.next;
        const message = `Point ${node.address}'s next at ${after.address}, then point ${prev.address}'s next at ${node.address}. ` +
            `The new node now sits at index ${index}.`;
        const changes = [change(node, "next", null, after.address), change(prev, "next", after.address, node.address)];
        node.next = after;
        prev.next = node;
        this.length++;
        steps.push(this.#step("link", [prev.address, node.address, after.address], message,
            { line: 7, cursors: { prev: prev.address, node: node.address }, changes }));
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
        if (index === 0) {
            const old = this.head;
            const message = old.next
                ? `Move head from ${old.address} to its next node ${old.next.address}. ${old.address} (${old.value}) is unlinked: O(1).`
                : `${old.address} (${old.value}) was the only node, so head and tail become NULL.`;
            const changes = [
                change(null, "head", old.address, addr(old.next)),
                ...(this.tail === old ? [change(null, "tail", old.address, null)] : []),
                ...(old.next ? [change(old, "next", old.next.address, null)] : [])
            ];
            this.head = old.next;
            if (this.tail === old) this.tail = null;
            old.next = null;
            this.length--;
            steps.push(this.#step("unlink", [old.address], message, { line: 2, changes, detached: [old] }));
            return ok(old.value, steps);
        }
        const prev = this.#walkTo(index - 1, steps,
            index === this.length - 1
                ? "to find the node before the tail (a singly linked list cannot step backwards, so this is O(n))"
                : `to find the node before index ${index}`,
            { cursor: "prev", start: 3, follow: 4 });
        const target = prev.next;
        const wasTail = this.tail === target;
        const message = target.next
            ? `Point ${prev.address}'s next past ${target.address} to ${target.next.address}. ${target.address} (${target.value}) is unlinked.`
            : `Point ${prev.address}'s next at NULL and make it the new tail. ${target.address} (${target.value}) is unlinked.`;
        const changes = [
            change(prev, "next", target.address, addr(target.next)),
            ...(wasTail ? [change(null, "tail", target.address, prev.address)] : []),
            ...(target.next ? [change(target, "next", target.next.address, null)] : [])
        ];
        prev.next = target.next;
        if (wasTail) this.tail = prev;
        target.next = null;
        this.length--;
        steps.push(this.#step("unlink", [prev.address, target.address], message,
            { line: 5, lines: wasTail ? [5, 6] : [5], cursors: { prev: prev.address }, changes, detached: [target] }));
        return ok(target.value, steps);
    }

    clear() {
        this.#op = "clear";
        const count = this.length;
        const changes = this.head ? [change(null, "head", this.head.address, null), change(null, "tail", this.tail.address, null)] : [];
        // Break every link so no node keeps the old chain reachable.
        let node = this.head;
        while (node) { const next = node.next; node.next = null; node = next; }
        this.head = null;
        this.tail = null;
        this.length = 0;
        return ok(count, [this.#step("clear", [], `Removed ${count} node${count === 1 ? "" : "s"}. head = tail = NULL.`, { line: 1, changes })]);
    }

    /* ---------- search & edit ---------- */

    /** Walks from head comparing addresses. ok({ index, value, address }) or a failure. */
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

    /** Changes the value stored in an existing node. The node and its links stay the same. */
    updateValue(address, value) {
        assertValue(value);
        this.#op = "update";
        const node = this.#nodeAt(address);
        if (!node) return this.#fail("not-found", `No node has address ${address}.`);
        if (this.uniqueValues && value !== node.value && this.hasValue(value)) {
            return this.#fail("duplicate", `Value ${value} is already in the list.`);
        }
        const steps = [];
        this.#walkToAddress(address, steps, { start: 2, follow: 3 });
        const message = `Node ${address}: value ${node.value} → ${value}. Its address and next pointer do not change.`;
        const changes = [change(node, "value", node.value, value)];
        node.value = value;
        steps.push(this.#step("update", [address], message, { line: 4, cursors: { curr: address }, changes }));
        return ok(address, steps);
    }

    /**
     * Swaps the node at `address` for a brand-new node (new value, new address) in the
     * same position: the new node takes over the old node's next, and whoever pointed
     * at the old node (head or the previous node) now points at the new one.
     */
    replaceNode(address, value, newAddress) {
        assertValue(value);
        this.#op = "replace";
        if (typeof newAddress !== "string" || !ADDRESS_PATTERN.test(newAddress)) {
            return this.#fail("bad-address", "New address must be 1–12 letters, digits, '-' or '_' (e.g. xyz001).");
        }
        if (!this.#nodeAt(address)) return this.#fail("not-found", `No node has address ${address}.`);
        if (newAddress !== address && this.#nodeAt(newAddress)) {
            return this.#fail("address-taken", `Address ${newAddress} is already used by another node.`);
        }
        const target = this.#nodeAt(address);
        if (this.uniqueValues && value !== target.value && this.hasValue(value)) {
            return this.#fail("duplicate", `Value ${value} is already in the list.`);
        }
        const steps = [];
        const { node, prev } = this.#walkToAddress(address, steps, { start: 2, follow: 3, trail: true });
        const fresh = new ListNode(value, newAddress, node.next);
        const cursors = { ...(prev ? { prev: prev.address } : {}), curr: address };
        steps.push(this.#step("create", [newAddress],
            `Create node ${newAddress} (${value}) and copy ${address}'s next into it (${addr(node.next) ?? "NULL"}). Nothing points at it yet.`,
            { line: 4, cursors, detached: [fresh], changes: [change(fresh, "next", null, addr(node.next))] }));
        const message = `New node ${newAddress} (${value}) takes ${address}'s next (${node.next ? node.next.address : "NULL"}), and ` +
            (prev ? `${prev.address}'s next` : "head") + ` now points at ${newAddress}. ${address} (${node.value}) is unlinked.`;
        const changes = [
            prev ? change(prev, "next", address, newAddress) : change(null, "head", address, newAddress),
            ...(this.tail === node ? [change(null, "tail", address, newAddress)] : []),
            ...(node.next ? [change(node, "next", node.next.address, null)] : [])
        ];
        if (prev) prev.next = fresh; else this.head = fresh;
        if (this.tail === node) this.tail = fresh;
        node.next = null;
        steps.push(this.#step("replace", [newAddress], message,
            { line: 5, cursors: prev ? { prev: prev.address } : {}, changes, detached: [node] }));
        return ok(newAddress, steps);
    }

    /* ---------- reorder ---------- */

    /** In-place reversal with three pointers (prev, curr, next). O(n) time, O(1) extra space. */
    reverse() {
        this.#op = "reverse";
        if (this.length < 2) {
            return ok(this.length, [this.#step("noop", [], "A list with fewer than 2 nodes is already its own reverse.", { line: 1 })]);
        }
        const steps = [];
        const order = [...this.nodes()];     // display order stays fixed so each arrow visibly flips
        let prev = null;
        let curr = this.head;
        const oldHead = this.head;
        while (curr) {
            const next = curr.next;
            const message = `Point ${curr.address}'s next back at ${prev ? prev.address : "NULL"} ` +
                `(it pointed at ${next ? next.address : "NULL"}).`;
            const cursors = { ...(prev ? { prev: prev.address } : {}), curr: curr.address, ...(next ? { next: next.address } : {}) };
            const changes = [change(curr, "next", addr(next), addr(prev))];
            curr.next = prev;
            prev = curr;
            curr = next;
            // Mid-reversal there are two chains: the reversed part (from prev) and the rest (from curr).
            steps.push({ type: "relink", operation: "reverse", line: 4, lines: [3, 4, 5], addresses: [prev.address], message, cursors, changes, snapshot: {
                phase: "reversing",
                reversed: chainAddresses(prev),
                remaining: chainAddresses(curr),
                nodes: order.map(view),
                head: addr(this.head),
                tail: addr(this.tail),
                size: this.length,
                capacity: this.capacity
            } });
        }
        const changes = [change(null, "head", oldHead.address, prev.address), change(null, "tail", addr(this.tail), oldHead.address)];
        this.tail = oldHead;
        this.head = prev;
        steps.push(this.#step("done", [this.head.address, this.tail.address],
            `head is now ${this.head.address} and tail is ${this.tail.address}. The list is reversed.`, { line: 6, changes }));
        return ok(this.length, steps);
    }

    /**
     * Ascending insertion sort that moves nodes by re-linking them (values never move
     * between nodes, so every value keeps its address). Stable. O(n²) comparisons.
     * Records a step per node taken, per comparison and per re-link.
     */
    sort() {
        this.#op = "sort";
        if (this.length < 2) {
            return ok(0, [this.#step("noop", [], "A list with fewer than 2 nodes is already sorted.", { line: 1 })]);
        }
        const steps = [];
        let comparisons = 0;
        let sortedHead = null;
        let node = this.head;
        // Mid-sort the list is two chains: sorted (from sortedHead) and unsorted (from `rest`).
        const frame = (type, addresses, message, line, cursors, rest, changes = []) => {
            const sorted = chainAddresses(sortedHead);
            const remaining = chainAddresses(rest);
            const byAddress = new Map();
            for (let n = sortedHead; n; n = n.next) byAddress.set(n.address, n);
            for (let n = rest; n; n = n.next) byAddress.set(n.address, n);
            steps.push({ type, operation: "sort", line, addresses, message, cursors, changes, snapshot: {
                phase: "sorting", sorted, remaining,
                nodes: [...sorted, ...remaining].map((a) => view(byAddress.get(a))),
                head: addr(this.head), tail: addr(this.tail), size: this.length, capacity: this.capacity
            } });
        };
        while (node) {
            const next = node.next;            // detach `node` from the unsorted part
            const base = { node: node.address, ...(next ? { next: next.address } : {}), ...(sortedHead ? { sorted: sortedHead.address } : {}) };
            frame("pick", [node.address], `Take ${node.address} (${node.value}) from the unsorted part and remember next = ${addr(next) ?? "NULL"}.`,
                4, base, node);
            let goesFirst = sortedHead === null;
            if (!goesFirst) {
                comparisons++;
                goesFirst = node.value < sortedHead.value;
                frame("compare", [node.address, sortedHead.address],
                    `Compare ${node.value} with the sorted front ${sortedHead.address} (${sortedHead.value}): ` +
                    (goesFirst ? `${node.value} < ${sortedHead.value}, so it goes first.` : `${node.value} ≥ ${sortedHead.value}, so walk the sorted part.`),
                    5, base, node);
            }
            if (goesFirst) {
                const changes = [change(node, "next", addr(next), addr(sortedHead))];
                const message = sortedHead
                    ? `Point ${node.address}.next at ${sortedHead.address}: ${node.address} is the new front of the sorted part.`
                    : `The sorted part is empty: ${node.address}.next ← NULL and it starts the sorted part.`;
                node.next = sortedHead;
                sortedHead = node;
                frame("relink", [node.address], message, 6, { node: node.address, sorted: node.address, ...(next ? { next: next.address } : {}) }, next, changes);
            } else {
                // Walk to the last sorted node whose value is <= node.value (keeps equal values in order).
                let walk = sortedHead;
                frame("visit", [walk.address], `walk ← sorted front ${walk.address}.`, 8, { ...base, walk: walk.address }, node);
                while (walk.next) {
                    comparisons++;
                    const bigger = walk.next.value > node.value;
                    frame("compare", [walk.next.address, node.address],
                        `walk.next is ${walk.next.address} (${walk.next.value}): ` +
                        (bigger ? `${walk.next.value} > ${node.value}, so stop and insert after ${walk.address}.`
                            : `${walk.next.value} ≤ ${node.value}, so move walk to ${walk.next.address}.`),
                        9, { ...base, walk: walk.address }, node);
                    if (bigger) break;
                    walk = walk.next;
                    frame("visit", [walk.address], `walk ← ${walk.address}.`, 10, { ...base, walk: walk.address }, node);
                }
                const changes = [change(node, "next", addr(next), addr(walk.next)), change(walk, "next", addr(walk.next), node.address)];
                const message = `Point ${node.address}.next at ${addr(walk.next) ?? "NULL"}, then ${walk.address}.next at ${node.address}.`;
                node.next = walk.next;
                walk.next = node;
                frame("relink", [walk.address, node.address], message, 11,
                    { walk: walk.address, node: node.address, sorted: sortedHead.address, ...(next ? { next: next.address } : {}) }, next, changes);
            }
            node = next;
        }
        let last = sortedHead;
        while (last.next) last = last.next;
        const changes = [change(null, "head", addr(this.head), sortedHead.address), change(null, "tail", addr(this.tail), last.address)];
        this.head = sortedHead;
        this.tail = last;
        steps.push(this.#step("done", [],
            `Sorted ascending by re-linking nodes (insertion sort, ${comparisons} comparisons). ` +
            "Each value kept its node and address; only next pointers changed.", { line: 13, changes }));
        return ok(comparisons, steps);
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
    #walkTo(index, steps, why, { cursor, start, follow, detached = [], extra = {} }) {
        let node = this.head;
        steps.push(this.#step("visit", [node.address], `Start at head ${node.address} ${why}.`,
            { line: start, cursors: { ...extra, [cursor]: node.address }, detached }));
        for (let i = 0; i < index; i++) {
            node = node.next;
            steps.push(this.#step("visit", [node.address], `Follow next to ${node.address} (index ${i + 1}).`,
                { line: follow, cursors: { ...extra, [cursor]: node.address }, detached }));
        }
        return node;
    }

    /** Follows next from head until `address`, recording a visit per node. `trail` also tracks prev. */
    #walkToAddress(address, steps, { start, follow, trail = false }) {
        let prev = null;
        let node = this.head;
        const cursors = () => ({ ...(trail && prev ? { prev: prev.address } : {}), curr: node.address });
        steps.push(this.#step("visit", [node.address],
            `Start at head ${node.address}${node.address === address ? `: it is ${address}.` : ` and walk to ${address}.`}`,
            { line: start, cursors: cursors() }));
        while (node.address !== address) {
            prev = node;
            node = node.next;
            steps.push(this.#step("visit", [node.address],
                `Follow next to ${node.address}${node.address === address ? `: found ${address}.` : "."}`, { line: follow, cursors: cursors() }));
        }
        return { node, prev };
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

/** Pseudocode and costs shown by the page. Each step's `line` is 1-based in pseudocode[operation]. */
export const LINKED_LIST_INFO = Object.freeze({
    name: "Singly Linked List",
    operations: Object.freeze({
        insertAt: { complexity: "O(1) at head or tail, O(i) in the middle", description: "append = insertAt(size), prepend = insertAt(0)." },
        deleteAt: { complexity: "O(1) at head, O(i) elsewhere", description: "Deleting the tail walks to the node before it." },
        find: { complexity: "O(n)", description: "Walk next pointers from head." },
        update: { complexity: "O(n)", description: "Walk to the node, change its value." },
        replace: { complexity: "O(n)", description: "Walk to the node, link a new node into its place." },
        reverse: { complexity: "O(n)", description: "Three pointers: prev, curr, next." },
        sort: { complexity: "O(n²)", description: "Insertion sort that re-links nodes." },
    }),
    pseudocode: Object.freeze({
        insertAt: Object.freeze([
            "if full, i out of range or x is a duplicate: stop",
            "node ← new Node(x)   // node.next = NULL",
            "if i = 0: node.next ← head; head ← node (empty: tail ← node)",
            "if i = size: tail.next ← node; tail ← node",
            "prev ← head",
            "repeat i − 1 times: prev ← prev.next",
            "node.next ← prev.next; prev.next ← node",
        ]),
        deleteAt: Object.freeze([
            "if empty or i out of range: stop",
            "if i = 0: head ← head.next (only node: tail ← NULL)",
            "prev ← head",
            "repeat i − 1 times: prev ← prev.next",
            "target ← prev.next; prev.next ← target.next",
            "if target = tail: tail ← prev",
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
            "prev ← NULL; curr ← head",
            "while curr.address ≠ a: prev ← curr; curr ← curr.next",
            "fresh ← new Node(x, b); fresh.next ← curr.next",
            "(prev.next or head) ← fresh; if curr = tail: tail ← fresh; curr.next ← NULL",
        ]),
        reverse: Object.freeze([
            "if size < 2: stop (already reversed)",
            "prev ← NULL; curr ← head",
            "while curr ≠ NULL: next ← curr.next",
            "    curr.next ← prev",
            "    prev ← curr; curr ← next",
            "tail ← head; head ← prev",
        ]),
        sort: Object.freeze([
            "if size < 2: stop (already sorted)",
            "sorted ← NULL; node ← head",
            "while node ≠ NULL:",
            "  next ← node.next",
            "  if sorted = NULL or node.value < sorted.value:",
            "    node.next ← sorted; sorted ← node",
            "  else:",
            "    walk ← sorted",
            "    while walk.next and walk.next.value ≤ node.value:",
            "      walk ← walk.next",
            "    node.next ← walk.next; walk.next ← node",
            "  node ← next",
            "head ← sorted; tail ← last sorted node",
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

function chainAddresses(node) {
    const out = [];
    for (; node !== null; node = node.next) out.push(node.address);
    return out;
}

function assertIndexType(index) {
    if (!Number.isInteger(index)) throw new TypeError(`Index must be an integer (got ${index})`);
}
