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
        if (this.rearAtEnd()) {
            const waste = this.wastedSlots;
            const error = waste > 0
                ? `Cannot enqueue ${value}: rear is already at the last index (${this.rear}). ` +
                  `${waste} slot${waste === 1 ? "" : "s"} at the front ${waste === 1 ? "is" : "are"} free, but a linear queue never moves ` +
                  `rear back to ${waste === 1 ? "it" : "them"}. This "false overflow" is why circular queues exist.`
                : `Queue overflow: ${this.capacity === 1 ? "the only slot is" : `all ${this.capacity} slots are`} used, so ${value} cannot be enqueued.`;
            return fail(error, [{ type: waste > 0 ? "false-overflow" : "overflow", indices: [], message: error, snapshot: this.snapshot() }]);
        }
        this.rear++;
        this.slots[this.rear] = value;
        this.count++;
        return ok(value, [{ type: "enqueue", indices: [this.rear], message: `Enqueued ${value} at index ${this.rear}. rear = ${this.rear}.`, snapshot: this.snapshot() }]);
    }

    dequeue() {
        if (this.isEmpty()) {
            return fail("Queue underflow: the queue is empty, so there is nothing to dequeue.",
                [{ type: "underflow", indices: [], message: "dequeue rejected (queue is empty)", snapshot: this.snapshot() }]);
        }
        const from = this.front;
        const value = this.slots[from];
        this.slots[from] = null;
        this.count--;
        let message = `Dequeued ${value} from index ${from}.`;
        if (this.count === 0) {
            // Common textbook optimisation: when the queue empties, both pointers reset.
            this.front = 0;
            this.rear = -1;
            message += " The queue is now empty, so front and rear reset to the start.";
        } else {
            this.front++;
            message += ` front moves to ${this.front}.`;
        }
        return ok(value, [{ type: "dequeue", indices: [from], message, snapshot: this.snapshot() }]);
    }

    peek() { return this.isEmpty() ? null : this.slots[this.front]; }
    peekRear() { return this.isEmpty() ? null : this.slots[this.rear]; }

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
        if (this.isFull()) {
            return fail(`Queue overflow: ${this.capacity === 1 ? "the only slot is" : `all ${this.capacity} slots are`} used, so ${value} cannot be enqueued.`,
                [{ type: "overflow", indices: [], message: "enqueue rejected (queue is full)", snapshot: this.snapshot() }]);
        }
        let message;
        if (this.isEmpty()) {
            this.front = 0;
            this.rear = 0;
            message = `Queue was empty: front = rear = 0. Stored ${value} at index 0.`;
        } else {
            const prev = this.rear;
            this.rear = (this.rear + 1) % this.capacity;
            message = `rear = (${prev} + 1) mod ${this.capacity} = ${this.rear}` +
                (this.rear < prev ? " (wrapped around to the start)" : "") + `. Stored ${value} there.`;
        }
        this.slots[this.rear] = value;
        return ok(value, [{ type: "enqueue", indices: [this.rear], message, snapshot: this.snapshot() }]);
    }

    dequeue() {
        if (this.isEmpty()) {
            return fail("Queue underflow: the queue is empty, so there is nothing to dequeue.",
                [{ type: "underflow", indices: [], message: "dequeue rejected (queue is empty)", snapshot: this.snapshot() }]);
        }
        const from = this.front;
        const value = this.slots[from];
        this.slots[from] = null;
        let message;
        if (this.front === this.rear) {
            this.front = -1;
            this.rear = -1;
            message = `Dequeued ${value}. That was the only element, so front = rear = −1 (empty).`;
        } else {
            this.front = (this.front + 1) % this.capacity;
            message = `Dequeued ${value} from index ${from}. front = (${from} + 1) mod ${this.capacity} = ${this.front}` +
                (this.front < from ? " (wrapped around)." : ".");
        }
        return ok(value, [{ type: "dequeue", indices: [from], message, snapshot: this.snapshot() }]);
    }

    peek() { return this.isEmpty() ? null : this.slots[this.front]; }
    peekRear() { return this.isEmpty() ? null : this.slots[this.rear]; }

    clear() {
        this.slots.fill(null);
        this.front = -1;
        this.rear = -1;
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
    #step(type, indices, message) { return { type, indices, message, snapshot: this.snapshot() }; }
}

/** "30 (priority 1, #4)": value, priority and arrival number. */
function label(it) { return `${it.value} (priority ${it.priority}, #${it.id})`; }

/** Why `a` ranks above `b`. Only called when a outranks b. */
function reason(a, b) {
    return a.priority !== b.priority
        ? `priority ${a.priority} beats ${b.priority}`
        : `same priority ${a.priority}, and #${a.id} arrived before #${b.id}`;
}

export const QUEUE_INFO = {
    linear: { name: "Linear Queue", enqueue: "O(1)", dequeue: "O(1)", note: "Slots before front are never reused (false overflow)." },
    circular: { name: "Circular Queue", enqueue: "O(1)", dequeue: "O(1)", note: "Indices wrap with (i + 1) mod capacity, so every slot is reused." },
    priority: { name: "Priority Queue (binary heap)", enqueue: "O(log n)", dequeue: "O(log n)", note: "A binary heap is not stable, so an arrival counter breaks ties and keeps equal priorities first-in, first-out." },
};
