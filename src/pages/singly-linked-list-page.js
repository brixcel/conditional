/**
 * Singly Linked List page controller. The list is a real SinglyLinkedList
 * (src/structures/linked-list.js): node objects joined by `next` pointers. The old
 * singly-linked-list.js kept an array and wrote "next" labels onto it afterwards.
 *
 * Kept from the original page: max size 1–20 set once, positive whole numbers only,
 * no duplicate values, addresses abc001…, the same buttons, ids and enable rules,
 * inline messages, highlight on Find / Head / Tail.
 * Changed: Reset clears the list in place instead of reloading the page; success
 * messages now say which pointers changed; Replace Address links a new node into the
 * old node's place (the old version edited the old node).
 */
import { SinglyLinkedList } from "../structures/linked-list.js";
import { parseInteger } from "../core/validate.js";

const MAX_SIZE = 20;
const $ = (id) => document.getElementById(id);
const els = {
    maxSize: $("maxSizeInput"), setMax: $("setMaxSizeBtn"), reset: $("resetBtn"),
    value: $("operationValue"), index: $("operationIndex"), address: $("findAddressInput"), newAddress: $("newAddressInput"),
    message: $("message"), display: $("linkedListDisplay"),
};
const button = (id) => $(id);

/** @type {SinglyLinkedList | null} */
let list = null;

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

/* ---------- rendering ---------- */

function render(highlightAddress = null) {
    els.display.replaceChildren();
    if (!list || list.isEmpty()) {
        const empty = document.createElement("span");
        empty.className = "text-muted text-italic";
        empty.textContent = "List is empty";
        els.display.append(empty);
        return;
    }
    for (const node of list.nodes()) {
        const box = document.createElement("div");
        box.className = "node-box" + (node.address === highlightAddress ? " node-highlight" : "");

        const isHead = node === list.head;
        const isTail = node === list.tail;
        if (isHead || isTail) {
            const role = document.createElement("span");
            role.className = "slot-label slot-label-active";
            role.textContent = isHead && isTail ? "HEAD & TAIL" : isHead ? "HEAD" : "TAIL";
            box.append(role);
        }
        const address = document.createElement("div");
        address.className = "mono text-muted";
        address.textContent = node.address;
        const value = document.createElement("strong");
        value.className = "mono";
        value.textContent = String(node.value);
        const next = document.createElement("div");
        next.className = "mono text-secondary";
        next.textContent = `Next: ${node.next ? node.next.address : "NULL"}`;
        box.append(address, value, next);
        box.setAttribute("aria-label",
            `${isHead ? "head, " : ""}${isTail ? "tail, " : ""}address ${node.address}, value ${node.value}, next ${node.next ? node.next.address : "NULL"}`);

        const arrow = document.createElement("span");
        arrow.className = "arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";
        els.display.append(box, arrow);
    }
    const end = document.createElement("div");
    end.className = "node-box car-empty";
    const label = document.createElement("span");
    label.className = "slot-label";
    label.textContent = "TERMINAL";
    const nil = document.createElement("strong");
    nil.className = "mono";
    nil.textContent = "NULL";
    end.append(label, nil);
    els.display.append(end);
}

/* ---------- button state (same rules as the old page) ---------- */

const ALWAYS_WITH_LIST = ["getSizeBtn", "isFullBtn", "isEmptyBtn"];
const NEEDS_ROOM = ["appendBtn", "prependBtn", "insertAtBtn"];
const NEEDS_NODES = ["deleteHeadBtn", "deleteTailBtn", "deleteIndexBtn", "showHeadBtn", "showTailBtn",
    "findBtn", "updateAddressBtn", "replaceAddressBtn", "clearListBtn"];
const NEEDS_TWO = ["sortBtn", "reverseBtn"];

function updateState() {
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
}

function refresh(highlightAddress = null) {
    render(highlightAddress);
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
    notify(`Max size set to ${parsed.value}. head = tail = NULL.`, "success");
    refresh();
    els.value.focus();
}

function resetList() {
    list = null;
    clear(els.maxSize, els.value, els.index, els.address, els.newAddress);
    notify("List reset. Set a new max size to start again.", "info");
    refresh();
    els.maxSize.focus();
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
    const verb = where === "head" ? "Prepended" : where === "tail" ? "Appended" : `Inserted at index ${index}:`;
    clear(els.value, els.index);
    notify(explain(result, `${verb} ${value} (node ${result.value}).`), "success");
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
    const what = which === "head" ? "Head" : which === "tail" ? "Tail" : `Index ${index}`;
    notify(explain(result, `${what} element ${result.value} deleted.`), "success");
    refresh();
}

function clearList() {
    const result = list.clear();
    notify(result.steps.at(-1).message, "success");
    refresh();
}

function reorder(kind) {
    const result = kind === "reverse" ? list.reverse() : list.sort();
    notify(result.steps.at(-1).message, "success");
    refresh();
}

function showEnd(which) {
    const node = which === "head" ? list.head : list.tail;
    notify(`${which === "head" ? "Head" : "Tail"} of the list: address ${node.address}, value ${node.value}.`, "info");
    refresh(node.address);
}

function findAddress() {
    const address = readAddress(els.address, "address to find");
    if (!address) return;
    const result = list.find(address);
    clear(els.address);
    if (!result.ok) { error(result.error, els.address); refresh(); return; }
    const { index, value } = result.value;
    notify(`Address ${address} found at index ${index} after visiting ${result.steps.length} node${result.steps.length === 1 ? "" : "s"} from head. Element: ${value}.`, "success");
    refresh(address);
}

function updateAddress() {
    const address = readAddress(els.address, "target address to update");
    if (!address) return;
    if (!list.locate(address)) { error(`No node has address ${address}.`, els.address); return; }
    const value = readValue();
    if (value === null) return;
    const result = list.updateValue(address, value);
    if (!result.ok) { error(result.error, els.value); return; }
    clear(els.address, els.value);
    notify(result.steps.at(-1).message, "success");
    refresh(address);
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
    if (!result.ok) {
        error(result.error, /address/i.test(result.error) ? els.newAddress : els.value);
        return;
    }
    clear(els.address, els.value, els.newAddress);
    notify(result.steps.at(-1).message, "success");
    refresh(newAddress);
}

/* ---------- wiring ---------- */

const actions = {
    setMaxSizeBtn: setMaxSize, resetBtn: resetList,
    appendBtn: () => insert("tail"), prependBtn: () => insert("head"), insertAtBtn: () => insert("index"),
    deleteHeadBtn: () => remove("head"), deleteTailBtn: () => remove("tail"), deleteIndexBtn: () => remove("index"),
    clearListBtn: clearList,
    getSizeBtn: () => notify(`Current list size: ${list.size} of ${list.capacity}.`, "info"),
    showHeadBtn: () => showEnd("head"), showTailBtn: () => showEnd("tail"),
    reverseBtn: () => reorder("reverse"), sortBtn: () => reorder("sort"),
    findBtn: findAddress,
    isEmptyBtn: () => notify(`Is Empty: ${list.isEmpty() ? "True" : "False"}`, "info"),
    isFullBtn: () => notify(`Is Full: ${list.isFull() ? "True" : "False"}`, "info"),
    updateAddressBtn: updateAddress, replaceAddressBtn: replaceAddress,
};
for (const [id, fn] of Object.entries(actions)) button(id).addEventListener("click", fn);

// Same typing filter as before: digits only (Value also drops leading zeros).
els.value.addEventListener("input", () => { els.value.value = els.value.value.replace(/\D/g, "").replace(/^0+/, ""); });
els.index.addEventListener("input", () => { els.index.value = els.index.value.replace(/\D/g, ""); });
els.maxSize.addEventListener("keydown", (e) => { if (e.key === "Enter") setMaxSize(); });

refresh();
