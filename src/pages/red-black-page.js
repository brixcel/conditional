/**
 * Red-black tree page controller (C21).
 * Logic: src/structures/red-black.js. Demos: ./red-black-demos.js. Layout: src/core/tree-layout.js.
 * Playback: StepPlayer. Reuses main.css sections 14/15 (.hp-*, .bst-*) and section 17 (.rb-*).
 * No inline styles, no .style writes, no HTML strings: every value reaches the page through
 * textContent or setAttribute.
 *
 * Nodes are kept in a pool keyed by node id, so a rotation glides the same SVG group to its
 * new position (requestAnimationFrame + setAttribute) instead of redrawing the tree; reduced
 * motion users get the final positions at once. Everything drawn comes from the recorded
 * step: colours, the red-red pair, the double-black marker (and its phantom NIL child) and
 * the validity check all read step.snapshot / step.fix / step.doubleBlack, never the live tree.
 */
import { StepPlayer } from "../core/step-player.js";
import { parseInteger } from "../core/validate.js";
import { layoutBinaryTree } from "../core/tree-layout.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import { parseArrayInput } from "../algorithms/sorting.js";
import { RedBlackTree, RB_INFO, INSERT_CASES, DELETE_CASES } from "../structures/red-black.js";
import { RB_DEMOS, DEFAULT_DEMO, parseShape } from "./red-black-demos.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CAPACITY = 31;
const VALUE_LIMITS = { min: -99, max: 999 };
const LAYOUT_OPTS = { levelGap: 76, minGap: 56 };
const PAD_X = 30;
const PAD_TOP = 32;
const PAD_BOTTOM = 44;
const NODE_RADIUS = 18;
const HALO_RADIUS = NODE_RADIUS + 5;
const NIL_RADIUS = 11;
const NIL_DX = LAYOUT_OPTS.minGap * 0.5;
const NIL_DY = LAYOUT_OPTS.levelGap * 0.86;
const RANDOM_COUNT = 10;
const MOVE_MS = 420;

const OP_TITLES = {
    insert: "Pseudocode (Insert + Fix-Up)",
    delete: "Pseudocode (Delete + Fix-Up)",
    search: "Pseudocode (Search)",
    min: "Pseudocode (Find Minimum)",
    max: "Pseudocode (Find Maximum)",
    inspect: "Pseudocode (Node Roles & Colours)",
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
    message: $("rbMessage"),
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
    statBlackHeight: $("statBlackHeight"),
    statCase: $("statCase"),
    statDoubleBlack: $("statDoubleBlack"),
    statValid: $("statValid"),
};

const reducedMotionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const prefersReducedMotion = () => Boolean(reducedMotionQuery && reducedMotionQuery.matches);

let rb = new RedBlackTree(CAPACITY);
let currentCodeKey = "";
let announceReady = false;

const player = new StepPlayer({ onStep: render, baseDelay: 1000 });
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
        if (bad) input.setAttribute("aria-describedby", "rbMessage");
        else input.removeAttribute("aria-describedby");
    }
}

/* ---------- helpers ---------- */

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function toneFor(type) {
    switch (type) {
        case "visit":
        case "go-left":
        case "go-right":
        case "check":
        case "violation":
        case "double-black":
            return "hp-compare";
        case "find-successor":
        case "transplant":
        case "highlight":
            return "hp-select";
        case "insert":
        case "found":
        case "rotate-left":
        case "rotate-right":
        case "done":
            return "hp-settled";
        case "not-found":
        case "duplicate":
        case "overflow":
        case "empty":
            return "hp-swap";
        default:
            return "";
    }
}

const isRecolor = (type) => type === "recolor" || type === "root-black";

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
}

/**
 * Validity of the SHOWN snapshot (not the live tree): rebuild it with fromSnapshot, which
 * runs integrityError() and throws with the broken rule. Cached per snapshot object.
 */
const validityCache = new WeakMap();
function snapshotError(snap) {
    if (validityCache.has(snap)) return validityCache.get(snap);
    let error = null;
    try {
        RedBlackTree.fromSnapshot({ nodes: snap.nodes, rootId: snap.rootId }, snap.capacity);
    } catch (e) {
        error = String(e && e.message ? e.message : e).replace(/^snapshot is not a valid red-black tree:\s*/, "");
    }
    validityCache.set(snap, error);
    return error;
}

/** Summary of one snapshot: lookup, parents, root, height, black counts on every root-to-NIL path. */
function analyze(snap) {
    const byId = new Map(snap.nodes.map((n) => [n.id, n]));
    const parentOf = new Map();
    for (const n of snap.nodes) {
        if (n.left !== null) parentOf.set(n.left, n.id);
        if (n.right !== null) parentOf.set(n.right, n.id);
    }
    const root = snap.rootId === null ? null : byId.get(snap.rootId) ?? null;
    let height = -1;
    let minBlack = Infinity;
    let maxBlack = -Infinity;
    const walk = (id, depth, blacks) => {
        if (id === null) {
            minBlack = Math.min(minBlack, blacks);
            maxBlack = Math.max(maxBlack, blacks);
            return;
        }
        const n = byId.get(id);
        if (!n) return;
        height = Math.max(height, depth);
        const b = blacks + (n.color === "black" ? 1 : 0);
        walk(n.left, depth + 1, b);
        walk(n.right, depth + 1, b);
    };
    if (root) walk(root.id, 0, 0);
    else minBlack = maxBlack = 0;
    return {
        byId,
        parentOf,
        root,
        height,
        minBlack,
        maxBlack,
        inorder: snap.nodes, // rb.snapshot() lists nodes in-order
        reds: snap.nodes.filter((n) => n.color === "red").length,
    };
}

function fixText(fix, op) {
    if (!fix) return "—";
    return `${op === "insert" ? "Insert" : "Delete"} case ${fix.number}: ${fix.label} (${fix.side})`;
}

function doubleBlackText(db, stats) {
    if (!db) return "—";
    if (db.id !== null) {
        const n = stats.byId.get(db.id);
        if (!n) return "—";
        return n.color === "red" ? `on ${n.value} (red + extra black)` : `on ${n.value}`;
    }
    const p = db.parentId === null ? null : stats.byId.get(db.parentId);
    return p ? `on the empty ${db.side} child (NIL) of ${p.value}` : "—";
}

/* ---------- pseudocode ---------- */

function updatePseudocode(step) {
    const op = RB_INFO.pseudocode[step.operation] ? step.operation : "insert";
    if (op !== currentCodeKey) {
        currentCodeKey = op;
        els.codeHeading.textContent = OP_TITLES[op] ?? "Pseudocode";
        els.code.replaceChildren(...RB_INFO.pseudocode[op].map((text) => {
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
    nil: null, // { g, line, parentId, side } phantom NIL child carrying a double black
    raf: 0,
};

function ensureSvg() {
    if (view.svg && view.svg.isConnected) return;
    view.svg = svgEl("svg", {
        class: "hp-svg bst-svg rb-svg",
        role: "img",
        "aria-labelledby": "rbSvgTitle",
        "aria-describedby": "rbSvgDesc",
    });
    view.titleEl = svgEl("title", { id: "rbSvgTitle" });
    view.descEl = svgEl("desc", { id: "rbSvgDesc" });
    view.edgeLayer = svgEl("g");
    view.nodeLayer = svgEl("g");
    view.svg.append(view.titleEl, view.descEl, view.edgeLayer, view.nodeLayer);
    view.nodes.clear();
    view.edges.clear();
    view.nil = null;
    els.treeStage.replaceChildren(view.svg);
}

function placeNode(entry, x, y) {
    entry.x = x;
    entry.y = y;
    entry.g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
}

/** Lines follow their endpoints; the phantom NIL follows its parent. Called every glide frame. */
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
    if (view.nil) {
        const p = view.nodes.get(view.nil.parentId);
        if (!p) return;
        const x = p.x + (view.nil.side === "left" ? -NIL_DX : NIL_DX);
        const y = p.y + NIL_DY;
        view.nil.g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        view.nil.line.setAttribute("x1", p.x.toFixed(1));
        view.nil.line.setAttribute("y1", p.y.toFixed(1));
        view.nil.line.setAttribute("x2", x.toFixed(1));
        view.nil.line.setAttribute("y2", y.toFixed(1));
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

function createNodeEntry(t) {
    const g = svgEl("g", { class: "hp-node" });
    const halo = svgEl("circle", { class: "rb-halo", cx: 0, cy: 0, r: HALO_RADIUS });
    const ring1 = svgEl("circle", { class: "rb-db-ring", cx: 0, cy: 0, r: NODE_RADIUS + 4 });
    const ring2 = svgEl("circle", { class: "rb-db-ring", cx: 0, cy: 0, r: NODE_RADIUS + 8 });
    const circle = svgEl("circle", { class: "hp-node-circle", cx: 0, cy: 0, r: NODE_RADIUS });
    const valueEl = svgEl("text", { class: "hp-node-value", x: 0, y: 0 });
    const labelEl = svgEl("text", { class: "hp-node-index", x: 0, y: NODE_RADIUS + 19 });
    g.append(halo, ring1, ring2, circle, valueEl, labelEl);
    view.nodeLayer.append(g);
    const entry = { g, valueEl, labelEl, x: t.x, y: t.y };
    placeNode(entry, t.x, t.y);
    return entry;
}

/** Shows, moves or removes the phantom NIL child that carries a double black. */
function syncNil(db) {
    const want = db && db.id === null && db.parentId !== null && view.nodes.has(db.parentId) ? db : null;
    if (!want) {
        if (view.nil) {
            view.nil.g.remove();
            view.nil.line.remove();
            view.nil = null;
        }
        return;
    }
    if (!view.nil) {
        const line = svgEl("line", { class: "rb-nil-edge" });
        const g = svgEl("g", { class: "rb-nil rb-double-black", "aria-hidden": "true" });
        g.append(
            svgEl("circle", { class: "rb-db-ring", cx: 0, cy: 0, r: NIL_RADIUS + 3 }),
            svgEl("circle", { class: "rb-db-ring", cx: 0, cy: 0, r: NIL_RADIUS + 6 }),
            svgEl("circle", { class: "rb-nil-circle", cx: 0, cy: 0, r: NIL_RADIUS }),
        );
        const text = svgEl("text", { class: "rb-nil-text", x: 0, y: 0 });
        text.textContent = "NIL";
        g.append(text);
        view.edgeLayer.append(line);
        view.nodeLayer.append(g);
        view.nil = { g, line, parentId: want.parentId, side: want.side };
    }
    view.nil.parentId = want.parentId;
    view.nil.side = want.side;
}

function nodeLabel(node, { violating, doubleBlack }) {
    if (doubleBlack) return node.color === "red" ? "red+black" : "black ×2";
    if (violating) return "red!";
    return node.color;
}

function renderTree(step, stats, index) {
    const snap = step.snapshot;
    if (snap.nodes.length === 0 || stats.root === null) {
        if (view.raf) cancelAnimationFrame(view.raf);
        view.raf = 0;
        view.svg = null;
        view.nodes.clear();
        view.edges.clear();
        view.nil = null;
        const empty = document.createElement("p");
        empty.className = "text-muted text-italic hp-empty";
        empty.textContent = "The red-black tree is empty. Insert a key, run a case demo, or build from a list.";
        els.treeStage.replaceChildren(empty);
        return null;
    }

    ensureSvg();
    const layout = layoutBinaryTree(snap, LAYOUT_OPTS);
    const targets = new Map(layout.nodes.map((n) => [n.id, { x: n.x + PAD_X, y: n.y + PAD_TOP }]));

    const db = step.doubleBlack ?? null;
    const nilParent = db && db.id === null && db.parentId !== null ? targets.get(db.parentId) : null;
    const w = Math.ceil(layout.width + PAD_X * 2);
    let hgt = Math.ceil(layout.height + PAD_TOP + PAD_BOTTOM);
    if (nilParent) hgt = Math.max(hgt, Math.ceil(nilParent.y + NIL_DY + NIL_RADIUS + 14));
    view.svg.setAttribute("width", String(w));
    view.svg.setAttribute("height", String(hgt));
    view.svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`);

    // Nodes: drop removed ids, create new ids at their target position.
    for (const [id, entry] of view.nodes) {
        if (!targets.has(id)) {
            entry.g.remove();
            view.nodes.delete(id);
        }
    }
    for (const [id, t] of targets) {
        if (!view.nodes.has(id)) view.nodes.set(id, createNodeEntry(t));
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
    syncNil(db);

    // Classes and labels for this frame.
    const tone = toneFor(step.type);
    const recolor = isRecolor(step.type);
    const active = new Set(step.nodeIds ?? []);
    const path = step.pathIds ?? [];
    const pathSet = new Set(path);
    const pathEdges = new Set();
    for (let i = 0; i + 1 < path.length; i++) pathEdges.add(`${path[i]}>${path[i + 1]}`);

    // Red-red violation: z is nodeIds[0]; its parent in this snapshot is the other red.
    const violating = new Set();
    let violationEdge = null;
    if (step.type === "violation" && step.nodeIds.length > 0) {
        const z = step.nodeIds[0];
        const p = stats.parentOf.get(z);
        if (p !== undefined && stats.byId.get(z)?.color === "red" && stats.byId.get(p)?.color === "red") {
            violating.add(z);
            violating.add(p);
            violationEdge = `${p}>${z}`;
        }
    }
    const dbId = db && db.id !== null ? db.id : null;
    const flashClass = index % 2 === 0 ? "rb-flash-a" : "rb-flash-b";

    for (const [key, { line, from, to }] of view.edges) {
        let cls = "hp-edge";
        if (key === violationEdge) cls += " rb-violation-edge";
        else if (tone && active.has(from) && active.has(to)) cls += ` ${tone}`;
        else if (pathEdges.has(key)) cls += " bst-path";
        line.setAttribute("class", cls);
    }

    for (const [id, entry] of view.nodes) {
        const node = stats.byId.get(id);
        const classes = ["hp-node", node.color === "red" ? "rb-red" : "rb-black"];
        if (id === snap.rootId) classes.push("hp-root");
        if (id === dbId) classes.push("rb-double-black");
        if (violating.has(id)) classes.push("rb-violation");
        else if (recolor && active.has(id)) classes.push(flashClass);
        else if (tone && active.has(id)) classes.push(tone);
        else if (pathSet.has(id)) classes.push("bst-path");
        entry.g.setAttribute("class", classes.join(" "));
        entry.valueEl.textContent = String(node.value);
        entry.labelEl.textContent = nodeLabel(node, { violating: violating.has(id), doubleBlack: id === dbId });
    }

    view.titleEl.textContent = `Red-black tree with ${plural(snap.nodes.length, "node")}, root ${stats.root.value} (${stats.root.color})`;
    const extras = [];
    if (violationEdge) {
        const [p, z] = violationEdge.split(">").map(Number);
        extras.push(`Red-red violation between ${stats.byId.get(p).value} and its child ${stats.byId.get(z).value}.`);
    }
    if (db) extras.push(`Double black ${doubleBlackText(db, stats)}.`);
    view.descEl.textContent = `${step.message} ${extras.join(" ")} Nodes in order: ` +
        stats.inorder.map((n) => `${n.value} ${n.color}`).join(", ") + ".";

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
    const tone = isRecolor(step.type) ? "hp-select" : toneFor(step.type);
    const active = new Set(step.nodeIds ?? []);
    els.inorderStage.replaceChildren(...stats.inorder.map((n, i) => {
        const li = document.createElement("li");
        li.className = "slot-wrap";
        const isRoot = n.id === step.snapshot.rootId;
        const isActive = Boolean(tone) && active.has(n.id);
        const letter = n.color === "red" ? "R" : "B";
        const lbl = document.createElement("span");
        lbl.className = isRoot || isActive ? "slot-label slot-label-active mono" : "slot-label mono";
        lbl.setAttribute("aria-hidden", "true");
        lbl.textContent = isRoot ? `[${i}] ${letter} ROOT` : `[${i}] ${letter}`;
        const box = document.createElement("div");
        const cls = ["node-box", "hp-cell", "bst-cell", "mono"];
        if (n.color === "red") cls.push("rb-cell-red");
        if (isRoot) cls.push("hp-root");
        if (isActive) cls.push(tone);
        box.className = cls.join(" ");
        box.setAttribute("aria-hidden", "true");
        box.textContent = String(n.value);
        const sr = document.createElement("span");
        sr.className = "bst-sr-only";
        sr.textContent = `Position ${i}: ${n.value}, ${n.color}${isRoot ? ", root" : ""}`;
        li.append(lbl, box, sr);
        return li;
    }));
}

/* ---------- frame ---------- */

function render(step, index, p) {
    const snap = step.snapshot;
    const stats = analyze(snap);

    updatePseudocode(step);
    revealInStage(renderTree(step, stats, index));
    renderInorder(step, stats);

    els.stepMessage.setAttribute("aria-live", liveReady && (userStep || p.atEnd) ? "polite" : "off");
    if (els.stepMessage.textContent !== step.message) els.stepMessage.textContent = step.message;

    els.statRoot.textContent = stats.root ? `${stats.root.value} (${stats.root.color})` : "— (empty)";
    els.statSize.textContent = `${snap.size} / ${snap.capacity}`;
    els.statHeight.textContent = String(stats.height);
    els.statBlackHeight.textContent = stats.minBlack === stats.maxBlack
        ? String(stats.minBlack)
        : `${stats.minBlack}–${stats.maxBlack} (paths differ)`;
    els.statCase.textContent = fixText(step.fix, step.operation);
    els.statDoubleBlack.textContent = doubleBlackText(step.doubleBlack, stats);
    const error = snapshotError(snap);
    els.statValid.textContent = error === null ? "Yes (all 5 rules hold)" : `No: ${error}`;

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

function fixSummary(fixes, op) {
    if (fixes.length === 0) return op === "insert" ? "No fix-up case was needed." : "No double-black case was needed.";
    const table = op === "insert" ? INSERT_CASES : DELETE_CASES;
    return `Fix-up: ${fixes.map((f) => `case ${f.number} (${table[f.case].label}, ${f.side})`).join(", then ")}.`;
}

function handleInsert(e) {
    e.preventDefault();
    const key = parseKey();
    if (key === null) return;
    const res = rb.insert(key);
    loadSteps(res.steps);
    if (!res.ok) {
        notify(res.error, "error");
        return;
    }
    notify(`Inserted ${key} (size ${rb.size}/${rb.capacity}). ${fixSummary(res.value.fixes, "insert")}`, "success");
    els.valueInput.value = "";
    els.valueInput.focus();
}

function handleSearch() {
    const key = parseKey();
    if (key === null) return;
    const res = rb.search(key);
    loadSteps(res.steps);
    notify(res.value.found ? `Found ${key}.` : `${key} is not in the red-black tree.`, res.value.found ? "success" : "warning");
}

function handleDelete() {
    const key = parseKey();
    if (key === null) return;
    const res = rb.delete(key);
    loadSteps(res.steps);
    if (!res.ok) {
        notify(res.error, "error");
        return;
    }
    const how = res.value.case === "two-children"
        ? ` (two children: successor ${res.value.successorValue} moved up)`
        : res.value.case === "one-child" ? " (one child moved up)" : " (leaf)";
    notify(`Deleted ${key}${how}; the removed colour was ${res.value.removedColor}. ${fixSummary(res.value.fixes, "delete")}`, "info");
    els.valueInput.value = "";
    els.valueInput.focus();
}

function handleExtreme(which) {
    const res = which === "min" ? rb.min() : rb.max();
    loadSteps(res.steps);
    if (!res.ok) notify(res.error, "error");
    else notify(`${which === "min" ? "Minimum" : "Maximum"} key is ${res.value.value}.`, "info");
}

function handleClear() {
    const res = rb.clear();
    loadSteps(res.steps, { autoPlay: false });
    notify(`Cleared ${plural(res.value, "node")}.`, "info");
}

function handleInspect(e) {
    e.preventDefault();
    const res = rb.inspect(els.inspectSelect.value);
    loadSteps(res.steps, { autoPlay: false });
    notify(res.steps[0].message, "info");
}

function handleDemo(e) {
    e.preventDefault();
    const demo = RB_DEMOS[els.demoSelect.value];
    if (!demo) return;
    const next = RedBlackTree.fromSnapshot(parseShape(demo.shape), CAPACITY);
    const start = next.toArray().length;
    const res = demo.op === "insert" ? next.insert(demo.key) : next.delete(demo.key);
    rb = next;
    loadSteps(res.steps);
    notify(`Demo: start tree ${demo.shape} (${plural(start, "key")}), then ${demo.op} ${demo.key}. ` +
        fixSummary(res.ok ? res.value.fixes : [], demo.op), "info");
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
        notify(`Red-black tree keys must be unique. Remove the duplicate${dupes.length === 1 ? "" : "s"}: ${dupes.join(", ")}.`, "error", "build");
        els.buildInput.focus();
        return;
    }
    const next = new RedBlackTree(CAPACITY);
    const steps = [];
    let rotations = 0;
    for (const v of parsed.values) {
        const res = next.insert(v);
        steps.push(...res.steps);
        rotations += res.steps.filter((s) => s.type.startsWith("rotate-")).length;
    }
    rb = next;
    loadSteps(steps, { autoPlay });
    if (!silent) {
        notify(`Built a red-black tree of ${plural(rb.size, "key")} (height ${rb.height()}, black height ` +
            `${rb.blackHeight()}, ${plural(rotations, "rotation")} along the way).`, "success");
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
    // Read the slider before pausing: pause() re-renders and resets els.progress.value.
    const target = Number(els.progress.value);
    player.pause();
    player.goTo(target);
}));

// Keys inside the scroll boxes scroll them; the shared guard in player-keys.js skips them.
bindPlayerKeys(document, userControls);

/* ---------- static content ---------- */

for (const [group, title] of [["insert", "Insert fix-up cases"], ["delete", "Delete fix-up cases"]]) {
    const og = document.createElement("optgroup");
    og.label = title;
    for (const [value, demo] of Object.entries(RB_DEMOS)) {
        if (demo.group !== group) continue;
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = demo.label;
        if (value === DEFAULT_DEMO) opt.selected = true;
        og.append(opt);
    }
    els.demoSelect.append(og);
}

$("rbName").textContent = RB_INFO.name;
$("rbSummary").textContent = RB_INFO.summary;
$("cxSearch").textContent = RB_INFO.complexity.search;
$("cxInsert").textContent = RB_INFO.complexity.insert;
$("cxDelete").textContent = RB_INFO.complexity.delete;
$("cxMinMax").textContent = RB_INFO.complexity.minMax;
$("cxRotation").textContent = RB_INFO.complexity.rotation;
$("cxSpace").textContent = RB_INFO.complexity.space;

const CX_ROWS = [
    ["Search", RB_INFO.complexity.search, "Height is at most 2·log₂(n + 1), so one root-to-leaf walk is short."],
    ["Insert", RB_INFO.complexity.insert, "BST insert of a red leaf. Case 1 only recolours and may repeat up the tree (O(log n) times); cases 2 and 3 rotate at most twice in total, then stop."],
    ["Delete", RB_INFO.complexity.delete, "BST delete (the in-order successor moves up for two children). If a black node was lost, cases 1-4 fix the double black: case 2 may move it up O(log n) times, while cases 1, 3 and 4 use at most 3 rotations in total."],
    ["Min / Max", RB_INFO.complexity.minMax, "Follow the left or right spine."],
    ["Rotation", RB_INFO.complexity.rotation, "Re-links three pointers; colours are unchanged by the rotation itself."],
    ["Space", RB_INFO.complexity.space, "One node per key; the colour needs only one extra bit."],
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

// Initial tree, shown on its final step so it is visible at once (silent).
handleBuild(null, { autoPlay: false, silent: true });
player.goTo(player.length - 1);
announceReady = true;
liveReady = true;
