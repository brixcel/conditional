/**
 * Circular Queue page controller. Logic comes from CircularQueue (src/structures/queue.js).
 *
 * Kept from the original inline script: capacity 2–100, values 1–1000, dequeue by
 * typing the front value, ring visual with Front/Rear labels, and status banner + output box.
 * Fixed: when front === rear the two labels were drawn on top of each other; now one
 * "Front & Rear" label. Messages now explain the modulo arithmetic (from the module's steps).
 */
import { CircularQueue } from "../structures/queue.js";
import { parseInteger } from "../core/validate.js";

const $ = (id) => document.getElementById(id);
const els = {
    size: $("queueSize"), allocate: $("cqAllocateBtn"), reset: $("cqResetBtn"),
    enqValue: $("enqueueValue"), enqueue: $("cqEnqueueBtn"), deqValue: $("dequeueValue"), dequeue: $("cqDequeueBtn"),
    peek: $("cqPeekBtn"), rear: $("cqRearBtn"), sizeBtn: $("cqSizeBtn"), isEmpty: $("cqIsEmptyBtn"), isFull: $("cqIsFullBtn"),
    status: $("status"), output: $("output"), ring: $("queueContainer"),
};
const OPS = [els.enqValue, els.enqueue, els.deqValue, els.dequeue, els.peek, els.rear, els.sizeBtn, els.isEmpty, els.isFull];
const VALUE_LIMITS = { min: 1, max: 1000 };

/** @type {CircularQueue | null} */
let queue = null;

function show(text, type = "info") {
    els.status.textContent = text;
    els.status.className = `alert-banner alert-live alert-${type}`;
    els.status.hidden = !text;
    window.DSA_UI?.announce?.(text, type === "error" ? "assertive" : "polite");
    els.output.textContent = text;
}

function updateControls() {
    els.size.disabled = queue !== null;
    els.allocate.disabled = queue !== null;
    OPS.forEach(el => { el.disabled = queue === null; });
}

/** Evenly spaced points on a circle, starting at 3 o'clock and going clockwise (screen y grows down). */
function ringPositions(n, radius, center) {
    return Array.from({ length: n }, (_, i) => {
        const a = (2 * Math.PI * i) / n;
        return { x: center + radius * Math.cos(a), y: center + radius * Math.sin(a), angle: a };
    });
}

function render() {
    els.ring.replaceChildren();
    if (!queue) {
        els.ring.style.width = "240px";
        els.ring.style.height = "240px";
        updateControls();
        return;
    }
    const max = Math.min(window.innerWidth - 60, 300);
    const radius = Math.max(65, Math.floor((max - 50) / 2));
    const side = 2 * radius + 50;
    els.ring.style.width = `${side}px`;
    els.ring.style.height = `${side}px`;
    const center = radius + 25;
    const pts = ringPositions(queue.capacity, radius, center);
    const { slots, front, rear } = queue.snapshot();
    const empty = queue.isEmpty();

    pts.forEach((p, idx) => {
        const slot = document.createElement("div");
        slot.className = "cqv-queue-slot";
        slot.style.left = `${p.x}px`;
        slot.style.top = `${p.y}px`;
        const tag = document.createElement("span");
        tag.textContent = `[${idx}]`;
        Object.assign(tag.style, { fontSize: "0.6rem", display: "block", lineHeight: "1" });
        slot.append(tag);
        if (slots[idx] !== null) {
            slot.classList.add("cqv-queue-slot-filled");
            tag.style.opacity = "0.8";
            slot.append(String(slots[idx]));
            slot.setAttribute("aria-label", `index ${idx}: ${slots[idx]}`);
        } else {
            tag.style.color = "var(--text-muted)";
            slot.setAttribute("aria-label", `index ${idx}: empty`);
        }
        els.ring.append(slot);

        if (!empty && (idx === front || idx === rear)) {
            const label = idx === front && idx === rear ? "Front & Rear" : idx === front ? "Front (F)" : "Rear (R)";
            const ind = document.createElement("div");
            ind.className = "cqv-front-last-indicator";
            ind.textContent = label;
            ind.style.left = `${p.x + 34 * Math.cos(p.angle)}px`;
            ind.style.top = `${p.y + 34 * Math.sin(p.angle)}px`;
            els.ring.append(ind);
        }
    });
    els.ring.setAttribute("aria-label",
        empty ? `Empty ring of ${queue.capacity} slots. front = rear = −1.`
              : `Ring of ${queue.capacity} slots holding ${queue.size}: front index ${front}, rear index ${rear}.`);
    updateControls();
}

function allocate() {
    const r = parseInteger(els.size.value, { min: CircularQueue.MIN_CAPACITY, max: CircularQueue.MAX_CAPACITY, label: "Capacity" });
    if (!r.ok) { show(r.error, "error"); els.size.focus(); return; }
    queue = new CircularQueue(r.value);
    render();
    show(`Ring allocated with ${r.value} slots (indices 0–${r.value - 1}). Empty: front = rear = −1.`, "success");
    els.enqValue.focus();
}

function reset() {
    queue = null;
    els.size.value = "";
    els.enqValue.value = "";
    els.deqValue.value = "";
    render();
    show("The queue has been reset. Please input a new queue size to start again.", "info");
    els.size.focus();
}

function enqueue() {
    const r = parseInteger(els.enqValue.value, { ...VALUE_LIMITS, label: "Value" });
    if (!r.ok) { show(r.error, "error"); els.enqValue.focus(); return; }
    const res = queue.enqueue(r.value);
    if (!res.ok) { show(res.error, "warning"); return; }
    els.enqValue.value = "";
    render();
    show(res.steps[0].message + (queue.isFull() ? " The ring is now full." : ""), queue.isFull() ? "warning" : "success");
    els.enqValue.focus();
}

function dequeue() {
    if (queue.isEmpty()) { show("Queue underflow: the queue is empty, so there is nothing to dequeue.", "warning"); return; }
    const front = queue.peek();
    const r = parseInteger(els.deqValue.value, { ...VALUE_LIMITS, label: "Value to dequeue" });
    if (!r.ok) { show(`${r.error} Type the front value (${front}) to dequeue it.`, "error"); els.deqValue.focus(); return; }
    if (r.value !== front) { show(`You can only dequeue the front element. The front is ${front}, not ${r.value}.`, "error"); return; }
    const res = queue.dequeue();
    els.deqValue.value = "";
    render();
    show(res.steps[0].message, "info");
}

els.allocate.addEventListener("click", allocate);
els.reset.addEventListener("click", reset);
els.enqueue.addEventListener("click", enqueue);
els.dequeue.addEventListener("click", dequeue);
els.peek.addEventListener("click", () =>
    show(queue.isEmpty() ? "Queue is empty." : `Peek: ${queue.peek()} (front index ${queue.front})`, "info"));
els.rear.addEventListener("click", () =>
    show(queue.isEmpty() ? "Queue is empty." : `Rear: ${queue.peekRear()} (rear index ${queue.rear})`, "info"));
els.sizeBtn.addEventListener("click", () => show(`Queue size: ${queue.size} of ${queue.capacity}`, "info"));
els.isEmpty.addEventListener("click", () => show(queue.isEmpty() ? "TRUE (Queue is empty)" : "FALSE (Queue is not empty)", "info"));
els.isFull.addEventListener("click", () => show(queue.isFull() ? "TRUE (Queue is full)" : "FALSE (Queue is not full)", "info"));
els.size.addEventListener("keydown", (e) => { if (e.key === "Enter") allocate(); });
els.enqValue.addEventListener("keydown", (e) => { if (e.key === "Enter" && queue) enqueue(); });
els.deqValue.addEventListener("keydown", (e) => { if (e.key === "Enter" && queue) dequeue(); });

let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 120); });

render();
