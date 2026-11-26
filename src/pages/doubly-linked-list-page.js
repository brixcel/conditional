/**
 * Doubly Linked List page controller. The list is a real DoublyLinkedList
 * (src/structures/doubly-linked-list.js): node objects joined by `prev` and `next`.
 * This replaces the page's old inline <script>, which held the same pointers in
 * global variables and could not be tested.
 *
 * Kept from the original page: any whole-number value including 0 and negatives,
 * no duplicate values, ABC001-style addresses, the same buttons, ids and enable
 * rules, inline messages, highlight on Find.
 * Changed: capacity is 1–20 (it had no upper limit); values are −999999 to 999999; Reset clears in place instead
 * of reloading; new addresses are 1–12 characters (was 1–20) to match Singly Linked
 * List; success messages say which pointers changed (so the duplicate toast popup was
 * dropped: on phones the longer messages stacked over the list); Find walks and highlights;
 * Head/Tail also highlight; Replace links a new node into the old node's place.
 */
import { DoublyLinkedList } from "../structures/doubly-linked-list.js";
import { parseInteger } from "../core/validate.js";

const MAX_SIZE = 20;
const VALUE_LIMIT = 999999;
const $ = (id) => document.getElementById(id);
const els = {
    limit: $("list-limit"), setLimit: $("setLimitBtn"), reset: $("resetPageBtn"),
    value: $("value"), index: $("index"), address: $("address"), newAddress: $("new-address"),
    message: $("dllMessage"), display: $("list-container"),
};

/** @type {DoublyLinkedList | null} */
let list = null;

/* ---------- messages ---------- */

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

/* ---------- rendering ---------- */

function textEl(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
}

function nullCap() {
    const cap = document.createElement("div");
    cap.className = "node-box car-empty";
    cap.append(textEl("strong", "mono", "NULL"));
    cap.setAttribute("aria-hidden", "true");
    return cap;
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
    els.display.append(nullCap(), arrow("←"));
    for (const node of list.nodes()) {
        if (node !== list.head) els.display.append(arrow("⇄"));
        const box = document.createElement("div");
        box.className = "node-box" + (node.address === highlightAddress ? " node-highlight" : "");
        const isHead = node === list.head;
        const isTail = node === list.tail;
        if (isHead || isTail) {
            box.append(textEl("span", "slot-label slot-label-active", isHead && isTail ? "HEAD & TAIL" : isHead ? "HEAD" : "TAIL"));
        }
        const prev = node.prev ? node.prev.address : "NULL";
        const next = node.next ? node.next.address : "NULL";
        box.append(
            textEl("div", "mono text-muted", node.address),
            textEl("div", "mono text-secondary", `Prev: ${prev}`),
            textEl("strong", "mono", String(node.value)),
            textEl("div", "mono text-secondary", `Next: ${next}`),
        );
        box.setAttribute("aria-label",
            `${isHead ? "head, " : ""}${isTail ? "tail, " : ""}address ${node.address}, value ${node.value}, prev ${prev}, next ${next}`);
        els.display.append(box);
    }
    els.display.append(arrow("→"), nullCap());
}

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
    const ready = list !== null;
    setEnabled(els.limit, !ready);
    setEnabled(els.setLimit, !ready);
    setEnabled(els.reset, ready);
    [els.value, els.index, els.address, els.newAddress].forEach((el) => setEnabled(el, ready));
    ALWAYS_WITH_LIST.forEach((id) => setEnabled($(id), ready));
    NEEDS_ROOM.forEach((id) => setEnabled($(id), ready && !list.isFull()));
    NEEDS_NODES.forEach((id) => setEnabled($(id), ready && !list.isEmpty()));
}

function refresh(highlightAddress = null) {
    render(highlightAddress);
    updateState();
}

/* ---------- operations ---------- */

function setLimit() {
    const raw = els.limit.value;
    const parsed = parseInteger(raw, { min: 1, max: MAX_SIZE, label: "Capacity" });
    if (!parsed.ok) { error(raw.trim() === "" ? `Enter a capacity from 1 to ${MAX_SIZE}.` : parsed.error, els.limit); return; }
    list = new DoublyLinkedList(parsed.value, { uniqueValues: true });
    notify(`List limit set to ${parsed.value}. head = tail = NULL.`, "success");
    refresh();
    els.value.focus();
}

function resetList() {
    list = null;
    clear(els.limit, els.value, els.index, els.address, els.newAddress);
    notify("List reset. Allocate a new capacity to start again.", "info");
    refresh();
    els.limit.focus();
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
    clear(els.value, els.index);
    const lead = where === "head" ? `Prepended ${value} at head` : where === "tail" ? `Appended ${value} at tail` : `Inserted ${value} at index ${index}`;
    notify(`${lead} (${result.value}). ${lastStep(result)}`, "success");
    refresh(result.value);
}

function remove(which) {
    let index = which === "head" ? 0 : list.size - 1;
    if (which === "index") {
        index = readIndex(list.size - 1);
        if (index === null) return;
    }
    const result = list.deleteAt(index);
    if (!result.ok) { error(result.error); return; }
    clear(els.index);
    const what = which === "head" ? "head node" : which === "tail" ? "tail node" : `node at index ${index}`;
    notify(`Deleted ${what} (${result.value}). ${lastStep(result)}`, "success");
    refresh();
}

function showEnd(which) {
    const node = which === "head" ? list.head : list.tail;
    if (!node) { notify("List is empty.", "info"); return; }
    notify(`${which === "head" ? "Head" : "Tail"} value: ${node.value}, address: ${node.address}.`, "info");
    refresh(node.address);
}

function findAddress() {
    const address = readAddress(els.address, "address to find");
    if (!address) return;
    const result = list.find(address);
    clear(els.address);
    if (!result.ok) { error(result.error, els.address); refresh(); return; }
    const { index, value } = result.value;
    notify(`Element found at index ${index} after visiting ${result.steps.length} node${result.steps.length === 1 ? "" : "s"}. ` +
        `Value: ${value}, address: ${address}.`, "success");
    refresh(address);
}

function updateValue() {
    const address = readAddress(els.address, "target address to update");
    if (!address) return;
    if (!list.locate(address)) { error(`Address ${address} not found.`, els.address); return; }
    const value = readValue();
    if (value === null) return;
    const result = list.updateValue(address, value);
    if (!result.ok) { error(result.error, els.value); return; }
    clear(els.address, els.value);
    notify(lastStep(result), "success");
    refresh(address);
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
    if (!result.ok) { error(result.error, /address/i.test(result.error) ? els.newAddress : els.value); return; }
    clear(els.address, els.value, els.newAddress);
    notify(lastStep(result), "success");
    refresh(newAddress);
}

/* ---------- wiring ---------- */

const actions = {
    setLimitBtn: setLimit, resetPageBtn: resetList,
    prependBtn: () => insert("head"), appendBtn: () => insert("tail"), insertBtn: () => insert("index"),
    deleteHeadBtn: () => remove("head"), deleteTailBtn: () => remove("tail"), deleteIndexBtn: () => remove("index"),
    clearBtn: () => { notify(lastStep(list.clear()), "info"); refresh(); },
    sizeBtn: () => notify(`Current list size: ${list.size} / ${list.capacity}`, "info"),
    headBtn: () => showEnd("head"), tailBtn: () => showEnd("tail"),
    reverseBtn: () => { notify(lastStep(list.reverse()), "success"); refresh(); },
    sortBtn: () => { notify(lastStep(list.sort()), "success"); refresh(); },
    findBtn: findAddress, updateBtn: updateValue, replaceBtn: replaceNode,
    isEmptyBtn: () => notify(`Is Empty: ${list.isEmpty() ? "True" : "False"}`, "info"),
    isFullBtn: () => notify(`Is Full: ${list.isFull() ? "True" : "False"}`, "info"),
};
for (const [id, fn] of Object.entries(actions)) $(id).addEventListener("click", fn);
els.limit.addEventListener("keydown", (e) => { if (e.key === "Enter") setLimit(); });

refresh();
