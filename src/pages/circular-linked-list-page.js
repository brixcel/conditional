/**
 * Circular Linked List page controller. The list is a real CircularLinkedList
 * (src/structures/circular-linked-list.js): a ring of nodes with prev and next,
 * where tail.next is head and head.prev is tail. Replaces circLL.js.
 * Playback: src/core/step-player.js; shortcuts: src/core/player-keys.js;
 * drawing: src/core/list-renderer.js.
 *
 * Kept from the original page: values are whole numbers >= 1 and may repeat,
 * abc_001-style addresses, the same buttons and ids, every operation enabled once
 * the max size is set (errors shown inline), Clear List also resets the max size,
 * the activity log.
 * Changed: max size is 1–20 (it had no upper limit); values go up to 999999; new
 * addresses take the lowest free number (they used to only count up); a single node
 * shows prev/next pointing at itself (it showed "Null", which is wrong for a ring);
 * the tail → head link is an explicit "back to HEAD" end cap instead of an SVG
 * measured from screen positions; the log keeps the last 50 entries; no duplicate
 * toast popups; messages explain each pointer change.
 * C24: every operation loads its recorded steps into the step player: walks from the
 * nearer end, each prev/next write shown old → new, the wrap back to head, and sort
 * opening and closing the ring.
 */
import { CircularLinkedList, CIRCULAR_LINKED_LIST_INFO } from "../structures/circular-linked-list.js";
import { parseInteger } from "../core/validate.js";
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import { createListRenderer, countUpTo } from "../core/list-renderer.js";

const MAX_SIZE = 20;
const VALUE_MAX = 999999;
const LOG_LIMIT = 50;
const $ = (id) => document.getElementById(id);
const els = {
    maxSize: $("maxSizeInput"), setMax: $("setMaxSizeButton"), reminder: $("sizeReminder"), message: $("cllMessage"),
    value: $("valueInput"), index: $("indexInput"), address: $("nodeAddress"), newAddress: $("newAddressInput"),
    display: $("currentList"), log: $("operationsLog"), detached: $("llDetached"), changes: $("llChanges"),
    head: $("llHeadVal"), tail: $("llTailVal"), count: $("llSizeVal"),
    visits: $("llVisitsVal"), compares: $("llComparesVal"), writes: $("llWritesVal"),
    resetBtn: $("playerResetBtn"), prevBtn: $("prevBtn"), playBtn: $("playBtn"), nextBtn: $("nextBtn"),
    speed: $("speedSelect"), progress: $("progress"), counter: $("stepCounter"),
    stepMessage: $("stepMessage"), codeHeading: $("codeHeading"), code: $("pseudocode"),
};
const OP_BUTTONS = ["appendButton", "prependButton", "insertAtIndexButton", "deleteHeadButton", "deleteTailButton",
    "deleteByIndexButton", "clearListButton", "sizeButton", "showHeadButton", "showTailButton", "reverseListButton",
    "sortListButton", "findButton", "updateButton", "replaceButton", "checkIfEmptyButton", "checkIfFullButton"];
const PLAYER_BUTTONS = [els.resetBtn, els.prevBtn, els.playBtn, els.nextBtn];
const STEP_HINT = "Set a max size, then run an operation to watch each prev / next change and the wrap back to head.";
const reduceMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** @type {CircularLinkedList | null} */
let list = null;

/* ---------- player ---------- */

const renderer = createListRenderer({ chain: els.display, detached: els.detached, changes: els.changes },
    { kind: "circular", emptyClass: "text-muted text-italic m-auto", reduceMotion });
const player = new StepPlayer({ onStep: render, baseDelay: 750 });
player.setSpeed(Number(els.speed.value) || 1);
let loaded = false;    // false until an operation records steps
let quiet = false;     // true while loading steps: the result is announced through notify()
let liveReady = false; // page setup stays silent
let codeKey = "";
let codeTitle = "";

// Keys and buttons go through these wrappers so nothing replays before an operation has run.
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
        els.code.replaceChildren(...(CIRCULAR_LINKED_LIST_INFO.pseudocode[key] ?? []).map((text) => {
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
    els.tail.textContent = snap?.tail ? `${snap.tail} (head.prev)` : "NULL";
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

/* ---------- messages & log ---------- */

function notify(message, type = "info") {
    const isError = type === "error";
    els.message.className = `alert-banner alert-live alert-${type}`;
    els.message.textContent = message;
    els.message.hidden = !message;
    window.DSA_UI?.announce?.(message, isError ? "assertive" : "polite");
}

const error = (message, focusEl) => { notify(message, "error"); focusEl?.focus(); };
const lastStep = (result) => result.steps.at(-1)?.message ?? "";

function log(text) {
    if (els.log.dataset.started !== "1") { els.log.replaceChildren(); els.log.dataset.started = "1"; }
    const entry = document.createElement("div");
    entry.className = "log-entry";
    entry.textContent = text;
    els.log.append(entry);
    while (els.log.childElementCount > LOG_LIMIT) els.log.firstElementChild.remove();
    els.log.scrollTop = els.log.scrollHeight;
}

/* ---------- input parsing ---------- */

function readValue() {
    if (els.value.value.trim() === "") { error("Enter a whole number of at least 1 in the Value field.", els.value); return null; }
    const parsed = parseInteger(els.value.value, { min: 1, max: VALUE_MAX, label: "Value" });
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

const clearInputs = () => [els.value, els.index, els.address, els.newAddress].forEach((el) => { el.value = ""; });

/* ---------- button state ---------- */

function updateState() {
    const focused = document.activeElement;
    const ready = list !== null;
    els.maxSize.disabled = ready;
    els.setMax.disabled = ready;
    els.reminder.hidden = ready;
    [els.value, els.index, els.address, els.newAddress].forEach((el) => { el.disabled = !ready; });
    OP_BUTTONS.forEach((id) => { $(id).disabled = !ready; });
    // Set Max Size disables itself; keep focus on the page.
    window.DSA_UI?.rescueFocus?.(focused, els.value, els.maxSize);
}

/** Shows the operation's steps, then re-applies the enable rules for the live list. */
function show(result, title) {
    loadSteps(result.steps, title);
    updateState();
}

/* ---------- operations ---------- */

function setMaxSize() {
    const raw = els.maxSize.value;
    const parsed = parseInteger(raw, { min: 1, max: MAX_SIZE, label: "Maximum size" });
    if (!parsed.ok) { error(raw.trim() === "" ? `Enter a maximum size from 1 to ${MAX_SIZE}.` : parsed.error, els.maxSize); return; }
    list = new CircularLinkedList(parsed.value);
    updateState();
    loadSteps([stateStep(`Maximum size ${parsed.value}. The ring is empty: head = NULL.`)], "");
    notify(`Maximum size set to ${parsed.value}. head = NULL (empty ring).`, "success");
    log(`Set maximum size to ${parsed.value}`);
    els.value.focus();
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
    clearInputs();
    const lead = where === "head" ? `Prepended ${value}` : where === "tail" ? `Appended ${value}` : `Inserted ${value} at index ${index}`;
    notify(`${lead} (${result.value}). ${lastStep(result)}`, "success");
    log(`${lead} (${result.value})`);
}

const DELETE_TITLES = { head: "deleteHead() = deleteAt(0)", tail: "deleteTail() = deleteAt(size − 1)", index: "deleteAt(i)" };

function remove(which) {
    if (list.isEmpty()) { error(`Cannot delete ${which === "index" ? "by index" : which}: the list is empty.`); return; }
    let index = which === "head" ? 0 : list.size - 1;
    if (which === "index") {
        index = readIndex(list.size - 1);
        if (index === null) return;
    }
    const result = list.deleteAt(index);
    show(result, DELETE_TITLES[which]);
    if (!result.ok) { error(result.error); return; }
    clearInputs();
    const what = which === "head" ? "head node" : which === "tail" ? "tail node" : `node at index ${index}`;
    notify(`Deleted ${what} (${result.value}). ${lastStep(result)}`, "success");
    log(`Deleted ${what} (value ${result.value})`);
}

function clearList() {
    const count = list.size;
    show(list.clear(), "clear()");   // replay shows the emptied ring; then the max size is reset as before
    list = null;
    clearInputs();
    els.maxSize.value = "";
    updateState();
    notify(`Cleared ${count} node${count === 1 ? "" : "s"} and reset the maximum size. Set a new maximum size to continue.`, "info");
    log("Cleared the list and reset maximum size");
    els.maxSize.focus();
}

function reorder(kind) {
    if (list.isEmpty()) { notify(`The list is empty. Nothing to ${kind}.`, "info"); return; }
    const result = kind === "reverse" ? list.reverse() : list.sort();
    show(result, `${kind}()`);
    notify(lastStep(result), "success");
    log(kind === "reverse" ? "Reversed the list" : "Sorted the list ascending");
}

function query(name, message) {
    const result = list.query(name);
    show(result, `${name}()`);
    notify(message(result.value), "info");
}

function showEnd(which) {
    if (list.isEmpty()) { notify("List is empty.", "info"); return; }
    query(which, (node) => `${which === "head" ? "Head" : "Tail"} node: value ${node.value}, address ${node.address}` +
        (which === "tail" ? ` (found as head.prev, no walk).` : "."));
}

function findAddress() {
    const address = readAddress(els.address, "address to find");
    if (!address) return;
    const result = list.find(address);
    clearInputs();
    show(result, "find(a)");
    if (!result.ok) { error(result.error, els.address); log(`Find ${address}: not found`); return; }
    const { index, value } = result.value;
    notify(`Found address ${address} at index ${index} after visiting ${result.steps.length} node${result.steps.length === 1 ? "" : "s"}. Value: ${value}.`, "success");
    log(`Found ${address} at index ${index}`);
}

function updateValue() {
    if (list.isEmpty()) { error("The list is empty. Nothing to update."); return; }
    const address = readAddress(els.address, "target address to update");
    if (!address) return;
    if (!list.locate(address)) { error(`Address ${address} not found in the list.`, els.address); return; }
    const value = readValue();
    if (value === null) return;
    const result = list.updateValue(address, value);
    show(result, "update(a, x)");
    if (!result.ok) { error(result.error, els.value); return; }
    clearInputs();
    notify(lastStep(result), "success");
    log(`Updated ${address} to ${value}`);
}

function replaceNode() {
    if (list.isEmpty()) { error("The list is empty. Nothing to replace."); return; }
    const address = readAddress(els.address, "target address to replace");
    if (!address) return;
    if (!list.locate(address)) { error(`Node with address ${address} not found.`, els.address); return; }
    const newAddress = readAddress(els.newAddress, "replacement address");
    if (!newAddress) return;
    const value = readValue();
    if (value === null) return;
    const result = list.replaceNode(address, value, newAddress);
    show(result, "replace(a, x, b)");
    if (!result.ok) { error(result.error, /address/i.test(result.error) ? els.newAddress : els.value); return; }
    clearInputs();
    notify(lastStep(result), "success");
    log(`Replaced ${address} with ${newAddress} = ${value}`);
}

/* ---------- wiring ---------- */

const actions = {
    setMaxSizeButton: setMaxSize,
    appendButton: () => insert("tail"), prependButton: () => insert("head"), insertAtIndexButton: () => insert("index"),
    deleteHeadButton: () => remove("head"), deleteTailButton: () => remove("tail"), deleteByIndexButton: () => remove("index"),
    clearListButton: clearList,
    sizeButton: () => query("size", (n) => `Current list size: ${n} / ${list.capacity}`),
    showHeadButton: () => showEnd("head"), showTailButton: () => showEnd("tail"),
    reverseListButton: () => reorder("reverse"), sortListButton: () => reorder("sort"),
    findButton: findAddress, updateButton: updateValue, replaceButton: replaceNode,
    checkIfEmptyButton: () => query("isEmpty", (v) => `Is the list empty? ${v ? "True" : "False"}`),
    checkIfFullButton: () => query("isFull", (v) => `Is the list full? ${v ? "True" : "False"}`),
};
for (const [id, fn] of Object.entries(actions)) $(id).addEventListener("click", fn);
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
