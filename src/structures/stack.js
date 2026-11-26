import { ok, fail, assertCapacity, assertValue } from "./result.js";
import { parseInteger } from "../core/validate.js";

/**
 * Array-backed bounded stack (LIFO). `top` is the index of the last element, or −1 when empty.
 * DOM-free: the page controller turns results into messages and visuals.
 *
 * Every operation returns { ok, value?, error?, steps }. A step is
 *   { type, operation, line, indices, message, snapshot }
 * where `line` is 1-based in STACK_INFO.pseudocode[operation], `indices` are array
 * indices to highlight, and `snapshot` = { items, top, capacity } is the state AFTER
 * that line ran. Messages are written before the line runs, from the values it reads.
 * Failed operations record one step (overflow / underflow) and change nothing.
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
        const top = this.top;
        const last = this.capacity - 1;
        if (this.isFull()) {
            return fail(`Stack overflow: ${this.capacity === 1 ? "the only slot is" : `all ${this.capacity} slots are`} used, so ${value} cannot be pushed.`,
                [this.#step("overflow", "push", 1, [],
                    `top = ${top} equals capacity − 1 = ${last}, so the stack is full. Overflow: ${value} is not pushed.`)]);
        }
        const steps = [this.#step("check", "push", 1, [],
            `top = ${top}, capacity − 1 = ${last}: not full, so there is room for ${value}.`)];
        const message = `top ← ${top} + 1 = ${top + 1}, then A[${top + 1}] ← ${value}. ${value} is the new top.`;
        this.items.push(value);
        steps.push(this.#step("push", "push", 2, [this.top], message));
        return ok(value, steps);
    }

    pop() {
        if (this.isEmpty()) {
            return fail("Stack underflow: the stack is empty, so there is nothing to pop.",
                [this.#step("underflow", "pop", 1, [], "top = −1, so the stack is empty. Underflow: there is nothing to pop.")]);
        }
        const from = this.top;
        const value = this.items[from];
        const steps = [
            this.#step("check", "pop", 1, [from], `top = ${from}, not −1: the stack holds ${this.size} item${this.size === 1 ? "" : "s"}.`),
            this.#step("read", "pop", 2, [from], `x ← A[${from}] = ${value}. Only the top can leave (last in, first out).`),
        ];
        const message = `top ← ${from} − 1 = ${from - 1}; return ${value}.` +
            (from === 0 ? " The stack is now empty." : ` ${this.items[from - 1]} is the new top.`);
        this.items.pop();
        steps.push(this.#step("pop", "pop", 3, [from], message));
        return ok(value, steps);
    }

    /** Top value, or null when empty (null never collides with a stored number). */
    peek() { return this.isEmpty() ? null : this.items[this.top]; }

    /**
     * Read-only operations with recorded steps for the player:
     * "peek" (value or null), "isEmpty", "isFull", "size". Never changes the stack.
     */
    query(name) {
        const top = this.top;
        switch (name) {
            case "peek":
                if (this.isEmpty()) return ok(null, [this.#step("empty", "peek", 1, [], "top = −1, so the stack is empty: peek returns null.")]);
                return ok(this.peek(), [
                    this.#step("check", "peek", 1, [top], `top = ${top}, not −1: the stack is not empty.`),
                    this.#step("peek", "peek", 2, [top], `Return A[${top}] = ${this.peek()} without removing it.`),
                ]);
            case "isEmpty":
                return ok(this.isEmpty(), [this.#step("query", "isEmpty", 1, [], `top = ${top}, so top == −1 is ${this.isEmpty()}.`)]);
            case "isFull":
                return ok(this.isFull(), [this.#step("query", "isFull", 1, [],
                    `top = ${top}, capacity − 1 = ${this.capacity - 1}, so top == capacity − 1 is ${this.isFull()}.`)]);
            case "size":
                return ok(this.size, [this.#step("query", "size", 1, [], `top + 1 = ${top} + 1 = ${this.size}.`)]);
            default:
                throw new RangeError(`Unknown stack query: ${name}`);
        }
    }

    clear() { this.items = []; }

    #step(type, operation, line, indices, message) {
        return { type, operation, line, indices, message, snapshot: this.snapshot() };
    }
}

/**
 * Checks the "re-type the top value to confirm pop" input.
 * `raw` is the field text; `badInput` is the field's validity.badInput (a type="number"
 * field reports letters as "" but sets badInput). Returns { ok: true } only when the
 * text is a whole number equal to `expected`; otherwise { ok: false, reason } with
 * reason "empty" | "invalid" | "mismatch". Empty and non-numeric input never confirm.
 */
export function checkPopConfirm(raw, expected, { badInput = false } = {}) {
    const text = String(raw ?? "").trim();
    if (badInput) return { ok: false, reason: "invalid" };
    if (text === "") return { ok: false, reason: "empty" };
    const r = parseInteger(text, { label: "Value" });
    if (!r.ok) return { ok: false, reason: "invalid" };
    return r.value === expected ? { ok: true } : { ok: false, reason: "mismatch" };
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
    /** 1-based `line` in each step points into these arrays. A = the backing array. */
    pseudocode: Object.freeze({
        push: Object.freeze([
            "if top == capacity − 1: overflow, stop",
            "top ← top + 1; A[top] ← x",
        ]),
        pop: Object.freeze([
            "if top == −1: underflow, stop",
            "x ← A[top]",
            "top ← top − 1; return x",
        ]),
        peek: Object.freeze([
            "if top == −1: return null",
            "return A[top]",
        ]),
        isEmpty: Object.freeze(["return top == −1"]),
        isFull: Object.freeze(["return top == capacity − 1"]),
        size: Object.freeze(["return top + 1"]),
    }),
};
