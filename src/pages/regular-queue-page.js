/**
 * Regular Queue page controller. Logic comes from LinearQueue (src/structures/queue.js).
 * Playback: src/core/step-player.js; shortcuts: src/core/player-keys.js.
 *
 * Kept from the original page: set/reset capacity, enqueue, dequeue (confirm by
 * typing the front value), peek, rear, isEmpty, isFull, clear, and positive whole numbers only.
 * Changed: the old page blocked every enqueue after any dequeue until "Clear".
 * The queue now behaves like a real linear array queue, so enqueue works until
 * rear reaches the last index, and the page explains the resulting "false overflow".
 * C20: every operation loads its recorded steps (check, move rear/front, store, clear slot)
 * into the step player with the pseudocode line highlighted. The array is drawn from the
 * step snapshot, with slots keyed by index (built once per capacity, then updated).
 */
import { LinearQueue, QUEUE_INFO } from "../structures/queue.js";
import { parseInteger } from "../core/validate.js";
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";

const $ = (id) => document.getElementById(id);
const els = {
    size: $("queueSize"), setSize: $("setQueueSizeBtn"), reset: $("resetQueueSizeBtn"),
    input: $("queueInput"), enqueue: $("enqueueBtn"), dequeue: $("dequeueBtn"),
    peek: $("peekBtn"), rear: $("rearBtn"), isEmpty: $("isEmptyBtn"), isFull: $("isFullBtn"), clear: $("clearQueueBtn"),
    message: $("queueMessage"), stage: $("queue"), state: $("queueState"),
    resetBtn: $("resetBtn"), prevBtn: $("prevBtn"), playBtn: $("playBtn"), nextBtn: $("nextBtn"),
    speed: $("speedSelect"), progress: $("progress"), counter: $("stepCounter"),
    stepMessage: $("stepMessage"), codeHeading: $("codeHeading"), code: $("pseudocode"),
};
const PSEUDOCODE = QUEUE_INFO.linear.pseudocode;
const CODE_TITLES = { enqueue: "enqueue(x)", dequeue: "dequeue()", peek: "peek()", rear: "rear()", isEmpty: "isEmpty()", isFull: "isFull()", size: "size()" };
const PLAYER_BUTTONS = [els.resetBtn, els.prevBtn, els.playBtn, els.nextBtn];
const STEP_HINT = "Set a queue size, then enqueue or dequeue to watch each step.";
const TONES = ["ht-tone-compare", "ht-tone-select", "ht-tone-swap", "ht-tone-sorted"];
const reduceMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** @type {LinearQueue | null} */
let queue = null;

/* ---------- player ---------- */

const player = new StepPlayer({ onStep: render, baseDelay: 750 });
player.setSpeed(Number(els.speed.value) || 1);
let loaded = false;
let quiet = false;
let liveReady = false;
let codeKey = "";
/** @type {{ wrap: HTMLElement, tag: HTMLElement, car: HTMLElement, num: HTMLElement, value: number | null, timer: any }[]} */
let cells = [];

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
    cells.forEach(c => clearTimeout(c.timer));
    cells = [];
    els.stage.replaceChildren(label("Set a queue size to allocate the array.", false));
    els.state.textContent = "No array allocated yet.";
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

/* ---------- rendering (from the step snapshot) ---------- */

function label(text, strong) {
    const span = document.createElement("span");
    span.className = strong ? "slot-label slot-label-active" : "slot-label";
    span.textContent = text;
    return span;
}

/** Builds one slot per array index; later frames only update them. */
function mountCells(capacity) {
    cells.forEach(c => clearTimeout(c.timer));
    cells = Array.from({ length: capacity }, () => {
        const wrap = document.createElement("div");
        wrap.className = "slot-wrap";
        const tag = label("", false);
        const car = document.createElement("div");
        car.className = "car car-empty";
        const num = document.createElement("div");
        num.className = "number";
        car.append(num);
        wrap.append(tag, car);
        return { wrap, tag, car, num, value: null, timer: null };
    });
    els.stage.replaceChildren(...cells.map(c => c.wrap));
}

function toneFor(type) {
    if (type === "check" || type === "peek" || type === "rear" || type === "overflow" || type === "false-overflow") return "ht-tone-compare";
    if (type === "move-rear" || type === "move-front") return "ht-tone-select";
    if (type === "dequeue") return "ht-tone-swap";
    if (type === "enqueue") return "ht-tone-sorted";
    return "";
}

function paintCell(c, value, text) {
    clearTimeout(c.timer);
    c.timer = null;
    c.car.classList.remove("car-exit");
    c.car.classList.toggle("car-empty", value === null);
    c.num.textContent = text;
    c.value = value;
}

function render(step, index, p) {
    const { slots, front, rear, count, capacity } = step.snapshot;
    if (cells.length !== capacity) mountCells(capacity);
    const tone = toneFor(step.type);
    const active = new Set(step.indices);

    slots.forEach((value, i) => {
        const c = cells[i];
        const isFront = rear >= 0 && i === front;
        const isRear = rear >= 0 && i === rear;
        const tagText = isFront && isRear ? "FRONT & REAR" : isFront ? "FRONT" : isRear ? "REAR" : "";
        c.tag.textContent = `${tagText ? tagText + " " : ""}[${i}]`;
        c.tag.className = tagText ? "slot-label slot-label-active" : "slot-label";
        const emptyText = i < front ? "freed" : "empty";
        const shown = value === null ? emptyText : String(value);
        if (value === null && c.value !== null && !reduceMotion()) {
            // A value just left this slot: play the exit, then show the empty slot.
            clearTimeout(c.timer);
            c.car.classList.add("car-exit");
            c.timer = setTimeout(() => paintCell(c, null, emptyText), 200);
            c.value = null;
        } else if (value !== c.value || c.num.textContent !== shown) {
            paintCell(c, value, shown);
        }
        const toneOn = active.has(i) && tone !== "";
        TONES.forEach(t => c.car.classList.toggle(t, toneOn && t === tone));
        c.car.setAttribute("aria-label", `index ${i}: ${shown}${tagText ? `, ${tagText.toLowerCase()}` : ""}`);
    });

    const waste = count > 0 ? front : 0;
    els.state.textContent = count === 0 && rear === -1
        ? `Empty. front = 0, rear = −1, capacity = ${capacity}.`
        : `front = ${front}, rear = ${rear}, elements = ${count} / ${capacity}` +
          (waste ? `, ${waste} freed slot${waste === 1 ? "" : "s"} before front (not reusable)` : "") + ".";

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
    window.DSA_UI?.rescueFocus?.(focused, els.playBtn, els.input, els.size);
}

/* ---------- feedback & controls ---------- */

function show(message, type = "info") {
    els.message.textContent = message;
    els.message.className = `alert-banner alert-live alert-${type}`;
    els.message.hidden = false;
    window.DSA_UI?.announce?.(message, type === "error" ? "assertive" : "polite");
}

function updateButtons() {
    const focused = document.activeElement;
    const ready = queue !== null;
    const empty = !queue || queue.isEmpty();
    els.setSize.disabled = ready;
    els.size.disabled = ready;
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
    window.DSA_UI?.rescueFocus?.(focused, els.input, els.size, els.reset);
}

/* ---------- operations ---------- */

function setSize() {
    const r = parseInteger(els.size.value, { min: 1, max: LinearQueue.MAX_CAPACITY, label: "Queue size" });
    if (!r.ok) { show(r.error, "error"); els.size.focus(); return; }
    queue = new LinearQueue(r.value);
    loadSteps([stateStep(`Allocated ${r.value} empty slot${r.value === 1 ? "" : "s"}. front = 0, rear = −1.`)]);
    updateButtons();
    show(`Allocated an array of ${r.value} slot${r.value === 1 ? "" : "s"}. front = 0, rear = −1.`, "success");
    els.input.focus();
}

function resetSize() {
    queue = null;
    els.size.value = "";
    els.input.value = "";
    unloadPlayer();
    updateButtons();
    show("Queue reset. Enter a new size to allocate a fresh array.", "info");
    els.size.focus();
}

function enqueue() {
    const r = parseInteger(els.input.value, { min: 1, max: 9999, label: "Value" });
    if (!r.ok) { show(r.error, "error"); els.input.focus(); return; }
    const res = queue.enqueue(r.value);
    loadSteps(res.steps);
    if (!res.ok) { show(res.error, res.steps[0]?.type === "false-overflow" ? "warning" : "error"); return; }
    els.input.value = "";
    updateButtons();
    show(`Enqueued ${r.value} at index ${queue.rear}. rear = ${queue.rear}.`, "success");
    els.input.focus();
}

function dequeue() {
    const front = queue.peek();
    // The field is type="text", so letters reach parseInteger and are refused like empty input.
    const r = parseInteger(els.input.value, { min: 1, max: 9999, label: "Value to dequeue" });
    if (!r.ok) { show(`${r.error} Type the front value (${front}) to confirm the dequeue.`, "error"); els.input.focus(); return; }
    if (r.value !== front) { show(`Only the front can leave a queue. The front is ${front}. Type ${front} to dequeue it.`, "error"); return; }
    const from = queue.front;
    const res = queue.dequeue();
    els.input.value = "";
    loadSteps(res.steps);
    updateButtons();
    show(`Dequeued ${res.value} from index ${from}.` + (queue.isEmpty()
        ? " The queue is now empty, so front and rear reset to the start."
        : ` front moves to ${queue.front}.`), "info");
    els.input.focus();
}

function runQuery(name, message) {
    const res = queue.query(name);
    loadSteps(res.steps);
    show(message(res.value), "info");
}

function clearQueue() {
    queue.clear();
    loadSteps([stateStep("clear(): every slot is emptied and front = 0, rear = −1.")]);
    updateButtons();
    show("Queue cleared. Every slot is empty and front = 0, rear = −1.", "info");
}

els.setSize.addEventListener("click", setSize);
els.reset.addEventListener("click", resetSize);
els.enqueue.addEventListener("click", enqueue);
els.dequeue.addEventListener("click", dequeue);
els.peek.addEventListener("click", () => runQuery("peek", (v) => `Front element: ${v} (index ${queue.front}).`));
els.rear.addEventListener("click", () => runQuery("rear", (v) => `Rear element: ${v} (index ${queue.rear}).`));
els.isEmpty.addEventListener("click", () => runQuery("isEmpty", (v) => `isEmpty() → ${v}`));
els.isFull.addEventListener("click", () => runQuery("isFull", (full) => {
    const extra = !full && queue.rearAtEnd() ? " (but rear is at the last index, so enqueue is blocked: false overflow)" : "";
    return `isFull() → ${full}${extra}`;
}));
els.clear.addEventListener("click", clearQueue);
els.size.addEventListener("keydown", (e) => { if (e.key === "Enter") setSize(); });
els.input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !els.enqueue.disabled) enqueue(); });

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
updateButtons();
liveReady = true;
els.stepMessage.setAttribute("aria-live", "polite");
