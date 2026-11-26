import { ok, fail, assertCapacity, assertValue } from "./result.js";

/**
 * Queues backed by a fixed-size array, modelled the way textbooks teach them.
 * - LinearQueue: front/rear only move forward, which shows the "false overflow" problem.
 * - CircularQueue: indices wrap with modulo, which fixes it.
 * - PriorityQueue: binary max-heap; highest priority leaves first, FIFO among equal priorities.
 * All DOM-free. Empty slots are null, and peeks return null when empty
 * (never −1, which could be a real value).
 */

/** Linear array queue. front = index of first element; rear = index of last (−1 before first enqueue). */
export class LinearQueue {
    static MAX_CAPACITY = 100;

    constructor(capacity) {
        assertCapacity(capacity, 1, LinearQueue.MAX_CAPACITY, "Queue");
        this.capacity = capacity;
        this.slots = new Array(capacity).fill(null);
        this.front = 0;
        this.rear = -1;
        this.count = 0;
    }

    get size() { return this.count; }
    isEmpty() { return this.count === 0; }
    /** Every slot holds a value. */
    isFull() { return this.count === this.capacity; }
    /** Rear has reached the last index, so no more enqueues, even if dequeued slots at the front are free. */
    rearAtEnd() { return this.rear === this.capacity - 1; }
    /** Free slots that a linear queue cannot reuse (they sit before `front`). */
    get wastedSlots() { return this.isEmpty() ? 0 : this.front; }

    toArray() { return this.isEmpty() ? [] : this.slots.slice(this.front, this.rear + 1); }
    snapshot() { return { slots: this.slots.slice(), front: this.front, rear: this.rear, count: this.count, capacity: this.capacity }; }

    enqueue(value) {
        assertValue(value);
        const rear = this.rear;
        const last = this.capacity - 1;
        if (this.rearAtEnd()) {
            const waste = this.wastedSlots;
            const error = waste > 0
                ? `Cannot enqueue ${value}: rear is already at the last index (${this.rear}). ` +
                  `${waste} slot${waste === 1 ? "" : "s"} at the front ${waste === 1 ? "is" : "are"} free, but a linear queue never moves ` +
                  `rear back to ${waste === 1 ? "it" : "them"}. This "false overflow" is why circular queues exist.`
                : `Queue overflow: ${this.capacity === 1 ? "the only slot is" : `all ${this.capacity} slots are`} used, so ${value} cannot be enqueued.`;
            return fail(error, [this.#step(waste > 0 ? "false-overflow" : "overflow", "enqueue", 1, [this.rear], error)]);
        }
        const steps = [this.#step("check", "enqueue", 1, rear >= 0 ? [rear] : [],
            `rear = ${rear}, capacity − 1 = ${last}: rear is not at the last index, so ${value} fits.`)];
        let message = `rear ← ${rear} + 1 = ${rear + 1}.`;
        this.rear++;
        steps.push(this.#step("move-rear", "enqueue", 2, [this.rear], message));
        message = `Q[${this.rear}] ← ${value}; count ← ${this.count} + 1 = ${this.count + 1}. Enqueued ${value} at index ${this.rear}.`;
        this.slots[this.rear] = value;
        this.count++;
        steps.push(this.#step("enqueue", "enqueue", 3, [this.rear], message));
        return ok(value, steps);
    }

    dequeue() {
        if (this.isEmpty()) {
            return fail("Queue underflow: the queue is empty, so there is nothing to dequeue.",
                [this.#step("underflow", "dequeue", 1, [], "count = 0, so the queue is empty. Underflow: there is nothing to dequeue.")]);
        }
        const from = this.front;
        const value = this.slots[from];
        const steps = [this.#step("check", "dequeue", 1, [from],
            `count = ${this.count}, not 0: the front element is at index ${from}.`)];
        let message = `x ← Q[${from}] = ${value}; Q[${from}] ← empty; count ← ${this.count} − 1 = ${this.count - 1}. Only the front can leave (first in, first out).`;
        this.slots[from] = null;
        this.count--;
        steps.push(this.#step("dequeue", "dequeue", 2, [from], message));
        if (this.count === 0) {
            // Common textbook optimisation: when the queue empties, both pointers reset.
            message = "count = 0, so the queue is now empty: front ← 0, rear ← −1 (both pointers reset to the start).";
            this.front = 0;
            this.rear = -1;
            steps.push(this.#step("reset", "dequeue", 3, [], message));
        } else {
            message = `front ← ${from} + 1 = ${from + 1}. Index ${from} is now freed, and a linear queue never reuses it.`;
            this.front++;
            steps.push(this.#step("move-front", "dequeue", 4, [this.front], message));
        }
        steps.push(this.#step("done", "dequeue", 5, [], `Return ${value}. Dequeued ${value} from index ${from}.`));
        return ok(value, steps);
    }

    peek() { return this.isEmpty() ? null : this.slots[this.front]; }
    peekRear() { return this.isEmpty() ? null : this.slots[this.rear]; }

    /** Read-only operations with recorded steps: "peek", "rear", "isEmpty", "isFull", "size". Never mutates. */
    query(name) {
        return recordQuery(this, name, "count == 0", (s) => `count = ${s.count}`,
            (s, full) => `count = ${s.count}, capacity = ${s.capacity}, so count == capacity is ${full}`);
    }

    #step(type, operation, line, indices, message) {
        return { type, operation, line, indices, message, snapshot: this.snapshot() };
    }

    clear() {
        this.slots.fill(null);
        this.front = 0;
        this.rear = -1;
        this.count = 0;
    }
}

/** Circular array queue. front/rear are −1 when empty (matches circular-queue.html). */
export class CircularQueue {
    static MIN_CAPACITY = 2;
    static MAX_CAPACITY = 100;

    constructor(capacity) {
        assertCapacity(capacity, CircularQueue.MIN_CAPACITY, CircularQueue.MAX_CAPACITY, "Circular queue");
        this.capacity = capacity;
        this.slots = new Array(capacity).fill(null);
        this.front = -1;
        this.rear = -1;
    }

    get size() {
        if (this.front === -1) return 0;
        return ((this.rear - this.front + this.capacity) % this.capacity) + 1;
    }
    isEmpty() { return this.front === -1; }
    isFull() { return !this.isEmpty() && (this.rear + 1) % this.capacity === this.front; }

    toArray() {
        const out = [];
        for (let i = 0, idx = this.front; i < this.size; i++, idx = (idx + 1) % this.capacity) out.push(this.slots[idx]);
        return out;
    }
    snapshot() { return { slots: this.slots.slice(), front: this.front, rear: this.rear, size: this.size, capacity: this.capacity }; }

    enqueue(value) {
        assertValue(value);
        const n = this.capacity;
        const next = (this.rear + 1) % n;
        if (this.isFull()) {
            return fail(`Queue overflow: ${this.capacity === 1 ? "the only slot is" : `all ${this.capacity} slots are`} used, so ${value} cannot be enqueued.`,
                [this.#step("overflow", "enqueue", 1, [this.front],
                    `(rear + 1) mod ${n} = (${this.rear} + 1) mod ${n} = ${next}, which is front (${this.front}): the ring is full. Overflow: ${value} is not enqueued.`)]);
        }
        const steps = [this.#step("check", "enqueue", 1, [],
            this.isEmpty()
                ? `front = −1, so the ring is empty and not full. There is room for ${value}.`
                : `(rear + 1) mod ${n} = (${this.rear} + 1) mod ${n} = ${next}, which is not front (${this.front}): not full.`)];
        let message;
        if (this.isEmpty()) {
            message = "Queue was empty: front ← 0, rear ← 0.";
            this.front = 0;
            this.rear = 0;
            steps.push(this.#step("move-rear", "enqueue", 2, [0], message));
        } else {
            const prev = this.rear;
            message = `rear ← (${prev} + 1) mod ${n} = ${next}` + (next < prev ? " (wrapped around to the start)." : ".");
            this.rear = next;
            steps.push(this.#step("move-rear", "enqueue", 3, [next], message));
        }
        message = `Q[${this.rear}] ← ${value}. Stored ${value} at index ${this.rear}.`;
        this.slots[this.rear] = value;
        steps.push(this.#step("enqueue", "enqueue", 4, [this.rear], message));
        return ok(value, steps);
    }

    dequeue() {
        if (this.isEmpty()) {
            return fail("Queue underflow: the queue is empty, so there is nothing to dequeue.",
                [this.#step("underflow", "dequeue", 1, [], "front = −1, so the ring is empty. Underflow: there is nothing to dequeue.")]);
        }
        const n = this.capacity;
        const from = this.front;
        const value = this.slots[from];
        const steps = [this.#step("check", "dequeue", 1, [from], `front = ${from}, not −1: the front element is at index ${from}.`)];
        let message = `x ← Q[${from}] = ${value}; Q[${from}] ← empty. Only the front can leave (first in, first out).`;
        this.slots[from] = null;
        steps.push(this.#step("dequeue", "dequeue", 2, [from], message));
        if (this.front === this.rear) {
            message = `front = rear = ${from}, so that was the only element: front ← −1, rear ← −1 (empty).`;
            this.front = -1;
            this.rear = -1;
            steps.push(this.#step("reset", "dequeue", 3, [], message));
        } else {
            const next = (from + 1) % n;
            message = `front ← (${from} + 1) mod ${n} = ${next}` + (next < from ? " (wrapped around to the start)." : ".");
            this.front = next;
            steps.push(this.#step("move-front", "dequeue", 4, [next], message));
        }
        steps.push(this.#step("done", "dequeue", 5, [], `Return ${value}. Dequeued ${value} from index ${from}.`));
        return ok(value, steps);
    }

    peek() { return this.isEmpty() ? null : this.slots[this.front]; }
    peekRear() { return this.isEmpty() ? null : this.slots[this.rear]; }

    /** Read-only operations with recorded steps: "peek", "rear", "isEmpty", "isFull", "size". Never mutates. */
    query(name) {
        return recordQuery(this, name, "front == −1", (s) => `front = ${s.front}`,
            (s, full) => s.front === -1
                ? "front = −1, so the ring is empty and isFull is false"
                : `(rear + 1) mod ${s.capacity} = (${s.rear} + 1) mod ${s.capacity} = ${(s.rear + 1) % s.capacity}, front = ${s.front}, so isFull is ${full}`);
    }

    #step(type, operation, line, indices, message) {
        return { type, operation, line, indices, message, snapshot: this.snapshot() };
    }

    clear() {
        this.slots.fill(null);
        this.front = -1;
        this.rear = -1;
    }
}

/**
 * Shared recorder for the read-only operations of LinearQueue and CircularQueue.
 * One step for isEmpty / isFull / size; peek / rear record the empty check, then the read.
 */
function recordQuery(q, name, emptyTest, emptyText, fullText) {
    const step = (type, line, indices, message) => ({ type, operation: name, line, indices, message, snapshot: q.snapshot() });
    const s = q.snapshot();
    switch (name) {
        case "peek":
        case "rear": {
            const which = name === "peek" ? "front" : "rear";
            if (q.isEmpty()) return ok(null, [step("empty", 1, [], `${emptyText(s)}, so the queue is empty: ${name} returns null.`)]);
            const at = q[which];
            const value = name === "peek" ? q.peek() : q.peekRear();
            return ok(value, [
                step("check", 1, [], `${emptyText(s)}: the queue is not empty.`),
                step(name, 2, [at], `Return Q[${which}] = Q[${at}] = ${value} without removing it.`),
            ]);
        }
        case "isEmpty":
            return ok(q.isEmpty(), [step("query", 1, [], `${emptyText(s)}, so ${emptyTest} is ${q.isEmpty()}.`)]);
        case "isFull":
            return ok(q.isFull(), [step("query", 1, [], `${fullText(s, q.isFull())}.`)]);
        case "size":
            return ok(q.size, [step("query", 1, [], `The queue holds ${q.size} of ${q.capacity} slots.`)]);
        default:
            throw new RangeError(`Unknown queue query: ${name}`);
    }
}

/**
 * Bounded priority queue backed by a binary max-heap in array form:
 * parent(i) = floor((i − 1) / 2), children 2i + 1 and 2i + 2. Index 0 is the front.
 *
 * A binary heap is not stable: two items with the same priority could come out
 * in either order. To keep first-in, first-out order among equal priorities,
 * every item gets an increasing arrival id (`nextId`) and the heap is ordered by
 * the pair (priority descending, id ascending). Ids are unique, so this is a
 * strict total order and the service order is fully determined.
 *
 * Complexity (n = size): enqueue O(log n), dequeue O(log n), peek O(1),
 * duplicate check O(1) (value -> count map), peekRear O(n) (the last item is
 * some leaf and the heap does not track which), toArray O(n log n) (sorts a copy).
 * Each recorded step also copies the queue for its snapshot; the operation
 * itself still does O(log n) comparisons and swaps.
 *
 * Edge cases: enqueue when full -> { ok: false } with an "overflow" step;
 * duplicate when allowDuplicates is false -> { ok: false } with a "duplicate" step;
 * dequeue when empty -> { ok: false } with an "underflow" step; peek/peekRear on
 * empty -> null (never −1). Values and priorities may be 0 or negative (any finite
 * number; anything else throws TypeError, as before). clear() keeps counting ids.
 *
 * snapshot() = { items, heap, capacity, size }
 *   items: copies in service order (front first), the same meaning as before the heap;
 *   heap:  copies in heap-array order (index 0 = root = front).
 * Step indices are heap-array indices.
 */
export class PriorityQueue {
    static MAX_CAPACITY = 50;

    constructor(capacity, { allowDuplicates = true } = {}) {
        assertCapacity(capacity, 1, PriorityQueue.MAX_CAPACITY, "Priority queue");
        this.capacity = capacity;
        this.allowDuplicates = allowDuplicates;
        this.heap = []; // { id, value, priority } in heap-array order
        this.nextId = 1;
        this.valueCounts = new Map();
    }

    /** True when `a` must leave before `b`: higher priority, or equal priority and arrived first. */
    static outranks(a, b) {
        return a.priority > b.priority || (a.priority === b.priority && a.id < b.id);
    }

    /** Checks the heap property for every parent/child pair of a heap-order array. */
    static isValidHeap(heap) {
        for (let i = 1; i < heap.length; i++) {
            if (PriorityQueue.outranks(heap[i], heap[Math.floor((i - 1) / 2)])) return false;
        }
        return true;
    }

    get size() { return this.heap.length; }
    isEmpty() { return this.heap.length === 0; }
    isFull() { return this.heap.length === this.capacity; }
    isValid() { return PriorityQueue.isValidHeap(this.heap); }

    /** Copies in service order (the order dequeue would return them). O(n log n). */
    toArray() {
        return this.heap.map(it => ({ ...it })).sort((a, b) => (PriorityQueue.outranks(a, b) ? -1 : 1));
    }
    /** Copies in heap-array order. O(n). */
    heapArray() { return this.heap.map(it => ({ ...it })); }
    snapshot() { return { items: this.toArray(), heap: this.heapArray(), capacity: this.capacity, size: this.heap.length }; }

    /** Adds `value` with `priority` (default 0) at the next free heap slot, then sifts it up. O(log n). */
    enqueue(value, priority = 0) {
        assertValue(value);
        assertValue(priority);
        this.#op = "enqueue";
        if (this.isFull()) {
            return fail(`Queue overflow: ${this.capacity === 1 ? "the only slot is" : `all ${this.capacity} slots are`} used, so ${value} cannot be enqueued.`,
                [this.#step("overflow", [], "enqueue rejected (queue is full)")]);
        }
        if (!this.allowDuplicates && this.valueCounts.has(value)) {
            return fail(`${value} is already in the queue. This queue does not allow duplicate values.`,
                [this.#step("duplicate", [], "enqueue rejected (duplicate)")]);
        }
        const item = { id: this.nextId++, value, priority };
        const at = this.heap.length;
        this.heap.push(item);
        this.valueCounts.set(value, (this.valueCounts.get(value) ?? 0) + 1);
        const steps = [this.#step("enqueue", [at], at === 0
            ? `The queue was empty, so ${label(item)} becomes the root (index 0), the front of the queue.`
            : `Place ${label(item)} at the next free slot, index ${at}. Now sift it up.`)];
        let i = at;
        while (i > 0) {
            const p = Math.floor((i - 1) / 2);
            const child = this.heap[i];
            const parent = this.heap[p];
            const head = `Compare ${label(child)} at index ${i} with its parent ${label(parent)} at index ${p}:`;
            if (!PriorityQueue.outranks(child, parent)) {
                steps.push(this.#step("compare", [i, p], `${head} ${reason(parent, child)}, so ${child.value} stays.`));
                break;
            }
            const message = `${head} ${reason(child, parent)}, so swap them.`;
            this.#swap(i, p);
            steps.push(this.#step("swap", [i, p], message));
            i = p;
        }
        steps.push(this.#step("settled", [i], i === 0
            ? `${label(item)} is at the root, so it is the next to leave.`
            : `${label(item)} settles at index ${i}. Heap property holds.`));
        return ok({ ...item }, steps);
    }

    /** Removes the front item (root), moves the last item into the root and sifts it down. O(log n). */
    dequeue() {
        this.#op = "dequeue";
        if (this.isEmpty()) {
            return fail("Queue underflow: the queue is empty, so there is nothing to dequeue.",
                [this.#step("underflow", [], "dequeue rejected (queue is empty)")]);
        }
        const root = this.heap[0];
        const steps = [this.#step("dequeue", [0],
            `Remove the root ${label(root)}: the highest priority, and the earliest arrival among equals.`)];
        const last = this.heap.pop();
        const count = this.valueCounts.get(root.value);
        if (count === 1) this.valueCounts.delete(root.value);
        else this.valueCounts.set(root.value, count - 1);
        if (this.heap.length === 0) {
            steps.push(this.#step("settled", [], `${root.value} was the only item, so the queue is now empty.`));
            return ok({ ...root }, steps);
        }
        const lastIndex = this.heap.length;
        this.heap[0] = last;
        steps.push(this.#step("move-last", [0],
            `Move the last item ${label(last)} from index ${lastIndex} into the root so the tree stays complete. Now sift it down.`));
        const n = this.heap.length;
        let i = 0;
        for (;;) {
            const l = 2 * i + 1;
            const r = 2 * i + 2;
            if (l >= n) {
                steps.push(this.#step("settled", [i], `${label(this.heap[i])} at index ${i} is a leaf, so it stops here.`));
                break;
            }
            let best = l;
            if (r < n && PriorityQueue.outranks(this.heap[r], this.heap[l])) best = r;
            const cur = this.heap[i];
            const child = this.heap[best];
            const other = best === l ? this.heap[r] : this.heap[l];
            const childText = r < n
                ? `its children are ${label(this.heap[l])} and ${label(this.heap[r])}; ${child.value} ranks higher (${reason(child, other)}).`
                : `its only child is ${label(child)}.`;
            const head = `${label(cur)} at index ${i}: ${childText}`;
            if (!PriorityQueue.outranks(child, cur)) {
                steps.push(this.#step("compare", [i, best], `${head} Against ${cur.value}: ${reason(cur, child)}, so ${cur.value} stays.`));
                steps.push(this.#step("settled", [i], `${label(cur)} settles at index ${i}. Heap property holds.`));
                break;
            }
            const message = `${head} Against ${cur.value}: ${reason(child, cur)}, so swap them.`;
            this.#swap(i, best);
            steps.push(this.#step("swap", [i, best], message));
            i = best;
        }
        return ok({ ...root }, steps);
    }

    /** Front item (heap root) or null when empty. O(1). */
    peek() { return this.isEmpty() ? null : { ...this.heap[0] }; }

    /** Last item in service order (lowest priority, latest arrival among those) or null when empty. O(n). */
    peekRear() {
        if (this.isEmpty()) return null;
        let worst = this.heap[0];
        for (const it of this.heap) if (PriorityQueue.outranks(worst, it)) worst = it;
        return { ...worst };
    }

    clear() {
        this.heap = [];
        this.valueCounts.clear();
    }

    #swap(a, b) { [this.heap[a], this.heap[b]] = [this.heap[b], this.heap[a]]; }
    /** Operation being recorded ("enqueue" / "dequeue"); picks the pseudocode line map. */
    #op = "enqueue";
    #step(type, indices, message) {
        const line = PQ_LINES[this.#op][type] ?? 0;
        return { type, operation: this.#op, line, indices, message, snapshot: this.snapshot() };
    }
}

/** "30 (priority 1, #4)": value, priority and arrival number. */
function label(it) { return `${it.value} (priority ${it.priority}, #${it.id})`; }

/** Why `a` ranks above `b`. Only called when a outranks b. */
function reason(a, b) {
    return a.priority !== b.priority
        ? `priority ${a.priority} beats ${b.priority}`
        : `same priority ${a.priority}, and #${a.id} arrived before #${b.id}`;
}

/** Step type -> 1-based line in QUEUE_INFO.priority.pseudocode[operation]. */
const PQ_LINES = {
    enqueue: { overflow: 1, duplicate: 1, enqueue: 2, compare: 3, swap: 4, settled: 5 },
    dequeue: { underflow: 1, dequeue: 2, "move-last": 3, compare: 4, swap: 5, settled: 6 },
};

export const QUEUE_INFO = {
    linear: {
        name: "Linear Queue", enqueue: "O(1)", dequeue: "O(1)", note: "Slots before front are never reused (false overflow).",
        /** 1-based `line` in LinearQueue steps points into these arrays. Q = the backing array. */
        pseudocode: Object.freeze({
            enqueue: Object.freeze([
                "if rear == capacity − 1: overflow, stop",
                "rear ← rear + 1",
                "Q[rear] ← x; count ← count + 1",
            ]),
            dequeue: Object.freeze([
                "if count == 0: underflow, stop",
                "x ← Q[front]; Q[front] ← empty; count ← count − 1",
                "if count == 0: front ← 0; rear ← −1",
                "else: front ← front + 1",
                "return x",
            ]),
            peek: Object.freeze(["if count == 0: return null", "return Q[front]"]),
            rear: Object.freeze(["if count == 0: return null", "return Q[rear]"]),
            isEmpty: Object.freeze(["return count == 0"]),
            isFull: Object.freeze(["return count == capacity"]),
            size: Object.freeze(["return count"]),
        }),
    },
    circular: {
        name: "Circular Queue", enqueue: "O(1)", dequeue: "O(1)", note: "Indices wrap with (i + 1) mod capacity, so every slot is reused.",
        /** 1-based `line` in CircularQueue steps points into these arrays. n = capacity. */
        pseudocode: Object.freeze({
            enqueue: Object.freeze([
                "if (rear + 1) mod n == front: overflow, stop",
                "if front == −1: front ← 0; rear ← 0",
                "else: rear ← (rear + 1) mod n",
                "Q[rear] ← x",
            ]),
            dequeue: Object.freeze([
                "if front == −1: underflow, stop",
                "x ← Q[front]; Q[front] ← empty",
                "if front == rear: front ← −1; rear ← −1",
                "else: front ← (front + 1) mod n",
                "return x",
            ]),
            peek: Object.freeze(["if front == −1: return null", "return Q[front]"]),
            rear: Object.freeze(["if front == −1: return null", "return Q[rear]"]),
            isEmpty: Object.freeze(["return front == −1"]),
            isFull: Object.freeze(["return (rear + 1) mod n == front"]),
            size: Object.freeze(["return (rear − front + n) mod n + 1   (0 if empty)"]),
        }),
    },
    priority: {
        name: "Priority Queue (binary heap)", enqueue: "O(log n)", dequeue: "O(log n)", note: "A binary heap is not stable, so an arrival counter breaks ties and keeps equal priorities first-in, first-out.",
        /** 1-based `line` in PriorityQueue steps (see PQ_LINES). "outranks" = higher priority, or equal priority and earlier arrival. */
        pseudocode: Object.freeze({
            enqueue: Object.freeze([
                "if size == capacity or x is a rejected duplicate: stop",
                "i ← size; A[i] ← item; size ← size + 1",
                "while i > 0: compare A[i] with A[parent(i)]",
                "    if A[i] outranks its parent: swap them; i ← parent(i), else stop",
                "A[i] is in place: heap property holds",
            ]),
            dequeue: Object.freeze([
                "if size == 0: underflow, stop",
                "top ← A[0]",
                "A[0] ← A[size − 1]; size ← size − 1; i ← 0",
                "compare A[i] with its higher-ranked child c",
                "    if c outranks A[i]: swap them; i ← c, else stop",
                "heap property holds; return top",
            ]),
        }),
    },
};
