import { ok, fail, assertCapacity, assertValue } from "./result.js";

/**
 * Queues backed by a fixed-size array, modelled the way textbooks teach them.
 * - LinearQueue: front/rear only move forward, which shows the "false overflow" problem.
 * - CircularQueue: indices wrap with modulo, which fixes it.
 * - PriorityQueue: highest priority leaves first, FIFO among equal priorities.
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
 * Bounded priority queue kept as an ordered array: highest priority first,
 * FIFO among equal priorities (stable). Enqueue O(n), dequeue O(n) (shift).
 * A heap-backed version arrives with the heap module.
 */
export class PriorityQueue {
    static MAX_CAPACITY = 50;

    constructor(capacity, { allowDuplicates = true } = {}) {
        assertCapacity(capacity, 1, PriorityQueue.MAX_CAPACITY, "Priority queue");
        this.capacity = capacity;
        this.allowDuplicates = allowDuplicates;
        this.items = []; // { id, value, priority }
        this.nextId = 1;
    }

    get size() { return this.items.length; }
    isEmpty() { return this.items.length === 0; }
    isFull() { return this.items.length === this.capacity; }
    toArray() { return this.items.map(it => ({ ...it })); }
    snapshot() { return { items: this.toArray(), capacity: this.capacity }; }

    enqueue(value, priority = 0) {
        assertValue(value);
        assertValue(priority);
        if (this.isFull()) {
            return fail(`Queue overflow: ${this.capacity === 1 ? "the only slot is" : `all ${this.capacity} slots are`} used, so ${value} cannot be enqueued.`,
                [{ type: "overflow", indices: [], message: "enqueue rejected (queue is full)", snapshot: this.snapshot() }]);
        }
        if (!this.allowDuplicates && this.items.some(it => it.value === value)) {
            return fail(`${value} is already in the queue. This queue does not allow duplicate values.`,
                [{ type: "duplicate", indices: [], message: "enqueue rejected (duplicate)", snapshot: this.snapshot() }]);
        }
        // Insert after every item with priority >= p, so equal priorities stay first-in, first-out.
        let pos = this.items.length;
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i].priority < priority) { pos = i; break; }
        }
        const item = { id: this.nextId++, value, priority };
        this.items.splice(pos, 0, item);
        const message = pos === this.items.length - 1
            ? `Enqueued ${value} (priority ${priority}) at the rear: no waiting item has a lower priority.`
            : `Enqueued ${value} (priority ${priority}) at position ${pos}, ahead of lower-priority items and behind ones with priority ≥ ${priority}.`;
        return ok({ ...item }, [{ type: "enqueue", indices: [pos], message, snapshot: this.snapshot() }]);
    }

    dequeue() {
        if (this.isEmpty()) {
            return fail("Queue underflow: the queue is empty, so there is nothing to dequeue.",
                [{ type: "underflow", indices: [], message: "dequeue rejected (queue is empty)", snapshot: this.snapshot() }]);
        }
        const item = this.items.shift();
        return ok({ ...item }, [{ type: "dequeue", indices: [0], message: `Dequeued ${item.value} (priority ${item.priority}), the highest-priority item that arrived first.`, snapshot: this.snapshot() }]);
    }

    peek() { return this.isEmpty() ? null : { ...this.items[0] }; }
    peekRear() { return this.isEmpty() ? null : { ...this.items.at(-1) }; }
    clear() { this.items = []; }
}

export const QUEUE_INFO = {
    linear: { name: "Linear Queue", enqueue: "O(1)", dequeue: "O(1)", note: "Slots before front are never reused (false overflow)." },
    circular: { name: "Circular Queue", enqueue: "O(1)", dequeue: "O(1)", note: "Indices wrap with (i + 1) mod capacity, so every slot is reused." },
    priority: { name: "Priority Queue (ordered array)", enqueue: "O(n)", dequeue: "O(n)", note: "A binary heap makes both O(log n)." },
};
