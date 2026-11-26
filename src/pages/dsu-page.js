/**
 * Disjoint Set Union (Union-Find) page controller (G11).
 * Pure DSU logic from src/structures/dsu.js; tree coordinates from src/core/tree-layout.js;
 * playback & keyboard shortcuts from src/core/step-player.js and src/core/player-keys.js.
 * Zero direct element styling writes, zero raw HTML writes, zero native dialogs.
 */
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import { layoutGeneralTree } from "../core/tree-layout.js";
import { parseInteger } from "../core/validate.js";
import { DisjointSet, DSU_INFO, DSU_LIMITS } from "../structures/dsu.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const LAYOUT_OPTS = { levelGap: 76, minGap: 60 };
const TREE_GAP = 40;
const PAD_X = 34;
const PAD_TOP = 44;
const PAD_BOTTOM = 34;
const NODE_RADIUS = 19;
const ROOT_RING_RADIUS = 14.5;
const BADGE_OFFSET_X = 16;
const BADGE_OFFSET_Y = -14;
const RANK_OFFSET_Y = -25;

const STARTER_SIZE = 8;
const STARTER_UNIONS = [
    [0, 1],
    [2, 3],
    [0, 2],
    [4, 5],
];

const OP_HEADINGS = {
    find: "Pseudocode (Find)",
    union: "Pseudocode (Union)",
    connected: "Pseudocode (Connected?)",
    reset: "Pseudocode (Make Sets / Reset)",
};

const $ = (id) => document.getElementById(id);

const els = {
    sizeForm: $("sizeForm"),
    sizeInput: $("sizeInput"),
    makeSetsBtn: $("makeSetsBtn"),
    randomBtn: $("randomBtn"),
    resetSetsBtn: $("resetSetsBtn"),
    byRankToggle: $("byRankToggle"),
    compressToggle: $("compressToggle"),
    optionsHint: $("optionsHint"),
    opForm: $("opForm"),
    elemALabel: $("elemALabel"),
    elemAInput: $("elemAInput"),
    elemBLabel: $("elemBLabel"),
    elemBInput: $("elemBInput"),
    unionBtn: $("unionBtn"),
    findBtn: $("findBtn"),
    connectedBtn: $("connectedBtn"),
    errorBanner: $("dsuError"),
    statusBanner: $("dsuStatus"),
    resetBtn: $("resetBtn"),
    stepBackBtn: $("stepBackBtn"),
    playBtn: $("playBtn"),
    playIcon: $("playIcon"),
    playLabel: $("playLabel"),
    stepFwdBtn: $("stepFwdBtn"),
    speed: $("speedSelect"),
    progress: $("progress"),
    counter: $("stepCounter"),
    forestStageLabel: $("forestStageLabel"),
    forestStage: $("forestStage"),
    svg: $("dsuSvg"),
    svgTitle: $("dsuSvgTitle"),
    svgDesc: $("dsuSvgDesc"),
    arraysStage: $("arraysStage"),
    arraysCaption: $("arraysCaption"),
    arraysHead: $("arraysHead"),
    arraysBody: $("arraysBody"),
    stepMessage: $("stepMessage"),
    codeHeading: $("codeHeading"),
    code: $("pseudocode"),
    statFinds: $("statFinds"),
    statHops: $("statHops"),
    statCompressed: $("statCompressed"),
    statLinks: $("statLinks"),
    statSets: $("statSets"),
    statIntegrity: $("statIntegrity"),
};

const reducedMotionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function prefersReducedMotion() {
    return Boolean(reducedMotionQuery && reducedMotionQuery.matches);
}

let dsu = new DisjointSet(STARTER_SIZE, { byRank: true, compress: true });
let totalCounts = zeroCounts();
let baseCounts = zeroCounts();
let stepDeltas = [];

let currentCodeKey = "";
let lastRenderedStep = null;
let lastTopoKey = "";
let lastNodePosMap = new Map(); // id -> { entry, cx, cy, depth, rootId }
let lastEdgeEntries = [];       // [{ fromId, toId, entry }]
let builtArraySize = 0;
let arrayIndexCells = [];       // [th]
let parentRowCells = [];        // [{ td, val, sr }]
let rankRowCells = [];          // [{ td, val, sr }]

let notifyTimerId = 0;
let revealRafId = 0;
let announceReady = false;
let suppressStepLive = false;
let userInitiatedPlay = false;
let autoPlayingOp = false;

const player = new StepPlayer({ onStep: render, baseDelay: 750 });
player.setSpeed(Number(els.speed.value) || 1);

function zeroCounts() {
    return { finds: 0, hops: 0, compressed: 0, links: 0 };
}

function addCounts(a, b) {
    return {
        finds: a.finds + b.finds,
        hops: a.hops + b.hops,
        compressed: a.compressed + b.compressed,
        links: a.links + b.links,
    };
}

function computeStepDeltas(steps) {
    const running = zeroCounts();
    return steps.map((step) => {
        if (step.type === "root-found") running.finds += 1;
        else if (step.type === "visit" && step.edge !== null) running.hops += 1;
        else if (step.type === "compress") running.compressed += 1;
        else if (step.type === "link") running.links += 1;
        return { ...running };
    });
}

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, String(v));
    }
    return el;
}

/* ---------- persistent SVG layers & pools ---------- */

const oldEdgeLayer = svgEl("g", { class: "dsu-old-edge-layer" });
const edgesLayer = svgEl("g", { class: "dsu-edges-layer" });
const nodesLayer = svgEl("g", { class: "dsu-nodes-layer" });
els.svg.append(oldEdgeLayer, edgesLayer, nodesLayer);

const oldEdgeLine = svgEl("line", { class: "dsu-edge-old dsu-hidden" });
oldEdgeLayer.append(oldEdgeLine);

const edgePool = []; // [{ g, lineEl, labelEl }]
const nodePool = []; // [{ g, titleEl, circleEl, rootRingEl, valueEl, rankEl, rootBadgeEl, resultBadgeEl }]

function ensureEdgePool(needed) {
    while (edgePool.length < needed) {
        const g = svgEl("g", { class: "dsu-edge-group dsu-hidden" });
        const lineEl = svgEl("line", { class: "hp-edge dsu-edge" });
        const labelEl = svgEl("text", { class: "dsu-edge-label dsu-hidden", "aria-hidden": "true" });
        g.append(lineEl, labelEl);
        edgesLayer.append(g);
        edgePool.push({ g, lineEl, labelEl });
    }
}

function ensureNodePool(needed) {
    while (nodePool.length < needed) {
        const g = svgEl("g", { class: "hp-node dsu-node dsu-hidden" });
        const titleEl = svgEl("title");
        const circleEl = svgEl("circle", { class: "hp-node-circle", r: NODE_RADIUS });
        const rootRingEl = svgEl("circle", { class: "dsu-root-found-ring", r: ROOT_RING_RADIUS });
        const valueEl = svgEl("text", { class: "hp-node-value" });
        const rankEl = svgEl("text", { class: "dsu-rank-label dsu-hidden" });
        const rootBadgeEl = svgEl("text", { class: "dsu-root-badge", "aria-hidden": "true" });
        const resultBadgeEl = svgEl("text", { class: "dsu-result-badge", "aria-hidden": "true" });
        g.append(titleEl, circleEl, rootRingEl, valueEl, rankEl, rootBadgeEl, resultBadgeEl);
        nodesLayer.append(g);
        nodePool.push({
            g,
            titleEl,
            circleEl,
            rootRingEl,
            valueEl,
            rankEl,
            rootBadgeEl,
            resultBadgeEl,
        });
    }
}

/* ---------- aligned parent[] / rank[] table pool ---------- */

function ensureArraysTable(n) {
    if (builtArraySize === n) return;
    builtArraySize = n;
    arrayIndexCells = [];
    parentRowCells = [];
    rankRowCells = [];

    const headRow = document.createElement("tr");
    const cornerTh = document.createElement("th");
    cornerTh.scope = "col";
    cornerTh.className = "dsu-arr-rowhead";
    cornerTh.textContent = "Index";
    headRow.append(cornerTh);

    const parentRow = document.createElement("tr");
    const parentHead = document.createElement("th");
    parentHead.scope = "row";
    parentHead.className = "dsu-arr-rowhead mono";
    parentHead.textContent = "parent[]";
    parentRow.append(parentHead);

    const rankRow = document.createElement("tr");
    const rankHead = document.createElement("th");
    rankHead.scope = "row";
    rankHead.className = "dsu-arr-rowhead mono";
    rankHead.textContent = "rank[]";
    rankRow.append(rankHead);

    for (let i = 0; i < n; i++) {
        const idxTh = document.createElement("th");
        idxTh.scope = "col";
        idxTh.className = "dsu-arr-idx mono";
        idxTh.textContent = String(i);
        headRow.append(idxTh);
        arrayIndexCells.push(idxTh);

        const pTd = document.createElement("td");
        pTd.className = "dsu-arr-cell mono";
        const pVal = document.createElement("span");
        pVal.setAttribute("aria-hidden", "true");
        const pSr = document.createElement("span");
        pSr.className = "visually-hidden";
        pTd.append(pVal, pSr);
        parentRow.append(pTd);
        parentRowCells.push({ td: pTd, val: pVal, sr: pSr });

        const rTd = document.createElement("td");
        rTd.className = "dsu-arr-cell mono";
        const rVal = document.createElement("span");
        rVal.setAttribute("aria-hidden", "true");
        const rSr = document.createElement("span");
        rSr.className = "visually-hidden";
        rTd.append(rVal, rSr);
        rankRow.append(rTd);
        rankRowCells.push({ td: rTd, val: rVal, sr: rSr });
    }

    els.arraysHead.replaceChildren(headRow);
    els.arraysBody.replaceChildren(parentRow, rankRow);
}

/* ---------- feedback banners & screen-reader announcements ---------- */

const LIVE_BASE_CLASS = "alert-banner alert-live bst-live";

function setFieldValidity(input, isInvalid) {
    input.setAttribute("aria-invalid", isInvalid ? "true" : "false");
    if (isInvalid) {
        input.setAttribute("aria-describedby", "dsuError");
    } else {
        input.removeAttribute("aria-describedby");
    }
}

function clearBanner(el) {
    el.textContent = "";
    el.className = LIVE_BASE_CLASS;
}

/**
 * Displays inline feedback without duplicate announcements:
 * - Errors write to #dsuError (static role="alert"), re-triggering repeated errors after 60ms.
 * - Status/info/success/warning messages write to visual #dsuStatus and announce once via DSA_UI.announce.
 */
function notify(msg, type = "info", invalidField = null) {
    if (notifyTimerId) {
        clearTimeout(notifyTimerId);
        notifyTimerId = 0;
    }

    setFieldValidity(els.sizeInput, invalidField === "size");
    setFieldValidity(els.elemAInput, invalidField === "elemA");
    setFieldValidity(els.elemBInput, invalidField === "elemB");

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

function syncElementRangeLabels(n) {
    const rangeText = n === 1 ? "0" : `0–${n - 1}`;
    els.elemALabel.textContent = `Element A (${rangeText})`;
    els.elemBLabel.textContent = `Element B (${rangeText})`;
    els.elemAInput.placeholder = rangeText;
    els.elemBInput.placeholder = rangeText;
}

/* ---------- snapshot integrity & forest layout ---------- */

function verifySnapshotIntegrity(snap, byRank, step) {
    if (!snap || !Array.isArray(snap.parent) || !Array.isArray(snap.rank) || !Array.isArray(snap.roots)) {
        return "Error (bad snapshot)";
    }
    const n = snap.parent.length;
    if (n < DSU_LIMITS.minSize || n > DSU_LIMITS.maxSize || snap.rank.length !== n) {
        return "Error (size mismatch)";
    }

    const actualRoots = [];
    for (let i = 0; i < n; i++) {
        const p = snap.parent[i];
        const r = snap.rank[i];
        if (!Number.isInteger(p) || p < 0 || p >= n) return `Error (parent[${i}])`;
        if (!Number.isInteger(r) || r < 0) return `Error (rank[${i}])`;
        if (p === i) actualRoots.push(i);
    }

    if (actualRoots.length !== snap.roots.length || actualRoots.some((r, idx) => r !== snap.roots[idx])) {
        return "Error (roots mismatch)";
    }

    const setSizes = new Map();
    for (let i = 0; i < n; i++) {
        let curr = i;
        let hops = 0;
        while (snap.parent[curr] !== curr) {
            curr = snap.parent[curr];
            hops += 1;
            if (hops >= n) return `Error (cycle at ${i})`;
        }
        setSizes.set(curr, (setSizes.get(curr) || 0) + 1);
    }

    if (byRank) {
        let pendingRankUp = false;
        for (let i = 0; i < n; i++) {
            const p = snap.parent[i];
            if (p !== i && !(snap.rank[p] > snap.rank[i])) {
                const isTiedLinkFrame =
                    step.type === "link" &&
                    step.edge &&
                    step.edge.from === i &&
                    step.edge.to === p &&
                    snap.rank[p] === snap.rank[i];
                if (isTiedLinkFrame) {
                    pendingRankUp = true;
                } else {
                    return `Error (rank[${p}] <= rank[${i}])`;
                }
            }
        }
        for (const r of actualRoots) {
            const minRequired = 2 ** snap.rank[r];
            if ((setSizes.get(r) || 0) < minRequired) {
                return `Error (root ${r} size)`;
            }
        }
        if (pendingRankUp) return "Linking…";
    }

    return "OK";
}

function buildForestLayout(snap) {
    const n = snap.parent.length;
    const childrenByParent = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
        const p = snap.parent[i];
        if (p !== i && p >= 0 && p < n) {
            childrenByParent[p].push(i);
        }
    }

    const allTreeNodes = Array.from({ length: n }, (_, id) => ({
        id,
        children: childrenByParent[id],
    }));

    const nodes = [];
    const edges = [];
    let cursorX = 0;
    let maxHeight = 0;

    for (const rootId of snap.roots) {
        const layout = layoutGeneralTree({ rootId, nodes: allTreeNodes }, LAYOUT_OPTS);
        for (const nd of layout.nodes) {
            nodes.push({
                id: nd.id,
                depth: nd.depth,
                x: nd.x + cursorX,
                y: nd.y,
                rootId,
            });
        }
        for (const ed of layout.edges) {
            edges.push({ from: ed.from, to: ed.to });
        }
        cursorX += layout.width + TREE_GAP;
        if (layout.height > maxHeight) maxHeight = layout.height;
    }

    const width = snap.roots.length > 0 ? Math.max(0, cursorX - TREE_GAP) : 0;
    return { nodes, edges, width, height: maxHeight };
}

function syncForestSvgLayout(snap, topoKey) {
    const layout = buildForestLayout(snap);
    const svgW = Math.max(140, Math.ceil(layout.width + PAD_X * 2));
    const svgH = Math.max(110, Math.ceil(layout.height + PAD_TOP + PAD_BOTTOM));

    els.svg.setAttribute("width", String(svgW));
    els.svg.setAttribute("height", String(svgH));
    els.svg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);

    const posById = new Map();
    for (const nd of layout.nodes) {
        posById.set(nd.id, {
            cx: nd.x + PAD_X,
            cy: nd.y + PAD_TOP,
            depth: nd.depth,
            rootId: nd.rootId,
        });
    }

    ensureEdgePool(layout.edges.length);
    lastEdgeEntries = [];
    for (let i = 0; i < layout.edges.length; i++) {
        const ed = layout.edges[i];
        const from = posById.get(ed.from);
        const to = posById.get(ed.to);
        const entry = edgePool[i];
        if (!from || !to) {
            entry.g.setAttribute("class", "dsu-edge-group dsu-hidden");
            entry.labelEl.setAttribute("class", "dsu-edge-label dsu-hidden");
            entry.labelEl.textContent = "";
            continue;
        }
        entry.lineEl.setAttribute("x1", from.cx.toFixed(1));
        entry.lineEl.setAttribute("y1", from.cy.toFixed(1));
        entry.lineEl.setAttribute("x2", to.cx.toFixed(1));
        entry.lineEl.setAttribute("y2", to.cy.toFixed(1));

        const mx = (from.cx + to.cx) / 2;
        const my = (from.cy + to.cy) / 2;
        entry.labelEl.setAttribute("x", mx.toFixed(1));
        entry.labelEl.setAttribute("y", my.toFixed(1));

        lastEdgeEntries.push({ fromId: ed.from, toId: ed.to, entry });
    }
    for (let i = layout.edges.length; i < edgePool.length; i++) {
        edgePool[i].g.setAttribute("class", "dsu-edge-group dsu-hidden");
        edgePool[i].labelEl.setAttribute("class", "dsu-edge-label dsu-hidden");
        edgePool[i].labelEl.textContent = "";
    }

    ensureNodePool(layout.nodes.length);
    lastNodePosMap = new Map();
    for (let i = 0; i < layout.nodes.length; i++) {
        const nd = layout.nodes[i];
        const entry = nodePool[i];
        const cx = nd.x + PAD_X;
        const cy = nd.y + PAD_TOP;
        const cxStr = cx.toFixed(1);
        const cyStr = cy.toFixed(1);

        entry.circleEl.setAttribute("cx", cxStr);
        entry.circleEl.setAttribute("cy", cyStr);
        entry.rootRingEl.setAttribute("cx", cxStr);
        entry.rootRingEl.setAttribute("cy", cyStr);
        entry.valueEl.setAttribute("x", cxStr);
        entry.valueEl.setAttribute("y", cyStr);
        entry.valueEl.textContent = String(nd.id);
        entry.rankEl.setAttribute("x", cxStr);
        entry.rankEl.setAttribute("y", (cy + RANK_OFFSET_Y).toFixed(1));
        entry.rootBadgeEl.setAttribute("x", (cx + BADGE_OFFSET_X).toFixed(1));
        entry.rootBadgeEl.setAttribute("y", (cy + BADGE_OFFSET_Y).toFixed(1));
        entry.resultBadgeEl.setAttribute("x", (cx + BADGE_OFFSET_X).toFixed(1));
        entry.resultBadgeEl.setAttribute("y", (cy + BADGE_OFFSET_Y).toFixed(1));

        lastNodePosMap.set(nd.id, { entry, cx, cy, depth: nd.depth, rootId: nd.rootId });
    }
    for (let i = layout.nodes.length; i < nodePool.length; i++) {
        const entry = nodePool[i];
        entry.g.setAttribute("class", "hp-node dsu-node dsu-hidden");
        entry.rankEl.setAttribute("class", "dsu-rank-label dsu-hidden");
        entry.titleEl.textContent = "";
        entry.valueEl.textContent = "";
        entry.rankEl.textContent = "";
        entry.rootBadgeEl.textContent = "";
        entry.resultBadgeEl.textContent = "";
    }

    lastTopoKey = topoKey;
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
            if (a.left < box.left + 12 || a.right > box.right - 12) {
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
    const op = DSU_INFO.pseudocode[step.operation] ? step.operation : "union";
    if (op !== currentCodeKey) {
        currentCodeKey = op;
        els.codeHeading.textContent = OP_HEADINGS[op] ?? "Pseudocode";
        els.code.replaceChildren(
            ...DSU_INFO.pseudocode[op].map((line) => {
                const li = document.createElement("li");
                li.textContent = line;
                return li;
            }),
        );
    }

    const activeLine = step.line ?? 0;
    [...els.code.children].forEach((li, i) => {
        const isActive = i + 1 === activeLine;
        li.classList.toggle("active", isActive);
        if (isActive) li.setAttribute("aria-current", "step");
        else li.removeAttribute("aria-current");
    });
}

/* ---------- SVG forest rendering ---------- */

function renderForestSvg(step) {
    const snap = step.snapshot;
    const n = snap.parent.length;
    const topoKey = `${snap.parent.join(",")}|${snap.roots.join(",")}`;
    if (topoKey !== lastTopoKey) {
        syncForestSvgLayout(snap, topoKey);
    }

    els.svgTitle.textContent =
        `Disjoint Set Forest: ${n} element${n === 1 ? "" : "s"} in ${snap.roots.length} disjoint set${snap.roots.length === 1 ? "" : "s"}`;
    els.svgDesc.textContent =
        `${step.message} Roots: ${snap.roots.join(", ")}.`;

    const activeIds = Array.isArray(step.ids) ? step.ids : [];
    const pathIds = Array.isArray(step.pathIds) ? step.pathIds : [];
    const activeSet = new Set(activeIds);
    const pathSet = new Set(pathIds);
    const rootSet = new Set(snap.roots);

    const isFollowStep = step.type === "visit" || step.type === "root-found" || step.type === "compress";
    const isSameSet = step.type === "same-set";
    const isDiffSet = step.operation === "connected" && step.type === "done" && activeIds.length >= 4;
    const sameSetRoot = isSameSet ? activeIds[2] : null;
    const diffRootA = isDiffSet ? activeIds[2] : null;
    const diffRootB = isDiffSet ? activeIds[3] : null;

    // Path edges in child->parent direction from step.pathIds.
    const pathEdgeKeys = new Set();
    if (isFollowStep) {
        for (let k = 0; k < pathIds.length - 1; k++) {
            pathEdgeKeys.add(`${pathIds[k]}->${pathIds[k + 1]}`);
        }
    }

    // Render faded old edge for one step during path compression.
    if (
        step.type === "compress" &&
        step.edge &&
        typeof step.edge.oldParent === "number" &&
        lastNodePosMap.has(step.edge.from) &&
        lastNodePosMap.has(step.edge.oldParent)
    ) {
        const fromPos = lastNodePosMap.get(step.edge.from);
        const oldPos = lastNodePosMap.get(step.edge.oldParent);
        oldEdgeLine.setAttribute("x1", fromPos.cx.toFixed(1));
        oldEdgeLine.setAttribute("y1", fromPos.cy.toFixed(1));
        oldEdgeLine.setAttribute("x2", oldPos.cx.toFixed(1));
        oldEdgeLine.setAttribute("y2", oldPos.cy.toFixed(1));
        oldEdgeLine.setAttribute("class", "dsu-edge-old");
    } else {
        oldEdgeLine.setAttribute("class", "dsu-edge-old dsu-hidden");
    }

    // Update pooled tree edges (fromId = parent, toId = child).
    for (const { fromId, toId, entry } of lastEdgeEntries) {
        const isStepEdge = Boolean(
            step.edge && step.edge.from === toId && step.edge.to === fromId,
        );
        const onFollowedPath = pathEdgeKeys.has(`${toId}->${fromId}`);

        let edgeClass = "dsu-edge-group";
        let showLinkLabel = false;

        if (isStepEdge && (step.type === "link" || step.type === "rank-up")) {
            edgeClass = "dsu-edge-group dsu-edge-link";
            showLinkLabel = true;
        } else if (isStepEdge && step.type === "compress") {
            edgeClass = "dsu-edge-group dsu-edge-compress";
        } else if (isStepEdge && step.type === "visit") {
            edgeClass = "dsu-edge-group dsu-edge-visit";
        } else if (onFollowedPath) {
            edgeClass = "dsu-edge-group dsu-edge-path";
        }

        if (entry.g.getAttribute("class") !== edgeClass) {
            entry.g.setAttribute("class", edgeClass);
        }
        const nextLabelClass = showLinkLabel ? "dsu-edge-label" : "dsu-edge-label dsu-hidden";
        if (entry.labelEl.getAttribute("class") !== nextLabelClass) {
            entry.labelEl.setAttribute("class", nextLabelClass);
        }
        const nextLabelText = showLinkLabel ? "linked" : "";
        if (entry.labelEl.textContent !== nextLabelText) {
            entry.labelEl.textContent = nextLabelText;
        }
    }

    els.forestStageLabel.textContent = dsu.byRank
        ? "Forest View (Rooted Trees • Rank Shown Above Roots)"
        : "Forest View (Rooted Trees • Rank Unused)";

    // Update pooled nodes.
    for (const [id, { entry }] of lastNodePosMap.entries()) {
        const isRoot = rootSet.has(id);
        const parentId = snap.parent[id];
        const rankVal = snap.rank[id];
        const isOnPath = isFollowStep && pathSet.has(id);

        const classes = ["hp-node", "dsu-node"];
        if (isRoot) classes.push("hp-root");

        const titleNotes = [];
        let resultGlyph = "";
        let isRootFoundNode = false;

        if (step.type === "visit" && activeSet.has(id)) {
            classes.push("dsu-node-visit");
            titleNotes.push("visiting");
        } else if (step.type === "root-found" && activeSet.has(id)) {
            classes.push("dsu-node-root-found");
            isRootFoundNode = true;
            titleNotes.push("visiting", "representative root found (R)");
        } else if (step.type === "done" && step.operation === "find" && activeSet.has(id)) {
            classes.push("dsu-node-root-found");
            isRootFoundNode = true;
            titleNotes.push("returned representative root (R)");
        } else if (step.type === "compress" && step.edge && step.edge.from === id) {
            classes.push("dsu-node-compress");
            titleNotes.push(`compressed from ${step.edge.oldParent} to ${step.edge.to}`);
        } else if (step.type === "compare-rank" && activeSet.has(id)) {
            classes.push("hp-compare");
            titleNotes.push("comparing rank");
        } else if (step.type === "link" && activeSet.has(id)) {
            classes.push("dsu-node-link");
            if (step.edge && step.edge.from === id) titleNotes.push(`linked under ${step.edge.to}`);
            else titleNotes.push("new parent root");
        } else if (step.type === "rank-up" && activeSet.has(id)) {
            classes.push("dsu-node-rank-up");
            titleNotes.push(`rank increased to ${rankVal}`);
        } else if (isSameSet && id === sameSetRoot) {
            classes.push("dsu-node-same-set");
            resultGlyph = "✓";
            titleNotes.push("same set (✓)");
        } else if (isDiffSet && (id === diffRootA || id === diffRootB)) {
            classes.push("dsu-node-diff-set");
            resultGlyph = "✗";
            titleNotes.push("different set root (✗)");
        } else if (step.type === "done" && step.operation === "union" && activeSet.has(id)) {
            classes.push("hp-settled");
            titleNotes.push("merged set root");
        } else if (isOnPath) {
            classes.push("dsu-node-path");
            titleNotes.push("on followed path");
        } else if (isSameSet && activeSet.has(id)) {
            classes.push("hp-settled");
            titleNotes.push("same set member");
        } else if (isDiffSet && activeSet.has(id)) {
            classes.push("hp-swap");
            titleNotes.push("queried element");
        }

        const nextNodeClass = classes.join(" ");
        if (entry.g.getAttribute("class") !== nextNodeClass) {
            entry.g.setAttribute("class", nextNodeClass);
        }

        const nextRootBadge = isRootFoundNode ? "R" : "";
        if (entry.rootBadgeEl.textContent !== nextRootBadge) {
            entry.rootBadgeEl.textContent = nextRootBadge;
        }

        if (entry.resultBadgeEl.textContent !== resultGlyph) {
            entry.resultBadgeEl.textContent = resultGlyph;
        }

        const showRank = isRoot && dsu.byRank;
        const nextRankClass = showRank ? "dsu-rank-label" : "dsu-rank-label dsu-hidden";
        if (entry.rankEl.getAttribute("class") !== nextRankClass) {
            entry.rankEl.setAttribute("class", nextRankClass);
        }
        const nextRankText = showRank ? `r=${rankVal}` : "";
        if (entry.rankEl.textContent !== nextRankText) {
            entry.rankEl.textContent = nextRankText;
        }

        const roleInfo = isRoot
            ? `root, parent=${parentId}, rank=${rankVal}`
            : `parent=${parentId}, rank=${rankVal}`;
        const suffix = titleNotes.length > 0 ? ` — ${titleNotes.join(", ")}` : "";
        const nextTitle = `Element ${id} (${roleInfo})${suffix}`;
        if (entry.titleEl.textContent !== nextTitle) {
            entry.titleEl.textContent = nextTitle;
        }
    }

    const focusId = activeIds.length > 0
        ? activeIds[0]
        : (pathIds.length > 0 ? pathIds[pathIds.length - 1] : null);
    return focusId !== null && lastNodePosMap.has(focusId)
        ? lastNodePosMap.get(focusId).entry.g
        : null;
}

/* ---------- aligned parent[] & rank[] arrays rendering ---------- */

function renderArraysTable(step) {
    const snap = step.snapshot;
    const n = snap.parent.length;
    ensureArraysTable(n);

    els.arraysCaption.textContent =
        `Aligned parent and rank arrays for ${n} element${n === 1 ? "" : "s"} (${snap.roots.length} disjoint set${snap.roots.length === 1 ? "" : "s"}): ${step.message}`;

    const activeIds = Array.isArray(step.ids) ? step.ids : [];
    const pathIds = Array.isArray(step.pathIds) ? step.pathIds : [];
    const activeSet = new Set(activeIds);
    const pathSet = new Set(pathIds);
    const isFollowStep = step.type === "visit" || step.type === "root-found" || step.type === "compress";
    const isSameSet = step.type === "same-set";
    const isDiffSet = step.operation === "connected" && step.type === "done" && activeIds.length >= 4;
    const sameSetRoot = isSameSet ? activeIds[2] : null;
    const diffRootA = isDiffSet ? activeIds[2] : null;
    const diffRootB = isDiffSet ? activeIds[3] : null;

    let focusCell = null;

    for (let i = 0; i < n; i++) {
        const pVal = snap.parent[i];
        const rVal = snap.rank[i];
        const isRoot = pVal === i;
        const isActive = activeSet.has(i);
        const isOnPath = isFollowStep && pathSet.has(i);

        arrayIndexCells[i].className = isActive || isOnPath
            ? "dsu-arr-idx mono dsu-idx-active"
            : "dsu-arr-idx mono";

        // parent[i] cell styling & SR label
        const pClasses = ["dsu-arr-cell", "mono"];
        let pStateNote = isRoot ? "root" : "";

        if (step.type === "compress" && step.edge && step.edge.from === i) {
            pClasses.push("dsu-cell-compress");
            pStateNote = `compressed from ${step.edge.oldParent}`;
            focusCell = parentRowCells[i].td;
        } else if ((step.type === "link" || step.type === "rank-up") && step.edge && step.edge.from === i) {
            pClasses.push("dsu-cell-link");
            pStateNote = `linked to ${step.edge.to}`;
            if (step.type === "link") focusCell = parentRowCells[i].td;
        } else if (step.type === "root-found" && isActive) {
            pClasses.push("dsu-cell-root-found");
            pStateNote = "representative root found";
            focusCell = parentRowCells[i].td;
        } else if (step.type === "visit" && isActive) {
            pClasses.push("dsu-cell-visit");
            pStateNote = "visiting";
            focusCell = parentRowCells[i].td;
        } else if (isSameSet && i === sameSetRoot) {
            pClasses.push("dsu-cell-same-set");
            pStateNote = "same set root";
            focusCell = parentRowCells[i].td;
        } else if (isDiffSet && (i === diffRootA || i === diffRootB)) {
            pClasses.push("dsu-cell-diff-set");
            pStateNote = "different set root";
            if (!focusCell) focusCell = parentRowCells[i].td;
        } else if (isOnPath) {
            pClasses.push("dsu-cell-path");
            pStateNote = "on followed path";
        } else if (isRoot) {
            pClasses.push("dsu-cell-root");
        }

        const pCell = parentRowCells[i];
        pCell.td.className = pClasses.join(" ");
        pCell.val.textContent = String(pVal);
        pCell.sr.textContent = `Index ${i} parent: ${pVal}${pStateNote ? ` (${pStateNote})` : ""}`;

        // rank[i] cell styling & SR label
        const rClasses = ["dsu-arr-cell", "mono"];
        let rStateNote = "";

        if (step.type === "rank-up" && isActive) {
            rClasses.push("dsu-cell-rank-up");
            rStateNote = "rank increased";
            focusCell = rankRowCells[i].td;
        } else if (step.type === "compare-rank" && isActive) {
            rClasses.push("dsu-cell-compare");
            rStateNote = "comparing rank";
            if (!focusCell) focusCell = rankRowCells[i].td;
        } else if (step.type === "root-found" && isActive) {
            rClasses.push("dsu-cell-root");
        }

        const rCell = rankRowCells[i];
        rCell.td.className = rClasses.join(" ");
        rCell.val.textContent = String(rVal);
        rCell.sr.textContent = `Index ${i} rank: ${rVal}${rStateNote ? ` (${rStateNote})` : ""}`;
    }

    return focusCell;
}

/* ---------- main render ---------- */

function render(step, index, p) {
    const activeBefore = document.activeElement;
    const stepChanged = step !== lastRenderedStep;
    lastRenderedStep = step;

    const counts = addCounts(baseCounts, stepDeltas[index] || zeroCounts());

    if (stepChanged) {
        const snap = step.snapshot;
        updatePseudocode(step);
        const forestTarget = renderForestSvg(step);
        const arrayTarget = renderArraysTable(step);
        scheduleReveal([
            [els.forestStage, forestTarget],
            [els.arraysStage, arrayTarget],
        ]);

        const hasGlobalAnnouncer = Boolean(window.DSA_UI?.announce);
        if (hasGlobalAnnouncer) {
            els.stepMessage.setAttribute("aria-live", "off");
            els.stepMessage.textContent = step.message;
        } else {
            const liveMode = p.isPlaying || suppressStepLive || !announceReady ? "off" : "polite";
            els.stepMessage.setAttribute("aria-live", liveMode);
            els.stepMessage.textContent = step.message;
        }

        if (hasGlobalAnnouncer && announceReady && !suppressStepLive) {
            if (!p.isPlaying && autoPlayingOp && p.atEnd) {
                // Operation-triggered autoplay already announced via notify().
                autoPlayingOp = false;
            } else if (!p.isPlaying && userInitiatedPlay && p.atEnd) {
                userInitiatedPlay = false;
                window.DSA_UI.announce(step.message, "polite");
            } else if (!p.isPlaying && !userInitiatedPlay && !autoPlayingOp) {
                window.DSA_UI.announce(step.message, "polite");
            }
        } else if (!p.isPlaying && autoPlayingOp && p.atEnd) {
            autoPlayingOp = false;
        }

        els.statFinds.textContent = String(counts.finds);
        els.statHops.textContent = String(counts.hops);
        els.statCompressed.textContent = String(counts.compressed);
        els.statLinks.textContent = String(counts.links);
        els.statSets.textContent = `${snap.roots.length} / ${snap.parent.length}`;
        els.statIntegrity.textContent = verifySnapshotIntegrity(snap, dsu.byRank, step);
    } else if (!p.isPlaying && userInitiatedPlay && p.atEnd) {
        userInitiatedPlay = false;
        if (announceReady) window.DSA_UI?.announce?.(step.message, "polite");
    }

    els.counter.textContent = `Step ${index + 1} / ${p.length}`;
    els.progress.max = Math.max(0, p.length - 1);
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
        els.elemAInput,
    );
}

/* ---------- playback helpers ---------- */

function pausePlayback() {
    userInitiatedPlay = false;
    autoPlayingOp = false;
    player.pause();
}

function loadSteps(steps, { autoPlay = true, landAtEnd = false, resetCounters = false } = {}) {
    if (!steps || steps.length === 0) return;

    if (resetCounters) {
        totalCounts = zeroCounts();
        baseCounts = zeroCounts();
    } else {
        baseCounts = { ...totalCounts };
    }

    stepDeltas = computeStepDeltas(steps);
    const finalDelta = stepDeltas[stepDeltas.length - 1] || zeroCounts();
    totalCounts = addCounts(baseCounts, finalDelta);

    userInitiatedPlay = false;
    autoPlayingOp = false;
    lastRenderedStep = null;
    suppressStepLive = true;
    player.load(steps);

    const shouldLandAtEnd = landAtEnd || (autoPlay && steps.length > 1 && prefersReducedMotion());
    if (shouldLandAtEnd && steps.length > 1) {
        player.goTo(steps.length - 1);
    }
    suppressStepLive = false;

    if (autoPlay && !shouldLandAtEnd && steps.length > 1) {
        autoPlayingOp = true;
        player.play();
    }
}

function isDrawerOpen() {
    return Boolean(document.getElementById("sideNavbar")?.classList.contains("active"));
}

const playerControls = {
    toggle() {
        if (isDrawerOpen() || player.length <= 1) return;
        if (player.isPlaying) {
            pausePlayback();
        } else {
            autoPlayingOp = false;
            userInitiatedPlay = true;
            player.play();
        }
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

/* ---------- validation & operation handlers ---------- */

function readElement(inputEl, label, fieldKey) {
    const parsed = parseInteger(inputEl.value, {
        min: 0,
        max: dsu.size - 1,
        label,
    });
    if (!parsed.ok) {
        notify(parsed.error, "error", fieldKey);
        inputEl.focus();
        return null;
    }
    return parsed.value;
}

function readOptimizationOptions() {
    return {
        byRank: Boolean(els.byRankToggle.checked),
        compress: Boolean(els.compressToggle.checked),
    };
}

function describeOptions({ byRank, compress }) {
    if (byRank && compress) return "Union by rank + Path compression";
    if (byRank) return "Union by rank only";
    if (compress) return "Path compression only";
    return "neither optimization";
}

function rebuildForest(n, options, statusMessage) {
    dsu = new DisjointSet(n, options);
    const res = dsu.reset(n);
    syncElementRangeLabels(n);
    els.sizeInput.value = String(n);

    if (Number(els.elemAInput.value) >= n) els.elemAInput.value = "0";
    if (Number(els.elemBInput.value) >= n) els.elemBInput.value = String(Math.min(1, n - 1));

    lastTopoKey = "";
    loadSteps(res.steps, { autoPlay: false, resetCounters: true });
    notify(statusMessage, "info");
}

function handleMakeSets() {
    const parsed = parseInteger(els.sizeInput.value, {
        min: DSU_LIMITS.minSize,
        max: DSU_LIMITS.maxSize,
        label: "Size n",
    });
    if (!parsed.ok) {
        notify(parsed.error, "error", "size");
        els.sizeInput.focus();
        return;
    }

    const opts = readOptimizationOptions();
    const n = parsed.value;
    rebuildForest(
        n,
        opts,
        `Created ${n} singleton set${n === 1 ? "" : "s"} (${n === 1 ? "0" : `0..${n - 1}`}) with ${describeOptions(opts)}. Counters reset.`,
    );
}

function handleOptionToggle() {
    const opts = readOptimizationOptions();
    const n = dsu.size;
    rebuildForest(
        n,
        opts,
        `Optimization changed (${describeOptions(opts)}): reset to ${n} singleton set${n === 1 ? "" : "s"} and zeroed cumulative counters.`,
    );
}

function handleResetSets() {
    const opts = readOptimizationOptions();
    const n = dsu.size;
    rebuildForest(
        n,
        opts,
        `Reset to ${n} singleton set${n === 1 ? "" : "s"} (${describeOptions(opts)}). Cumulative counters zeroed.`,
    );
}

function handleUnion() {
    const a = readElement(els.elemAInput, "Element A", "elemA");
    if (a === null) return;
    const b = readElement(els.elemBInput, "Element B", "elemB");
    if (b === null) return;

    const res = dsu.union(a, b);
    if (!res.ok) {
        notify(res.error, "error");
        return;
    }

    loadSteps(res.steps, { autoPlay: true });
    if (res.value === false) {
        notify(
            `Elements ${a} and ${b} are already in the same set (${dsu.setCount}/${dsu.size} sets).`,
            "warning",
        );
    } else {
        notify(
            `United ${a} and ${b} under representative root ${res.value} (${dsu.setCount}/${dsu.size} sets remaining).`,
            "success",
        );
    }
}

function handleFind() {
    const a = readElement(els.elemAInput, "Element A", "elemA");
    if (a === null) return;

    const res = dsu.find(a);
    if (!res.ok) {
        notify(res.error, "error");
        return;
    }

    const compressedCount = res.steps.filter((s) => s.type === "compress").length;
    loadSteps(res.steps, { autoPlay: true });
    notify(
        compressedCount > 0
            ? `find(${a}) = ${res.value} (compressed ${compressedCount} pointer${compressedCount === 1 ? "" : "s"}).`
            : `find(${a}) = ${res.value}.`,
        "info",
    );
}

function handleConnected() {
    const a = readElement(els.elemAInput, "Element A", "elemA");
    if (a === null) return;
    const b = readElement(els.elemBInput, "Element B", "elemB");
    if (b === null) return;

    const res = dsu.connected(a, b);
    if (!res.ok) {
        notify(res.error, "error");
        return;
    }

    loadSteps(res.steps, { autoPlay: true });
    if (res.value) {
        notify(`Connected: ${a} and ${b} belong to the same set.`, "success");
    } else {
        notify(`Not connected: ${a} and ${b} belong to different sets.`, "warning");
    }
}

function pickRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function handleRandomUnions() {
    const n = dsu.size;
    if (n === 1) {
        const res = dsu.union(0, 0);
        loadSteps(res.steps, { autoPlay: true });
        notify("Only 1 element (0) exists — increase Size n to merge multiple sets.", "warning");
        return;
    }

    let restarted = false;
    if (dsu.setCount <= 1) {
        const opts = readOptimizationOptions();
        dsu = new DisjointSet(n, opts);
        restarted = true;
    }

    const targetMerges = Math.min(4, Math.max(1, dsu.setCount - 1));
    const pairs = [];
    const allSteps = [];

    for (let k = 0; k < targetMerges; k++) {
        const groups = dsu.sets();
        if (groups.length <= 1) break;

        const idxA = Math.floor(Math.random() * groups.length);
        let idxB = Math.floor(Math.random() * (groups.length - 1));
        if (idxB >= idxA) idxB += 1;

        const a = pickRandomElement(groups[idxA]);
        const b = pickRandomElement(groups[idxB]);
        const res = dsu.union(a, b);
        if (res.ok) {
            pairs.push(`(${a}, ${b})`);
            allSteps.push(...res.steps);
        }
    }

    if (allSteps.length === 0) return;
    if (restarted) lastTopoKey = "";
    loadSteps(allSteps, { autoPlay: true, resetCounters: restarted });
    notify(
        restarted
            ? `All elements were in 1 set — reset to ${n} singletons (counters zeroed) and ran ${pairs.length} random union${pairs.length === 1 ? "" : "s"}: ${pairs.join(", ")} (${dsu.setCount}/${n} sets remaining).`
            : `Ran ${pairs.length} random union${pairs.length === 1 ? "" : "s"}: ${pairs.join(", ")} (${dsu.setCount}/${n} sets remaining).`,
        "success",
    );
}

/* ---------- event bindings ---------- */

els.sizeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleMakeSets();
});

els.opForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleUnion();
});

els.findBtn.addEventListener("click", handleFind);
els.connectedBtn.addEventListener("click", handleConnected);
els.randomBtn.addEventListener("click", handleRandomUnions);
els.resetSetsBtn.addEventListener("click", handleResetSets);
els.byRankToggle.addEventListener("change", handleOptionToggle);
els.compressToggle.addEventListener("change", handleOptionToggle);

els.playBtn.addEventListener("click", () => playerControls.toggle());
els.stepFwdBtn.addEventListener("click", () => playerControls.next());
els.stepBackBtn.addEventListener("click", () => playerControls.prev());
els.resetBtn.addEventListener("click", () => playerControls.reset());
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value)));
els.progress.addEventListener("input", () => {
    const target = Number(els.progress.value);
    pausePlayback();
    suppressStepLive = true;
    player.goTo(target);
    suppressStepLive = false;
});

bindPlayerKeys(document, playerControls);

/* ---------- concept card & complexity table population ---------- */

function splitComplexity(entry) {
    const parts = String(entry).split(" — ");
    return {
        bigO: parts[0] || entry,
        detail: parts[1] || "",
    };
}

$("dsuName").textContent = DSU_INFO.name;
$("dsuSummary").textContent = DSU_INFO.summary;
$("cxBoth").textContent = splitComplexity(DSU_INFO.complexity.both).bigO;
$("cxRankOnly").textContent = splitComplexity(DSU_INFO.complexity.rankOnly).bigO;
$("cxCompressOnly").textContent = splitComplexity(DSU_INFO.complexity.compressOnly).bigO;
$("cxNeither").textContent = splitComplexity(DSU_INFO.complexity.neither).bigO;
$("cxMakeSet").textContent = splitComplexity(DSU_INFO.complexity.makeSet).bigO;
$("cxSpace").textContent = splitComplexity(DSU_INFO.complexity.space).bigO;

const CX_ROWS = [
    [
        "Union / Find / Connected (Rank + Compression)",
        splitComplexity(DSU_INFO.complexity.both).bigO,
        "Union by Rank + Path Compression; inverse Ackermann α(n) ≤ 4 for all practical n.",
    ],
    [
        "Union / Find / Connected (Rank Only)",
        splitComplexity(DSU_INFO.complexity.rankOnly).bigO,
        "Union by Rank only; tree height never exceeds ⌊log₂ n⌋.",
    ],
    [
        "Union / Find / Connected (Compression Only)",
        splitComplexity(DSU_INFO.complexity.compressOnly).bigO,
        "Path Compression only; flattens traversed paths without rank checks, though a single find can still take O(n) worst case before compression.",
    ],
    [
        "Union / Find / Connected (Neither)",
        splitComplexity(DSU_INFO.complexity.neither).bigO,
        "Neither optimization; union(a, b) always links rootA → rootB, so repeated links can form a chain of height n − 1.",
    ],
    [
        "Make Sets (n) / Reset",
        splitComplexity(DSU_INFO.complexity.makeSet).bigO,
        "Initialize n singleton sets (parent[i] = i, rank[i] = 0); O(1) per single element.",
    ],
    [
        "Space",
        splitComplexity(DSU_INFO.complexity.space).bigO,
        `Stores parent[] and rank[] arrays (bounded here to ${DSU_LIMITS.minSize}..${DSU_LIMITS.maxSize} elements).`,
    ],
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

/* ---------- initial starter forest (silent, landed on final frame) ---------- */

function initStarterForest() {
    dsu = new DisjointSet(STARTER_SIZE, { byRank: true, compress: true });
    syncElementRangeLabels(STARTER_SIZE);
    const starterSteps = [];
    for (const [a, b] of STARTER_UNIONS) {
        const res = dsu.union(a, b);
        if (res.ok) starterSteps.push(...res.steps);
    }
    loadSteps(starterSteps, { autoPlay: false, landAtEnd: true, resetCounters: true });
    announceReady = true;
}

initStarterForest();
