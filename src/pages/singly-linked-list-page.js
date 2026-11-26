/**
 * Singly Linked List page controller. The list is a real SinglyLinkedList
 * (src/structures/linked-list.js): node objects joined by `next` pointers. The old
 * singly-linked-list.js kept an array and wrote "next" labels onto it afterwards.
 * Playback: src/core/step-player.js; shortcuts: src/core/player-keys.js (Space
 * play/pause, ←/→ step, Home reset); drawing: src/core/list-renderer.js.
 *
 * Kept from the original page: max size 1–20 set once, positive whole numbers only,
 * no duplicate values, addresses abc001…, the same buttons, ids and enable rules,
 * inline messages, highlight on Find / Head / Tail.
 * Changed: Reset clears the list in place instead of reloading the page; success
 * messages now say which pointers changed; Replace Address links a new node into the
 * old node's place (the old version edited the old node).
 * C24: every operation loads its recorded steps into the step player (walk cursors,
 * each pointer write shown old → new, head/tail moves, the pseudocode line). The
 * list on screen is always the current step's snapshot; the buttons follow the live list.
 */
import { SinglyLinkedList, LINKED_LIST_INFO } from "../structures/linked-list.js";
import { parseInteger } from "../core/validate.js";
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import { createListRenderer, countUpTo } from "../core/list-renderer.js";

const MAX_SIZE = 20;
const $ = (id) => document.getElementById(id);
const els = {
    maxSize: $("maxSizeInput"), setMax: $("setMaxSizeBtn"), reset: $("resetBtn"),
    value: $("operationValue"), index: $("operationIndex"), address: $("findAddressInput"), newAddress: $("newAddressInput"),
    message: $("message"), display: $("linkedListDisplay"), detached: $("llDetached"), changes: $("llChanges"),
    head: $("llHeadVal"), tail: $("llTailVal"), count: $("llSizeVal"),
    visits: $("llVisitsVal"), compares: $("llComparesVal"), writes: $("llWritesVal"),
    resetBtn: $("playerResetBtn"), prevBtn: $("prevBtn"), playBtn: $("playBtn"), nextBtn: $("nextBtn"),
    speed: $("speedSelect"), progress: $("progress"), counter: $("stepCounter"),
    stepMessage: $("stepMessage"), codeHeading: $("codeHeading"), code: $("pseudocode"),
};
const button = (id) => $(id);
const PLAYER_BUTTONS = [els.resetBtn, els.prevBtn, els.playBtn, els.nextBtn];
const STEP_HINT = "Set a max size, then run an operation to watch each pointer change.";
const reduceMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** @type {SinglyLinkedList | null} */
let list = null;

/* ---------- player ---------- */

const renderer = createListRenderer({ chain: els.display, detached: els.detached, changes: els.changes },
    { kind: "singly", emptyClass: "text-muted text-italic", reduceMotion });
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

/** A frame holding the real current state, used after Set Max Size (no operation has run yet). */
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
        els.code.replaceChildren(...(LINKED_LIST_INFO.pseudocode[key] ?? []).map((text) => {
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
    window.DSA_UI?.rescueFocus?.(focused, els.playBtn, els.value, els.maxSize);
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

/** Success text plus the module's explanation of the pointer change (its last step). */
function explain(result, lead) {
    const detail = result.steps.at(-1)?.message;
    return detail && detail !== lead ? `${lead} ${detail}` : lead;
}

/* ---------- input parsing ---------- */

function readValue() {
    if (els.value.value.trim() === "") { error("Enter a positive whole number in the Value field.", els.value); return null; }
    const parsed = parseInteger(els.value.value, { min: 1, label: "Value" });
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

const ALWAYS_WITH_LIST = ["getSizeBtn", "isFullBtn", "isEmptyBtn"];
const NEEDS_ROOM = ["appendBtn", "prependBtn", "insertAtBtn"];
const NEEDS_NODES = ["deleteHeadBtn", "deleteTailBtn", "deleteIndexBtn", "showHeadBtn", "showTailBtn",
    "findBtn", "updateAddressBtn", "replaceAddressBtn", "clearListBtn"];
const NEEDS_TWO = ["sortBtn", "reverseBtn"];

function updateState() {
    const focused = document.activeElement;
    const ready = list !== null;
    const empty = !ready || list.isEmpty();
    els.maxSize.disabled = ready;
    els.setMax.disabled = ready;
    ALWAYS_WITH_LIST.forEach((id) => { button(id).disabled = !ready; });
    NEEDS_ROOM.forEach((id) => { button(id).disabled = !ready || list.isFull(); });
    NEEDS_NODES.forEach((id) => { button(id).disabled = empty; });
    NEEDS_TWO.forEach((id) => { button(id).disabled = !ready || list.size < 2; });
    // Value and Index stay usable when full (Update/Replace and Delete by Index still need them).
    els.value.disabled = !ready;
    els.index.disabled = !ready;
    els.address.disabled = empty;
    els.newAddress.disabled = empty;
    // Focused control may have just been disabled (e.g. Clear empties the list): keep focus on the page.
    window.DSA_UI?.rescueFocus?.(focused, els.value, els.maxSize, els.reset);
}

/** Shows the operation's steps, then re-applies the enable rules for the live list. */
function show(result, title) {
    loadSteps(result.steps, title);
    updateState();
}

/* ---------- operations ---------- */

function setMaxSize() {
    const parsed = parseInteger(els.maxSize.value, { min: 1, max: MAX_SIZE, label: "Max size" });
    if (!parsed.ok) {
        error(els.maxSize.value.trim() === "" ? `Enter a max size from 1 to ${MAX_SIZE}.` : parsed.error, els.maxSize);
        return;
    }
    list = new SinglyLinkedList(parsed.value, { uniqueValues: true });
    updateState();
    loadSteps([stateStep(`Max size ${parsed.value}. The list is empty: head = tail = NULL.`)], "");
    notify(`Max size set to ${parsed.value}. head = tail = NULL.`, "success");
    els.value.focus();
}

function resetList() {
    list = null;
    clear(els.maxSize, els.value, els.index, els.address, els.newAddress);
    unloadPlayer();
    updateState();
    notify("List reset. Set a new max size to start again.", "info");
    els.maxSize.focus();
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
    const verb = where === "head" ? "Prepended" : where === "tail" ? "Appended" : `Inserted at index ${index}:`;
    clear(els.value, els.index);
    notify(explain(result, `${verb} ${value} (node ${result.value}).`), "success");
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
    const what = which === "head" ? "Head" : which === "tail" ? "Tail" : `Index ${index}`;
    notify(explain(result, `${what} element ${result.value} deleted.`), "success");
}

function clearList() {
    const result = list.clear();
    show(result, "clear()");
    notify(result.steps.at(-1).message, "success");
}

function reorder(kind) {
    const result = kind === "reverse" ? list.reverse() : list.sort();
    show(result, kind === "reverse" ? "reverse()" : "sort()");
    notify(result.steps.at(-1).message, "success");
}

function query(name, message) {
    const result = list.query(name);
    show(result, `${name}()`);
    notify(message(result.value), "info");
}

function showEnd(which) {
    query(which, (node) => `${which === "head" ? "Head" : "Tail"} of the list: address ${node.address}, value ${node.value}.`);
}

function findAddress() {
    const address = readAddress(els.address, "address to find");
    if (!address) return;
    const result = list.find(address);
    clear(els.address);
    show(result, "find(a)");
    if (!result.ok) { error(result.error, els.address); return; }
    const { index, value } = result.value;
    notify(`Address ${address} found at index ${index} after visiting ${result.steps.length} node${result.steps.length === 1 ? "" : "s"} from head. Element: ${value}.`, "success");
}

function updateAddress() {
    const address = readAddress(els.address, "target address to update");
    if (!address) return;
    if (!list.locate(address)) { error(`No node has address ${address}.`, els.address); return; }
    const value = readValue();
    if (value === null) return;
    const result = list.updateValue(address, value);
    show(result, "update(a, x)");
    if (!result.ok) { error(result.error, els.value); return; }
    clear(els.address, els.value);
    notify(result.steps.at(-1).message, "success");
}

function replaceAddress() {
    const address = readAddress(els.address, "target address to replace");
    if (!address) return;
    if (!list.locate(address)) { error(`No node has address ${address}.`, els.address); return; }
    const value = readValue();
    if (value === null) return;
    const newAddress = readAddress(els.newAddress, "replacement address");
    if (!newAddress) return;
    const result = list.replaceNode(address, value, newAddress);
    show(result, "replace(a, x, b)");
    if (!result.ok) {
        error(result.error, /address/i.test(result.error) ? els.newAddress : els.value);
        return;
    }
    clear(els.address, els.value, els.newAddress);
    notify(result.steps.at(-1).message, "success");
}

/* ---------- wiring ---------- */

const actions = {
    setMaxSizeBtn: setMaxSize, resetBtn: resetList,
    appendBtn: () => insert("tail"), prependBtn: () => insert("head"), insertAtBtn: () => insert("index"),
    deleteHeadBtn: () => remove("head"), deleteTailBtn: () => remove("tail"), deleteIndexBtn: () => remove("index"),
    clearListBtn: clearList,
    getSizeBtn: () => query("size", (n) => `Current list size: ${n} of ${list.capacity}.`),
    showHeadBtn: () => showEnd("head"), showTailBtn: () => showEnd("tail"),
    reverseBtn: () => reorder("reverse"), sortBtn: () => reorder("sort"),
    findBtn: findAddress,
    isEmptyBtn: () => query("isEmpty", (v) => `Is Empty: ${v ? "True" : "False"}`),
    isFullBtn: () => query("isFull", (v) => `Is Full: ${v ? "True" : "False"}`),
    updateAddressBtn: updateAddress, replaceAddressBtn: replaceAddress,
};
for (const [id, fn] of Object.entries(actions)) button(id).addEventListener("click", fn);

// Same typing filter as before: digits only (Value also drops leading zeros).
els.value.addEventListener("input", () => { els.value.value = els.value.value.replace(/\D/g, "").replace(/^0+/, ""); });
els.index.addEventListener("input", () => { els.index.value = els.index.value.replace(/\D/g, ""); });
els.maxSize.addEventListener("keydown", (e) => { if (e.key === "Enter") setMaxSize(); });

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
