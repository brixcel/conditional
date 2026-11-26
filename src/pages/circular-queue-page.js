/**
 * Circular Queue page controller. Logic comes from CircularQueue (src/structures/queue.js).
 * Playback: src/core/step-player.js; shortcuts: src/core/player-keys.js.
 *
 * Kept from the original inline script: capacity 2–100, values 1–1000, dequeue by
 * typing the front value, ring visual with Front/Rear labels, and status banner + output box.
 * Fixed: when front === rear the two labels were drawn on top of each other; now one
 * "Front & Rear" label. Messages explain the modulo arithmetic (from the module's steps).
 * C20: every operation loads its recorded steps (full check, front/rear pointer moves with
 * wrap-around, store, clear slot) into the step player with the pseudocode line highlighted.
 * The ring is now an SVG built once per capacity and updated per step (no inline styles,
 * no resize handler: the viewBox scales to the stage).
 */
import { CircularQueue, QUEUE_INFO } from "../structures/queue.js";
import { parseInteger } from "../core/validate.js";
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const SLOT_R = 20;
const LABEL_MARGIN = 64; // room for "Front & Rear" (about 70 units wide) centred just outside the ring

const $ = (id) => document.getElementById(id);
const els = {
    size: $("queueSize"), allocate: $("cqAllocateBtn"), reset: $("cqResetBtn"),
    enqValue: $("enqueueValue"), enqueue: $("cqEnqueueBtn"), deqValue: $("dequeueValue"), dequeue: $("cqDequeueBtn"),
    peek: $("cqPeekBtn"), rear: $("cqRearBtn"), sizeBtn: $("cqSizeBtn"), isEmpty: $("cqIsEmptyBtn"), isFull: $("cqIsFullBtn"),
    status: $("status"), output: $("output"), ring: $("queueContainer"),
    resetBtn: $("resetBtn"), prevBtn: $("prevBtn"), playBtn: $("playBtn"), nextBtn: $("nextBtn"),
    speed: $("speedSelect"), progress: $("progress"), counter: $("stepCounter"),
    stepMessage: $("stepMessage"), codeHeading: $("codeHeading"), code: $("pseudocode"),
};
const OPS = [els.enqValue, els.enqueue, els.deqValue, els.dequeue, els.peek, els.rear, els.sizeBtn, els.isEmpty, els.isFull];
const VALUE_LIMITS = { min: 1, max: 1000 };
const PSEUDOCODE = QUEUE_INFO.circular.pseudocode;
const CODE_TITLES = { enqueue: "enqueue(x)", dequeue: "dequeue()", peek: "peek()", rear: "rear()", isEmpty: "isEmpty()", isFull: "isFull()", size: "size()" };
const PLAYER_BUTTONS = [els.resetBtn, els.prevBtn, els.playBtn, els.nextBtn];
const STEP_HINT = "Allocate a ring, then enqueue or dequeue to watch each step.";
const TONES = ["hp-compare", "hp-select", "hp-swap", "hp-settled"];
const reduceMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** @type {CircularQueue | null} */
let queue = null;

/* ---------- player ---------- */

const player = new StepPlayer({ onStep: render, baseDelay: 750 });
player.setSpeed(Number(els.speed.value) || 1);
let loaded = false;
let quiet = false;
let liveReady = false;
let codeKey = "";
/** One entry per ring slot: { g, value, label } plus the pointer label nodes. */
let ring = null;

const whenLoaded = (fn) => () => { if (loaded) fn(); };
const playerControls = {
    toggle: whenLoaded(() => { if (player.length > 1) player.toggle(); }),
    pause: whenLoaded(() => player.pause()),
    next: whenLoaded(() => player.next()),
    prev: whenLoaded(() => player.prev()),
    reset: whenLoaded(() => player.reset()),
};

function loadSteps(steps) {
    loaded = true;
    quiet = true;
    player.load(steps);
    const animate = steps.length > 1 && !reduceMotion();
    if (!animate) player.goTo(steps.length - 1);
    quiet = false;
    if (animate) player.play();
}

function stateStep(message) {
    return { type: "state", operation: "", line: 0, indices: [], message, snapshot: queue.snapshot() };
}

function unloadPlayer() {
    player.pause();
    loaded = false;
    ring = null;
    els.ring.replaceChildren();
    els.ring.setAttribute("aria-label", "Circular queue ring (not allocated)");
    els.counter.textContent = "Step 0 / 0";
    els.progress.max = 0;
    els.progress.value = 0;
    els.progress.disabled = true;
    els.progress.setAttribute("aria-valuetext", "No steps");
    PLAYER_BUTTONS.forEach(b => { b.disabled = true; });
    els.playBtn.textContent = "▶ Play";
    els.playBtn.setAttribute("aria-label", "Play");
    els.stepMessage.setAttribute("aria-live", "off");
    els.stepMessage.textContent = STEP_HINT;
    setCode("");
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

/* ---------- ring geometry (pure) and SVG ---------- */

/** Evenly spaced points on a circle, starting at 3 o'clock and going clockwise (SVG y grows down). */
function ringPositions(n, radius, center) {
    return Array.from({ length: n }, (_, i) => {
        const a = (2 * Math.PI * i) / n;
        return { x: center + radius * Math.cos(a), y: center + radius * Math.sin(a), angle: a };
    });
}

function svg(tag, attrs = {}, cls = "") {
    const el = document.createElementNS(SVG_NS, tag);
    if (cls) el.setAttribute("class", cls);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
}

/** Builds the ring once per capacity. The radius grows with n so slots never overlap; the viewBox scales it to fit. */
function mountRing(n) {
    const radius = Math.max(110, (n * (2 * SLOT_R + 8)) / (2 * Math.PI));
    const center = radius + SLOT_R + LABEL_MARGIN;
    const side = 2 * center;
    const root = svg("svg", { viewBox: `0 0 ${side} ${side}`, "aria-hidden": "true", focusable: "false" }, "hp-svg cq-ring-svg");
    root.append(svg("circle", { cx: center, cy: center, r: radius }, "cq-track"));
    const pts = ringPositions(n, radius, center);
    const slots = pts.map((p, i) => {
        const g = svg("g", {}, "hp-node cq-slot-empty");
        g.append(svg("circle", { cx: p.x, cy: p.y, r: SLOT_R }, "hp-node-circle"));
        const value = svg("text", { x: p.x, y: p.y }, "hp-node-value");
        const inner = radius - SLOT_R - 12;
        const index = svg("text", { x: center + inner * Math.cos(p.angle), y: center + inner * Math.sin(p.angle) + 4 }, "hp-node-index");
        index.textContent = `[${i}]`;
        g.append(value, index);
        root.append(g);
        return { g, value };
    });
    // Pointer labels sit outside the ring next to their slot; text and position, not colour, say which is which.
    const pointer = () => {
        const g = svg("g", {}, "hp-node hp-root");
        const t = svg("text", {}, "hp-node-index");
        g.append(t);
        root.append(g);
        return { g, t };
    };
    ring = { n, pts, slots, front: pointer(), rear: pointer(), outer: radius + SLOT_R + 22, center };
    els.ring.replaceChildren(root);
}

function placePointer(ptr, idx, text) {
    if (idx < 0) { ptr.g.setAttribute("display", "none"); return; }
    const a = ring.pts[idx].angle;
    ptr.g.removeAttribute("display");
    ptr.t.setAttribute("x", String(ring.center + ring.outer * Math.cos(a)));
    ptr.t.setAttribute("y", String(ring.center + ring.outer * Math.sin(a) + 4));
    ptr.t.textContent = text;
}

function toneFor(type) {
    if (type === "check" || type === "peek" || type === "rear" || type === "overflow") return "hp-compare";
    if (type === "move-rear" || type === "move-front") return "hp-select";
    if (type === "dequeue") return "hp-swap";
    if (type === "enqueue") return "hp-settled";
    return "";
}

function render(step, index, p) {
    const { slots, front, rear, size, capacity } = step.snapshot;
    if (!ring || ring.n !== capacity) mountRing(capacity);
    const tone = toneFor(step.type);
    const active = new Set(step.indices);
    slots.forEach((v, i) => {
        const s = ring.slots[i];
        const text = v === null ? "" : String(v);
        if (s.value.textContent !== text) s.value.textContent = text;
        s.g.classList.toggle("cq-slot-filled", v !== null);
        s.g.classList.toggle("cq-slot-empty", v === null);
        TONES.forEach(t => s.g.classList.toggle(t, t === tone && active.has(i)));
    });
    if (front >= 0 && front === rear) {
        placePointer(ring.front, front, "Front & Rear");
        placePointer(ring.rear, -1, "");
    } else {
        placePointer(ring.front, front, "Front (F)");
        placePointer(ring.rear, rear, "Rear (R)");
    }
    // role="img" on the container: its name lists every slot.
    const slotText = slots.map((v, i) => `[${i}] ${v === null ? "empty" : v}`).join(", ");
    els.ring.setAttribute("aria-label", front === -1
        ? `Empty ring of ${capacity} slots. front = rear = −1.`
        : `Ring of ${capacity} slots holding ${size}: front index ${front}, rear index ${rear}. Slots: ${slotText}.`);

    setCode(step.operation, step.line);
    els.stepMessage.setAttribute("aria-live", p.isPlaying || quiet || !liveReady ? "off" : "polite");
    els.stepMessage.textContent = step.message;

    els.counter.textContent = `Step ${index + 1} / ${p.length}`;
    els.progress.max = Math.max(0, p.length - 1);
    els.progress.value = index;
    els.progress.disabled = p.length <= 1;
    els.progress.setAttribute("aria-valuetext", `Step ${index + 1} of ${p.length}`);
    els.playBtn.textContent = p.isPlaying ? "⏸ Pause" : (p.atEnd && p.length > 1 ? "↻ Replay" : "▶ Play");
    els.playBtn.setAttribute("aria-label", p.isPlaying ? "Pause" : (p.atEnd && p.length > 1 ? "Replay" : "Play"));

    const focused = document.activeElement;
    els.playBtn.disabled = p.length <= 1;
    els.prevBtn.disabled = p.atStart;
    els.resetBtn.disabled = p.atStart;
    els.nextBtn.disabled = p.atEnd;
    window.DSA_UI?.rescueFocus?.(focused, els.playBtn, els.enqValue, els.size);
}

/* ---------- feedback & controls ---------- */

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

/* ---------- operations ---------- */

function allocate() {
    const r = parseInteger(els.size.value, { min: CircularQueue.MIN_CAPACITY, max: CircularQueue.MAX_CAPACITY, label: "Capacity" });
    if (!r.ok) { show(r.error, "error"); els.size.focus(); return; }
    queue = new CircularQueue(r.value);
    updateControls();
    loadSteps([stateStep(`Allocated a ring of ${r.value} slots. Empty: front = rear = −1.`)]);
    show(`Ring allocated with ${r.value} slots (indices 0–${r.value - 1}). Empty: front = rear = −1.`, "success");
    els.enqValue.focus();
}

function reset() {
    queue = null;
    els.size.value = "";
    els.enqValue.value = "";
    els.deqValue.value = "";
    unloadPlayer();
    updateControls();
    show("The queue has been reset. Please input a new queue size to start again.", "info");
    els.size.focus();
}

function enqueue() {
    const r = parseInteger(els.enqValue.value, { ...VALUE_LIMITS, label: "Value" });
    if (!r.ok) { show(r.error, "error"); els.enqValue.focus(); return; }
    const res = queue.enqueue(r.value);
    loadSteps(res.steps);
    if (!res.ok) { show(res.error, "warning"); return; }
    els.enqValue.value = "";
    // Same wording as before C20; the step player shows the individual lines.
    const prev = res.steps[0].snapshot.rear;
    const text = prev === -1
        ? `Queue was empty: front = rear = 0. Stored ${r.value} at index 0.`
        : `rear = (${prev} + 1) mod ${queue.capacity} = ${queue.rear}` +
          (queue.rear < prev ? " (wrapped around to the start)" : "") + `. Stored ${r.value} there.`;
    show(text + (queue.isFull() ? " The ring is now full." : ""), queue.isFull() ? "warning" : "success");
    els.enqValue.focus();
}

function dequeue() {
    if (queue.isEmpty()) {
        loadSteps(queue.dequeue().steps);
        show("Queue underflow: the queue is empty, so there is nothing to dequeue.", "warning");
        return;
    }
    const front = queue.peek();
    // The field is type="text", so letters reach parseInteger and are refused like empty input.
    const r = parseInteger(els.deqValue.value, { ...VALUE_LIMITS, label: "Value to dequeue" });
    if (!r.ok) { show(`${r.error} Type the front value (${front}) to dequeue it.`, "error"); els.deqValue.focus(); return; }
    if (r.value !== front) { show(`You can only dequeue the front element. The front is ${front}, not ${r.value}.`, "error"); return; }
    const from = queue.front;
    const res = queue.dequeue();
    els.deqValue.value = "";
    loadSteps(res.steps);
    show(queue.isEmpty()
        ? `Dequeued ${res.value}. That was the only element, so front = rear = −1 (empty).`
        : `Dequeued ${res.value} from index ${from}. front = (${from} + 1) mod ${queue.capacity} = ${queue.front}` +
          (queue.front < from ? " (wrapped around)." : "."), "info");
}

function runQuery(name, message) {
    const res = queue.query(name);
    loadSteps(res.steps);
    show(message(res.value), "info");
}

els.allocate.addEventListener("click", allocate);
els.reset.addEventListener("click", reset);
els.enqueue.addEventListener("click", enqueue);
els.dequeue.addEventListener("click", dequeue);
els.peek.addEventListener("click", () => runQuery("peek", (v) =>
    v === null ? "Queue is empty." : `Peek: ${v} (front index ${queue.front})`));
els.rear.addEventListener("click", () => runQuery("rear", (v) =>
    v === null ? "Queue is empty." : `Rear: ${v} (rear index ${queue.rear})`));
els.sizeBtn.addEventListener("click", () => runQuery("size", (v) => `Queue size: ${v} of ${queue.capacity}`));
els.isEmpty.addEventListener("click", () => runQuery("isEmpty", (v) => v ? "TRUE (Queue is empty)" : "FALSE (Queue is not empty)"));
els.isFull.addEventListener("click", () => runQuery("isFull", (v) => v ? "TRUE (Queue is full)" : "FALSE (Queue is not full)"));
els.size.addEventListener("keydown", (e) => { if (e.key === "Enter") allocate(); });
els.enqValue.addEventListener("keydown", (e) => { if (e.key === "Enter" && queue) enqueue(); });
els.deqValue.addEventListener("keydown", (e) => { if (e.key === "Enter" && queue) dequeue(); });

els.playBtn.addEventListener("click", playerControls.toggle);
els.nextBtn.addEventListener("click", () => { playerControls.pause(); playerControls.next(); });
els.prevBtn.addEventListener("click", playerControls.prev);
els.resetBtn.addEventListener("click", playerControls.reset);
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value) || 1));
els.progress.addEventListener("input", () => {
    const target = Number(els.progress.value);
    if (!loaded) return;
    player.pause();
    player.goTo(target);
});
bindPlayerKeys(document, playerControls);

unloadPlayer();
updateControls();
liveReady = true;
els.stepMessage.setAttribute("aria-live", "polite");
