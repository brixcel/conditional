/**
 * Priority Queue page controller. Logic comes from PriorityQueue (src/structures/queue.js)
 * in two-level mode: "High Priority (P)" = priority 1, normal = priority 0.
 *
 * Kept from the original inline script: positive whole numbers only, no duplicate values,
 * high-priority items go ahead of normal ones and keep FIFO order among themselves,
 * dequeue by typing the front value, and every query button plus "Display List".
 * Changed: max size is now 1–50 (it had no upper limit), and messages say where
 * a new item was placed and why.
 */
import { PriorityQueue } from "../structures/queue.js";
import { parseInteger } from "../core/validate.js";

const $ = (id) => document.getElementById(id);
const els = {
    maxSize: $("maxSize"), allocate: $("pqAllocateBtn"), reset: $("pqResetBtn"),
    value: $("enqueueValue"), high: $("priority"), enqueue: $("pqEnqueueBtn"),
    deqValue: $("dequeueValue"), dequeue: $("pqDequeueBtn"),
    peek: $("pqPeekBtn"), rear: $("pqRearBtn"), isEmpty: $("pqIsEmptyBtn"), isFull: $("pqIsFullBtn"),
    size: $("pqSizeBtn"), display: $("pqDisplayBtn"), output: $("output"), stage: $("queueDisplay"),
};
const OPS = [els.value, els.high, els.enqueue, els.deqValue, els.dequeue, els.peek, els.rear, els.isEmpty, els.isFull, els.size, els.display];
const VALUE_LIMITS = { min: 1, max: 9999 };
const fmt = (item) => `${item.value}${item.priority > 0 ? " (P)" : ""}`;

/** @type {PriorityQueue | null} */
let queue = null;

function setOutput(message) {
    els.output.textContent = message;
    window.DSA_UI?.announce?.(message, message.startsWith("Error") ? "assertive" : "polite");
}

function updateControls() {
    els.maxSize.disabled = queue !== null;
    els.allocate.disabled = queue !== null;
    OPS.forEach(el => { el.disabled = queue === null; });
}

function render(highlightIndex = -1) {
    els.stage.replaceChildren();
    if (!queue || queue.isEmpty()) {
        const p = document.createElement("p");
        p.textContent = queue ? "Queue is empty" : "Allocate a queue to begin";
        Object.assign(p.style, { color: "var(--text-muted)", fontStyle: "italic" });
        els.stage.append(p);
    } else {
        queue.toArray().forEach((item, i) => {
            const div = document.createElement("div");
            div.className = `queue-item${item.priority > 0 ? " queue-item-priority" : ""}${i === highlightIndex ? " highlight" : ""}`;
            div.textContent = item.value;
            div.setAttribute("aria-label", `position ${i}: ${item.value}${item.priority > 0 ? ", high priority" : ""}`);
            if (item.priority > 0) {
                const tag = document.createElement("span");
                tag.className = "priority-label";
                tag.textContent = "P";
                tag.setAttribute("aria-hidden", "true");
                div.append(tag);
            }
            els.stage.append(div);
        });
    }
    updateControls();
}

function allocate() {
    const r = parseInteger(els.maxSize.value, { min: 1, max: PriorityQueue.MAX_CAPACITY, label: "Max size" });
    if (!r.ok) { setOutput(`Error: ${r.error}`); els.maxSize.focus(); return; }
    queue = new PriorityQueue(r.value, { allowDuplicates: false });
    render();
    setOutput(`Queue initialized with max size: ${r.value}`);
    els.value.focus();
}

function reset() {
    queue = null;
    els.maxSize.value = "";
    els.value.value = "";
    els.deqValue.value = "";
    els.high.checked = false;
    render();
    setOutput("Queue has been reset. Please set a new max size.");
    els.maxSize.focus();
}

function enqueue() {
    const r = parseInteger(els.value.value, { ...VALUE_LIMITS, label: "Value" });
    if (!r.ok) { setOutput(`Error: ${r.error}`); els.value.focus(); return; }
    const high = els.high.checked;
    const res = queue.enqueue(r.value, high ? 1 : 0);
    if (!res.ok) { setOutput(`Error: ${res.error}`); return; }
    const pos = res.steps[0].indices[0];
    els.value.value = "";
    els.high.checked = false;
    render(pos);
    const normals = queue.size - 1 - pos; // items it jumped ahead of
    setOutput(high
        ? `Enqueued ${r.value} (High Priority) at position ${pos}` +
          (pos === 0 ? ": no other high-priority item is waiting, so it goes to the front" : `: behind ${pos} earlier high-priority item${pos === 1 ? "" : "s"}`) +
          (normals > 0 ? `, ahead of ${normals} normal item${normals === 1 ? "" : "s"}.` : ".")
        : `Enqueued ${r.value} (normal) at the back, position ${pos}.`);
    els.value.focus();
}

function dequeue() {
    if (queue.isEmpty()) { setOutput("Error: Queue is empty. Cannot dequeue."); return; }
    const front = queue.peek();
    const r = parseInteger(els.deqValue.value, { ...VALUE_LIMITS, label: "Value to dequeue" });
    if (!r.ok || r.value !== front.value) {
        setOutput(`Error: You can only dequeue the front element. Type ${front.value} to dequeue it.`);
        els.deqValue.focus();
        return;
    }
    const res = queue.dequeue();
    els.deqValue.value = "";
    render();
    setOutput(`Dequeued: ${fmt(res.value)}`);
}

els.allocate.addEventListener("click", allocate);
els.reset.addEventListener("click", reset);
els.enqueue.addEventListener("click", enqueue);
els.dequeue.addEventListener("click", dequeue);
els.peek.addEventListener("click", () => setOutput(queue.isEmpty() ? "Queue is empty." : `Front of queue: ${fmt(queue.peek())}`));
els.rear.addEventListener("click", () => setOutput(queue.isEmpty() ? "Queue is empty." : `Rear of queue: ${fmt(queue.peekRear())}`));
els.isEmpty.addEventListener("click", () => setOutput(queue.isEmpty() ? "Queue is empty (TRUE)." : "Queue is not empty (FALSE)."));
els.isFull.addEventListener("click", () => setOutput(queue.isFull() ? "Queue is full (TRUE)." : "Queue is not full (FALSE)."));
els.size.addEventListener("click", () => setOutput(`Queue size: ${queue.size} of ${queue.capacity}`));
els.display.addEventListener("click", () =>
    setOutput(queue.isEmpty() ? "Queue Items: Queue is empty." : `Queue Items: ${queue.toArray().map(fmt).join(", ")}`));
els.maxSize.addEventListener("keydown", (e) => { if (e.key === "Enter") allocate(); });
els.value.addEventListener("keydown", (e) => { if (e.key === "Enter" && queue) enqueue(); });
els.deqValue.addEventListener("keydown", (e) => { if (e.key === "Enter" && queue) dequeue(); });

render();
