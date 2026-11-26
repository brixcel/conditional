/**
 * Priority Queue page controller. Logic comes from PriorityQueue (src/structures/queue.js)
 * in two-level mode: "High Priority (P)" = priority 1, normal = priority 0.
 *
 * Kept from the original inline script: positive whole numbers only, no duplicate values,
 * high-priority items go ahead of normal ones and keep FIFO order among themselves,
 * dequeue by typing the front value, and every query button plus "Display List".
 * Changed: max size is now 1–50 (it had no upper limit), and messages say where
 * a new item was placed and why.
 * C13: the queue is a binary max-heap. The pipeline still shows service order; the
 * heap array view replays the recorded sift-up / sift-down steps of the last operation.
 * C20: the Back/Step stepper is now the full shared player (Reset, Back, Play/Pause, Step,
 * speed, progress slider, step counter, pseudocode line; keys via bindPlayerKeys).
 * Each operation autoplays unless reduced motion is on (then it shows the final step).
 */
import { PriorityQueue, QUEUE_INFO } from "../structures/queue.js";
import { parseInteger } from "../core/validate.js";
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";

const $ = (id) => document.getElementById(id);
const els = {
    maxSize: $("maxSize"), allocate: $("pqAllocateBtn"), reset: $("pqResetBtn"),
    value: $("enqueueValue"), high: $("priority"), enqueue: $("pqEnqueueBtn"),
    deqValue: $("dequeueValue"), dequeue: $("pqDequeueBtn"),
    peek: $("pqPeekBtn"), rear: $("pqRearBtn"), isEmpty: $("pqIsEmptyBtn"), isFull: $("pqIsFullBtn"),
    size: $("pqSizeBtn"), display: $("pqDisplayBtn"), output: $("output"), stage: $("queueDisplay"),
    heapStage: $("heapDisplay"),
    resetBtn: $("resetBtn"), prevBtn: $("prevBtn"), playBtn: $("playBtn"), nextBtn: $("nextBtn"),
    speed: $("speedSelect"), progress: $("progress"), counter: $("stepCounter"),
    stepMessage: $("stepMessage"), codeHeading: $("codeHeading"), code: $("pseudocode"),
};
const PSEUDOCODE = QUEUE_INFO.priority.pseudocode;
const CODE_TITLES = { enqueue: "enqueue(x, priority) with sift-up", dequeue: "dequeue() with sift-down" };
const reduceMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
const OPS = [els.value, els.high, els.enqueue, els.deqValue, els.dequeue, els.peek, els.rear, els.isEmpty, els.isFull, els.size, els.display];
const VALUE_LIMITS = { min: 1, max: 9999 };
const HEAP_HINT = "Enqueue or dequeue to see the sift-up and sift-down steps.";
const fmt = (item) => `${item.value}${item.priority > 0 ? " (P)" : ""}`;

/** @type {PriorityQueue | null} */
let queue = null;
/** False until an operation records steps, and again after allocate/reset (player keeps no stale steps visible). */
let stepsLoaded = false;

const player = new StepPlayer({ onStep: renderHeapStep, baseDelay: 750 });
player.setSpeed(Number(els.speed.value) || 1);
let quiet = false;     // true while loading steps: the result is announced through setOutput()
let liveReady = false; // page setup stays silent
let codeKey = "";

// Keys and buttons go through these wrappers so nothing replays stale steps after allocate/reset.
const whenLoaded = (fn) => () => { if (stepsLoaded) fn(); };
const playerControls = {
    toggle: whenLoaded(() => { if (player.length > 1) player.toggle(); }),
    pause: whenLoaded(() => player.pause()),
    next: whenLoaded(() => player.next()),
    prev: whenLoaded(() => player.prev()),
    reset: whenLoaded(() => player.reset()),
};

function setOutput(message) {
    els.output.textContent = message;
    window.DSA_UI?.announce?.(message, message.startsWith("Error") ? "assertive" : "polite");
}

function updateControls() {
    els.maxSize.disabled = queue !== null;
    els.allocate.disabled = queue !== null;
    OPS.forEach(el => { el.disabled = queue === null; });
    const focused = document.activeElement;
    els.playBtn.disabled = !stepsLoaded || player.length <= 1;
    els.prevBtn.disabled = !stepsLoaded || player.atStart;
    els.resetBtn.disabled = !stepsLoaded || player.atStart;
    els.nextBtn.disabled = !stepsLoaded || player.atEnd;
    els.progress.disabled = !stepsLoaded || player.length <= 1;
    // A focused Back/Reset/Step button that just became disabled would drop focus to <body>.
    window.DSA_UI?.rescueFocus?.(focused, els.playBtn, els.value, els.maxSize);
}

function setCode(key, line = 0) {
    if (key !== codeKey) {
        codeKey = key;
        els.codeHeading.textContent = key ? `Pseudocode: ${CODE_TITLES[key]}` : "Pseudocode";
        els.code.replaceChildren(...(PSEUDOCODE[key] ?? []).map(text => {
            const li = document.createElement("li");
            li.textContent = text;
            return li;
        }));
    }
    [...els.code.children].forEach((li, i) => li.classList.toggle("active", i + 1 === line));
}

function emptyNote(text) {
    const p = document.createElement("p");
    p.className = "text-muted text-italic";
    p.textContent = text;
    return p;
}

/** Service-order pipeline (front first). Always shows the current queue. */
function render(highlightId = null) {
    els.stage.replaceChildren();
    if (!queue || queue.isEmpty()) {
        els.stage.append(emptyNote(queue ? "Queue is empty" : "Allocate a queue to begin"));
    } else {
        queue.toArray().forEach((item, i) => {
            const div = document.createElement("div");
            div.className = `queue-item${item.priority > 0 ? " queue-item-priority" : ""}${item.id === highlightId ? " highlight" : ""}`;
            div.textContent = item.value;
            div.setAttribute("aria-label", `position ${i}: ${item.value}${item.priority > 0 ? ", high priority" : ""}, arrival ${item.id}`);
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

function toneFor(type) {
    if (type === "compare") return "hp-compare";
    if (type === "swap") return "hp-swap";
    if (type === "settled") return "hp-settled";
    if (type === "enqueue" || type === "dequeue" || type === "move-last") return "hp-select";
    return "";
}

/** Heap-array view of one recorded step (its snapshot, not the live queue). */
function drawHeap(heap, indices = [], type = "") {
    if (heap.length === 0) {
        els.heapStage.replaceChildren(emptyNote("Heap array is empty (size 0)."));
        return;
    }
    const active = new Set(indices);
    const tone = toneFor(type);
    els.heapStage.replaceChildren(...heap.map((item, i) => {
        const wrap = document.createElement("div");
        wrap.className = "slot-wrap";
        const isActive = active.has(i) && tone !== "";
        const idx = document.createElement("span");
        idx.className = isActive || i === 0 ? "slot-label slot-label-active mono" : "slot-label mono";
        idx.textContent = i === 0 ? "[0] ROOT" : `[${i}]`;
        const box = document.createElement("div");
        box.className = ["node-box", "hp-cell", "mono", i === 0 ? "hp-root" : "", isActive ? tone : ""].filter(Boolean).join(" ");
        box.textContent = String(item.value);
        box.setAttribute("aria-label", `Index ${i}: ${item.value}, priority ${item.priority}, arrival ${item.id}`);
        const meta = document.createElement("span");
        meta.className = "slot-label mono";
        meta.textContent = `${item.priority > 0 ? "P " : ""}#${item.id}`;
        meta.setAttribute("aria-hidden", "true");
        wrap.append(idx, box, meta);
        return wrap;
    }));
}

function renderHeapStep(step, index, p) {
    drawHeap(step.snapshot.heap, step.indices, step.type);
    setCode(step.operation, step.line);
    // aria-live is set before the text: autoplay and loads stay quiet; user steps and the last autoplay frame speak.
    els.stepMessage.setAttribute("aria-live", p.isPlaying || quiet || !liveReady ? "off" : "polite");
    els.stepMessage.textContent = step.message;
    els.counter.textContent = `Step ${index + 1} / ${p.length}`;
    els.progress.max = Math.max(0, p.length - 1);
    els.progress.value = index;
    els.progress.setAttribute("aria-valuetext", `Step ${index + 1} of ${p.length}`);
    els.playBtn.textContent = p.isPlaying ? "⏸ Pause" : (p.atEnd && p.length > 1 ? "↻ Replay" : "▶ Play");
    els.playBtn.setAttribute("aria-label", p.isPlaying ? "Pause" : (p.atEnd && p.length > 1 ? "Replay" : "Play"));
    updateControls();
}

/** Loads an operation's steps and autoplays them; with reduced motion it shows the last one (the current state) and Back replays. */
function showSteps(steps) {
    stepsLoaded = true;
    quiet = true;
    player.load(steps);
    const animate = steps.length > 1 && !reduceMotion();
    if (!animate) player.goTo(steps.length - 1);
    quiet = false;
    if (animate) player.play();
}

function clearSteps() {
    player.pause();
    stepsLoaded = false;
    drawHeap(queue ? queue.heapArray() : []);
    els.stepMessage.setAttribute("aria-live", "off");
    els.stepMessage.textContent = HEAP_HINT;
    els.counter.textContent = "Step 0 / 0";
    els.progress.max = 0;
    els.progress.value = 0;
    els.progress.setAttribute("aria-valuetext", "No steps");
    els.playBtn.textContent = "\u25B6 Play";
    els.playBtn.setAttribute("aria-label", "Play");
    setCode("");
    if (liveReady) els.stepMessage.setAttribute("aria-live", "polite");
}

function allocate() {
    const r = parseInteger(els.maxSize.value, { min: 1, max: PriorityQueue.MAX_CAPACITY, label: "Max size" });
    if (!r.ok) { setOutput(`Error: ${r.error}`); els.maxSize.focus(); return; }
    queue = new PriorityQueue(r.value, { allowDuplicates: false });
    clearSteps();
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
    clearSteps();
    render();
    setOutput("Queue has been reset. Please set a new max size.");
    els.maxSize.focus();
}

function enqueue() {
    const r = parseInteger(els.value.value, { ...VALUE_LIMITS, label: "Value" });
    if (!r.ok) { setOutput(`Error: ${r.error}`); els.value.focus(); return; }
    const high = els.high.checked;
    const res = queue.enqueue(r.value, high ? 1 : 0);
    if (!res.ok) { showSteps(res.steps); setOutput(`Error: ${res.error}`); return; }
    const pos = queue.toArray().findIndex(it => it.id === res.value.id); // position in service order
    els.value.value = "";
    els.high.checked = false;
    render(res.value.id);
    showSteps(res.steps);
    const normals = queue.size - 1 - pos; // items it jumped ahead of
    setOutput(high
        ? `Enqueued ${r.value} (High Priority) at position ${pos}` +
          (pos === 0 ? ": no other high-priority item is waiting, so it goes to the front" : `: behind ${pos} earlier high-priority item${pos === 1 ? "" : "s"}`) +
          (normals > 0 ? `, ahead of ${normals} normal item${normals === 1 ? "" : "s"}.` : ".")
        : `Enqueued ${r.value} (normal) at the back, position ${pos}.`);
    els.value.focus();
}

function dequeue() {
    if (queue.isEmpty()) { showSteps(queue.dequeue().steps); setOutput("Error: Queue is empty. Cannot dequeue."); return; }
    const front = queue.peek();
    // The field is type="text", so letters reach parseInteger and are refused like empty input.
    const r = parseInteger(els.deqValue.value, { ...VALUE_LIMITS, label: "Value to dequeue" });
    if (!r.ok || r.value !== front.value) {
        setOutput(`Error: You can only dequeue the front element. Type ${front.value} to dequeue it.`);
        els.deqValue.focus();
        return;
    }
    const res = queue.dequeue();
    els.deqValue.value = "";
    render();
    showSteps(res.steps);
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

els.playBtn.addEventListener("click", playerControls.toggle);
els.nextBtn.addEventListener("click", () => { playerControls.pause(); playerControls.next(); });
els.prevBtn.addEventListener("click", playerControls.prev);
els.resetBtn.addEventListener("click", playerControls.reset);
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value) || 1));
els.progress.addEventListener("input", () => {
    const target = Number(els.progress.value);
    if (!stepsLoaded) return;
    player.pause();
    player.goTo(target);
});
bindPlayerKeys(document, playerControls);

clearSteps();
render();
liveReady = true;
els.stepMessage.setAttribute("aria-live", "polite");
