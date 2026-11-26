/**
 * Binary Heap page controller (G7).
 * Logic comes from src/structures/heap.js; coordinates from src/core/tree-layout.js;
 * input parsing reuses src/core/validate.js and src/algorithms/sorting.js.
 * Uses CSS classes from main.css section 14 — zero inline style writes, zero user innerHTML.
 */
import { StepPlayer } from "../core/step-player.js";
import { parseInteger } from "../core/validate.js";
import { layoutCompleteTree } from "../core/tree-layout.js";
import { parseArrayInput, randomArray } from "../algorithms/sorting.js";
import { BinaryHeap, HEAP_INFO, isValidHeap } from "../structures/heap.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HEAP_CAPACITY = 31; // 5 levels — readable on a phone
const VALUE_LIMITS = { min: -99, max: 999 };
const TREE_PAD_X = 24;
const TREE_PAD_TOP = 28;
const TREE_PAD_BOTTOM = 38;
const NODE_RADIUS = 18;

const $ = (id) => document.getElementById(id);

const els = {
    kind: $("kindSelect"),
    insertForm: $("insertForm"),
    valueInput: $("valueInput"),
    insertBtn: $("insertBtn"),
    extractBtn: $("extractBtn"),
    peekBtn: $("peekBtn"),
    clearBtn: $("clearBtn"),
    buildForm: $("buildForm"),
    buildInput: $("buildInput"),
    buildBtn: $("buildBtn"),
    randomBtn: $("randomBtn"),
    message: $("heapMessage"),
    resetBtn: $("resetBtn"),
    prevBtn: $("prevBtn"),
    playBtn: $("playBtn"),
    nextBtn: $("nextBtn"),
    speed: $("speedSelect"),
    progress: $("progress"),
    counter: $("stepCounter"),
    treeStageLabel: $("treeStageLabel"),
    treeStage: $("treeStage"),
    arrayStage: $("arrayStage"),
    stepMessage: $("stepMessage"),
    codeHeading: $("codeHeading"),
    code: $("pseudocode"),
    statKind: $("statKind"),
    statRootLabel: $("statRootLabel"),
    statRoot: $("statRoot"),
    statSize: $("statSize"),
    statComparisons: $("statComparisons"),
    statSwaps: $("statSwaps"),
    statValid: $("statValid"),
};

const CODE_TITLES = {
    insert: "Pseudocode (Insert)",
    extract: "Pseudocode (Extract Root)",
    build: "Pseudocode (Build Heap — O(n))",
};

// Exact 1-based step-type → pseudocode-line mapping per G7 spec.
const LINE_MAP = {
    insert: { insert: 1, compare: 2, swap: 3, done: 2 },
    extract: { extract: 1, "move-last": 2, compare: 3, swap: 3, settled: 3, done: 4 },
    build: { "build-start": 1, heapify: 2, compare: 3, swap: 3, settled: 3, done: 3 },
};

let heap = new BinaryHeap("min", HEAP_CAPACITY);
let currentOp = "build";
let currentCodeKey = "";

const player = new StepPlayer({ onStep: render, baseDelay: 750 });

function notify(msg, type = "info", invalidField = null) {
    const isError = type === "error";
    els.message.className = `alert-banner alert-live alert-${type}`;
    els.message.setAttribute("role", isError ? "alert" : "status");
    els.message.setAttribute("aria-live", isError ? "assertive" : "polite");
    els.message.textContent = msg || "";
    els.message.hidden = !msg;

    els.valueInput.setAttribute("aria-invalid", invalidField === "value" ? "true" : "false");
    els.buildInput.setAttribute("aria-invalid", invalidField === "build" ? "true" : "false");
}

function clearNotify() {
    notify("");
}

function stepHighlightClass(type) {
    if (type === "compare") return "hp-compare";
    if (type === "swap" || type === "extract" || type === "overflow" || type === "underflow") return "hp-swap";
    if (type === "settled" || type === "done") return "hp-settled";
    if (type === "insert" || type === "move-last" || type === "heapify" || type === "build-start") return "hp-select";
    return "";
}

function updatePseudocode(op, stepType) {
    const isErrorStep = stepType === "overflow" || stepType === "underflow";
    const key = isErrorStep ? (currentCodeKey || op) : op;
    if (key !== currentCodeKey) {
        currentCodeKey = key;
        els.codeHeading.textContent = CODE_TITLES[key] ?? "Pseudocode";
        els.code.replaceChildren(...HEAP_INFO.pseudocode[key].map(line => {
            const li = document.createElement("li");
            li.textContent = line;
            return li;
        }));
    }
    const activeLine = isErrorStep ? 0 : (LINE_MAP[key]?.[stepType] ?? 0);
    [...els.code.children].forEach((li, i) => li.classList.toggle("active", i + 1 === activeLine));
}

function updateKindChrome(kind) {
    const isMin = kind === "min";
    $("heapName").textContent = isMin ? "Binary Heap (Min-Heap)" : "Binary Heap (Max-Heap)";
    els.treeStageLabel.textContent = isMin
        ? "Complete Binary Tree — Min-Heap (Parent ≤ Children)"
        : "Complete Binary Tree — Max-Heap (Parent ≥ Children)";
    els.extractBtn.textContent = isMin ? "Extract Min" : "Extract Max";
    els.peekBtn.textContent = isMin ? "Peek Min" : "Peek Max";
    els.statKind.textContent = isMin ? "Min-Heap" : "Max-Heap";
    els.statRootLabel.textContent = isMin ? "Root (Min)" : "Root (Max)";
}

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
}

function renderTree(step) {
    const { items, kind } = step.snapshot;
    const n = items.length;
    if (n === 0) {
        const empty = document.createElement("p");
        empty.className = "text-muted text-italic hp-empty";
        empty.textContent = "Heap is empty. Insert a value or run Build Heap.";
        els.treeStage.replaceChildren(empty);
        return;
    }

    const layout = layoutCompleteTree(n, { levelGap: 68, minGap: 46 });
    const svgW = Math.ceil(layout.width + TREE_PAD_X * 2);
    const svgH = Math.ceil(layout.height + TREE_PAD_TOP + TREE_PAD_BOTTOM);

    const activeSet = new Set(step.indices);
    const toneClass = stepHighlightClass(step.type);

    const svg = svgEl("svg", {
        class: "hp-svg",
        width: svgW,
        height: svgH,
        viewBox: `0 0 ${svgW} ${svgH}`,
        role: "img",
        "aria-label": `Binary ${kind}-heap with ${n} node${n === 1 ? "" : "s"}`,
    });

    for (const edge of layout.edges) {
        const from = layout.nodes[edge.from];
        const to = layout.nodes[edge.to];
        const edgeActive = activeSet.has(edge.from) && activeSet.has(edge.to) && toneClass;
        svg.append(svgEl("line", {
            class: edgeActive ? `hp-edge ${toneClass}` : "hp-edge",
            x1: (from.x + TREE_PAD_X).toFixed(1),
            y1: (from.y + TREE_PAD_TOP).toFixed(1),
            x2: (to.x + TREE_PAD_X).toFixed(1),
            y2: (to.y + TREE_PAD_TOP).toFixed(1),
        }));
    }

    for (const node of layout.nodes) {
        const i = node.index;
        const val = items[i];
        const cx = node.x + TREE_PAD_X;
        const cy = node.y + TREE_PAD_TOP;
        const isActive = activeSet.has(i) && toneClass;
        const classes = ["hp-node"];
        if (i === 0) classes.push("hp-root");
        if (isActive) classes.push(toneClass);

        const g = svgEl("g", {
            class: classes.join(" "),
            "aria-label": `Index ${i}, value ${val}${i === 0 ? ", root" : ""}`,
        });

        g.append(svgEl("circle", {
            class: "hp-node-circle",
            cx: cx.toFixed(1),
            cy: cy.toFixed(1),
            r: NODE_RADIUS,
        }));

        const valueEl = svgEl("text", {
            class: "hp-node-value",
            x: cx.toFixed(1),
            y: cy.toFixed(1),
        });
        valueEl.textContent = String(val);

        const indexEl = svgEl("text", {
            class: "hp-node-index",
            x: cx.toFixed(1),
            y: (cy + NODE_RADIUS + 13).toFixed(1),
        });
        indexEl.textContent = `[${i}]`;

        g.append(valueEl, indexEl);
        svg.append(g);
    }

    els.treeStage.replaceChildren(svg);
}

function renderArray(step) {
    const { items } = step.snapshot;
    if (items.length === 0) {
        const empty = document.createElement("span");
        empty.className = "text-muted text-italic hp-empty";
        empty.textContent = "Array A is empty (size 0).";
        els.arrayStage.replaceChildren(empty);
        return;
    }

    const activeSet = new Set(step.indices);
    const toneClass = stepHighlightClass(step.type);

    const cells = items.map((val, i) => {
        const wrap = document.createElement("div");
        wrap.className = "slot-wrap";

        const isActive = activeSet.has(i) && Boolean(toneClass);
        const lbl = document.createElement("span");
        lbl.className = isActive || i === 0 ? "slot-label slot-label-active mono" : "slot-label mono";
        lbl.textContent = i === 0 ? "[0] ROOT" : `[${i}]`;

        const box = document.createElement("div");
        const boxClasses = ["node-box", "hp-cell", "mono"];
        if (i === 0) boxClasses.push("hp-root");
        if (isActive) boxClasses.push(toneClass);
        box.className = boxClasses.join(" ");
        box.textContent = String(val);
        box.setAttribute("aria-label", `Index ${i}: ${val}${i === 0 ? ", root" : ""}`);

        wrap.append(lbl, box);
        return wrap;
    });

    els.arrayStage.replaceChildren(...cells);
}

function render(step, index, p) {
    const snap = step.snapshot;
    updateKindChrome(snap.kind);
    updatePseudocode(currentOp, step.type);

    renderTree(step);
    renderArray(step);

    els.stepMessage.textContent = step.message;
    els.statRoot.textContent = snap.items.length > 0 ? String(snap.items[0]) : "— (empty)";
    els.statSize.textContent = `${snap.size} / ${snap.capacity}`;
    els.statComparisons.textContent = String(step.comparisons);
    els.statSwaps.textContent = String(step.swaps);
    els.statValid.textContent = isValidHeap(snap.items, snap.kind) ? "Valid" : "Sifting…";

    els.counter.textContent = `Step ${index + 1} / ${p.length}`;
    els.progress.max = Math.max(0, p.length - 1);
    els.progress.value = index;

    els.playBtn.textContent = p.isPlaying ? "⏸ Pause" : (p.atEnd ? "↻ Replay" : "▶ Play");
    els.playBtn.setAttribute("aria-label", p.isPlaying ? "Pause" : "Play");
    els.prevBtn.disabled = p.atStart;
    els.resetBtn.disabled = p.atStart;
    els.nextBtn.disabled = p.atEnd;
}

function loadSteps(op, steps, { autoPlay = true } = {}) {
    if (!steps || steps.length === 0) return;
    currentOp = op;
    player.load(steps);
    if (autoPlay && steps.length > 1) player.play();
}

function handleInsert(e) {
    e.preventDefault();
    const parsed = parseInteger(els.valueInput.value, { min: VALUE_LIMITS.min, max: VALUE_LIMITS.max, label: "Value" });
    if (!parsed.ok) { notify(parsed.error, "error", "value"); els.valueInput.focus(); return; }

    clearNotify();
    const res = heap.insert(parsed.value);
    if (!res.ok) {
        loadSteps(currentOp, res.steps, { autoPlay: false });
        notify(res.error, "error");
        return;
    }
    loadSteps("insert", res.steps);
    notify(`Inserted ${parsed.value} into the ${heap.label} (size ${heap.size}/${heap.capacity}).`, "success");
    els.valueInput.value = "";
    els.valueInput.focus();
}

function handleExtract() {
    clearNotify();
    const res = heap.extract();
    if (!res.ok) {
        loadSteps(currentOp, res.steps, { autoPlay: false });
        notify(res.error, "error");
        return;
    }
    loadSteps("extract", res.steps);
    notify(`Extracted ${heap.kind === "min" ? "minimum" : "maximum"} root ${res.value}.`, "info");
}

function handlePeek() {
    clearNotify();
    const root = heap.peek();
    if (root === null) {
        notify(`Heap is empty: there is no ${heap.kind === "min" ? "minimum" : "maximum"} root to peek.`, "error");
        return;
    }
    notify(`Peek: ${heap.kind === "min" ? "minimum" : "maximum"} root is ${root} at index 0.`, "info");
}

function handleBuild(e, { autoPlay = true } = {}) {
    if (e) e.preventDefault();
    const parsed = parseArrayInput(els.buildInput.value, {
        minLength: 1,
        maxLength: HEAP_CAPACITY,
        min: VALUE_LIMITS.min,
        max: VALUE_LIMITS.max,
    });
    if (!parsed.ok) { notify(parsed.error, "error", "build"); els.buildInput.focus(); return; }

    clearNotify();
    const res = BinaryHeap.from(heap.kind, parsed.values, HEAP_CAPACITY);
    if (!res.ok) {
        notify(res.error, "error", "build");
        return;
    }
    heap = res.value;
    loadSteps("build", res.steps, { autoPlay });
    notify(`Built a ${heap.label} of ${heap.size} value${heap.size === 1 ? "" : "s"} in O(n) time.`, "success");
}

function handleRandomBuild() {
    const values = randomArray(11);
    els.buildInput.value = values.join(", ");
    handleBuild(null, { autoPlay: true });
}

function handleKindChange() {
    const nextKind = els.kind.value;
    const existing = heap.toArray();
    clearNotify();
    if (existing.length > 0) {
        const res = BinaryHeap.from(nextKind, existing, HEAP_CAPACITY);
        heap = res.value;
        loadSteps("build", res.steps, { autoPlay: true });
        notify(`Switched to ${heap.label} and rebuilt from ${existing.length} current value${existing.length === 1 ? "" : "s"}.`, "info");
    } else {
        heap = new BinaryHeap(nextKind, HEAP_CAPACITY);
        loadSteps("build", [{
            type: "clear",   // not in LINE_MAP: nothing ran, so no pseudocode line is highlighted
            indices: [],
            message: `Switched to empty ${heap.label} (capacity ${HEAP_CAPACITY}).`,
            snapshot: heap.snapshot(),
            comparisons: 0,
            swaps: 0,
        }], { autoPlay: false });
        notify(`Switched to ${heap.label}.`, "info");
    }
}

function handleClear() {
    heap.clear();
    clearNotify();
    loadSteps("build", [{
        type: "clear",   // not in LINE_MAP: nothing ran, so no pseudocode line is highlighted
        indices: [],
        message: `Cleared the ${heap.label}.`,
        snapshot: heap.snapshot(),
        comparisons: 0,
        swaps: 0,
    }], { autoPlay: false });
    notify("Heap cleared.", "info");
}

els.insertForm.addEventListener("submit", handleInsert);
els.extractBtn.addEventListener("click", handleExtract);
els.peekBtn.addEventListener("click", handlePeek);
els.clearBtn.addEventListener("click", handleClear);
els.buildForm.addEventListener("submit", handleBuild);
els.randomBtn.addEventListener("click", handleRandomBuild);
els.kind.addEventListener("change", handleKindChange);

els.playBtn.addEventListener("click", () => player.toggle());
els.nextBtn.addEventListener("click", () => { player.pause(); player.next(); });
els.prevBtn.addEventListener("click", () => player.prev());
els.resetBtn.addEventListener("click", () => player.reset());
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value)));
els.progress.addEventListener("input", () => {
    const target = Number(els.progress.value);
    player.pause();
    player.goTo(target);
});

document.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
    if (e.key === " ") { e.preventDefault(); player.toggle(); }
    else if (e.key === "ArrowRight") { player.pause(); player.next(); }
    else if (e.key === "ArrowLeft") player.prev();
    else if (e.key === "Home") player.reset();
});

// Populate concept card and complexity table from HEAP_INFO using DOM nodes (no innerHTML).
$("heapSummary").textContent = HEAP_INFO.summary;
$("cxPeek").textContent = HEAP_INFO.complexity.peek;
$("cxInsert").textContent = HEAP_INFO.complexity.insert;
$("cxExtract").textContent = HEAP_INFO.complexity.extract;
$("cxBuild").textContent = HEAP_INFO.complexity.build;
$("cxSpace").textContent = HEAP_INFO.complexity.space;

const CX_ROWS = [
    ["Peek Root", HEAP_INFO.complexity.peek, "Read A[0] directly without modifying the tree."],
    ["Insert (Sift Up)", HEAP_INFO.complexity.insert, "Append at A[n] and swap with parent(i) until heap order holds."],
    ["Extract Root (Sift Down)", HEAP_INFO.complexity.extract, "Move last leaf A[n−1] to root and sift down toward the better child."],
    ["Build Heap (Bottom-Up)", HEAP_INFO.complexity.build, "Sift down internal nodes from floor((n − 2) / 2) down to 0."],
    ["Space", HEAP_INFO.complexity.space, "Stored in-place in a flat 0-indexed array."],
];
const tbody = $("cxTable");
tbody.replaceChildren(...CX_ROWS.map(([op, cx, note]) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = op;
    const tdCx = document.createElement("td");
    tdCx.textContent = cx;
    const tdNote = document.createElement("td");
    tdNote.textContent = note;
    tr.append(th, tdCx, tdNote);
    return tr;
}));

// Load initial demo heap on its final valid step so the user sees a built heap and can scrub back.
handleBuild(null, { autoPlay: false });
player.goTo(player.length - 1);
clearNotify();
