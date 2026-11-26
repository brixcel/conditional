/**
 * AVL tree page controller (C12).
 * Logic: src/structures/avl.js. Layout: src/core/tree-layout.js. Playback: StepPlayer.
 * Reuses main.css sections 14/15 (.hp-*, .bst-*). No inline styles, no .style writes,
 * no HTML strings: every value reaches the page through textContent or setAttribute.
 *
 * Nodes are kept in a pool keyed by node id, so when a rotation moves a node the same
 * SVG group glides to its new position (requestAnimationFrame + setAttribute) instead
 * of the tree being redrawn. Reduced-motion users get the final positions at once.
 */
import { StepPlayer } from "../core/step-player.js";
import { parseInteger } from "../core/validate.js";
import { layoutBinaryTree } from "../core/tree-layout.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import { parseArrayInput } from "../algorithms/sorting.js";
import { AVLTree, AVL_INFO } from "../structures/avl.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CAPACITY = 31;
const VALUE_LIMITS = { min: -99, max: 999 };
const LAYOUT_OPTS = { levelGap: 70, minGap: 54 };
const PAD_X = 28;
const PAD_TOP = 28;
const PAD_BOTTOM = 40;
const NODE_RADIUS = 18;
const RANDOM_COUNT = 10;
const MOVE_MS = 420;

const DEMOS = {
    "insert-LL": { build: [30, 20], op: "insert", key: 10 },
    "insert-RR": { build: [10, 20], op: "insert", key: 30 },
    "insert-LR": { build: [30, 10], op: "insert", key: 20 },
    "insert-RL": { build: [10, 30], op: "insert", key: 20 },
    "delete-LL": { build: [20, 10, 30, 5], op: "delete", key: 30 },
    "delete-RR": { build: [20, 10, 30, 40], op: "delete", key: 10 },
    "delete-LR": { build: [20, 10, 30, 15], op: "delete", key: 30 },
    "delete-RL": { build: [20, 10, 30, 25], op: "delete", key: 10 },
};

const OP_TITLES = {
    insert: "Pseudocode (Insert + Rebalance)",
    delete: "Pseudocode (Delete + Rebalance)",
    search: "Pseudocode (Search)",
    min: "Pseudocode (Find Minimum)",
    max: "Pseudocode (Find Maximum)",
    inspect: "Pseudocode (Node Roles)",
    clear: "Pseudocode (Clear)",
};

const $ = (id) => document.getElementById(id);

const els = {
    keyForm: $("keyForm"),
    valueInput: $("valueInput"),
    searchBtn: $("searchBtn"),
    deleteBtn: $("deleteBtn"),
    minBtn: $("minBtn"),
    maxBtn: $("maxBtn"),
    clearBtn: $("clearBtn"),
    demoForm: $("demoForm"),
    demoSelect: $("demoSelect"),
    buildForm: $("buildForm"),
    buildInput: $("buildInput"),
    randomBtn: $("randomBtn"),
    inspectForm: $("inspectForm"),
    inspectSelect: $("inspectSelect"),
    message: $("avlMessage"),
    resetBtn: $("resetBtn"),
    prevBtn: $("prevBtn"),
    playBtn: $("playBtn"),
    playIcon: $("playIcon"),
    playLabel: $("playLabel"),
    nextBtn: $("nextBtn"),
    speed: $("speedSelect"),
    progress: $("progress"),
    counter: $("stepCounter"),
    treeStage: $("treeStage"),
    inorderStage: $("inorderStage"),
    stepMessage: $("stepMessage"),
    codeHeading: $("codeHeading"),
    code: $("pseudocode"),
    statRoot: $("statRoot"),
    statSize: $("statSize"),
    statHeight: $("statHeight"),
    statMin: $("statMin"),
    statMax: $("statMax"),
    statRotation: $("statRotation"),
    statBalanced: $("statBalanced"),
};

const reducedMotionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const prefersReducedMotion = () => Boolean(reducedMotionQuery && reducedMotionQuery.matches);

let avl = new AVLTree(CAPACITY);
let currentCodeKey = "";
let announceReady = false;

const player = new StepPlayer({ onStep: render, baseDelay: 900 });
player.setSpeed(Number(els.speed.value) || 1);

/* ---------- announcements ---------- */

// #stepMessage is a polite live region that only speaks for steps the user asked for
// (buttons, keys, slider) and for the last step of an autoplay run; operation results
// are announced through DSA_UI.announce(). Page load stays silent.
let userStep = false;
let liveReady = false;
const byUser = (fn) => (...args) => {
    userStep = true;
    try { return fn(...args); } finally { userStep = false; }
};
const userControls = {
    toggle: byUser(() => player.toggle()),
    pause: byUser(() => player.pause()),
    next: byUser(() => player.next()),
    prev: byUser(() => player.prev()),
    reset: byUser(() => player.reset()),
};

function notify(msg, type = "info", invalidField = null) {
    els.message.className = `alert-banner alert-live alert-${type}`;
    els.message.textContent = msg || "";
    els.message.hidden = !msg;
    if (announceReady && msg) window.DSA_UI?.announce?.(msg, type === "error" ? "assertive" : "polite");
    for (const [input, name] of [[els.valueInput, "value"], [els.buildInput, "build"]]) {
        const bad = invalidField === name;
        input.setAttribute("aria-invalid", bad ? "true" : "false");
        if (bad) input.setAttribute("aria-describedby", "avlMessage");
        else input.removeAttribute("aria-describedby");
    }
}

/* ---------- helpers ---------- */

const fmtBf = (b) => (b > 0 ? `+${b}` : String(b));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function toneFor(type) {
    switch (type) {
        case "visit":
        case "go-left":
        case "go-right":
            return "hp-compare";
        case "update-height":
        case "find-successor":
        case "copy-successor":
        case "highlight":
            return "hp-select";
        case "insert":
        case "found":
        case "rotate-left":
        case "rotate-right":
        case "stop":
        case "done":
            return "hp-settled";
        case "unbalanced":
        case "delete-leaf":
        case "delete-one-child":
        case "delete-successor":
        case "not-found":
        case "duplicate":
        case "overflow":
        case "empty":
            return "hp-swap";
        default:
            return "";
    }
}

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
}

/** Summary of one snapshot: lookup, in-order list, root, min, max, worst balance. */
function analyze(snap) {
    const byId = new Map(snap.nodes.map((n) => [n.id, n]));
    const root = snap.rootId === null ? null : byId.get(snap.rootId) ?? null;
    let worst = null;
    for (const n of snap.nodes) {
        if (Math.abs(n.balance) > 1 && (worst === null || Math.abs(n.balance) > Math.abs(worst.balance))) worst = n;
    }
    return {
        byId,
        root,
        inorder: snap.nodes, // avl.snapshot() lists nodes in-order
        min: snap.nodes.length ? snap.nodes[0].value : null,
        max: snap.nodes.length ? snap.nodes[snap.nodes.length - 1].value : null,
        worst,
    };
}

/* ---------- pseudocode ---------- */

function updatePseudocode(step) {
    const op = AVL_INFO.pseudocode[step.operation] ? step.operation : "insert";
    if (op !== currentCodeKey) {
        currentCodeKey = op;
        els.codeHeading.textContent = OP_TITLES[op] ?? "Pseudocode";
        els.code.replaceChildren(...AVL_INFO.pseudocode[op].map((text) => {
            const li = document.createElement("li");
            li.textContent = text;
            return li;
        }));
    }
    [...els.code.children].forEach((li, i) => li.classList.toggle("active", i + 1 === step.line));
}

/* ---------- tree view (node pool keyed by id) ---------- */

const view = {
    svg: null,
    titleEl: null,
    descEl: null,
    edgeLayer: null,
    nodeLayer: null,
    nodes: new Map(), // id -> { g, valueEl, labelEl, x, y }
    edges: new Map(), // "from>to" -> { line, from, to }
    raf: 0,
};

function ensureSvg() {
    if (view.svg && view.svg.isConnected) return;
    view.svg = svgEl("svg", {
        class: "hp-svg bst-svg",
        role: "img",
        "aria-labelledby": "avlSvgTitle",
        "aria-describedby": "avlSvgDesc",
    });
    view.titleEl = svgEl("title", { id: "avlSvgTitle" });
    view.descEl = svgEl("desc", { id: "avlSvgDesc" });
    view.edgeLayer = svgEl("g");
    view.nodeLayer = svgEl("g");
    view.svg.append(view.titleEl, view.descEl, view.edgeLayer, view.nodeLayer);
    view.nodes.clear();
    view.edges.clear();
    els.treeStage.replaceChildren(view.svg);
}

function placeNode(entry, x, y) {
    entry.x = x;
    entry.y = y;
    entry.g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
}

function placeEdges() {
    for (const { line, from, to } of view.edges.values()) {
        const a = view.nodes.get(from);
        const b = view.nodes.get(to);
        if (!a || !b) continue;
        line.setAttribute("x1", a.x.toFixed(1));
        line.setAttribute("y1", a.y.toFixed(1));
        line.setAttribute("x2", b.x.toFixed(1));
        line.setAttribute("y2", b.y.toFixed(1));
    }
}

function moveDuration() {
    return Math.min(MOVE_MS, Math.round(player.delay * 0.6));
}

/** Moves every pooled node to `targets`, gliding when motion is allowed. */
function moveTo(targets) {
    if (view.raf) cancelAnimationFrame(view.raf);
    view.raf = 0;
    const moves = [];
    for (const [id, t] of targets) {
        const entry = view.nodes.get(id);
        if (entry.x !== t.x || entry.y !== t.y) moves.push({ entry, fromX: entry.x, fromY: entry.y, t });
    }
    const duration = moveDuration();
    if (moves.length === 0 || prefersReducedMotion() || duration < 60) {
        for (const m of moves) placeNode(m.entry, m.t.x, m.t.y);
        placeEdges();
        return;
    }
    const start = performance.now();
    const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
    const frame = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const k = ease(p);
        for (const m of moves) {
            placeNode(m.entry, m.fromX + (m.t.x - m.fromX) * k, m.fromY + (m.t.y - m.fromY) * k);
        }
        placeEdges();
        view.raf = p < 1 ? requestAnimationFrame(frame) : 0;
    };
    view.raf = requestAnimationFrame(frame);
}

function renderTree(step, stats) {
    const snap = step.snapshot;
    if (snap.nodes.length === 0 || stats.root === null) {
        if (view.raf) cancelAnimationFrame(view.raf);
        view.raf = 0;
        view.svg = null;
        view.nodes.clear();
        view.edges.clear();
        const empty = document.createElement("p");
        empty.className = "text-muted text-italic hp-empty";
        empty.textContent = "The AVL tree is empty. Insert a key, run a rotation demo, or build from a list.";
        els.treeStage.replaceChildren(empty);
        return null;
    }

    ensureSvg();
    const layout = layoutBinaryTree(snap, LAYOUT_OPTS);
    const w = Math.ceil(layout.width + PAD_X * 2);
    const hgt = Math.ceil(layout.height + PAD_TOP + PAD_BOTTOM);
    view.svg.setAttribute("width", String(w));
    view.svg.setAttribute("height", String(hgt));
    view.svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`);

    const targets = new Map(layout.nodes.map((n) => [n.id, { x: n.x + PAD_X, y: n.y + PAD_TOP }]));

    // Nodes: drop removed ids, create new ids at their target position.
    for (const [id, entry] of view.nodes) {
        if (!targets.has(id)) {
            entry.g.remove();
            view.nodes.delete(id);
        }
    }
    for (const [id, t] of targets) {
        if (view.nodes.has(id)) continue;
        const g = svgEl("g", { class: "hp-node" });
        const circle = svgEl("circle", { class: "hp-node-circle", cx: 0, cy: 0, r: NODE_RADIUS });
        const valueEl = svgEl("text", { class: "hp-node-value", x: 0, y: 0 });
        const labelEl = svgEl("text", { class: "hp-node-index", x: 0, y: NODE_RADIUS + 13 });
        g.append(circle, valueEl, labelEl);
        view.nodeLayer.append(g);
        const entry = { g, valueEl, labelEl, x: t.x, y: t.y };
        placeNode(entry, t.x, t.y);
        view.nodes.set(id, entry);
    }

    // Edges keyed by parent>child, so a rotation re-links lines instead of redrawing all.
    const wanted = new Set(layout.edges.map((e) => `${e.from}>${e.to}`));
    for (const [key, edge] of view.edges) {
        if (!wanted.has(key)) {
            edge.line.remove();
            view.edges.delete(key);
        }
    }
    for (const e of layout.edges) {
        const key = `${e.from}>${e.to}`;
        if (view.edges.has(key)) continue;
        const line = svgEl("line", { class: "hp-edge" });
        view.edgeLayer.append(line);
        view.edges.set(key, { line, from: e.from, to: e.to });
    }

    // Classes and labels for this frame.
    const tone = toneFor(step.type);
    const active = new Set(step.nodeIds ?? []);
    const path = step.pathIds ?? [];
    const pathSet = new Set(path);
    const pathEdges = new Set();
    for (let i = 0; i + 1 < path.length; i++) pathEdges.add(`${path[i]}>${path[i + 1]}`);

    for (const [key, { line, from, to }] of view.edges) {
        let cls = "hp-edge";
        if (tone && active.has(from) && active.has(to)) cls += ` ${tone}`;
        else if (pathEdges.has(key)) cls += " bst-path";
        line.setAttribute("class", cls);
    }

    for (const [id, entry] of view.nodes) {
        const node = stats.byId.get(id);
        const unbalanced = Math.abs(node.balance) > 1;
        const classes = ["hp-node"];
        if (id === snap.rootId) classes.push("hp-root");
        if (unbalanced) classes.push("hp-swap");
        else if (tone && active.has(id)) classes.push(tone);
        else if (pathSet.has(id)) classes.push("bst-path");
        entry.g.setAttribute("class", classes.join(" "));
        entry.valueEl.textContent = String(node.value);
        entry.labelEl.textContent = `h${node.height} bf${fmtBf(node.balance)}${unbalanced ? "!" : ""}`;
    }

    view.titleEl.textContent = `AVL tree with ${plural(snap.nodes.length, "node")}, root ${stats.root.value}`;
    view.descEl.textContent = `${step.message} Nodes in order: ` +
        stats.inorder.map((n) => `${n.value} (height ${n.height}, balance ${fmtBf(n.balance)})`).join(", ") + ".";

    moveTo(targets);

    const focusId = step.nodeIds && step.nodeIds.length ? step.nodeIds[0] : path.length ? path[path.length - 1] : null;
    return focusId !== null && view.nodes.has(focusId) ? view.nodes.get(focusId).g : null;
}

function revealInStage(target) {
    if (!target) return;
    requestAnimationFrame(() => {
        const box = els.treeStage;
        if (box.scrollWidth <= box.clientWidth) return;
        const a = target.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        if (a.width === 0 || (a.left >= b.left + 12 && a.right <= b.right - 12)) return;
        const left = Math.max(0, box.scrollLeft + (a.left + a.width / 2) - (b.left + b.width / 2));
        box.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
}

/* ---------- in-order list ---------- */

function renderInorder(step, stats) {
    if (stats.inorder.length === 0) {
        const li = document.createElement("li");
        li.className = "text-muted text-italic hp-empty";
        li.textContent = "No keys (the tree is empty).";
        els.inorderStage.replaceChildren(li);
        return;
    }
    const tone = toneFor(step.type);
    const active = new Set(step.nodeIds ?? []);
    els.inorderStage.replaceChildren(...stats.inorder.map((n, i) => {
        const li = document.createElement("li");
        li.className = "slot-wrap";
        const isRoot = n.id === step.snapshot.rootId;
        const isActive = Boolean(tone) && active.has(n.id);
        const lbl = document.createElement("span");
        lbl.className = isRoot || isActive ? "slot-label slot-label-active mono" : "slot-label mono";
        lbl.setAttribute("aria-hidden", "true");
        lbl.textContent = isRoot ? `[${i}] ROOT` : `[${i}]`;
        const box = document.createElement("div");
        const cls = ["node-box", "hp-cell", "bst-cell", "mono"];
        if (isRoot) cls.push("hp-root");
        if (isActive) cls.push(tone);
        box.className = cls.join(" ");
        box.setAttribute("aria-hidden", "true");
        box.textContent = String(n.value);
        const sr = document.createElement("span");
        sr.className = "bst-sr-only";
        sr.textContent = `Position ${i}: ${n.value}${isRoot ? ", root" : ""}`;
        li.append(lbl, box, sr);
        return li;
    }));
}

/* ---------- frame ---------- */

function render(step, index, p) {
    const snap = step.snapshot;
    const stats = analyze(snap);

    updatePseudocode(step);
    revealInStage(renderTree(step, stats));
    renderInorder(step, stats);

    els.stepMessage.setAttribute("aria-live", liveReady && (userStep || p.atEnd) ? "polite" : "off");
    if (els.stepMessage.textContent !== step.message) els.stepMessage.textContent = step.message;

    els.statRoot.textContent = stats.root ? String(stats.root.value) : "— (empty)";
    els.statSize.textContent = `${snap.size} / ${snap.capacity}`;
    els.statHeight.textContent = String(stats.root ? stats.root.height : -1);
    els.statMin.textContent = stats.min === null ? "—" : String(stats.min);
    els.statMax.textContent = stats.max === null ? "—" : String(stats.max);
    const r = step.rotation;
    els.statRotation.textContent = r
        ? `${r.case} at ${r.pivotValue} (${r.stage === 0 ? "detected" : `rotation ${r.stage} of ${r.stages}`})`
        : "—";
    els.statBalanced.textContent = stats.worst
        ? `No: ${stats.worst.value} has bf ${fmtBf(stats.worst.balance)}`
        : "Yes (every |bf| ≤ 1)";

    els.counter.textContent = `Step ${index + 1} / ${p.length}`;
    els.progress.max = String(Math.max(0, p.length - 1));
    els.progress.value = String(index);
    els.progress.disabled = p.length <= 1;
    els.progress.setAttribute("aria-valuetext", `Step ${index + 1} of ${p.length}: ${step.message}`);

    if (p.isPlaying) {
        els.playIcon.textContent = "⏸";
        els.playLabel.textContent = "Pause";
    } else if (p.atEnd && p.length > 1) {
        els.playIcon.textContent = "↻";
        els.playLabel.textContent = "Replay";
    } else {
        els.playIcon.textContent = "▶";
        els.playLabel.textContent = "Play";
    }
    els.playBtn.disabled = p.length <= 1;
    els.prevBtn.disabled = p.atStart;
    els.resetBtn.disabled = p.atStart;
    els.nextBtn.disabled = p.atEnd;
}

function loadSteps(steps, { autoPlay = true } = {}) {
    if (!steps || steps.length === 0) return;
    player.load(steps);
    if (autoPlay && steps.length > 1 && !prefersReducedMotion()) player.play();
}

/* ---------- handlers ---------- */

function parseKey() {
    const parsed = parseInteger(els.valueInput.value, { ...VALUE_LIMITS, label: "Value" });
    if (!parsed.ok) {
        notify(parsed.error, "error", "value");
        els.valueInput.focus();
        return null;
    }
    return parsed.value;
}

function rotationSummary(rotations) {
    if (rotations.length === 0) return "No rotation needed.";
    return `Rotations: ${rotations.map((r) => `${r.case} at ${r.pivotValue}`).join(", ")}.`;
}

function handleInsert(e) {
    e.preventDefault();
    const key = parseKey();
    if (key === null) return;
    const res = avl.insert(key);
    loadSteps(res.steps);
    if (!res.ok) {
        notify(res.error, "error");
        return;
    }
    notify(`Inserted ${key} (size ${avl.size}/${avl.capacity}). ${rotationSummary(res.value.rotations)}`, "success");
    els.valueInput.value = "";
    els.valueInput.focus();
}

function handleSearch() {
    const key = parseKey();
    if (key === null) return;
    const res = avl.search(key);
    loadSteps(res.steps);
    notify(res.value.found ? `Found ${key}.` : `${key} is not in the AVL tree.`, res.value.found ? "success" : "warning");
}

function handleDelete() {
    const key = parseKey();
    if (key === null) return;
    const res = avl.delete(key);
    loadSteps(res.steps);
    if (!res.ok) {
        notify(res.error, "error");
        return;
    }
    const how = res.value.case === "two-children"
        ? ` using in-order successor ${res.value.successorValue}`
        : res.value.case === "one-child" ? " (one child moved up)" : " (leaf)";
    notify(`Deleted ${key}${how}. ${rotationSummary(res.value.rotations)}`, "info");
    els.valueInput.value = "";
    els.valueInput.focus();
}

function handleExtreme(which) {
    const res = which === "min" ? avl.min() : avl.max();
    loadSteps(res.steps);
    if (!res.ok) notify(res.error, "error");
    else notify(`${which === "min" ? "Minimum" : "Maximum"} key is ${res.value.value}.`, "info");
}

function handleClear() {
    const res = avl.clear();
    loadSteps(res.steps, { autoPlay: false });
    notify(`Cleared ${plural(res.value, "node")}.`, "info");
}

function handleInspect(e) {
    e.preventDefault();
    const res = avl.inspect(els.inspectSelect.value);
    loadSteps(res.steps, { autoPlay: false });
    notify(res.steps[0].message, "info");
}

function handleDemo(e) {
    e.preventDefault();
    const demo = DEMOS[els.demoSelect.value];
    if (!demo) return;
    const next = new AVLTree(CAPACITY);
    for (const v of demo.build) next.insert(v);
    const res = demo.op === "insert" ? next.insert(demo.key) : next.delete(demo.key);
    avl = next;
    loadSteps(res.steps);
    const verb = demo.op === "insert" ? "insert" : "delete";
    notify(`Demo: tree [${demo.build.join(", ")}], then ${verb} ${demo.key}. ${rotationSummary(res.value.rotations)}`, "info");
}

function duplicatesIn(values) {
    const seen = new Set();
    const dupes = new Set();
    for (const v of values) (seen.has(v) ? dupes : seen).add(v);
    return [...dupes];
}

function handleBuild(e, { autoPlay = true, silent = false } = {}) {
    if (e) e.preventDefault();
    const parsed = parseArrayInput(els.buildInput.value, { minLength: 1, maxLength: CAPACITY, ...VALUE_LIMITS });
    if (!parsed.ok) {
        notify(parsed.error, "error", "build");
        els.buildInput.focus();
        return;
    }
    const dupes = duplicatesIn(parsed.values);
    if (dupes.length > 0) {
        notify(`AVL keys must be unique. Remove the duplicate${dupes.length === 1 ? "" : "s"}: ${dupes.join(", ")}.`, "error", "build");
        els.buildInput.focus();
        return;
    }
    const next = new AVLTree(CAPACITY);
    const steps = [];
    let rotations = 0;
    for (const v of parsed.values) {
        const res = next.insert(v);
        steps.push(...res.steps);
        if (res.ok) rotations += res.value.rotations.length;
    }
    avl = next;
    loadSteps(steps, { autoPlay });
    if (!silent) {
        notify(`Built an AVL tree of ${plural(avl.size, "key")} (height ${avl.height()}, ${plural(rotations, "rotation case")} along the way).`, "success");
    }
}

function handleRandom() {
    const chosen = new Set();
    while (chosen.size < RANDOM_COUNT) chosen.add(1 + Math.floor(Math.random() * 99));
    els.buildInput.value = [...chosen].join(", ");
    handleBuild(null);
}

els.keyForm.addEventListener("submit", handleInsert);
els.searchBtn.addEventListener("click", handleSearch);
els.deleteBtn.addEventListener("click", handleDelete);
els.minBtn.addEventListener("click", () => handleExtreme("min"));
els.maxBtn.addEventListener("click", () => handleExtreme("max"));
els.clearBtn.addEventListener("click", handleClear);
els.demoForm.addEventListener("submit", handleDemo);
els.buildForm.addEventListener("submit", handleBuild);
els.randomBtn.addEventListener("click", handleRandom);
els.inspectForm.addEventListener("submit", handleInspect);

els.playBtn.addEventListener("click", userControls.toggle);
els.nextBtn.addEventListener("click", () => { userControls.pause(); userControls.next(); });
els.prevBtn.addEventListener("click", userControls.prev);
els.resetBtn.addEventListener("click", userControls.reset);
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value)));
els.progress.addEventListener("input", byUser(() => {
    player.pause();
    player.goTo(Number(els.progress.value));
}));

// Arrow keys inside the scrollable tree / list / pseudocode regions scroll them instead of stepping.
bindPlayerKeys({
    addEventListener: (type, fn) => document.addEventListener(type, (e) => {
        if (e.target && typeof e.target.closest === "function" && e.target.closest(".hp-scroll-region")) return;
        fn(e);
    }),
}, userControls);

/* ---------- static content ---------- */

$("avlName").textContent = AVL_INFO.name;
$("avlSummary").textContent = AVL_INFO.summary;
$("cxSearch").textContent = AVL_INFO.complexity.search;
$("cxInsert").textContent = AVL_INFO.complexity.insert;
$("cxDelete").textContent = AVL_INFO.complexity.delete;
$("cxMinMax").textContent = AVL_INFO.complexity.minMax;
$("cxRotation").textContent = AVL_INFO.complexity.rotation;
$("cxSpace").textContent = AVL_INFO.complexity.space;

const CX_ROWS = [
    ["Search", AVL_INFO.complexity.search, "Height is always below 1.44·log₂(n + 2), so the path is short."],
    ["Insert", AVL_INFO.complexity.insert, "BST insert, then update heights bottom-up; one single or double rotation always restores balance."],
    ["Delete", AVL_INFO.complexity.delete, "BST delete (in-order successor for two children); a rotation can shorten the subtree, so later ancestors may also rotate."],
    ["Min / Max", AVL_INFO.complexity.minMax, "Follow the left or right spine."],
    ["Rotation", AVL_INFO.complexity.rotation, "Re-links three pointers and recomputes two heights."],
    ["Space", AVL_INFO.complexity.space, "One node per key, each storing its height."],
];
$("cxTable").replaceChildren(...CX_ROWS.map(([op, cx, note]) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = op;
    const td1 = document.createElement("td");
    td1.textContent = cx;
    const td2 = document.createElement("td");
    td2.textContent = note;
    tr.append(th, td1, td2);
    return tr;
}));

// Initial demo tree, shown on its final step so it is visible at once (silent).
handleBuild(null, { autoPlay: false, silent: true });
player.goTo(player.length - 1);
announceReady = true;
liveReady = true;
