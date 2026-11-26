/**
 * Circular Linked List page controller. The list is a real CircularLinkedList
 * (src/structures/circular-linked-list.js): a ring of nodes with prev and next,
 * where tail.next is head and head.prev is tail. Replaces circLL.js.
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
 */
import { CircularLinkedList } from "../structures/circular-linked-list.js";
import { parseInteger } from "../core/validate.js";

const MAX_SIZE = 20;
const VALUE_MAX = 999999;
const LOG_LIMIT = 50;
const $ = (id) => document.getElementById(id);
const els = {
    maxSize: $("maxSizeInput"), setMax: $("setMaxSizeButton"), reminder: $("sizeReminder"), message: $("cllMessage"),
    value: $("valueInput"), index: $("indexInput"), address: $("nodeAddress"), newAddress: $("newAddressInput"),
    display: $("currentList"), log: $("operationsLog"),
};
const OP_BUTTONS = ["appendButton", "prependButton", "insertAtIndexButton", "deleteHeadButton", "deleteTailButton",
    "deleteByIndexButton", "clearListButton", "sizeButton", "showHeadButton", "showTailButton", "reverseListButton",
    "sortListButton", "findButton", "updateButton", "replaceButton", "checkIfEmptyButton", "checkIfFullButton"];

/** @type {CircularLinkedList | null} */
let list = null;

/* ---------- messages & log ---------- */

function notify(message, type = "info") {
    const isError = type === "error";
    els.message.className = `alert-banner alert-live alert-${type}`;
    els.message.setAttribute("role", isError ? "alert" : "status");
    els.message.setAttribute("aria-live", isError ? "assertive" : "polite");
    els.message.textContent = message;
    els.message.hidden = !message;
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

/* ---------- rendering ---------- */

function textEl(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
}

function arrow(symbol) {
    const a = textEl("span", "arrow", symbol);
    a.setAttribute("aria-hidden", "true");
    return a;
}

function render(highlightAddress = null) {
    els.display.replaceChildren();
    if (!list || list.isEmpty()) {
        els.display.append(textEl("span", "text-muted text-italic m-auto", "List is empty"));
        return;
    }
    for (const node of list.nodes()) {
        if (node !== list.head) els.display.append(arrow("⇄"));
        const box = document.createElement("div");
        box.className = "node-box" + (node.address === highlightAddress ? " node-highlight" : "");
        const isHead = node === list.head;
        const isTail = node === list.tail;
        if (isHead || isTail) {
            box.append(textEl("span", "slot-label slot-label-active", isHead && isTail ? "HEAD & TAIL" : isHead ? "HEAD" : "TAIL"));
        }
        box.append(
            textEl("div", "mono text-muted", node.address),
            textEl("div", "mono text-secondary", `Prev: ${node.prev.address}`),
            textEl("strong", "mono", String(node.value)),
            textEl("div", "mono text-secondary", `Next: ${node.next.address}`),
        );
        box.setAttribute("aria-label", `${isHead ? "head, " : ""}${isTail ? "tail, " : ""}address ${node.address}, ` +
            `value ${node.value}, prev ${node.prev.address}, next ${node.next.address}`);
        els.display.append(box);
    }
    // The ring closes: tail.next is head. Show that instead of a NULL end.
    els.display.append(arrow("→"));
    const loop = document.createElement("div");
    loop.className = "node-box car-empty";
    loop.append(textEl("span", "slot-label", "BACK TO HEAD"), textEl("strong", "mono", `↺ ${list.head.address}`));
    loop.setAttribute("aria-label", `tail.next points back to head ${list.head.address}`);
    els.display.append(loop);
}

function updateState() {
    const ready = list !== null;
    els.maxSize.disabled = ready;
    els.setMax.disabled = ready;
    els.reminder.hidden = ready;
    [els.value, els.index, els.address, els.newAddress].forEach((el) => { el.disabled = !ready; });
    OP_BUTTONS.forEach((id) => { $(id).disabled = !ready; });
}

function refresh(highlightAddress = null) {
    render(highlightAddress);
    updateState();
}

/* ---------- operations ---------- */

function setMaxSize() {
    const raw = els.maxSize.value;
    const parsed = parseInteger(raw, { min: 1, max: MAX_SIZE, label: "Maximum size" });
    if (!parsed.ok) { error(raw.trim() === "" ? `Enter a maximum size from 1 to ${MAX_SIZE}.` : parsed.error, els.maxSize); return; }
    list = new CircularLinkedList(parsed.value);
    notify(`Maximum size set to ${parsed.value}. head = NULL (empty ring).`, "success");
    log(`Set maximum size to ${parsed.value}`);
    refresh();
    els.value.focus();
}

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
    if (!result.ok) { error(result.error, els.value); return; }
    clearInputs();
    const lead = where === "head" ? `Prepended ${value}` : where === "tail" ? `Appended ${value}` : `Inserted ${value} at index ${index}`;
    notify(`${lead} (${result.value}). ${lastStep(result)}`, "success");
    log(`${lead} (${result.value})`);
    refresh(result.value);
}

function remove(which) {
    if (list.isEmpty()) { error(`Cannot delete ${which === "index" ? "by index" : which}: the list is empty.`); return; }
    let index = which === "head" ? 0 : list.size - 1;
    if (which === "index") {
        index = readIndex(list.size - 1);
        if (index === null) return;
    }
    const result = list.deleteAt(index);
    if (!result.ok) { error(result.error); return; }
    clearInputs();
    const what = which === "head" ? "head node" : which === "tail" ? "tail node" : `node at index ${index}`;
    notify(`Deleted ${what} (${result.value}). ${lastStep(result)}`, "success");
    log(`Deleted ${what} (value ${result.value})`);
    refresh();
}

function clearList() {
    const count = list.size;
    list = null;
    clearInputs();
    els.maxSize.value = "";
    notify(`Cleared ${count} node${count === 1 ? "" : "s"} and reset the maximum size. Set a new maximum size to continue.`, "info");
    log("Cleared the list and reset maximum size");
    refresh();
    els.maxSize.focus();
}

function reorder(kind) {
    if (list.isEmpty()) { notify(`The list is empty. Nothing to ${kind}.`, "info"); return; }
    const result = kind === "reverse" ? list.reverse() : list.sort();
    notify(lastStep(result), "success");
    log(kind === "reverse" ? "Reversed the list" : "Sorted the list ascending");
    refresh();
}

function showEnd(which) {
    const node = which === "head" ? list.head : list.tail;
    if (!node) { notify("List is empty.", "info"); return; }
    notify(`${which === "head" ? "Head" : "Tail"} node: value ${node.value}, address ${node.address}` +
        (which === "tail" ? ` (found as head.prev, no walk).` : "."), "info");
    refresh(node.address);
}

function findAddress() {
    const address = readAddress(els.address, "address to find");
    if (!address) return;
    const result = list.find(address);
    clearInputs();
    if (!result.ok) { error(result.error, els.address); log(`Find ${address}: not found`); refresh(); return; }
    const { index, value } = result.value;
    notify(`Found address ${address} at index ${index} after visiting ${result.steps.length} node${result.steps.length === 1 ? "" : "s"}. Value: ${value}.`, "success");
    log(`Found ${address} at index ${index}`);
    refresh(address);
}

function updateValue() {
    if (list.isEmpty()) { error("The list is empty. Nothing to update."); return; }
    const address = readAddress(els.address, "target address to update");
    if (!address) return;
    if (!list.locate(address)) { error(`Address ${address} not found in the list.`, els.address); return; }
    const value = readValue();
    if (value === null) return;
    const result = list.updateValue(address, value);
    if (!result.ok) { error(result.error, els.value); return; }
    clearInputs();
    notify(lastStep(result), "success");
    log(`Updated ${address} to ${value}`);
    refresh(address);
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
    if (!result.ok) { error(result.error, /address/i.test(result.error) ? els.newAddress : els.value); return; }
    clearInputs();
    notify(lastStep(result), "success");
    log(`Replaced ${address} with ${newAddress} = ${value}`);
    refresh(newAddress);
}

/* ---------- wiring ---------- */

const actions = {
    setMaxSizeButton: setMaxSize,
    appendButton: () => insert("tail"), prependButton: () => insert("head"), insertAtIndexButton: () => insert("index"),
    deleteHeadButton: () => remove("head"), deleteTailButton: () => remove("tail"), deleteByIndexButton: () => remove("index"),
    clearListButton: clearList,
    sizeButton: () => notify(`Current list size: ${list.size} / ${list.capacity}`, "info"),
    showHeadButton: () => showEnd("head"), showTailButton: () => showEnd("tail"),
    reverseListButton: () => reorder("reverse"), sortListButton: () => reorder("sort"),
    findButton: findAddress, updateButton: updateValue, replaceButton: replaceNode,
    checkIfEmptyButton: () => notify(`Is the list empty? ${list.isEmpty() ? "True" : "False"}`, "info"),
    checkIfFullButton: () => notify(`Is the list full? ${list.isFull() ? "True" : "False"}`, "info"),
};
for (const [id, fn] of Object.entries(actions)) $(id).addEventListener("click", fn);
els.maxSize.addEventListener("keydown", (e) => { if (e.key === "Enter") setMaxSize(); });

refresh();
