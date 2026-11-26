/**
 * Stack page controller. Logic comes from Stack (src/structures/stack.js); the DOM
 * only mirrors recorded steps. Playback: src/core/step-player.js; shortcuts:
 * src/core/player-keys.js (Space play/pause, ←/→ step, Home reset).
 *
 * Kept from the original page: capacity 1–12, positive whole numbers only, Pop asks you
 * to type the top value (it must equal the top), push/pop animations, the Peek highlight,
 * inline messages plus the shared toast.
 * Changed: a capacity above 12 is rejected with a message instead of being cut to 12 silently.
 * C20: every operation (push, pop, peek, isEmpty, isFull, size) loads its recorded steps
 * into the player, with the pseudocode line highlighted. Pop now refuses an empty or
 * non-numeric confirm value (a type="number" field reads letters as "", which used to
 * skip the LIFO check and pop the top).
 */
import { Stack, STACK_INFO, checkPopConfirm } from "../structures/stack.js";
import { parseInteger } from "../core/validate.js";
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";

const $ = (id) => document.getElementById(id);
const els = {
    capacity: $("stack-capacityInput"), setCap: $("stack-setCapacityButton"), reset: $("stack-refreshButton"),
    value: $("stack-numberInput"), push: $("stack-pushButton"), pop: $("stack-popButton"),
    peek: $("stack-peekButton"), isEmpty: $("stack-isEmptyButton"), isFull: $("stack-isFullButton"), size: $("stack-sizeButton"),
    message: $("stackMessage"), top: $("stack-top-val"), count: $("stack-size-val"), box: document.querySelector(".stack-box"),
    resetBtn: $("resetBtn"), prevBtn: $("prevBtn"), playBtn: $("playBtn"), nextBtn: $("nextBtn"),
    speed: $("speedSelect"), progress: $("progress"), counter: $("stepCounter"),
    stepMessage: $("stepMessage"), codeHeading: $("codeHeading"), code: $("pseudocode"),
};
const OPS = [els.push, els.pop, els.peek, els.isEmpty, els.isFull, els.size];
const PLAYER_BUTTONS = [els.resetBtn, els.prevBtn, els.playBtn, els.nextBtn];
const EMPTY_TOP = "Empty (null)";
const STEP_HINT = "Allocate a capacity, then push or pop to watch each step.";
const CODE_TITLES = { push: "push(x)", pop: "pop()", peek: "peek()", isEmpty: "isEmpty()", isFull: "isFull()", size: "size()" };
const reduceMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** @type {Stack | null} */
let stack = null;

/* ---------- player ---------- */

const player = new StepPlayer({ onStep: render, baseDelay: 750 });
player.setSpeed(Number(els.speed.value) || 1);
let loaded = false;    // false until an operation records steps, and again after Reset Stack
let quiet = false;     // true while loading steps: the result is announced through notify()
let liveReady = false; // page setup stays silent
let codeKey = "";

// Keys and buttons go through these wrappers so nothing replays stale steps after a reset.
const whenLoaded = (fn) => () => { if (loaded) fn(); };
const playerControls = {
    toggle: whenLoaded(() => { if (player.length > 1) player.toggle(); }),
    pause: whenLoaded(() => player.pause()),
    next: whenLoaded(() => player.next()),
    prev: whenLoaded(() => player.prev()),
    reset: whenLoaded(() => player.reset()),
};

/** Loads an operation's steps. Autoplays unless reduced motion is on; then it shows the final step (Back replays). */
function loadSteps(steps) {
    loaded = true;
    quiet = true;
    player.load(steps);
    const animate = steps.length > 1 && !reduceMotion();
    if (!animate) player.goTo(steps.length - 1);
    quiet = false;
    if (animate) player.play();
}

/** A frame holding the real current state, used after Allocate (no operation has run yet). */
function stateStep(message) {
    return { type: "state", operation: "", line: 0, indices: [], message, snapshot: stack.snapshot() };
}

function unloadPlayer() {
    player.pause();
    loaded = false;
    els.box.replaceChildren();
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
    paintMonitor(null);
}

function setCode(key, line = 0) {
    if (key !== codeKey) {
        codeKey = key;
        els.codeHeading.textContent = key ? `Pseudocode: ${CODE_TITLES[key]}` : "Pseudocode";
        els.code.replaceChildren(...(STACK_INFO.pseudocode[key] ?? []).map(text => {
            const li = document.createElement("li");
            li.textContent = text;
            return li;
        }));
    }
    [...els.code.children].forEach((li, i) => li.classList.toggle("active", i + 1 === line));
}

/* ---------- rendering (from the step snapshot, never the live stack) ---------- */

function paintMonitor(snap) {
    els.count.textContent = snap ? `${snap.items.length} / ${snap.capacity}` : "0 / 0";
    els.top.textContent = snap && snap.items.length ? `${snap.items[snap.top]} (index ${snap.top})` : EMPTY_TOP;
}

/** Highlight class for the bars named in step.indices. Text (monitor + step message) carries the same information. */
function toneFor(type) {
    if (type === "peek") return "stack-highlight";
    if (type === "read") return "ht-tone-swap";
    if (type === "check") return "ht-tone-compare";
    if (type === "push") return "ht-tone-sorted";
    return "";
}
const TONES = ["stack-highlight", "ht-tone-swap", "ht-tone-compare", "ht-tone-sorted"];

/** Bars are keyed by index: only bars that appear or disappear are added/removed, so push/pop animations stay meaningful. */
function renderBars(step) {
    const { items, top } = step.snapshot;
    const live = [...els.box.children].filter(b => !b.classList.contains("stack-bar-pop"));
    let added = false;
    items.forEach((value, i) => {
        let bar = live[i];
        if (!bar) {
            bar = document.createElement("div");
            bar.className = "stack-bar";
            els.box.appendChild(bar);
            added = true;
        }
        if (bar.textContent !== String(value)) bar.textContent = value;
        bar.dataset.index = i;
        bar.setAttribute("aria-label", `index ${i}: ${value}${i === top ? ", top" : ""}`);
    });
    for (const bar of live.slice(items.length)) {
        if (reduceMotion()) { bar.remove(); continue; }
        TONES.forEach(c => bar.classList.remove(c));
        bar.classList.add("stack-bar-pop");
        setTimeout(() => bar.remove(), 240);
    }
    const tone = toneFor(step.type);
    const active = new Set(step.indices);
    [...els.box.children].forEach(bar => {
        if (bar.classList.contains("stack-bar-pop")) return;
        const i = Number(bar.dataset.index);
        TONES.forEach(c => bar.classList.toggle(c, c === tone && active.has(i)));
    });
    if (added) els.box.scrollTop = els.box.scrollHeight;
}

function render(step, index, p) {
    renderBars(step);
    paintMonitor(step.snapshot);
    setCode(step.operation, step.line);

    // aria-live is set before the text: autoplay and loads stay quiet; user steps and the last autoplay frame speak.
    els.stepMessage.setAttribute("aria-live", p.isPlaying || quiet || !liveReady ? "off" : "polite");
    els.stepMessage.textContent = step.message;

    els.counter.textContent = `Step ${index + 1} / ${p.length}`;
    els.progress.max = Math.max(0, p.length - 1);
    els.progress.value = index;
    els.progress.disabled = p.length <= 1;
    els.progress.setAttribute("aria-valuetext", `Step ${index + 1} of ${p.length}`);

    const label = p.isPlaying ? "Pause" : (p.atEnd && p.length > 1 ? "Replay" : "Play");
    els.playBtn.textContent = p.isPlaying ? "⏸ Pause" : (p.atEnd && p.length > 1 ? "↻ Replay" : "▶ Play");
    els.playBtn.setAttribute("aria-label", label);

    const focused = document.activeElement;
    els.playBtn.disabled = p.length <= 1;
    els.prevBtn.disabled = p.atStart;
    els.resetBtn.disabled = p.atStart;
    els.nextBtn.disabled = p.atEnd;
    window.DSA_UI?.rescueFocus?.(focused, els.playBtn, els.value, els.capacity);
}

/* ---------- feedback ---------- */

function notify(message, type = "info") {
    const isError = type === "error";
    els.message.className = `alert-banner alert-live alert-${type}`;
    els.message.textContent = message;
    els.message.hidden = !message;
    window.DSA_UI?.announce?.(message, isError ? "assertive" : "polite");
    window.DSA_UI?.showToast?.(message, type);
}

function updateState() {
    const focused = document.activeElement;
    const ready = stack !== null;
    els.capacity.disabled = ready;
    els.setCap.disabled = ready;
    els.value.disabled = !ready;
    OPS.forEach(b => { b.disabled = !ready; });
    // A focused control that was just disabled would drop focus to <body>.
    window.DSA_UI?.rescueFocus?.(focused, els.value, els.capacity, els.reset);
}

/* ---------- operations ---------- */

function setCapacity() {
    const r = parseInteger(els.capacity.value, { min: 1, max: Stack.MAX_CAPACITY, label: "Capacity" });
    if (!r.ok) { notify(r.error, "error"); els.capacity.focus(); return; }
    stack = new Stack(r.value);
    els.box.replaceChildren();
    updateState();
    loadSteps([stateStep(`Allocated ${stack.capacity} slot${stack.capacity === 1 ? "" : "s"}. The stack is empty: top = −1.`)]);
    notify(`Stack capacity successfully set to ${stack.capacity}`, "success");
    els.value.focus();
}

function reset() {
    stack = null;
    els.value.value = "";
    els.capacity.value = "6";
    unloadPlayer();
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
    loadSteps(res.steps);
    if (!res.ok) { notify(res.error, "error"); return; }
    els.value.value = "";
    notify(`Pushed ${r.value} onto Top of Stack (top = ${stack.top})`, "success");
    els.value.focus();
}

function pop() {
    if (stack.isEmpty()) {
        loadSteps(stack.pop().steps);
        notify("Stack Underflow! Cannot pop from an empty stack.", "error");
        return;
    }
    const typed = els.value.value.trim();
    const top = stack.peek();
    const check = checkPopConfirm(typed, top, { badInput: Boolean(els.value.validity?.badInput) });
    if (!check.ok) {
        notify(check.reason === "mismatch"
            ? `LIFO Rule: Top element is ${top}, not ${typed}.`
            : check.reason === "empty"
                ? `Type the top value (${top}) in the value box to confirm the pop.`
                : `That is not a whole number. Type the top value (${top}) to confirm the pop.`, "error");
        els.value.focus();
        return;
    }
    const res = stack.pop();
    els.value.value = "";
    loadSteps(res.steps);
    notify(`Popped ${res.value} from Top of Stack (LIFO). ` +
        (stack.isEmpty() ? "The stack is now empty (top = −1)." : `top is now ${stack.top}.`), "info");
}

function query(name, message) {
    const res = stack.query(name);
    loadSteps(res.steps);
    notify(message(res.value), "info");
}

els.setCap.addEventListener("click", setCapacity);
els.reset.addEventListener("click", reset);
els.push.addEventListener("click", push);
els.pop.addEventListener("click", pop);
els.peek.addEventListener("click", () => query("peek", (v) =>
    v === null ? `Peek: the stack is empty. Top is ${EMPTY_TOP}.` : `Peek: Top element is ${v} (index ${stack.top})`));
els.isEmpty.addEventListener("click", () => query("isEmpty", (v) =>
    v ? "IsEmpty: TRUE (Size is 0)" : "IsEmpty: FALSE (Stack contains elements)"));
els.isFull.addEventListener("click", () => query("isFull", (v) =>
    v ? "IsFull: TRUE (Stack is at max capacity)" : "IsFull: FALSE (Available space remains)"));
els.size.addEventListener("click", () => query("size", (v) => `Current Stack Size: ${v} / ${stack.capacity} elements`));
els.capacity.addEventListener("keydown", (e) => { if (e.key === "Enter") setCapacity(); });
els.value.addEventListener("keydown", (e) => { if (e.key === "Enter" && !els.push.disabled) push(); });

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
updateState();
liveReady = true;
els.stepMessage.setAttribute("aria-live", "polite");
