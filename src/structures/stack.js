import { ok, fail, assertCapacity, assertValue } from "./result.js";

/**
 * Array-backed bounded stack (LIFO). `top` is the index of the last element, or −1 when empty.
 * DOM-free: the page controller turns results into messages and visuals.
 */
export class Stack {
    static MAX_CAPACITY = 12;

    constructor(capacity) {
        assertCapacity(capacity, 1, Stack.MAX_CAPACITY, "Stack");
        this.capacity = capacity;
        this.items = [];
    }

    get size() { return this.items.length; }
    get top() { return this.items.length - 1; }
    isEmpty() { return this.items.length === 0; }
    isFull() { return this.items.length === this.capacity; }

    /** Bottom → top copy. */
    toArray() { return this.items.slice(); }

    snapshot() { return { items: this.toArray(), top: this.top, capacity: this.capacity }; }

    push(value) {
        assertValue(value);
        if (this.isFull()) {
            return fail(`Stack overflow: ${this.capacity === 1 ? "the only slot is" : `all ${this.capacity} slots are`} used, so ${value} cannot be pushed.`,
                [{ type: "overflow", indices: [], message: "push rejected (stack is full)", snapshot: this.snapshot() }]);
        }
        this.items.push(value);
        return ok(value, [{ type: "push", indices: [this.top], message: `Pushed ${value}. top is now ${this.top}.`, snapshot: this.snapshot() }]);
    }

    pop() {
        if (this.isEmpty()) {
            return fail("Stack underflow: the stack is empty, so there is nothing to pop.",
                [{ type: "underflow", indices: [], message: "pop rejected (stack is empty)", snapshot: this.snapshot() }]);
        }
        const from = this.top;
        const value = this.items.pop();
        return ok(value, [{ type: "pop", indices: [from], message: `Popped ${value} from index ${from}. top is now ${this.top}.`, snapshot: this.snapshot() }]);
    }

    /** Top value, or null when empty (null never collides with a stored number). */
    peek() { return this.isEmpty() ? null : this.items[this.top]; }

    clear() { this.items = []; }
}

export const STACK_INFO = {
    name: "Stack",
    operations: {
        push: { complexity: "O(1)", description: "Add a value on top. Fails with overflow when full." },
        pop: { complexity: "O(1)", description: "Remove and return the top value. Fails with underflow when empty." },
        peek: { complexity: "O(1)", description: "Read the top value without removing it." },
        isEmpty: { complexity: "O(1)", description: "size === 0" },
        isFull: { complexity: "O(1)", description: "size === capacity" },
    },
};
