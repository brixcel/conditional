/**
 * Stack page controller. Logic comes from Stack (src/structures/stack.js); the DOM
 * only mirrors it. (The old stack.js stored the stack in the DOM and read values back
 * from bar text.)
 *
 * Kept from the original page: capacity 1–12, positive whole numbers only, Pop with an
 * empty input pops directly or, if a value is typed, it must equal the top. Also kept:
 * push/pop animations, the Peek highlight, inline messages plus the shared toast.
 * Changed: a capacity above 12 is rejected with a message instead of being cut to 12 silently.
 */
import { Stack } from "../structures/stack.js";
import { parseInteger } from "../core/validate.js";

const $ = (id) => document.getElementById(id);
const els = {
    capacity: $("stack-capacityInput"), setCap: $("stack-setCapacityButton"), reset: $("stack-refreshButton"),
    value: $("stack-numberInput"), push: $("stack-pushButton"), pop: $("stack-popButton"),
    peek: $("stack-peekButton"), isEmpty: $("stack-isEmptyButton"), isFull: $("stack-isFullButton"), size: $("stack-sizeButton"),
    message: $("stackMessage"), top: $("stack-top-val"), count: $("stack-size-val"), box: document.querySelector(".stack-box"),
};
const OPS = [els.push, els.pop, els.peek, els.isEmpty, els.isFull, els.size];
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** @type {Stack | null} */
let stack = null;
let busy = false; // true while the pop animation runs

function notify(message, type = "info") {
    const isError = type === "error";
    els.message.className = `alert-banner alert-live alert-${type}`;
    els.message.setAttribute("role", isError ? "alert" : "status");
    els.message.setAttribute("aria-live", isError ? "assertive" : "polite");
    els.message.textContent = message;
    els.message.hidden = !message;
    window.DSA_UI?.showToast?.(message, type);
}

function updateState() {
    const ready = stack !== null && !busy;
    els.capacity.disabled = stack !== null;
    els.setCap.disabled = stack !== null;
    els.value.disabled = !ready;
    OPS.forEach(b => { b.disabled = !ready; });
    els.count.textContent = stack ? `${stack.size} / ${stack.capacity}` : "0 / 0";
    els.top.textContent = stack && !stack.isEmpty() ? `${stack.peek()} (index ${stack.top})` : "Empty (None)";
}

/** Bars mirror stack.toArray() (bottom → top). Only the changed bar is added/removed so animations stay meaningful. */
function addBar(value, index) {
    const bar = document.createElement("div");
    bar.className = "stack-bar";
    bar.textContent = value;
    bar.dataset.index = index;
    bar.setAttribute("aria-label", `index ${index}: ${value}`);
    els.box.appendChild(bar);
    els.box.scrollTop = els.box.scrollHeight;
}

function setCapacity() {
    const r = parseInteger(els.capacity.value, { min: 1, max: Stack.MAX_CAPACITY, label: "Capacity" });
    if (!r.ok) { notify(r.error, "error"); els.capacity.focus(); return; }
    stack = new Stack(r.value);
    els.box.replaceChildren();
    updateState();
    notify(`Stack capacity successfully set to ${stack.capacity}`, "success");
    els.value.focus();
}

function reset() {
    stack = null;
    busy = false;
    els.box.replaceChildren();
    els.value.value = "";
    els.capacity.value = "6";
    updateState();
    notify("Stack state reset. Please allocate a new capacity.", "info");
    els.capacity.focus();
}

function push() {
    // type="number" inputs report letters as "", so an empty value also covers non-numeric typing.
    const r = parseInteger(els.value.value, { min: 1, max: 9999, label: "Value" });
    if (!r.ok) {
        notify(els.value.value.trim() === "" ? "Enter a positive whole number to push (e.g. 10, 42)." : r.error, "error");
        els.value.focus();
        return;
    }
    const res = stack.push(r.value);
    if (!res.ok) { notify(res.error, "error"); return; }
    addBar(r.value, stack.top);
    els.value.value = "";
    updateState();
    notify(`Pushed ${r.value} onto Top of Stack (top = ${stack.top})`, "success");
    els.value.focus();
}

function pop() {
    if (stack.isEmpty()) { notify("Stack Underflow! Cannot pop from an empty stack.", "error"); return; }
    const typed = els.value.value.trim();
    const top = stack.peek();
    if (typed !== "") {
        const r = parseInteger(typed, { label: "Value" });
        if (!r.ok || r.value !== top) {
            notify(`LIFO Rule: Top element is ${top}, not ${typed}.`, "error");
            els.value.focus();
            return;
        }
    }
    const res = stack.pop();
    const bar = els.box.lastElementChild;
    const finish = () => {
        bar?.remove();
        busy = false;
        els.value.value = "";
        updateState();
        notify(`Popped ${res.value} from Top of Stack (LIFO). ` +
            (stack.isEmpty() ? "The stack is now empty (top = −1)." : `top is now ${stack.top}.`), "info");
    };
    if (bar && !reduceMotion()) {
        busy = true;
        updateState();
        bar.classList.add("stack-bar-pop");
        setTimeout(finish, 240);
    } else finish();
}

function peek() {
    if (stack.isEmpty()) { notify("The stack is empty. Top is null.", "info"); return; }
    const bar = els.box.lastElementChild;
    if (bar) {
        bar.classList.add("stack-highlight");
        setTimeout(() => bar.classList.remove("stack-highlight"), 1200);
    }
    notify(`Peek: Top element is ${stack.peek()} (index ${stack.top})`, "info");
}

els.setCap.addEventListener("click", setCapacity);
els.reset.addEventListener("click", reset);
els.push.addEventListener("click", push);
els.pop.addEventListener("click", pop);
els.peek.addEventListener("click", peek);
els.isEmpty.addEventListener("click", () =>
    notify(stack.isEmpty() ? "IsEmpty: TRUE (Size is 0)" : "IsEmpty: FALSE (Stack contains elements)", "info"));
els.isFull.addEventListener("click", () =>
    notify(stack.isFull() ? "IsFull: TRUE (Stack is at max capacity)" : "IsFull: FALSE (Available space remains)", "info"));
els.size.addEventListener("click", () => notify(`Current Stack Size: ${stack.size} / ${stack.capacity} elements`, "info"));
els.capacity.addEventListener("keydown", (e) => { if (e.key === "Enter") setCapacity(); });
els.value.addEventListener("keydown", (e) => { if (e.key === "Enter" && !els.push.disabled) push(); });

updateState();
