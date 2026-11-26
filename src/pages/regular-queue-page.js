/**
 * Regular Queue page controller. Logic comes from LinearQueue (src/structures/queue.js).
 *
 * Kept from the original page: set/reset capacity, enqueue, dequeue (confirm by
 * typing the front value), peek, rear, isEmpty, isFull, clear, and positive whole numbers only.
 * Changed: the old page blocked every enqueue after any dequeue until "Clear".
 * The queue now behaves like a real linear array queue, so enqueue works until
 * rear reaches the last index, and the page explains the resulting "false overflow".
 */
import { LinearQueue } from "../structures/queue.js";
import { parseInteger } from "../core/validate.js";

const $ = (id) => document.getElementById(id);
const els = {
    size: $("queueSize"), setSize: $("setQueueSizeBtn"), reset: $("resetQueueSizeBtn"),
    input: $("queueInput"), enqueue: $("enqueueBtn"), dequeue: $("dequeueBtn"),
    peek: $("peekBtn"), rear: $("rearBtn"), isEmpty: $("isEmptyBtn"), isFull: $("isFullBtn"), clear: $("clearQueueBtn"),
    message: $("queueMessage"), stage: $("queue"), state: $("queueState"),
};

/** @type {LinearQueue | null} */
let queue = null;
let busy = false; // true while the dequeue exit animation runs

function show(message, type = "info") {
    els.message.textContent = message;
    els.message.className = `alert-banner alert-live alert-${type}`;
    els.message.hidden = false;
    window.DSA_UI?.announce?.(message, type === "error" ? "assertive" : "polite");
}

function label(text, strong) {
    const span = document.createElement("span");
    span.className = strong ? "slot-label slot-label-active" : "slot-label";
    span.textContent = text;
    return span;
}

function render() {
    els.stage.replaceChildren();
    if (!queue) {
        els.stage.append(label("Set a queue size to allocate the array.", false));
        els.state.textContent = "No array allocated yet.";
        updateButtons();
        return;
    }
    const { slots, front, rear, count } = queue.snapshot();
    slots.forEach((value, i) => {
        const wrap = document.createElement("div");
        wrap.className = "slot-wrap";

        const isFront = count > 0 && i === front;
        const isRear = count > 0 && i === rear;
        const tag = isFront && isRear ? "FRONT & REAR" : isFront ? "FRONT" : isRear ? "REAR" : "";
        wrap.append(label(`${tag ? tag + " " : ""}[${i}]`, Boolean(tag)));

        const car = document.createElement("div");
        car.className = "car";
        car.classList.toggle("car-empty", value === null);
        const num = document.createElement("div");
        num.className = "number";
        if (value === null) {
            num.textContent = count > 0 && i < front ? "freed" : "empty";
            car.setAttribute("aria-label", `index ${i}: ${num.textContent}`);
        } else {
            num.textContent = value;
            car.setAttribute("aria-label", `index ${i}: ${value}${tag ? `, ${tag.toLowerCase()}` : ""}`);
        }
        car.append(num);
        wrap.append(car);
        els.stage.append(wrap);
    });

    const waste = queue.wastedSlots;
    els.state.textContent = count === 0
        ? `Empty. front = 0, rear = −1, capacity = ${queue.capacity}.`
        : `front = ${front}, rear = ${rear}, elements = ${count} / ${queue.capacity}` +
          (waste ? `, ${waste} freed slot${waste === 1 ? "" : "s"} before front (not reusable)` : "") + ".";
    updateButtons();
}

function updateButtons() {
    const focused = document.activeElement;
    const ready = queue !== null && !busy;
    const empty = !queue || queue.isEmpty();
    els.setSize.disabled = queue !== null;
    els.size.disabled = queue !== null;
    els.input.disabled = !ready;
    // Stays enabled when rear is at the end so students can see the overflow / false-overflow explanation.
    els.enqueue.disabled = !ready;
    els.dequeue.disabled = !ready || empty;
    els.peek.disabled = !ready || empty;
    els.rear.disabled = !ready || empty;
    els.isEmpty.disabled = !ready;
    els.isFull.disabled = !ready;
    els.clear.disabled = !ready || empty;
    // Focused control may have just been disabled (e.g. Clear empties the list): keep focus on the page.
    // (Not during the dequeue animation: finish() puts focus back on the input itself.)
    if (!busy) window.DSA_UI?.rescueFocus?.(focused, els.input, els.size, els.reset);
}

function setSize() {
    const r = parseInteger(els.size.value, { min: 1, max: LinearQueue.MAX_CAPACITY, label: "Queue size" });
    if (!r.ok) { show(r.error, "error"); els.size.focus(); return; }
    queue = new LinearQueue(r.value);
    render();
    show(`Allocated an array of ${r.value} slot${r.value === 1 ? "" : "s"}. front = 0, rear = −1.`, "success");
    els.input.focus();
}

function resetSize() {
    queue = null;
    els.size.value = "";
    els.input.value = "";
    render();
    show("Queue reset. Enter a new size to allocate a fresh array.", "info");
    els.size.focus();
}

function enqueue() {
    const r = parseInteger(els.input.value, { min: 1, max: 9999, label: "Value" });
    if (!r.ok) { show(r.error, "error"); els.input.focus(); return; }
    const res = queue.enqueue(r.value);
    if (!res.ok) { show(res.error, res.steps[0]?.type === "false-overflow" ? "warning" : "error"); return; }
    els.input.value = "";
    render();
    show(res.steps[0].message, "success");
    els.input.focus();
}

function dequeue() {
    const front = queue.peek();
    const r = parseInteger(els.input.value, { min: 1, max: 9999, label: "Value to dequeue" });
    if (!r.ok) { show(`${r.error} Type the front value (${front}) to confirm the dequeue.`, "error"); els.input.focus(); return; }
    if (r.value !== front) { show(`Only the front can leave a queue. The front is ${front}. Type ${front} to dequeue it.`, "error"); return; }

    const res = queue.dequeue();
    const exiting = els.stage.children[res.steps[0].indices[0]]?.querySelector(".car");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => { busy = false; els.input.value = ""; render(); show(res.steps[0].message, "info"); els.input.focus(); };
    if (exiting && !reduceMotion) {
        busy = true;
        updateButtons();
        exiting.classList.add("car-exit");
        setTimeout(finish, 200);
    } else finish();
}

function clearQueue() {
    queue.clear();
    render();
    show("Queue cleared. Every slot is empty and front = 0, rear = −1.", "info");
}

els.setSize.addEventListener("click", setSize);
els.reset.addEventListener("click", resetSize);
els.enqueue.addEventListener("click", enqueue);
els.dequeue.addEventListener("click", dequeue);
els.peek.addEventListener("click", () => show(`Front element: ${queue.peek()} (index ${queue.front}).`, "info"));
els.rear.addEventListener("click", () => show(`Rear element: ${queue.peekRear()} (index ${queue.rear}).`, "info"));
els.isEmpty.addEventListener("click", () => show(`isEmpty() → ${queue.isEmpty()}`, "info"));
els.isFull.addEventListener("click", () => {
    const full = queue.isFull();
    const extra = !full && queue.rearAtEnd() ? " (but rear is at the last index, so enqueue is blocked: false overflow)" : "";
    show(`isFull() → ${full}${extra}`, "info");
});
els.clear.addEventListener("click", clearQueue);
els.size.addEventListener("keydown", (e) => { if (e.key === "Enter") setSize(); });
els.input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !els.enqueue.disabled) enqueue(); });

render();
