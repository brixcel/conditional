/**
 * Segment Tree page controller (G13).
 * Logic comes from src/structures/segment-tree.js; coordinates from src/core/tree-layout.js;
 * playback, shortcuts & validation reuse src/core/step-player.js, src/core/player-keys.js,
 * src/core/validate.js, and src/algorithms/sorting.js.
 * Uses CSS classes from main.css section 20 — zero inline style writes, zero innerHTML.
 */
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import { layoutCompleteTree } from "../core/tree-layout.js";
import { parseInteger } from "../core/validate.js";
import { parseArrayInput } from "../algorithms/sorting.js";
import {
    SegmentTree,
    SEGMENT_TREE_INFO,
    SEGMENT_TREE_LIMITS,
} from "../structures/segment-tree.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const LAYOUT_OPTS = { levelGap: 82, minGap: 70 };
const TREE_PAD_X = 40;
const TREE_PAD_TOP = 32;
const TREE_PAD_BOTTOM = 42;
const NODE_W = 56;
const NODE_H = 30;
const NODE_RX = 9;
const INNER_INSET = 4;
const INNER_RX = 6;
const HALO_PAD = 4;
const HALO_RX = 12;
const BADGE_RADIUS = 8.5;
const BADGE_OFFSET_X = NODE_W / 2 - 2;
const BADGE_OFFSET_Y = -(NODE_H / 2);

const OP_HEADINGS = {
    build: "Pseudocode (Build — O(n))",
    query: "Pseudocode (Range Query — O(log n))",
    update: "Pseudocode (Point Update — O(log n))",
    setMode: "Pseudocode (Switch Mode & Rebuild — O(n))",
};

const STATE_GLYPHS = {
    full: "✓",
    partial: "½",
    disjoint: "✗",
    combine: "+",
    recompute: "↑",
    "update-leaf": "★",
    visit: "•",
};

const $ = (id) => document.getElementById(id);

const els = {
    buildForm: $("buildForm"),
    buildInput: $("buildInput"),
    modeSelect: $("modeSelect"),
    buildBtn: $("buildBtn"),
    randomBtn: $("randomBtn"),
    queryForm: $("queryForm"),
    leftInput: $("leftInput"),
    rightInput: $("rightInput"),
    queryBtn: $("queryBtn"),
    queryRangeHint: $("queryRangeHint"),
    leftRangeHint: $("leftRangeHint"),
    rightRangeHint: $("rightRangeHint"),
    updateForm: $("updateForm"),
    indexInput: $("indexInput"),
    valueInput: $("valueInput"),
    updateBtn: $("updateBtn"),
    updateRangeHint: $("updateRangeHint"),
    indexRangeHint: $("indexRangeHint"),
    errorBanner: $("segError"),
    statusBanner: $("segStatus"),
    resetBtn: $("resetBtn"),
    stepBackBtn: $("stepBackBtn"),
    playBtn: $("playBtn"),
    playIcon: $("playIcon"),
    playLabel: $("playLabel"),
    stepFwdBtn: $("stepFwdBtn"),
    speed: $("speedSelect"),
    progress: $("progress"),
    counter: $("stepCounter"),
    treeStageLabel: $("treeStageLabel"),
    treeStage: $("treeStage"),
    svg: $("segSvg"),
    svgTitle: $("segSvgTitle"),
    svgDesc: $("segSvgDesc"),
    arrayStageLabel: $("arrayStageLabel"),
    arrayScrollRegion: $("arrayScrollRegion"),
    arrayStage: $("arrayStage"),
    stepMessage: $("stepMessage"),
    codeHeading: $("codeHeading"),
    code: $("pseudocode"),
    statResult: $("statResult"),
    statVisited: $("statVisited"),
    statCombines: $("statCombines"),
    statActiveNode: $("statActiveNode"),
    statModeSize: $("statModeSize"),
    statIntegrity: $("statIntegrity"),
};

const FIELD_MAP = {
    build: els.buildInput,
    left: els.leftInput,
    right: els.rightInput,
    index: els.indexInput,
    value: els.valueInput,
};

const reducedMotionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function prefersReducedMotion() {
    return Boolean(reducedMotionQuery && reducedMotionQuery.matches);
}

let segTree = new SegmentTree();
let currentCodeKey = "";
let lastRenderedStep = null;
let lastTopoKey = "";
let lastNodePosMap = new Map(); // nodeIndex -> { entry, cx, cy }
let lastEdgeEntries = [];       // [{ from, to, key, lineEl }]
let notifyTimerId = 0;
let revealRafId = 0;
let liveRearmRafId = 0;
let announceReady = false;
let suppressStepLive = false;
let autoPlaying = false;

const player = new StepPlayer({ onStep: render, baseDelay: 750 });
player.setSpeed(Number(els.speed.value) || 1);

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, String(v));
    }
    return el;
}

/* ---------- persistent SVG layers & DOM pools ---------- */

const edgesLayer = svgEl("g", { class: "st-edges-layer" });
const nodesLayer = svgEl("g", { class: "st-nodes-layer" });
els.svg.append(edgesLayer, nodesLayer);

const edgePool = [];  // [{ lineEl }]
const nodePool = [];  // [{ g, titleEl, haloEl, boxEl, innerEl, valueEl, rangeEl, badgeGroup, badgeBg, badgeText }]
const arrayPool = []; // [{ li, lbl, box, tag, sr }]

function ensureEdgePool(needed) {
    while (edgePool.length < needed) {
        const lineEl = svgEl("line", { class: "st-edge st-hidden" });
        edgesLayer.append(lineEl);
        edgePool.push({ lineEl });
    }
}

function ensureNodePool(needed) {
    while (nodePool.length < needed) {
        const g = svgEl("g", { class: "st-node st-hidden" });
        const titleEl = svgEl("title");
        const haloEl = svgEl("rect", {
            class: "st-active-halo",
            width: NODE_W + HALO_PAD * 2,
            height: NODE_H + HALO_PAD * 2,
            rx: HALO_RX,
            ry: HALO_RX,
        });
        const boxEl = svgEl("rect", {
            class: "st-node-box",
            width: NODE_W,
            height: NODE_H,
            rx: NODE_RX,
            ry: NODE_RX,
        });
        const innerEl = svgEl("rect", {
            class: "st-node-inner",
            width: NODE_W - INNER_INSET * 2,
            height: NODE_H - INNER_INSET * 2,
            rx: INNER_RX,
            ry: INNER_RX,
        });
        const valueEl = svgEl("text", { class: "st-node-value" });
        const rangeEl = svgEl("text", { class: "st-node-range" });

        const badgeGroup = svgEl("g", { class: "st-badge", "aria-hidden": "true" });
        const badgeBg = svgEl("circle", { class: "st-badge-bg", r: BADGE_RADIUS });
        const badgeText = svgEl("text", { class: "st-badge-text" });
        badgeGroup.append(badgeBg, badgeText);

        g.append(titleEl, haloEl, boxEl, innerEl, valueEl, rangeEl, badgeGroup);
        nodesLayer.append(g);
        nodePool.push({
            g,
            titleEl,
            haloEl,
            boxEl,
            innerEl,
            valueEl,
            rangeEl,
            badgeGroup,
            badgeBg,
            badgeText,
        });
    }
}

function ensureArrayPool(needed) {
    while (arrayPool.length < needed) {
        const li = document.createElement("li");
        li.className = "slot-wrap st-arr-wrap st-hidden";

        const lbl = document.createElement("span");
        lbl.className = "slot-label mono";
        lbl.setAttribute("aria-hidden", "true");

        const box = document.createElement("div");
        box.className = "node-box hp-cell bst-cell st-arr-cell mono";
        box.setAttribute("aria-hidden", "true");

        const tag = document.createElement("span");
        tag.className = "st-arr-tag mono";
        tag.setAttribute("aria-hidden", "true");

        const sr = document.createElement("span");
        sr.className = "bst-sr-only";

        li.append(lbl, box, tag, sr);
        els.arrayStage.append(li);
        arrayPool.push({ li, lbl, box, tag, sr });
    }
}

/* ---------- feedback banners & screen-reader announcements ---------- */

const LIVE_BASE_CLASS = "alert-banner alert-live bst-live";

function setFieldValidity(input, isInvalid) {
    input.setAttribute("aria-invalid", isInvalid ? "true" : "false");
    if (isInvalid) {
        input.setAttribute("aria-describedby", "segError");
    } else {
        input.removeAttribute("aria-describedby");
    }
}

function clearBanner(el) {
    el.textContent = "";
    el.className = LIVE_BASE_CLASS;
}

/**
 * Displays inline feedback without duplicate screen-reader announcements:
 * - Errors write to `#segError` (static `role="alert"`, never `[hidden]`).
 * - Status/info/success messages write to visual `#segStatus` and announce
 *   politely via `window.DSA_UI.announce`.
 */
function notify(msg, type = "info", invalidFields = []) {
    if (notifyTimerId) {
        clearTimeout(notifyTimerId);
        notifyTimerId = 0;
    }

    const invalidSet = new Set(
        Array.isArray(invalidFields)
            ? invalidFields
            : (invalidFields ? [invalidFields] : []),
    );
    for (const [key, inputEl] of Object.entries(FIELD_MAP)) {
        setFieldValidity(inputEl, invalidSet.has(key));
    }

    if (!msg) {
        clearBanner(els.errorBanner);
        clearBanner(els.statusBanner);
        if (announceReady) window.DSA_UI?.announce?.("", "polite");
        return;
    }

    if (type === "error") {
        clearBanner(els.statusBanner);
        if (announceReady) window.DSA_UI?.announce?.("", "polite");

        const isRepeated = els.errorBanner.textContent === msg;
        els.errorBanner.className = `${LIVE_BASE_CLASS} alert-error`;
        if (isRepeated) {
            els.errorBanner.textContent = "";
            notifyTimerId = setTimeout(() => {
                notifyTimerId = 0;
                els.errorBanner.textContent = msg;
            }, 60);
        } else {
            els.errorBanner.textContent = msg;
        }
        return;
    }

    clearBanner(els.errorBanner);
    els.statusBanner.className = `${LIVE_BASE_CLASS} alert-${type}`;
    els.statusBanner.textContent = msg;
    if (announceReady) window.DSA_UI?.announce?.(msg, "polite");
}

/* ---------- formatting, history & snapshot integrity ---------- */

function formatRangeShort(lo, hi) {
    return lo === hi ? `[${lo}]` : `[${lo}..${hi}]`;
}

function formatModeShort(mode) {
    return mode === "sum" ? "Sum" : "Min";
}

function formatModeLong(mode) {
    return mode === "sum" ? "Sum (Range Sum)" : "Minimum (Range Min)";
}

function combineValues(mode, a, b) {
    const res = mode === "sum" ? a + b : Math.min(a, b);
    return Object.is(res, -0) ? 0 : res;
}

/**
 * Verifies the displayed `step.snapshot` directly (never the live tree),
 * so scrubbing backward through build or update frames reports accurately.
 */
function checkSnapshotIntegrity(snapshot, step) {
    if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.values)) {
        return "Error (missing snapshot)";
    }
    const { nodes, values, mode } = snapshot;
    const n = values.length;
    if (n === 0) return "Error (empty array)";

    const byIndex = new Map();
    let hasUncomputed = false;
    for (const node of nodes) {
        byIndex.set(node.index, node);
        if (node.value === null) hasUncomputed = true;
    }
    if (hasUncomputed) return "Building…";

    const isMidUpdate = step.operation === "update" && step.type !== "done";

    function verify(idx, lo, hi) {
        const node = byIndex.get(idx);
        if (!node) return `missing node #${idx}`;
        if (node.lo !== lo || node.hi !== hi) return `range mismatch at #${idx}`;
        if (typeof node.value !== "number" || !Number.isInteger(node.value)) {
            return `invalid value at #${idx}`;
        }
        if (lo === hi) {
            if (node.value !== values[lo]) return `leaf #${idx} ≠ A[${lo}]`;
            return null;
        }
        const mid = Math.floor((lo + hi) / 2);
        const leftIdx = 2 * idx + 1;
        const rightIdx = 2 * idx + 2;
        const leftErr = verify(leftIdx, lo, mid);
        if (leftErr !== null) return leftErr;
        const rightErr = verify(rightIdx, mid + 1, hi);
        if (rightErr !== null) return rightErr;

        const expected = combineValues(mode, byIndex.get(leftIdx).value, byIndex.get(rightIdx).value);
        if (node.value !== expected) {
            return isMidUpdate ? "__UPDATING__" : `aggregate mismatch at #${idx}`;
        }
        return null;
    }

    const err = verify(0, 0, n - 1);
    if (err === "__UPDATING__") return "Updating…";
    if (err !== null) return `Error (${err})`;
    if (byIndex.size !== 2 * n - 1) return `Error (node count ${byIndex.size})`;
    return "OK";
}

/**
 * Derives persistent visual states purely from `steps[0..stepIndex]`:
 * - During `query`: every previously visited node retains its overlap classification
 *   (`full`, `partial`, `disjoint`), so by `done` the full decomposition is visible.
 * - During `update`: every node on the leaf-to-root path retains its visit / leaf /
 *   recompute state.
 */
function collectHistoryStates(steps, stepIndex) {
    const queryOverlaps = new Map(); // nodeIndex -> "full" | "partial" | "disjoint"
    const updateStates = new Map();  // nodeIndex -> "visit" | "update-leaf" | "recompute"
    const edgeStates = new Map();    // "parent->child" -> edgeClass

    const current = steps[stepIndex];
    if (!current) {
        return { queryOverlaps, updateStates, edgeStates };
    }

    if (current.operation === "query") {
        for (let k = 0; k <= stepIndex; k++) {
            const s = steps[k];
            if (s.node !== null && s.overlap !== null) {
                queryOverlaps.set(s.node, s.overlap);
                if (s.node > 0) {
                    const parent = Math.floor((s.node - 1) / 2);
                    const edgeCls =
                        s.overlap === "full"
                            ? "st-edge-full"
                            : s.overlap === "partial"
                                ? "st-edge-partial"
                                : "st-edge-disjoint";
                    edgeStates.set(`${parent}->${s.node}`, edgeCls);
                }
            }
        }
        if (current.type === "combine" && current.node !== null) {
            edgeStates.set(`${current.node}->${2 * current.node + 1}`, "st-edge-combine");
            edgeStates.set(`${current.node}->${2 * current.node + 2}`, "st-edge-combine");
        }
    } else if (current.operation === "update") {
        for (let k = 0; k <= stepIndex; k++) {
            const s = steps[k];
            if (s.node === null) continue;
            if (s.type === "visit" || s.type === "update-leaf" || s.type === "recompute") {
                updateStates.set(s.node, s.type);
                if (s.node > 0) {
                    const parent = Math.floor((s.node - 1) / 2);
                    const edgeCls = s.type === "visit" ? "st-edge-visit" : "st-edge-combine";
                    edgeStates.set(`${parent}->${s.node}`, edgeCls);
                }
            }
        }
        if (current.type === "recompute" && current.node !== null) {
            edgeStates.set(`${current.node}->${2 * current.node + 1}`, "st-edge-combine");
            edgeStates.set(`${current.node}->${2 * current.node + 2}`, "st-edge-combine");
        }
    } else if (current.node !== null) {
        if (current.type === "combine") {
            edgeStates.set(`${current.node}->${2 * current.node + 1}`, "st-edge-combine");
            edgeStates.set(`${current.node}->${2 * current.node + 2}`, "st-edge-combine");
        } else if (current.node > 0) {
            const parent = Math.floor((current.node - 1) / 2);
            const edgeCls = current.type === "update-leaf" ? "st-edge-combine" : "st-edge-visit";
            edgeStates.set(`${parent}->${current.node}`, edgeCls);
        }
    }

    return { queryOverlaps, updateStates, edgeStates };
}

/* ---------- coalesced rAF auto-scroll reveal ---------- */

function scheduleReveal(pairs) {
    if (revealRafId) cancelAnimationFrame(revealRafId);
    const activePairs = pairs.filter(([c, t]) => c && t);
    if (activePairs.length === 0) {
        revealRafId = 0;
        return;
    }

    revealRafId = requestAnimationFrame(() => {
        revealRafId = 0;
        const plans = [];
        for (const [container, targetEl] of activePairs) {
            if (container.scrollWidth <= container.clientWidth) continue;
            const a = targetEl.getBoundingClientRect();
            const box = container.getBoundingClientRect();
            if (a.width === 0 || box.width === 0) continue;
            if (a.left < box.left + 14 || a.right > box.right - 14) {
                const nextLeft = Math.max(
                    0,
                    container.scrollLeft + (a.left + a.width / 2) - (box.left + box.width / 2),
                );
                plans.push([container, nextLeft]);
            }
        }
        const behavior = prefersReducedMotion() ? "auto" : "smooth";
        for (const [container, nextLeft] of plans) {
            if (typeof container.scrollTo === "function") {
                container.scrollTo({ left: nextLeft, behavior });
            } else {
                container.scrollLeft = nextLeft;
            }
        }
    });
}

/* ---------- pseudocode rendering ---------- */

function updatePseudocode(step) {
    const op = SEGMENT_TREE_INFO.pseudocode[step.operation] ? step.operation : "build";
    if (op !== currentCodeKey) {
        currentCodeKey = op;
        els.codeHeading.textContent = OP_HEADINGS[op] ?? "Pseudocode";
        els.code.replaceChildren(
            ...SEGMENT_TREE_INFO.pseudocode[op].map((line) => {
                const li = document.createElement("li");
                li.textContent = line;
                return li;
            }),
        );
    }

    const activeLine = step.line ?? 0;
    [...els.code.children].forEach((li, i) => {
        const isCurrent = i + 1 === activeLine;
        li.classList.toggle("active", isCurrent);
        if (isCurrent) {
            li.setAttribute("aria-current", "step");
        } else {
            li.removeAttribute("aria-current");
        }
    });
}

/* ---------- SVG Segment Tree rendering (pooled) ---------- */

function syncSvgLayout(snap) {
    const populatedNodes = snap.nodes;
    const maxIndex = populatedNodes.reduce((acc, nd) => Math.max(acc, nd.index), 0);
    const layout = layoutCompleteTree(maxIndex + 1, LAYOUT_OPTS);

    const svgW = Math.max(160, Math.ceil(layout.width + TREE_PAD_X * 2));
    const svgH = Math.max(110, Math.ceil(layout.height + TREE_PAD_TOP + TREE_PAD_BOTTOM));
    const offsetX = (svgW - layout.width) / 2;

    els.svg.setAttribute("width", String(svgW));
    els.svg.setAttribute("height", String(svgH));
    els.svg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);

    const populatedSet = new Set(populatedNodes.map((nd) => nd.index));
    const populatedEdges = [];
    for (const nd of populatedNodes) {
        if (nd.index === 0) continue;
        const parent = Math.floor((nd.index - 1) / 2);
        if (populatedSet.has(parent)) {
            populatedEdges.push({ from: parent, to: nd.index });
        }
    }

    ensureEdgePool(populatedEdges.length);
    lastEdgeEntries = [];
    for (let i = 0; i < populatedEdges.length; i++) {
        const edge = populatedEdges[i];
        const fromPos = layout.nodes[edge.from];
        const toPos = layout.nodes[edge.to];
        const entry = edgePool[i];

        const x1 = fromPos.x + offsetX;
        const y1 = fromPos.y + TREE_PAD_TOP;
        const x2 = toPos.x + offsetX;
        const y2 = toPos.y + TREE_PAD_TOP;

        entry.lineEl.setAttribute("x1", x1.toFixed(1));
        entry.lineEl.setAttribute("y1", y1.toFixed(1));
        entry.lineEl.setAttribute("x2", x2.toFixed(1));
        entry.lineEl.setAttribute("y2", y2.toFixed(1));
        entry.lineEl.setAttribute("class", "st-edge");

        lastEdgeEntries.push({
            from: edge.from,
            to: edge.to,
            key: `${edge.from}->${edge.to}`,
            lineEl: entry.lineEl,
        });
    }
    for (let i = populatedEdges.length; i < edgePool.length; i++) {
        edgePool[i].lineEl.setAttribute("class", "st-edge st-hidden");
    }

    ensureNodePool(populatedNodes.length);
    lastNodePosMap = new Map();
    for (let i = 0; i < populatedNodes.length; i++) {
        const nd = populatedNodes[i];
        const pos = layout.nodes[nd.index];
        const entry = nodePool[i];

        const cx = pos.x + offsetX;
        const cy = pos.y + TREE_PAD_TOP;
        const cxStr = cx.toFixed(1);
        const cyStr = cy.toFixed(1);

        entry.haloEl.setAttribute("x", (cx - NODE_W / 2 - HALO_PAD).toFixed(1));
        entry.haloEl.setAttribute("y", (cy - NODE_H / 2 - HALO_PAD).toFixed(1));

        entry.boxEl.setAttribute("x", (cx - NODE_W / 2).toFixed(1));
        entry.boxEl.setAttribute("y", (cy - NODE_H / 2).toFixed(1));

        entry.innerEl.setAttribute("x", (cx - NODE_W / 2 + INNER_INSET).toFixed(1));
        entry.innerEl.setAttribute("y", (cy - NODE_H / 2 + INNER_INSET).toFixed(1));

        entry.valueEl.setAttribute("x", cxStr);
        entry.valueEl.setAttribute("y", cyStr);

        entry.rangeEl.setAttribute("x", cxStr);
        entry.rangeEl.setAttribute("y", (cy + NODE_H / 2 + 13).toFixed(1));

        const bx = (cx + BADGE_OFFSET_X).toFixed(1);
        const by = (cy + BADGE_OFFSET_Y).toFixed(1);
        entry.badgeBg.setAttribute("cx", bx);
        entry.badgeBg.setAttribute("cy", by);
        entry.badgeText.setAttribute("x", bx);
        entry.badgeText.setAttribute("y", by);

        lastNodePosMap.set(nd.index, { entry, cx, cy });
    }
    for (let i = populatedNodes.length; i < nodePool.length; i++) {
        nodePool[i].g.setAttribute("class", "st-node st-hidden");
    }
}

function renderTreeSvg(step, history) {
    const snap = step.snapshot;
    const topoKey = snap.nodes.map((nd) => `${nd.index}:${nd.lo}-${nd.hi}`).join(",");
    if (topoKey !== lastTopoKey) {
        syncSvgLayout(snap);
        lastTopoKey = topoKey;
    }

    const n = snap.values.length;
    const modeName = formatModeLong(snap.mode);
    els.treeStageLabel.textContent =
        `Segment Tree View — ${formatModeShort(snap.mode)} Mode (Nodes Show Aggregate & Interval [lo..hi])`;
    els.svgTitle.textContent =
        `Segment Tree (${modeName}) over ${n} element${n === 1 ? "" : "s"} (${snap.nodes.length} nodes)`;
    els.svgDesc.textContent = `${step.message} Backing array: [${snap.values.join(", ")}].`;

    for (const edge of lastEdgeEntries) {
        const edgeCls = history.edgeStates.get(edge.key);
        edge.lineEl.setAttribute("class", edgeCls ? `st-edge ${edgeCls}` : "st-edge");
    }

    let activeGroup = null;
    for (const nd of snap.nodes) {
        const slot = lastNodePosMap.get(nd.index);
        if (!slot) continue;
        const { entry } = slot;

        const isActiveNode = step.node === nd.index;
        const isPending = nd.value === null;

        let stateKey = null;
        if (step.operation === "query") {
            if (isActiveNode && step.type === "combine") {
                stateKey = "combine";
            } else if (history.queryOverlaps.has(nd.index)) {
                stateKey = history.queryOverlaps.get(nd.index);
            }
        } else if (step.operation === "update") {
            if (isActiveNode && (step.type === "visit" || step.type === "update-leaf" || step.type === "recompute")) {
                stateKey = step.type;
            } else if (history.updateStates.has(nd.index)) {
                stateKey = history.updateStates.get(nd.index);
            }
        } else if (isActiveNode && (step.type === "visit" || step.type === "update-leaf" || step.type === "combine")) {
            stateKey = step.type;
        }

        const classes = ["st-node"];
        if (nd.index === 0) classes.push("st-root");
        if (isPending) classes.push("st-pending");
        if (stateKey) classes.push(`st-${stateKey}`);
        if (isActiveNode) {
            classes.push("st-active");
            activeGroup = entry.g;
        }

        entry.g.setAttribute("class", classes.join(" "));

        const valText = isPending ? "—" : String(nd.value);
        if (entry.valueEl.textContent !== valText) entry.valueEl.textContent = valText;

        const rangeText = formatRangeShort(nd.lo, nd.hi);
        if (entry.rangeEl.textContent !== rangeText) entry.rangeEl.textContent = rangeText;

        const glyph = stateKey ? STATE_GLYPHS[stateKey] : "";
        if (glyph) {
            entry.badgeGroup.setAttribute("class", "st-badge st-badge-visible");
            if (entry.badgeText.textContent !== glyph) entry.badgeText.textContent = glyph;
        } else {
            entry.badgeGroup.setAttribute("class", "st-badge");
            if (entry.badgeText.textContent !== "") entry.badgeText.textContent = "";
        }

        const stateDesc = stateKey ? `, state: ${stateKey}` : "";
        const activeDesc = isActiveNode ? " (active step)" : "";
        const nextTitle =
            `Node #${nd.index}, range [${nd.lo}..${nd.hi}], value: ${isPending ? "not computed yet" : nd.value}${stateDesc}${activeDesc}`;
        if (entry.titleEl.textContent !== nextTitle) entry.titleEl.textContent = nextTitle;
    }

    return activeGroup;
}

/* ---------- Underlying Array rendering (pooled) ---------- */

function findUpdateTargetIndex(steps, step) {
    if (step.operation !== "update") return null;
    const last = steps[steps.length - 1];
    if (last && Array.isArray(last.range)) return last.range[0];
    return Array.isArray(step.range) ? step.range[0] : null;
}

function renderArray(step, updateIdx) {
    const values = step.snapshot.values;
    const n = values.length;
    const queryRange = step.queryRange;
    const hasQuery = Array.isArray(queryRange);
    const ql = hasQuery ? queryRange[0] : null;
    const qr = hasQuery ? queryRange[1] : null;

    const activeRange = step.node !== null && Array.isArray(step.range) ? step.range : null;
    const isUpdateOp = step.operation === "update";

    if (hasQuery) {
        els.arrayStageLabel.textContent =
            `Underlying Array A[0..${n - 1}] — Target Query Range [${ql}..${qr}]`;
    } else if (isUpdateOp && updateIdx !== null) {
        els.arrayStageLabel.textContent =
            `Underlying Array A[0..${n - 1}] — Updating A[${updateIdx}]`;
    } else {
        els.arrayStageLabel.textContent = `Underlying Array A[0..${n - 1}]`;
    }

    ensureArrayPool(n);
    let focusTarget = null;

    for (let i = 0; i < n; i++) {
        const slot = arrayPool[i];
        const val = values[i];

        const inQuery = hasQuery && i >= ql && i <= qr;
        const isQueryStart = hasQuery && i === ql;
        const isQueryEnd = hasQuery && i === qr;
        const inActiveNode = activeRange !== null && i >= activeRange[0] && i <= activeRange[1];
        const isUpdateTarget = isUpdateOp && i === updateIdx;

        const wrapClasses = ["slot-wrap", "st-arr-wrap"];
        if (inQuery) wrapClasses.push("st-arr-in-query");
        if (isQueryStart) wrapClasses.push("st-arr-query-start");
        if (isQueryEnd) wrapClasses.push("st-arr-query-end");
        slot.li.className = wrapClasses.join(" ");

        let lblSuffix = "";
        if (isQueryStart && isQueryEnd) lblSuffix = " l=r";
        else if (isQueryStart) lblSuffix = " l";
        else if (isQueryEnd) lblSuffix = " r";
        else if (isUpdateTarget) lblSuffix = " ★";

        const isLblActive = inQuery || inActiveNode || isUpdateTarget;
        slot.lbl.className = isLblActive ? "slot-label slot-label-active mono" : "slot-label mono";
        slot.lbl.textContent = `[${i}]${lblSuffix}`;

        const boxClasses = ["node-box", "hp-cell", "bst-cell", "st-arr-cell", "mono"];
        let tagText = "";
        let tagTone = "";

        if (inActiveNode) {
            if (step.type === "full") {
                boxClasses.push("st-arr-full");
                tagText = "✓ full";
                tagTone = "st-tag-full";
            } else if (step.type === "partial") {
                boxClasses.push("st-arr-partial");
                tagText = "½ split";
                tagTone = "st-tag-partial";
            } else if (step.type === "disjoint") {
                boxClasses.push("st-arr-disjoint");
                tagText = "✗ skip";
                tagTone = "st-tag-disjoint";
            } else if (step.type === "combine" || step.type === "recompute") {
                boxClasses.push("st-arr-combine");
                tagText = step.type === "combine" ? "+ comb" : "↑ rec";
                tagTone = "st-tag-accent";
            } else if (step.type === "update-leaf") {
                boxClasses.push("st-arr-leaf");
                tagText = "★ leaf";
                tagTone = "st-tag-accent";
            } else if (step.type === "visit") {
                boxClasses.push("st-arr-visit");
                tagText = "• visit";
                tagTone = "st-tag-accent";
            }
            if (focusTarget === null) focusTarget = slot.li;
        } else if (isUpdateTarget && step.type === "done") {
            boxClasses.push("st-arr-leaf");
            tagText = "★ updated";
            tagTone = "st-tag-accent";
            focusTarget = slot.li;
        } else if (inQuery) {
            boxClasses.push("st-arr-in-range");
            tagText = "in [l..r]";
            tagTone = "st-tag-accent";
        }

        slot.box.className = boxClasses.join(" ");
        slot.box.textContent = String(val);

        slot.tag.className = tagTone ? `st-arr-tag mono ${tagTone}` : "st-arr-tag mono";
        slot.tag.textContent = tagText;

        const srParts = [`A[${i}] = ${val}`];
        if (inQuery) srParts.push(`inside target query range [${ql}..${qr}]`);
        if (inActiveNode) srParts.push(`covered by active node #${step.node} [${activeRange[0]}..${activeRange[1]}] (${step.type})`);
        if (isUpdateTarget) srParts.push("update target");
        slot.sr.textContent = srParts.join(", ");
    }

    for (let i = n; i < arrayPool.length; i++) {
        arrayPool[i].li.className = "slot-wrap st-arr-wrap st-hidden";
    }

    return focusTarget;
}

/* ---------- state monitor formatting ---------- */

function formatActiveNodeStat(step) {
    if (step.node === null) return "—";
    const [lo, hi] = step.range;
    const rangeStr = `[${lo}..${hi}]`;
    let tag = step.type;
    if (step.type === "update-leaf") tag = "leaf";
    else if (step.type !== "combine" && step.overlap) tag = step.overlap;
    return `#${step.node} ${rangeStr} (${tag})`;
}

function formatQueryResultStat(step) {
    if (step.operation !== "query" || step.value === null) return "—";
    return step.type === "done" ? String(step.value) : `${step.value} (subtree)`;
}

/* ---------- main render ---------- */

function render(step, index, p) {
    const activeBefore = document.activeElement;
    const finishingAutoPlay = autoPlaying && !p.isPlaying && p.atEnd;
    if (finishingAutoPlay) autoPlaying = false;

    const keepQuiet = p.isPlaying || finishingAutoPlay || suppressStepLive || !announceReady;
    const stepChanged = step !== lastRenderedStep;
    lastRenderedStep = step;

    if (stepChanged) {
        const snap = step.snapshot;
        const history = collectHistoryStates(p.steps, index);

        updatePseudocode(step);
        const treeTarget = renderTreeSvg(step, history);
        const updateTargetIdx = findUpdateTargetIndex(p.steps, step);
        const arrayTarget = renderArray(step, updateTargetIdx);
        scheduleReveal([
            [els.treeStage, treeTarget],
            [els.arrayScrollRegion, arrayTarget],
        ]);

        // Set aria-live BEFORE updating textContent so autoplay and initial load stay quiet,
        // while manual steps and scrubbing announce immediately.
        els.stepMessage.setAttribute("aria-live", keepQuiet ? "off" : "polite");
        if (els.stepMessage.textContent !== step.message) {
            els.stepMessage.textContent = step.message;
        }

        els.statResult.textContent = formatQueryResultStat(step);
        els.statVisited.textContent = String(step.nodesVisited ?? 0);
        els.statCombines.textContent = String(step.combines ?? 0);
        els.statActiveNode.textContent = formatActiveNodeStat(step);
        els.statModeSize.textContent =
            `${formatModeShort(snap.mode)} · ${snap.values.length} / ${SEGMENT_TREE_LIMITS.maxSize}`;
        els.statIntegrity.textContent = checkSnapshotIntegrity(snap, step);
    } else {
        els.stepMessage.setAttribute("aria-live", keepQuiet ? "off" : "polite");
    }

    if (finishingAutoPlay) {
        if (liveRearmRafId) cancelAnimationFrame(liveRearmRafId);
        liveRearmRafId = requestAnimationFrame(() => {
            liveRearmRafId = 0;
            if (!player.isPlaying) {
                els.stepMessage.setAttribute("aria-live", "polite");
            }
        });
    }

    els.counter.textContent = `Step ${index + 1} / ${p.length}`;
    els.progress.max = String(Math.max(0, p.length - 1));
    els.progress.value = String(index);
    els.progress.disabled = p.length <= 1;
    els.progress.setAttribute("aria-valuetext", `Step ${index + 1} of ${p.length}: ${step.message}`);

    if (p.isPlaying) {
        els.playIcon.textContent = "⏸";
        els.playLabel.textContent = "Pause";
    } else if (p.atEnd) {
        els.playIcon.textContent = "↻";
        els.playLabel.textContent = "Replay";
    } else {
        els.playIcon.textContent = "▶";
        els.playLabel.textContent = "Play";
    }

    els.playBtn.disabled = p.length <= 1;
    els.stepBackBtn.disabled = p.atStart;
    els.resetBtn.disabled = p.atStart;
    els.stepFwdBtn.disabled = p.atEnd;

    window.DSA_UI?.rescueFocus?.(
        activeBefore,
        els.playBtn,
        els.stepFwdBtn,
        els.stepBackBtn,
        els.resetBtn,
        els.buildInput,
    );
}

/* ---------- playback helpers ---------- */

function cancelPendingLiveRearm() {
    if (liveRearmRafId) {
        cancelAnimationFrame(liveRearmRafId);
        liveRearmRafId = 0;
    }
}

function startPlayback() {
    if (player.length <= 1) return;
    cancelPendingLiveRearm();
    suppressStepLive = true;
    try {
        player.play();
    } finally {
        suppressStepLive = false;
    }
    autoPlaying = player.isPlaying;
}

function pausePlayback() {
    cancelPendingLiveRearm();
    autoPlaying = false;
    player.pause();
}

function loadSteps(steps, { autoPlay = true, landAtEnd = false } = {}) {
    if (!steps || steps.length === 0) return;
    cancelPendingLiveRearm();
    autoPlaying = false;
    // Pause before resetting lastRenderedStep so pausing an active run never re-renders the old frame.
    player.pause();
    lastRenderedStep = null;

    suppressStepLive = true;
    try {
        player.load(steps);
        if (landAtEnd && steps.length > 1) {
            player.goTo(steps.length - 1);
        }
    } finally {
        suppressStepLive = false;
    }

    if (autoPlay && !landAtEnd && steps.length > 1 && !prefersReducedMotion()) {
        startPlayback();
    } else {
        // Immediately re-arm live region on 1-step, reduced-motion, or landed loads.
        els.stepMessage.setAttribute("aria-live", "polite");
    }
}

function isDrawerOpen() {
    return Boolean(document.getElementById("sideNavbar")?.classList.contains("active"));
}

const playerControls = {
    toggle() {
        if (isDrawerOpen() || player.length <= 1) return;
        if (player.isPlaying) pausePlayback();
        else startPlayback();
    },
    pause() {
        if (isDrawerOpen()) return;
        pausePlayback();
    },
    next() {
        if (isDrawerOpen()) return;
        pausePlayback();
        player.next();
    },
    prev() {
        if (isDrawerOpen()) return;
        pausePlayback();
        player.prev();
    },
    reset() {
        if (isDrawerOpen()) return;
        pausePlayback();
        player.reset();
    },
};

/* ---------- range hints & input sync ---------- */

function updateRangeHints(size, { clampOutOfBounds = false } = {}) {
    const maxIdx = Math.max(0, size - 1);
    const hint = `0..${maxIdx}`;
    els.queryRangeHint.textContent = hint;
    els.leftRangeHint.textContent = hint;
    els.rightRangeHint.textContent = hint;
    els.updateRangeHint.textContent = hint;
    els.indexRangeHint.textContent = hint;

    if (!clampOutOfBounds) return;

    const parsedL = parseInteger(els.leftInput.value, { min: 0, max: maxIdx, label: "l" });
    const parsedR = parseInteger(els.rightInput.value, { min: 0, max: maxIdx, label: "r" });
    if (!parsedL.ok || !parsedR.ok || parsedL.value > parsedR.value) {
        const nextL = size >= 4 ? 1 : 0;
        const nextR = size >= 4 ? Math.max(nextL, maxIdx - 1) : maxIdx;
        els.leftInput.value = String(nextL);
        els.rightInput.value = String(nextR);
    }

    const parsedI = parseInteger(els.indexInput.value, { min: 0, max: maxIdx, label: "i" });
    if (!parsedI.ok) {
        els.indexInput.value = String(Math.min(2, maxIdx));
    }
}

/* ---------- operation handlers ---------- */

function handleBuild({ autoPlay = true, silent = false, landAtEnd = false } = {}) {
    const parsed = parseArrayInput(els.buildInput.value, {
        minLength: SEGMENT_TREE_LIMITS.minSize,
        maxLength: SEGMENT_TREE_LIMITS.maxSize,
        min: SEGMENT_TREE_LIMITS.minValue,
        max: SEGMENT_TREE_LIMITS.maxValue,
    });
    if (!parsed.ok) {
        notify(parsed.error, "error", "build");
        els.buildInput.focus();
        return false;
    }

    const res = segTree.build(parsed.values);
    if (!res.ok) {
        notify(res.error, "error", "build");
        els.buildInput.focus();
        return false;
    }

    updateRangeHints(segTree.size, { clampOutOfBounds: !silent });
    loadSteps(res.steps, { autoPlay, landAtEnd });

    if (!silent) {
        notify(
            `Built ${formatModeShort(segTree.mode)} Segment Tree for ${segTree.size} element${segTree.size === 1 ? "" : "s"} (${segTree.nodeCount} nodes; root = ${res.value.root}).`,
            "success",
        );
    }
    return true;
}

function handleRandomBuild() {
    const len = 6 + Math.floor(Math.random() * 7); // 6..12 elements
    const values = Array.from({ length: len }, () => Math.floor(Math.random() * 35) - 5);
    els.buildInput.value = values.join(", ");
    handleBuild({ autoPlay: true });
}

function handleModeChange() {
    const nextMode = els.modeSelect.value;
    const res = segTree.setMode(nextMode);
    if (!res.ok) {
        els.modeSelect.value = segTree.mode;
        notify(res.error, "error");
        return;
    }

    loadSteps(res.steps, { autoPlay: true });
    notify(
        `Switched mode to ${formatModeLong(segTree.mode)} and rebuilt all ${segTree.nodeCount} nodes (root [0..${segTree.size - 1}] = ${res.value.root}).`,
        "info",
    );
}

function handleQuery(e) {
    e.preventDefault();
    const maxIdx = segTree.size - 1;
    const parsedL = parseInteger(els.leftInput.value, { min: 0, max: maxIdx, label: "Left index l" });
    if (!parsedL.ok) {
        notify(parsedL.error, "error", "left");
        els.leftInput.focus();
        return;
    }
    const parsedR = parseInteger(els.rightInput.value, { min: 0, max: maxIdx, label: "Right index r" });
    if (!parsedR.ok) {
        notify(parsedR.error, "error", "right");
        els.rightInput.focus();
        return;
    }
    if (parsedL.value > parsedR.value) {
        notify(
            `Invalid query range [${parsedL.value}..${parsedR.value}]: left index l must be ≤ right index r.`,
            "error",
            ["left", "right"],
        );
        els.leftInput.focus();
        return;
    }

    const res = segTree.query(parsedL.value, parsedR.value);
    if (!res.ok) {
        notify(res.error, "error", ["left", "right"]);
        els.leftInput.focus();
        return;
    }

    loadSteps(res.steps, { autoPlay: true });
    const modeWord = segTree.mode === "sum" ? "sum" : "minimum";
    const lastStep = res.steps[res.steps.length - 1];
    notify(
        `Range ${modeWord} over [${parsedL.value}..${parsedR.value}] = ${res.value} (${lastStep.nodesVisited} node${lastStep.nodesVisited === 1 ? "" : "s"} visited, ${lastStep.combines} combine${lastStep.combines === 1 ? "" : "s"}).`,
        "success",
    );
}

function handleUpdate(e) {
    e.preventDefault();
    const maxIdx = segTree.size - 1;
    const parsedI = parseInteger(els.indexInput.value, { min: 0, max: maxIdx, label: "Index i" });
    if (!parsedI.ok) {
        notify(parsedI.error, "error", "index");
        els.indexInput.focus();
        return;
    }
    const parsedV = parseInteger(els.valueInput.value, {
        min: SEGMENT_TREE_LIMITS.minValue,
        max: SEGMENT_TREE_LIMITS.maxValue,
        label: "New value",
    });
    if (!parsedV.ok) {
        notify(parsedV.error, "error", "value");
        els.valueInput.focus();
        return;
    }

    const res = segTree.update(parsedI.value, parsedV.value);
    if (!res.ok) {
        notify(res.error, "error", ["index", "value"]);
        els.indexInput.focus();
        return;
    }

    els.buildInput.value = segTree.toArray().join(", ");
    loadSteps(res.steps, { autoPlay: true });
    notify(
        `Updated A[${res.value.index}] from ${res.value.oldValue} to ${res.value.value}; new root [0..${segTree.size - 1}] = ${res.value.root}.`,
        "success",
    );
}

/* ---------- event bindings ---------- */

els.buildForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleBuild({ autoPlay: true });
});
els.randomBtn.addEventListener("click", handleRandomBuild);
els.modeSelect.addEventListener("change", handleModeChange);
els.queryForm.addEventListener("submit", handleQuery);
els.updateForm.addEventListener("submit", handleUpdate);

els.playBtn.addEventListener("click", () => playerControls.toggle());
els.stepFwdBtn.addEventListener("click", () => playerControls.next());
els.stepBackBtn.addEventListener("click", () => playerControls.prev());
els.resetBtn.addEventListener("click", () => playerControls.reset());
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value)));
els.progress.addEventListener("input", () => {
    const target = Number(els.progress.value);
    pausePlayback();
    player.goTo(target);
});

bindPlayerKeys(document, playerControls);

/* ---------- concept card & complexity table population ---------- */

$("segName").textContent = SEGMENT_TREE_INFO.name;
$("segSummary").textContent = SEGMENT_TREE_INFO.summary;
$("cxBuild").textContent = SEGMENT_TREE_INFO.complexity.build;
$("cxQuery").textContent = SEGMENT_TREE_INFO.complexity.query;
$("cxUpdate").textContent = SEGMENT_TREE_INFO.complexity.update;
$("cxSetMode").textContent = SEGMENT_TREE_INFO.complexity.setMode;
$("cxSpace").textContent = SEGMENT_TREE_INFO.complexity.space;

const CX_ROWS = [
    ["Build (Recursive)", SEGMENT_TREE_INFO.complexity.build, "Splits intervals top-down to leaves and combines child pairs upward, visiting all 2n − 1 nodes once (Θ(n))."],
    ["Range Query [l..r]", SEGMENT_TREE_INFO.complexity.query, "Stops at full-overlap and disjoint nodes; splits at most two partial boundary paths per level (O(1) best case for [0..n−1], O(log n) worst case)."],
    ["Point Update A[i]", SEGMENT_TREE_INFO.complexity.update, "Updates one leaf and recomputes every ancestor along the single leaf-to-root path."],
    ["Switch Mode (Sum / Min)", SEGMENT_TREE_INFO.complexity.setMode, "Changes the associative combine function and rebuilds all 2n − 1 node aggregates recursively (Θ(n))."],
    ["Space", SEGMENT_TREE_INFO.complexity.space, "Stores 2n − 1 populated nodes keyed by 0-based complete-tree indices (a flat array uses ≤ 4n slots; max 16 elements here)."],
];

const cxBody = $("cxTable");
cxBody.replaceChildren(
    ...CX_ROWS.map(([op, complexity, note]) => {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.scope = "row";
        th.textContent = op;
        const tdCx = document.createElement("td");
        tdCx.textContent = complexity;
        const tdNote = document.createElement("td");
        tdNote.textContent = note;
        tr.append(th, tdCx, tdNote);
        return tr;
    }),
);

/* ---------- initial starter tree (silent, landed on final built frame) ---------- */

handleBuild({ autoPlay: false, silent: true, landAtEnd: true });
announceReady = true;
els.stepMessage.setAttribute("aria-live", "polite");
