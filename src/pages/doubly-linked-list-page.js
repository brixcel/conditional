/**
 * Doubly Linked List page controller. The list is a real DoublyLinkedList
 * (src/structures/doubly-linked-list.js): node objects joined by `prev` and `next`.
 * This replaces the page's old inline <script>, which held the same pointers in
 * global variables and could not be tested. Playback: src/core/step-player.js;
 * shortcuts: src/core/player-keys.js; drawing: src/core/list-renderer.js.
 *
 * Kept from the original page: any whole-number value including 0 and negatives,
 * no duplicate values, ABC001-style addresses, the same buttons, ids and enable
 * rules, inline messages, highlight on Find.
 * Changed: capacity is 1–20 (it had no upper limit); values are −999999 to 999999; Reset clears in place instead
 * of reloading; new addresses are 1–12 characters (was 1–20) to match Singly Linked
 * List; success messages say which pointers changed (so the duplicate toast popup was
 * dropped: on phones the longer messages stacked over the list); Find walks and highlights;
 * Head/Tail also highlight; Replace links a new node into the old node's place.
 * C24: every operation loads its recorded steps into the step player: the walk from
 * the nearer end, each prev/next write shown old → new, head/tail moves, the pseudocode line.
 */
import { DoublyLinkedList, DOUBLY_LINKED_LIST_INFO } from "../structures/doubly-linked-list.js";
import { parseInteger } from "../core/validate.js";
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import { createListRenderer, countUpTo } from "../core/list-renderer.js";

const MAX_SIZE = 20;
const VALUE_LIMIT = 999999;
const $ = (id) => document.getElementById(id);
const els = {
    limit: $("list-limit"), setLimit: $("setLimitBtn"), reset: $("resetPageBtn"),
    value: $("value"), index: $("index"), address: $("address"), newAddress: $("new-address"),
    message: $("dllMessage"), display: $("list-container"), detached: $("llDetached"), changes: $("llChanges"),
    head: $("llHeadVal"), tail: $("llTailVal"), count: $("llSizeVal"),
    visits: $("llVisitsVal"), compares: $("llComparesVal"), writes: $("llWritesVal"),
    resetBtn: $("playerResetBtn"), prevBtn: $("prevBtn"), playBtn: $("playBtn"), nextBtn: $("nextBtn"),
    speed: $("speedSelect"), progress: $("progress"), counter: $("stepCounter"),
    stepMessage: $("stepMessage"), codeHeading: $("codeHeading"), code: $("pseudocode"),
};
const PLAYER_BUTTONS = [els.resetBtn, els.prevBtn, els.playBtn, els.nextBtn];
const STEP_HINT = "Allocate a list, then run an operation to watch each prev / next change.";
const reduceMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** @type {DoublyLinkedList | null} */
let list = null;

/* ---------- player ---------- */

const renderer = createListRenderer({ chain: els.display, detached: els.detached, changes: els.changes },
    { kind: "doubly", emptyClass: "text-muted text-italic m-auto", reduceMotion });
const player = new StepPlayer({ onStep: render, baseDelay: 750 });
player.setSpeed(Number(els.speed.value) || 1);
let loaded = false;    // false until an operation records steps, and again after Reset List
let quiet = false;     // true while loading steps: the result is announced through notify()
let liveReady = false; // page setup stays silent
let codeKey = "";
let codeTitle = "";

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
function loadSteps(steps, title) {
    loaded = true;
    quiet = true;
    codeTitle = title;
    codeKey = null;      // force the heading to refresh even when the operation key repeats
    player.load(steps);
    const animate = steps.length > 1 && !reduceMotion();
    if (!animate) player.goTo(steps.length - 1);
    quiet = false;
    if (animate) player.play();
}

/** A frame holding the real current state, used after Allocate (no operation has run yet). */
function stateStep(message) {
    return { type: "state", operation: "", line: 0, addresses: [], cursors: {}, changes: [], message, snapshot: list.snapshot() };
}

function unloadPlayer() {
    player.pause();
    loaded = false;
    renderer.clear();
    els.counter.textContent = "Step 0 / 0";
    els.progress.max = 0;
    els.progress.value = 0;
    els.progress.disabled = true;
    els.progress.setAttribute("aria-valuetext", "No steps");
    PLAYER_BUTTONS.forEach((b) => { b.disabled = true; });
    els.playBtn.textContent = "▶ Play";
    els.playBtn.setAttribute("aria-label", "Play");
    els.stepMessage.setAttribute("aria-live", "off");
    els.stepMessage.textContent = STEP_HINT;
    codeTitle = "";
    setCode("", []);
    paintMonitor(null, { visits: 0, comparisons: 0, writes: 0 });
}

function setCode(key, lines) {
    if (key !== codeKey) {
        codeKey = key;
        els.codeHeading.textContent = key ? `Pseudocode: ${codeTitle || key}` : "Pseudocode";
        els.code.replaceChildren(...(DOUBLY_LINKED_LIST_INFO.pseudocode[key] ?? []).map((text) => {
            const li = document.createElement("li");
            li.textContent = text;
            return li;
        }));
    }
    const on = new Set(lines);
    [...els.code.children].forEach((li, i) => li.classList.toggle("active", on.has(i + 1)));
}

function paintMonitor(snap, counts) {
    els.head.textContent = snap?.head ?? "NULL";
    els.tail.textContent = snap?.tail ?? "NULL";
    els.count.textContent = snap ? `${snap.size} / ${snap.capacity}` : "0 / 0";
    els.visits.textContent = String(counts.visits);
    els.compares.textContent = String(counts.comparisons);
    els.writes.textContent = String(counts.writes);
}

function render(step, index, p) {
    renderer.render(step);
    paintMonitor(step.snapshot, countUpTo(p.steps, index));
    setCode(step.operation, step.lines ?? (step.line ? [step.line] : []));

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
    window.DSA_UI?.rescueFocus?.(focused, els.playBtn, els.value, els.limit);
}

/* ---------- messages ---------- */

function notify(message, type = "info") {
    const isError = type === "error";
    els.message.className = `alert-banner alert-live alert-${type}`;
    els.message.textContent = message;
    els.message.hidden = !message;
    window.DSA_UI?.announce?.(message, isError ? "assertive" : "polite");
}

const error = (message, focusEl) => { notify(message, "error"); focusEl?.focus(); };
const lastStep = (result) => result.steps.at(-1)?.message ?? "";

/* ---------- input parsing ---------- */

function readValue() {
    if (els.value.value.trim() === "") { error("Enter a whole number in the Value field.", els.value); return null; }
    const parsed = parseInteger(els.value.value, { min: -VALUE_LIMIT, max: VALUE_LIMIT, label: "Value" });
    if (!parsed.ok) error(parsed.error, els.value);
    return parsed.ok ? parsed.value : null;
}

function readIndex(max) {
    if (els.index.value.trim() === "") { error(`Enter an index from 0 to ${max} in the Index field.`, els.index); return null; }
    const parsed = parseInteger(els.index.value, { min: 0, max, label: "Index" });
    if (!parsed.ok) error(parsed.error, els.index);
    return parsed.ok ? parsed.value : null;
}

function readAddress(input, what) {
    const address = input.value.trim();
    if (!address) error(`Enter the ${what} in the ${input === els.newAddress ? "New Address" : "Target Address"} field.`, input);
    return address || null;
}

const clear = (...inputs) => inputs.forEach((input) => { input.value = ""; });

/* ---------- button state (same rules as the old page) ---------- */

const NEEDS_ROOM = ["prependBtn", "appendBtn", "insertBtn"];
const NEEDS_NODES = ["deleteHeadBtn", "deleteTailBtn", "deleteIndexBtn", "updateBtn", "replaceBtn", "clearBtn",
    "reverseBtn", "sortBtn", "findBtn"];
const ALWAYS_WITH_LIST = ["sizeBtn", "headBtn", "tailBtn", "isEmptyBtn", "isFullBtn"];

function setEnabled(el, enabled) {
    el.disabled = !enabled;
    el.classList.toggle("disabled", !enabled);
}

function updateState() {
    const focused = document.activeElement;
    const ready = list !== null;
    setEnabled(els.limit, !ready);
    setEnabled(els.setLimit, !ready);
    setEnabled(els.reset, ready);
    [els.value, els.index, els.address, els.newAddress].forEach((el) => setEnabled(el, ready));
    ALWAYS_WITH_LIST.forEach((id) => setEnabled($(id), ready));
    NEEDS_ROOM.forEach((id) => setEnabled($(id), ready && !list.isFull()));
    NEEDS_NODES.forEach((id) => setEnabled($(id), ready && !list.isEmpty()));
    // Focused control may have just been disabled (e.g. Clear empties the list): keep focus on the page.
    window.DSA_UI?.rescueFocus?.(focused, els.value, els.limit, els.reset);
}

/** Shows the operation's steps, then re-applies the enable rules for the live list. */
function show(result, title) {
    loadSteps(result.steps, title);
    updateState();
}

/* ---------- operations ---------- */

function setLimit() {
    const raw = els.limit.value;
    const parsed = parseInteger(raw, { min: 1, max: MAX_SIZE, label: "Capacity" });
    if (!parsed.ok) { error(raw.trim() === "" ? `Enter a capacity from 1 to ${MAX_SIZE}.` : parsed.error, els.limit); return; }
    list = new DoublyLinkedList(parsed.value, { uniqueValues: true });
    updateState();
    loadSteps([stateStep(`List limit ${parsed.value}. The list is empty: head = tail = NULL.`)], "");
    notify(`List limit set to ${parsed.value}. head = tail = NULL.`, "success");
    els.value.focus();
}

function resetList() {
    list = null;
    clear(els.limit, els.value, els.index, els.address, els.newAddress);
    unloadPlayer();
    updateState();
    notify("List reset. Allocate a new capacity to start again.", "info");
    els.limit.focus();
}

const INSERT_TITLES = { head: "prepend(x) = insertAt(0, x)", tail: "append(x) = insertAt(size, x)", index: "insertAt(i, x)" };

function insert(where) {
    if (list.isFull()) { error(`The list is full (${list.size} of ${list.capacity} nodes).`); return; }
    const value = readValue();
    if (value === null) return;
    let index = where === "head" ? 0 : list.size;
    if (where === "index") {
        index = readIndex(list.size);
        if (index === null) return;
    }
    const result = list.insertAt(index, value);
    show(result, INSERT_TITLES[where]);
    if (!result.ok) { error(result.error, els.value); return; }
    clear(els.value, els.index);
    const lead = where === "head" ? `Prepended ${value} at head` : where === "tail" ? `Appended ${value} at tail` : `Inserted ${value} at index ${index}`;
    notify(`${lead} (${result.value}). ${lastStep(result)}`, "success");
}

const DELETE_TITLES = { head: "deleteHead() = deleteAt(0)", tail: "deleteTail() = deleteAt(size − 1)", index: "deleteAt(i)" };

function remove(which) {
    let index = which === "head" ? 0 : list.size - 1;
    if (which === "index") {
        index = readIndex(list.size - 1);
        if (index === null) return;
    }
    const result = list.deleteAt(index);
    show(result, DELETE_TITLES[which]);
    if (!result.ok) { error(result.error); return; }
    clear(els.index);
    const what = which === "head" ? "head node" : which === "tail" ? "tail node" : `node at index ${index}`;
    notify(`Deleted ${what} (${result.value}). ${lastStep(result)}`, "success");
}

function query(name, message) {
    const result = list.query(name);
    show(result, `${name}()`);
    notify(message(result.value), "info");
}

function showEnd(which) {
    query(which, (node) => node
        ? `${which === "head" ? "Head" : "Tail"} value: ${node.value}, address: ${node.address}.`
        : "List is empty.");
}

function findAddress() {
    const address = readAddress(els.address, "address to find");
    if (!address) return;
    const result = list.find(address);
    clear(els.address);
    show(result, "find(a)");
    if (!result.ok) { error(result.error, els.address); return; }
    const { index, value } = result.value;
    notify(`Element found at index ${index} after visiting ${result.steps.length} node${result.steps.length === 1 ? "" : "s"}. ` +
        `Value: ${value}, address: ${address}.`, "success");
}

function updateValue() {
    const address = readAddress(els.address, "target address to update");
    if (!address) return;
    if (!list.locate(address)) { error(`Address ${address} not found.`, els.address); return; }
    const value = readValue();
    if (value === null) return;
    const result = list.updateValue(address, value);
    show(result, "update(a, x)");
    if (!result.ok) { error(result.error, els.value); return; }
    clear(els.address, els.value);
    notify(lastStep(result), "success");
}

function replaceNode() {
    const address = readAddress(els.address, "target address to replace");
    if (!address) return;
    if (!list.locate(address)) { error(`Address ${address} not found.`, els.address); return; }
    const value = readValue();
    if (value === null) return;
    const newAddress = readAddress(els.newAddress, "new address");
    if (!newAddress) return;
    const result = list.replaceNode(address, value, newAddress);
    show(result, "replace(a, x, b)");
    if (!result.ok) { error(result.error, /address/i.test(result.error) ? els.newAddress : els.value); return; }
    clear(els.address, els.value, els.newAddress);
    notify(lastStep(result), "success");
}

function run(fn, title, type) {
    const result = fn();
    show(result, title);
    notify(lastStep(result), type);
}

/* ---------- wiring ---------- */

const actions = {
    setLimitBtn: setLimit, resetPageBtn: resetList,
    prependBtn: () => insert("head"), appendBtn: () => insert("tail"), insertBtn: () => insert("index"),
    deleteHeadBtn: () => remove("head"), deleteTailBtn: () => remove("tail"), deleteIndexBtn: () => remove("index"),
    clearBtn: () => run(() => list.clear(), "clear()", "info"),
    sizeBtn: () => query("size", (n) => `Current list size: ${n} / ${list.capacity}`),
    headBtn: () => showEnd("head"), tailBtn: () => showEnd("tail"),
    reverseBtn: () => run(() => list.reverse(), "reverse()", "success"),
    sortBtn: () => run(() => list.sort(), "sort()", "success"),
    findBtn: findAddress, updateBtn: updateValue, replaceBtn: replaceNode,
    isEmptyBtn: () => query("isEmpty", (v) => `Is Empty: ${v ? "True" : "False"}`),
    isFullBtn: () => query("isFull", (v) => `Is Full: ${v ? "True" : "False"}`),
};
for (const [id, fn] of Object.entries(actions)) $(id).addEventListener("click", fn);
els.limit.addEventListener("keydown", (e) => { if (e.key === "Enter") setLimit(); });

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
