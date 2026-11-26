/**
 * Fenwick Tree (Binary Indexed Tree) page controller (G12).
 * Pure data structure logic lives in src/structures/fenwick.js;
 * playback and keyboard shortcuts come from src/core/step-player.js and src/core/player-keys.js.
 * Zero inline style writes, zero innerHTML writes, zero native dialogs.
 */
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import { parseInteger } from "../core/validate.js";
import { parseArrayInput } from "../algorithms/sorting.js";
import {
    FenwickTree,
    FENWICK_INFO,
    FENWICK_LIMITS,
    lowbit,
    formatBinary,
} from "../structures/fenwick.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/* ---------- SVG layout geometry constants ---------- */
const COL_W = 58;
const LEFT_LABEL_W = 68;
const PAD_RIGHT = 18;
const ARC_BASE_Y = 58;
const HEADER_IDX_Y = 72;
const HEADER_BIN_Y = 86;
const VAL_Y = 96;
const VAL_H = 26;
const TREE_Y = 128;
const TREE_H = 28;
const DIVIDER_Y = 165;
const BARS_TOP = 175;
const TIER_STEP = 34;
const BAR_H = 26;
const PAD_BOTTOM = 16;

const STARTER_VALUES = [3, 2, -1, 6, 5, 4, -3, 3];

const OP_HEADINGS = {
    build: "Pseudocode (Build — O(n))",
    update: "Pseudocode (Point Update — O(log n))",
    set: "Pseudocode (Point Set — O(log n))",
    prefixSum: "Pseudocode (Prefix Sum — O(log n))",
    rangeSum: "Pseudocode (Range Sum — O(log n))",
    clear: "Pseudocode (Clear — O(n))",
};

const $ = (id) => document.getElementById(id);

const els = {
    buildForm: $("buildForm"),
    buildInput: $("buildInput"),
    buildBtn: $("buildBtn"),
    randomBtn: $("randomBtn"),
    clearBtn: $("clearBtn"),
    pointForm: $("pointForm"),
    indexInput: $("indexInput"),
    deltaInput: $("deltaInput"),
    indexRangeHint: $("indexRangeHint"),
    updateBtn: $("updateBtn"),
    setBtn: $("setBtn"),
    prefixBtn: $("prefixBtn"),
    rangeForm: $("rangeForm"),
    leftInput: $("leftInput"),
    rightInput: $("rightInput"),
    leftRangeHint: $("leftRangeHint"),
    rightRangeHint: $("rightRangeHint"),
    rangeBtn: $("rangeBtn"),
    errorBanner: $("fenwickError"),
    statusBanner: $("fenwickStatus"),
    resetBtn: $("resetBtn"),
    stepBackBtn: $("stepBackBtn"),
    playBtn: $("playBtn"),
    playIcon: $("playIcon"),
    playLabel: $("playLabel"),
    stepFwdBtn: $("stepFwdBtn"),
    speed: $("speedSelect"),
    progress: $("progress"),
    counter: $("stepCounter"),
    arraysStage: $("arraysStage"),
    tableCaption: $("fenwickTableCaption"),
    headRow: $("fenwickHeadRow"),
    valuesRow: $("fenwickValuesRow"),
    treeRow: $("fenwickTreeRow"),
    lowbitRow: $("fenwickLowbitRow"),
    barsStage: $("barsStage"),
    svg: $("fenwickSvg"),
    svgTitle: $("fenwickSvgTitle"),
    svgDesc: $("fenwickSvgDesc"),
    stepMessage: $("stepMessage"),
    codeHeading: $("codeHeading"),
    code: $("pseudocode"),
    statRunningTotal: $("statRunningTotal"),
    statSteps: $("statSteps"),
    statIndex: $("statIndex"),
    statLowbit: $("statLowbit"),
    statSize: $("statSize"),
    statIntegrity: $("statIntegrity"),
};

const reducedMotionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function prefersReducedMotion() {
    return Boolean(reducedMotionQuery && reducedMotionQuery.matches);
}

let fenwick = new FenwickTree(STARTER_VALUES.length);
let currentCodeKey = "";
let lastRenderedStep = null;
let lastSvgSize = 0;
let notifyTimerId = 0;
let revealRafId = 0;
let announceReady = false;
let suppressStepLive = false;
let autoPlayingOp = false;

const player = new StepPlayer({ onStep: render, baseDelay: 750 });
player.setSpeed(Number(els.speed.value) || 1);

function bitWidth(n) {
    return Math.max(4, n.toString(2).length);
}

function colLeft(j) {
    return LEFT_LABEL_W + (j - 1) * COL_W + 4;
}

function colRight(j) {
    return LEFT_LABEL_W + j * COL_W - 4;
}

function colCenter(j) {
    return LEFT_LABEL_W + (j - 0.5) * COL_W;
}

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, String(v));
    }
    return el;
}

/* ---------- persistent table column pool ---------- */

const tableCols = [];

function ensureTablePool(needed) {
    while (tableCols.length < needed) {
        const th = document.createElement("th");
        th.scope = "col";
        th.className = "fw-col-head fw-hidden";

        const thIdx = document.createElement("span");
        thIdx.className = "fw-head-j mono";
        thIdx.setAttribute("aria-hidden", "true");

        const thBin = document.createElement("span");
        thBin.className = "fw-head-bin mono";
        thBin.setAttribute("aria-hidden", "true");

        const thZero = document.createElement("span");
        thZero.className = "fw-head-zero mono";
        thZero.setAttribute("aria-hidden", "true");

        const thSr = document.createElement("span");
        thSr.className = "visually-hidden";

        th.append(thIdx, thBin, thZero, thSr);
        els.headRow.append(th);

        const valTd = document.createElement("td");
        valTd.className = "fw-cell fw-val-cell mono fw-hidden";
        const valText = document.createElement("span");
        valText.className = "fw-cell-val";
        valText.setAttribute("aria-hidden", "true");
        const valBadge = document.createElement("span");
        valBadge.className = "fw-cell-badge";
        valBadge.setAttribute("aria-hidden", "true");
        const valSr = document.createElement("span");
        valSr.className = "visually-hidden";
        valTd.append(valText, valBadge, valSr);
        els.valuesRow.append(valTd);

        const treeTd = document.createElement("td");
        treeTd.className = "fw-cell fw-tree-cell mono fw-hidden";
        const treeText = document.createElement("span");
        treeText.className = "fw-cell-val";
        treeText.setAttribute("aria-hidden", "true");
        const treeBadge = document.createElement("span");
        treeBadge.className = "fw-cell-badge";
        treeBadge.setAttribute("aria-hidden", "true");
        const treeSr = document.createElement("span");
        treeSr.className = "visually-hidden";
        treeTd.append(treeText, treeBadge, treeSr);
        els.treeRow.append(treeTd);

        const lbTd = document.createElement("td");
        lbTd.className = "fw-cell fw-lb-cell mono fw-hidden";
        const lbNum = document.createElement("span");
        lbNum.className = "fw-lb-num";
        lbNum.setAttribute("aria-hidden", "true");
        const lbRange = document.createElement("span");
        lbRange.className = "fw-lb-range";
        lbRange.setAttribute("aria-hidden", "true");
        const lbSr = document.createElement("span");
        lbSr.className = "visually-hidden";
        lbTd.append(lbNum, lbRange, lbSr);
        els.lowbitRow.append(lbTd);

        tableCols.push({
            th,
            thIdx,
            thBin,
            thZero,
            thSr,
            valTd,
            valText,
            valBadge,
            valSr,
            treeTd,
            treeText,
            treeBadge,
            treeSr,
            lbTd,
            lbNum,
            lbRange,
            lbSr,
        });
    }
}

/* ---------- persistent SVG layers & pools ---------- */

const guidesLayer = svgEl("g", { class: "fw-guides-layer" });
const cellsLayer = svgEl("g", { class: "fw-cells-layer" });
const barsLayer = svgEl("g", { class: "fw-bars-layer" });
const arcLayer = svgEl("g", { class: "fw-arc-layer" });
els.svg.append(guidesLayer, cellsLayer, barsLayer, arcLayer);

const activeColGuide = svgEl("rect", {
    class: "fw-col-guide fw-hidden",
    y: HEADER_IDX_Y - 10,
    width: COL_W - 4,
    rx: 6,
});
const dividerLine = svgEl("line", {
    class: "fw-divider",
    x1: 8,
    y1: DIVIDER_Y,
    y2: DIVIDER_Y,
});
const gutterIdxLabel = svgEl("text", {
    class: "fw-gutter-label",
    x: LEFT_LABEL_W - 10,
    y: HEADER_IDX_Y + 6,
});
gutterIdxLabel.textContent = "j / bin";
const gutterValLabel = svgEl("text", {
    class: "fw-gutter-label",
    x: LEFT_LABEL_W - 10,
    y: VAL_Y + VAL_H / 2,
});
gutterValLabel.textContent = "a[j−1]";
const gutterTreeLabel = svgEl("text", {
    class: "fw-gutter-label",
    x: LEFT_LABEL_W - 10,
    y: TREE_Y + TREE_H / 2,
});
gutterTreeLabel.textContent = "tree[j]";

guidesLayer.append(activeColGuide, dividerLine, gutterIdxLabel, gutterValLabel, gutterTreeLabel);

const tierPool = []; // [{ lineEl, labelEl }]
const colPool = [];  // [{ g, idxEl, binEl, valGroup, valTitle, valRect, valText, treeGroup, treeTitle, treeRect, treeInnerRect, treeText, treeBadge }]
const barPool = [];  // [{ g, titleEl, rectEl, innerRectEl, textEl, badgeEl }]

const jumpArc = (() => {
    const g = svgEl("g", { class: "fw-arc-group fw-hidden" });
    const titleEl = svgEl("title");
    const pathEl = svgEl("path", { class: "fw-arc-path" });
    const headEl = svgEl("path", { class: "fw-arc-head" });
    const startDot = svgEl("circle", { class: "fw-arc-dot", r: 3.5 });
    const endDot = svgEl("circle", { class: "fw-arc-dot", r: 3.5 });
    const labelEl = svgEl("text", { class: "fw-arc-label" });
    g.append(titleEl, pathEl, headEl, startDot, endDot, labelEl);
    arcLayer.append(g);
    return { g, titleEl, pathEl, headEl, startDot, endDot, labelEl };
})();

function ensureTierPool(needed) {
    while (tierPool.length < needed) {
        const lineEl = svgEl("line", { class: "fw-tier-line fw-hidden", x1: LEFT_LABEL_W });
        const labelEl = svgEl("text", {
            class: "fw-gutter-label fw-tier-label fw-hidden",
            x: LEFT_LABEL_W - 10,
        });
        guidesLayer.append(lineEl, labelEl);
        tierPool.push({ lineEl, labelEl });
    }
}

function ensureColPool(needed) {
    while (colPool.length < needed) {
        const g = svgEl("g", { class: "fw-svg-col fw-hidden" });
        const idxEl = svgEl("text", { class: "fw-svg-idx", y: HEADER_IDX_Y });
        const binEl = svgEl("text", { class: "fw-svg-bin", y: HEADER_BIN_Y });

        const valGroup = svgEl("g", { class: "fw-svg-val" });
        const valTitle = svgEl("title");
        const valRect = svgEl("rect", {
            class: "fw-svg-cell-rect fw-svg-val-rect",
            y: VAL_Y,
            width: COL_W - 8,
            height: VAL_H,
            rx: 4,
        });
        const valText = svgEl("text", { class: "fw-svg-cell-text", y: VAL_Y + VAL_H / 2 });
        valGroup.append(valTitle, valRect, valText);

        const treeGroup = svgEl("g", { class: "fw-svg-tree" });
        const treeTitle = svgEl("title");
        const treeRect = svgEl("rect", {
            class: "fw-svg-cell-rect fw-svg-tree-rect",
            y: TREE_Y,
            width: COL_W - 8,
            height: TREE_H,
            rx: 4,
        });
        const treeInnerRect = svgEl("rect", {
            class: "fw-svg-inner-rect",
            y: TREE_Y + 3,
            width: COL_W - 14,
            height: TREE_H - 6,
            rx: 2,
        });
        const treeText = svgEl("text", { class: "fw-svg-cell-text", y: TREE_Y + TREE_H / 2 });
        const treeBadge = svgEl("text", {
            class: "fw-svg-cell-badge",
            y: TREE_Y + 7,
            "aria-hidden": "true",
        });
        treeGroup.append(treeTitle, treeRect, treeInnerRect, treeText, treeBadge);

        g.append(idxEl, binEl, valGroup, treeGroup);
        cellsLayer.append(g);
        colPool.push({
            g,
            idxEl,
            binEl,
            valGroup,
            valTitle,
            valRect,
            valText,
            treeGroup,
            treeTitle,
            treeRect,
            treeInnerRect,
            treeText,
            treeBadge,
        });
    }
}

function ensureBarPool(needed) {
    while (barPool.length < needed) {
        const g = svgEl("g", { class: "fw-bar-group fw-hidden" });
        const titleEl = svgEl("title");
        const rectEl = svgEl("rect", { class: "fw-bar-rect", height: BAR_H, rx: 5 });
        const innerRectEl = svgEl("rect", { class: "fw-bar-inner-rect", height: BAR_H - 6, rx: 3 });
        const textEl = svgEl("text", { class: "fw-bar-text" });
        const badgeEl = svgEl("text", { class: "fw-bar-badge", "aria-hidden": "true" });
        g.append(titleEl, rectEl, innerRectEl, textEl, badgeEl);
        barsLayer.append(g);
        barPool.push({ g, titleEl, rectEl, innerRectEl, textEl, badgeEl });
    }
}

/* ---------- feedback banners & screen-reader announcements ---------- */

const LIVE_BASE_CLASS = "alert-banner alert-live bst-live";

const FIELD_INPUTS = {
    build: els.buildInput,
    index: els.indexInput,
    delta: els.deltaInput,
    left: els.leftInput,
    right: els.rightInput,
};

function setFieldValidity(input, isInvalid) {
    input.setAttribute("aria-invalid", isInvalid ? "true" : "false");
    if (isInvalid) {
        input.setAttribute("aria-describedby", "fenwickError");
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
 * - Errors write to `#fenwickError` (static `role="alert"`, never `[hidden]`).
 * - Status messages write visually to `#fenwickStatus` and announce politely via `DSA_UI.announce`.
 */
function notify(msg, type = "info", invalidField = null) {
    if (notifyTimerId) {
        clearTimeout(notifyTimerId);
        notifyTimerId = 0;
    }

    for (const [key, input] of Object.entries(FIELD_INPUTS)) {
        setFieldValidity(input, invalidField === key);
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

/* ---------- snapshot integrity & step classification ---------- */

/**
 * Verifies the Fenwick invariant directly on the rendered `step.snapshot`.
 * Reports intermediate building/updating status on partial-mutation frames.
 */
function verifySnapshot(snapshot, step) {
    if (step.operation === "build" && step.type !== "done") {
        return "Building…";
    }
    if ((step.operation === "update" || step.operation === "set") && step.type !== "done") {
        return "Updating…";
    }

    const { values, tree } = snapshot;
    if (!Array.isArray(values) || !Array.isArray(tree)) {
        return "Error (missing arrays)";
    }
    const n = values.length;
    if (n < FENWICK_LIMITS.minSize || n > FENWICK_LIMITS.maxSize) {
        return `Error (size ${n})`;
    }
    if (tree.length !== n + 1) {
        return `Error (tree length ${tree.length})`;
    }
    if (tree[0] !== 0) {
        return `Error (tree[0] = ${tree[0]})`;
    }

    for (let j = 1; j <= n; j++) {
        const lb = lowbit(j);
        let expected = 0;
        for (let k = j - lb; k < j; k++) {
            expected += values[k];
        }
        if (tree[j] !== expected) {
            return `Error (tree[${j}] ≠ ${expected})`;
        }
    }
    return "OK";
}

/**
 * Derives per-column visual states and jump-arc endpoints solely from recorded steps.
 */
function analyzeStep(step, stepIndex) {
    const n = step.snapshot.values.length;
    const activeJ = typeof step.index === "number" ? step.index : null;
    const visitedSet = new Set(Array.isArray(step.indices) ? step.indices : []);

    const rightVisited = new Set();
    const leftVisited = new Set();
    if (step.operation === "rangeSum") {
        const limit = Math.min(stepIndex, player.steps.length - 1);
        for (let s = 0; s <= limit; s++) {
            const prev = player.steps[s];
            if (!prev || typeof prev.index !== "number") continue;
            if (prev.type === "range-right") rightVisited.add(prev.index);
            else if (prev.type === "range-left") leftVisited.add(prev.index);
        }
    }

    let jump = null;
    if (step.type === "move-up" && activeJ !== null && typeof step.lowbit === "number") {
        const toJ = activeJ + step.lowbit;
        if (toJ <= n) {
            jump = { fromJ: activeJ, toJ, dir: "up", lb: step.lowbit };
        }
    } else if (step.type === "move-down" && activeJ !== null && typeof step.lowbit === "number") {
        const toJ = activeJ - step.lowbit;
        if (toJ >= 1) {
            jump = { fromJ: activeJ, toJ, dir: "down", lb: step.lowbit };
        }
    } else if (
        step.operation === "build" &&
        step.type === "add" &&
        Array.isArray(step.indices) &&
        step.indices.length === 2 &&
        typeof step.lowbit === "number"
    ) {
        const [fromJ, toJ] = step.indices;
        if (fromJ >= 1 && toJ <= n) {
            jump = { fromJ, toJ, dir: "up", lb: step.lowbit };
        }
    }

    let coverLo = null;
    let coverHi = null;
    if (activeJ !== null && activeJ >= 1 && activeJ <= n) {
        const lb = lowbit(activeJ);
        coverLo = activeJ - lb + 1; // 1-based start column
        coverHi = activeJ;          // 1-based end column
    }

    const mutatedCol =
        (step.operation === "update" || step.operation === "set") &&
        Array.isArray(step.indices) &&
        step.indices.length > 0
            ? step.indices[0]
            : null;

    const colStates = new Array(n + 1);
    const valStates = new Array(n + 1);

    for (let j = 1; j <= n; j++) {
        let stateClass = "";
        let badge = "";
        let stateWord = "idle";

        if (step.operation === "rangeSum") {
            if (j === activeJ) {
                if (step.type === "range-right") {
                    stateClass = "fw-range-right";
                    badge = "+";
                    stateWord = "range right (+tree[j])";
                } else if (step.type === "range-left") {
                    stateClass = "fw-range-left";
                    badge = "−";
                    stateWord = "range left (−tree[j])";
                } else if (step.type === "move-down") {
                    stateClass = "fw-move-down";
                    badge = "↓";
                    stateWord = "jumping down";
                }
            } else if (jump && j === jump.toJ) {
                stateClass = "fw-jump-target fw-move-down";
                badge = "↓";
                stateWord = "next jump target";
            } else if (leftVisited.has(j) && rightVisited.has(j)) {
                stateClass = "fw-range-left";
                badge = "±";
                stateWord = "added in right prefix, subtracted in left prefix (cancels)";
            } else if (leftVisited.has(j)) {
                stateClass = "fw-range-left";
                badge = "−";
                stateWord = "subtracted in left prefix";
            } else if (rightVisited.has(j)) {
                stateClass = "fw-range-right";
                badge = "+";
                stateWord = "added in right prefix";
            }
        } else if (step.operation === "build") {
            if (step.type === "visit" && visitedSet.has(j)) {
                stateClass = "fw-visit";
                badge = "•";
                stateWord = "copied from a[i]";
            } else if (step.type === "add") {
                if (jump && j === jump.toJ) {
                    stateClass = "fw-add";
                    badge = "+";
                    stateWord = "parent accumulated";
                } else if (j === activeJ) {
                    stateClass = "fw-move-up";
                    badge = "↑";
                    stateWord = "child source";
                }
            }
        } else if (step.operation === "update" || step.operation === "set") {
            if (j === activeJ) {
                if (step.type === "add") {
                    stateClass = "fw-add";
                    badge = "+";
                    stateWord = "updated (+delta)";
                } else if (step.type === "move-up") {
                    stateClass = "fw-move-up";
                    badge = "↑";
                    stateWord = "climbing to parent";
                }
            } else if (jump && j === jump.toJ) {
                stateClass = "fw-jump-target fw-move-up";
                badge = "↑";
                stateWord = "next parent target";
            } else if (visitedSet.has(j)) {
                stateClass = step.type === "done" ? "fw-add" : "fw-visited";
                badge = "+";
                stateWord = "updated";
            }
        } else if (step.operation === "prefixSum") {
            if (j === activeJ) {
                if (step.type === "visit") {
                    stateClass = "fw-visit";
                    badge = "•";
                    stateWord = "added to prefix sum";
                } else if (step.type === "move-down") {
                    stateClass = "fw-move-down";
                    badge = "↓";
                    stateWord = "stepping down";
                }
            } else if (jump && j === jump.toJ) {
                stateClass = "fw-jump-target fw-move-down";
                badge = "↓";
                stateWord = "next jump target";
            } else if (visitedSet.has(j)) {
                stateClass = step.type === "done" ? "fw-done-hit" : "fw-visited";
                badge = "✓";
                stateWord = "included in prefix sum";
            }
        }

        colStates[j] = { stateClass, badge, stateWord };

        let vClass = "";
        let vBadge = "";
        let vWord = "unchanged";
        if (step.operation === "build" && step.type === "visit") {
            vClass = "fw-visit";
            vBadge = "•";
            vWord = "copied to tree";
        } else if (mutatedCol === j) {
            vClass = "fw-add";
            vBadge = "+";
            vWord = "updated element";
        } else if (coverLo !== null && j >= coverLo && j <= coverHi) {
            vClass = "fw-covered";
            vWord = `covered by tree[${activeJ}]`;
        }
        valStates[j] = { stateClass: vClass, badge: vBadge, stateWord: vWord };
    }

    const focusJ =
        activeJ !== null
            ? activeJ
            : jump !== null
                ? jump.toJ
                : step.operation === "build" && step.type === "visit" && Array.isArray(step.indices) && step.indices.length > 0
                    ? step.indices[0]
                    : Array.isArray(step.indices) && step.indices.length > 0
                        ? step.indices[step.indices.length - 1]
                        : null;

    return { activeJ, jump, colStates, valStates, focusJ };
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
    const op = FENWICK_INFO.pseudocode[step.operation] ? step.operation : "build";
    if (op !== currentCodeKey) {
        currentCodeKey = op;
        els.codeHeading.textContent = OP_HEADINGS[op] ?? "Pseudocode";
        els.code.replaceChildren(
            ...FENWICK_INFO.pseudocode[op].map((line) => {
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

/* ---------- Stage 1: Index-aligned table rendering (pooled) ---------- */

function renderTable(step, analysis) {
    const { values, tree } = step.snapshot;
    const n = values.length;
    const bits = bitWidth(n);

    ensureTablePool(n);

    els.tableCaption.textContent =
        `Fenwick tree with ${n} element${n === 1 ? "" : "s"}: logical values a[0..${n - 1}] aligned with 1-based tree[1..${n}]. ${step.message}`;

    for (let k = 0; k < n; k++) {
        const j = k + 1;
        const bin = formatBinary(j, bits);
        const lb = lowbit(j);
        const rangeLo = j - lb;
        const rangeHi = j - 1;
        const rangeStr = rangeLo === rangeHi ? `a[${rangeLo}]` : `a[${rangeLo}..${rangeHi}]`;

        const col = tableCols[k];
        const tState = analysis.colStates[j];
        const vState = analysis.valStates[j];

        const headClasses = ["fw-col-head"];
        if (j === analysis.activeJ) headClasses.push("fw-head-active");
        col.th.className = headClasses.join(" ");
        col.thIdx.textContent = `j=${j}`;
        col.thBin.textContent = bin;
        col.thZero.textContent = `i=${k}`;
        col.thSr.textContent = `1-based index ${j}, binary ${bin}, 0-based index ${k}`;

        const valClasses = ["fw-cell", "fw-val-cell", "mono"];
        if (vState.stateClass) valClasses.push(vState.stateClass);
        col.valTd.className = valClasses.join(" ");
        col.valText.textContent = String(values[k]);
        col.valBadge.textContent = vState.badge;
        col.valSr.textContent = `a[${k}] = ${values[k]} (${vState.stateWord})`;

        const treeClasses = ["fw-cell", "fw-tree-cell", "mono"];
        if (tState.stateClass) treeClasses.push(tState.stateClass);
        col.treeTd.className = treeClasses.join(" ");
        col.treeText.textContent = String(tree[j]);
        col.treeBadge.textContent = tState.badge;
        col.treeSr.textContent = `tree[${j}] (binary ${bin}) = ${tree[j]} (${tState.stateWord})`;

        const lbClasses = ["fw-cell", "fw-lb-cell", "mono"];
        if (j === analysis.activeJ) lbClasses.push("fw-lb-active");
        col.lbTd.className = lbClasses.join(" ");
        col.lbNum.textContent = `lb=${lb}`;
        col.lbRange.textContent = rangeStr;
        col.lbSr.textContent = `lowbit(${j}) = ${lb}, covers ${rangeStr}`;
    }

    for (let k = n; k < tableCols.length; k++) {
        const col = tableCols[k];
        col.th.className = "fw-col-head fw-hidden";
        col.thIdx.textContent = "";
        col.thBin.textContent = "";
        col.thZero.textContent = "";
        col.thSr.textContent = "";

        col.valTd.className = "fw-cell fw-val-cell mono fw-hidden";
        col.valText.textContent = "";
        col.valBadge.textContent = "";
        col.valSr.textContent = "";

        col.treeTd.className = "fw-cell fw-tree-cell mono fw-hidden";
        col.treeText.textContent = "";
        col.treeBadge.textContent = "";
        col.treeSr.textContent = "";

        col.lbTd.className = "fw-cell fw-lb-cell mono fw-hidden";
        col.lbNum.textContent = "";
        col.lbRange.textContent = "";
        col.lbSr.textContent = "";
    }

    return analysis.focusJ !== null && analysis.focusJ >= 1 && analysis.focusJ <= n
        ? tableCols[analysis.focusJ - 1].treeTd
        : null;
}

/* ---------- Stage 2: SVG Coverage Bars & Binary Jump Diagram (pooled) ---------- */

function syncSvgLayout(n) {
    const bits = bitWidth(n);
    const maxTier = Math.floor(Math.log2(n));
    const tierCount = maxTier + 1;

    const svgW = LEFT_LABEL_W + n * COL_W + PAD_RIGHT;
    const svgH = BARS_TOP + tierCount * TIER_STEP + PAD_BOTTOM;

    els.svg.setAttribute("width", String(svgW));
    els.svg.setAttribute("height", String(svgH));
    els.svg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);

    dividerLine.setAttribute("x2", String(svgW - 8));
    activeColGuide.setAttribute("height", String(svgH - (HEADER_IDX_Y - 10) - 8));

    ensureTierPool(tierCount);
    for (let t = 0; t < tierCount; t++) {
        const entry = tierPool[t];
        const cy = BARS_TOP + t * TIER_STEP + BAR_H / 2;
        entry.lineEl.setAttribute("class", "fw-tier-line");
        entry.lineEl.setAttribute("x2", String(svgW - PAD_RIGHT));
        entry.lineEl.setAttribute("y1", cy.toFixed(1));
        entry.lineEl.setAttribute("y2", cy.toFixed(1));

        entry.labelEl.setAttribute("class", "fw-gutter-label fw-tier-label");
        entry.labelEl.setAttribute("y", cy.toFixed(1));
        entry.labelEl.textContent = `lb=${1 << t}`;
    }
    for (let t = tierCount; t < tierPool.length; t++) {
        tierPool[t].lineEl.setAttribute("class", "fw-tier-line fw-hidden");
        tierPool[t].labelEl.setAttribute("class", "fw-gutter-label fw-tier-label fw-hidden");
        tierPool[t].labelEl.textContent = "";
    }

    ensureColPool(n);
    for (let k = 0; k < n; k++) {
        const j = k + 1;
        const entry = colPool[k];
        const cx = colCenter(j);
        const left = colLeft(j);

        entry.g.setAttribute("class", "fw-svg-col");
        entry.idxEl.setAttribute("x", cx.toFixed(1));
        entry.idxEl.textContent = String(j);
        entry.binEl.setAttribute("x", cx.toFixed(1));
        entry.binEl.textContent = formatBinary(j, bits);

        entry.valRect.setAttribute("x", left.toFixed(1));
        entry.valText.setAttribute("x", cx.toFixed(1));

        entry.treeRect.setAttribute("x", left.toFixed(1));
        entry.treeInnerRect.setAttribute("x", (left + 3).toFixed(1));
        entry.treeText.setAttribute("x", cx.toFixed(1));
        entry.treeBadge.setAttribute("x", (left + COL_W - 14).toFixed(1));
    }
    for (let k = n; k < colPool.length; k++) {
        const entry = colPool[k];
        entry.g.setAttribute("class", "fw-svg-col fw-hidden");
        entry.idxEl.textContent = "";
        entry.binEl.textContent = "";
        entry.valText.textContent = "";
        entry.valTitle.textContent = "";
        entry.treeText.textContent = "";
        entry.treeBadge.textContent = "";
        entry.treeTitle.textContent = "";
    }

    ensureBarPool(n);
    for (let k = 0; k < n; k++) {
        const j = k + 1;
        const lb = lowbit(j);
        const tier = Math.round(Math.log2(lb));
        const startCol = j - lb + 1;
        const x = colLeft(startCol);
        const width = colRight(j) - x;
        const y = BARS_TOP + tier * TIER_STEP;
        const entry = barPool[k];

        entry.rectEl.setAttribute("x", x.toFixed(1));
        entry.rectEl.setAttribute("y", y.toFixed(1));
        entry.rectEl.setAttribute("width", width.toFixed(1));

        entry.innerRectEl.setAttribute("x", (x + 3).toFixed(1));
        entry.innerRectEl.setAttribute("y", (y + 3).toFixed(1));
        entry.innerRectEl.setAttribute("width", Math.max(0, width - 6).toFixed(1));

        entry.textEl.setAttribute("x", (x + width / 2).toFixed(1));
        entry.textEl.setAttribute("y", (y + BAR_H / 2).toFixed(1));

        entry.badgeEl.setAttribute("x", (lb === 1 ? x + width - 4 : x + width - 8).toFixed(1));
        entry.badgeEl.setAttribute("y", (lb === 1 ? y + 7 : y + BAR_H / 2).toFixed(1));
    }
    for (let k = n; k < barPool.length; k++) {
        const entry = barPool[k];
        entry.g.setAttribute("class", "fw-bar-group fw-hidden");
        entry.titleEl.textContent = "";
        entry.textEl.textContent = "";
        entry.badgeEl.textContent = "";
    }

    lastSvgSize = n;
}

function renderJumpArc(jump, bits) {
    if (!jump) {
        jumpArc.g.setAttribute("class", "fw-arc-group fw-hidden");
        jumpArc.titleEl.textContent = "";
        jumpArc.labelEl.textContent = "";
        return;
    }

    const x1 = colCenter(jump.fromJ);
    const x2 = colCenter(jump.toJ);
    const yBase = ARC_BASE_Y;
    const span = Math.abs(jump.toJ - jump.fromJ);
    const lift = Math.min(42, 18 + span * 4);
    const cx = (x1 + x2) / 2;
    const cy = yBase - lift * 1.5;
    const yApex = yBase - lift * 0.75;

    const d = `M ${x1.toFixed(1)} ${yBase.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${yBase.toFixed(1)}`;
    jumpArc.pathEl.setAttribute("d", d);

    // Directional chevron at (x2, yBase)
    const headD =
        jump.dir === "up"
            ? `M ${(x2 - 6).toFixed(1)} ${(yBase - 6).toFixed(1)} L ${x2.toFixed(1)} ${yBase.toFixed(1)} L ${(x2 + 2).toFixed(1)} ${(yBase - 8).toFixed(1)}`
            : `M ${(x2 + 6).toFixed(1)} ${(yBase - 6).toFixed(1)} L ${x2.toFixed(1)} ${yBase.toFixed(1)} L ${(x2 - 2).toFixed(1)} ${(yBase - 8).toFixed(1)}`;
    jumpArc.headEl.setAttribute("d", headD);

    jumpArc.startDot.setAttribute("cx", x1.toFixed(1));
    jumpArc.startDot.setAttribute("cy", yBase.toFixed(1));
    jumpArc.endDot.setAttribute("cx", x2.toFixed(1));
    jumpArc.endDot.setAttribute("cy", yBase.toFixed(1));

    const labelY = Math.max(12, yApex - 5);
    jumpArc.labelEl.setAttribute("x", cx.toFixed(1));
    jumpArc.labelEl.setAttribute("y", labelY.toFixed(1));
    jumpArc.labelEl.textContent =
        jump.dir === "up" ? `+${jump.lb} ↑` : `−${jump.lb} ↓`;

    const toneClass = jump.dir === "up" ? "fw-arc-up" : "fw-arc-down";
    jumpArc.g.setAttribute("class", `fw-arc-group ${toneClass}`);
    jumpArc.titleEl.textContent =
        jump.dir === "up"
            ? `Climb up: j = ${jump.fromJ} (${formatBinary(jump.fromJ, bits)}) + lowbit ${jump.lb} → ${jump.toJ} (${formatBinary(jump.toJ, bits)})`
            : `Step down: j = ${jump.fromJ} (${formatBinary(jump.fromJ, bits)}) − lowbit ${jump.lb} → ${jump.toJ} (${formatBinary(jump.toJ, bits)})`;
}

function renderFenwickSvg(step, analysis) {
    const { values, tree } = step.snapshot;
    const n = values.length;
    const bits = bitWidth(n);

    if (n !== lastSvgSize) {
        syncSvgLayout(n);
    }

    els.svgTitle.textContent =
        `Fenwick Tree coverage diagram for ${n} element${n === 1 ? "" : "s"}`;
    els.svgDesc.textContent =
        `${step.message} Values: [${values.join(", ")}]. Tree[1..${n}]: [${tree.slice(1).join(", ")}].`;

    if (analysis.activeJ !== null && analysis.activeJ >= 1 && analysis.activeJ <= n) {
        activeColGuide.setAttribute("x", (LEFT_LABEL_W + (analysis.activeJ - 1) * COL_W + 2).toFixed(1));
        activeColGuide.setAttribute("class", "fw-col-guide");
    } else {
        activeColGuide.setAttribute("class", "fw-col-guide fw-hidden");
    }

    for (let k = 0; k < n; k++) {
        const j = k + 1;
        const lb = lowbit(j);
        const rangeLo = j - lb;
        const rangeHi = j - 1;
        const rangeTag = rangeLo === rangeHi ? `[${rangeLo}]` : `[${rangeLo}..${rangeHi}]`;
        const bin = formatBinary(j, bits);

        const col = colPool[k];
        const tState = analysis.colStates[j];
        const vState = analysis.valStates[j];

        const colClasses = ["fw-svg-col"];
        if (j === analysis.activeJ) colClasses.push("fw-svg-col-active");
        col.g.setAttribute("class", colClasses.join(" "));

        const valClasses = ["fw-svg-val"];
        if (vState.stateClass) valClasses.push(vState.stateClass);
        col.valGroup.setAttribute("class", valClasses.join(" "));
        col.valText.textContent = String(values[k]);
        col.valTitle.textContent = `a[${k}] = ${values[k]} (${vState.stateWord})`;

        const treeClasses = ["fw-svg-tree"];
        if (tState.stateClass) treeClasses.push(tState.stateClass);
        col.treeGroup.setAttribute("class", treeClasses.join(" "));
        col.treeText.textContent = String(tree[j]);
        col.treeBadge.textContent = tState.badge;
        col.treeTitle.textContent = `tree[${j}] (${bin}) = ${tree[j]} — covers a${rangeTag} (${tState.stateWord})`;

        const bar = barPool[k];
        const barClasses = ["fw-bar-group"];
        if (tState.stateClass) barClasses.push(tState.stateClass);
        bar.g.setAttribute("class", barClasses.join(" "));

        const treeValStr = String(tree[j]);
        bar.textEl.textContent =
            lb === 1
                ? treeValStr
                : lb === 2
                    ? (treeValStr.length >= 4 ? treeValStr : `${treeValStr} ${rangeTag}`)
                    : `${treeValStr} · a${rangeTag}`;
        bar.badgeEl.textContent = tState.badge;
        bar.titleEl.textContent =
            `tree[${j}] = ${tree[j]} (binary ${bin}, lowbit ${lb}): covers a${rangeTag} — ${tState.stateWord}`;
    }

    renderJumpArc(analysis.jump, bits);

    return analysis.focusJ !== null && analysis.focusJ >= 1 && analysis.focusJ <= n
        ? colPool[analysis.focusJ - 1].treeGroup
        : null;
}

/* ---------- main render ---------- */

function render(step, index, p) {
    const activeBefore = document.activeElement;
    const stepChanged = step !== lastRenderedStep;
    lastRenderedStep = step;

    const finishingAutoPlay = autoPlayingOp && !p.isPlaying && p.atEnd;
    const quietLive = p.isPlaying || suppressStepLive || !announceReady || finishingAutoPlay;
    const liveMode = quietLive ? "off" : "polite";

    if (stepChanged) {
        const snap = step.snapshot;
        const n = snap.values.length;
        const bits = bitWidth(n);
        const analysis = analyzeStep(step, index);

        updatePseudocode(step);
        const tableTarget = renderTable(step, analysis);
        const svgTarget = renderFenwickSvg(step, analysis);
        scheduleReveal([
            [els.arraysStage, tableTarget],
            [els.barsStage, svgTarget],
        ]);

        els.stepMessage.setAttribute("aria-live", liveMode);
        els.stepMessage.textContent = step.message;

        els.statRunningTotal.textContent =
            step.runningTotal !== null && step.runningTotal !== undefined
                ? String(step.runningTotal)
                : "—";
        els.statSteps.textContent =
            step.operation === "build" && step.type === "done"
                ? String(n)
                : Array.isArray(step.indices)
                    ? String(step.indices.length)
                    : "0";
        els.statIndex.textContent =
            typeof step.index === "number"
                ? `${step.index} (${formatBinary(step.index, bits)})`
                : "—";
        els.statLowbit.textContent =
            typeof step.lowbit === "number"
                ? `${step.lowbit} (${formatBinary(step.lowbit, bits)})`
                : "—";
        els.statSize.textContent = `${n} / ${FENWICK_LIMITS.maxSize}`;
        els.statIntegrity.textContent = verifySnapshot(snap, step);
    } else {
        els.stepMessage.setAttribute("aria-live", liveMode);
    }

    if (finishingAutoPlay) {
        autoPlayingOp = false;
        requestAnimationFrame(() => {
            if (!player.isPlaying && !suppressStepLive && !autoPlayingOp) {
                els.stepMessage.setAttribute("aria-live", "polite");
            }
        });
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
        els.buildInput,
    );
}

/* ---------- playback helpers ---------- */

function loadSteps(steps, { autoPlay = true } = {}) {
    if (!steps || steps.length === 0) return;
    player.pause();
    lastRenderedStep = null;
    autoPlayingOp = false;
    suppressStepLive = true;
    player.load(steps);
    if (autoPlay && steps.length > 1) {
        if (prefersReducedMotion()) {
            player.goTo(steps.length - 1);
            suppressStepLive = false;
            els.stepMessage.setAttribute("aria-live", "polite");
            return;
        }
        suppressStepLive = false;
        autoPlayingOp = true;
        player.play();
        return;
    }
    suppressStepLive = false;
    els.stepMessage.setAttribute("aria-live", "polite");
}

function isDrawerOpen() {
    return Boolean(document.getElementById("sideNavbar")?.classList.contains("active"));
}

const playerControls = {
    toggle() {
        if (isDrawerOpen() || player.length <= 1) return;
        autoPlayingOp = false;
        player.toggle();
    },
    pause() {
        if (isDrawerOpen()) return;
        autoPlayingOp = false;
        player.pause();
    },
    next() {
        if (isDrawerOpen()) return;
        autoPlayingOp = false;
        player.next();
    },
    prev() {
        if (isDrawerOpen()) return;
        autoPlayingOp = false;
        player.prev();
    },
    reset() {
        if (isDrawerOpen()) return;
        autoPlayingOp = false;
        player.reset();
    },
};

/* ---------- range hint & input clamping helpers ---------- */

function syncIndexBounds(n) {
    const maxIdx = n - 1;
    const hint = `0..${maxIdx}`;
    els.indexRangeHint.textContent = hint;
    els.leftRangeHint.textContent = hint;
    els.rightRangeHint.textContent = hint;

    const clampField = (input) => {
        const parsed = parseInteger(input.value, { min: 0, max: FENWICK_LIMITS.maxSize });
        if (parsed.ok && parsed.value > maxIdx) {
            input.value = String(maxIdx);
        }
    };
    clampField(els.indexInput);
    clampField(els.leftInput);
    clampField(els.rightInput);

    const leftVal = parseInteger(els.leftInput.value, { min: 0, max: maxIdx });
    const rightVal = parseInteger(els.rightInput.value, { min: 0, max: maxIdx });
    if (leftVal.ok && rightVal.ok && leftVal.value > rightVal.value) {
        els.leftInput.value = String(rightVal.value);
    }
}

/* ---------- operation handlers ---------- */

const BUILD_LIMITS = {
    minLength: FENWICK_LIMITS.minSize,
    maxLength: FENWICK_LIMITS.maxSize,
    min: FENWICK_LIMITS.minValue,
    max: FENWICK_LIMITS.maxValue,
};

function handleBuild({ autoPlay = true, silent = false } = {}) {
    const parsed = parseArrayInput(els.buildInput.value, BUILD_LIMITS);
    if (!parsed.ok) {
        notify(parsed.error, "error", "build");
        els.buildInput.focus();
        return false;
    }

    const res = fenwick.build(parsed.values);
    if (!res.ok) {
        notify(res.error, "error", "build");
        els.buildInput.focus();
        return false;
    }

    syncIndexBounds(fenwick.size);
    loadSteps(res.steps, { autoPlay });
    if (!silent) {
        notify(
            `Built Fenwick Tree for ${fenwick.size} element${fenwick.size === 1 ? "" : "s"} in O(n) time.`,
            "success",
        );
    }
    return true;
}

function handleRandom() {
    const n = 8 + Math.floor(Math.random() * 5); // 8..12 elements
    const values = Array.from({ length: n }, () => Math.floor(Math.random() * 31) - 10);
    if (values.every((v) => v === 0)) {
        values[0] = 5;
    }
    els.buildInput.value = values.join(", ");
    handleBuild({ autoPlay: true });
}

function handleClear() {
    const res = fenwick.clear();
    els.buildInput.value = fenwick.toArray().join(", ");
    loadSteps(res.steps, { autoPlay: false });
    notify(`Cleared all ${fenwick.size} values and Fenwick tree cells to 0.`, "info");
}

function readZeroIndex(inputEl, fieldKey, label) {
    const checked = parseInteger(inputEl.value, {
        min: 0,
        max: fenwick.size - 1,
        label,
    });
    if (!checked.ok) {
        notify(checked.error, "error", fieldKey);
        inputEl.focus();
        return null;
    }
    return checked.value;
}

function readBoundedValue(label) {
    const checked = parseInteger(els.deltaInput.value, {
        min: FENWICK_LIMITS.minValue,
        max: FENWICK_LIMITS.maxValue,
        label,
    });
    if (!checked.ok) {
        notify(checked.error, "error", "delta");
        els.deltaInput.focus();
        return null;
    }
    return checked.value;
}

function handleUpdate() {
    const i = readZeroIndex(els.indexInput, "index", "Index i");
    if (i === null) return;
    const delta = readBoundedValue("Delta");
    if (delta === null) return;

    const res = fenwick.update(i, delta);
    if (!res.ok) {
        notify(res.error, "error", "delta");
        return;
    }

    els.buildInput.value = fenwick.toArray().join(", ");
    loadSteps(res.steps, { autoPlay: true });
    const sign = delta >= 0 ? `+${delta}` : String(delta);
    notify(`Updated a[${i}] by ${sign} → ${res.value}.`, "success");
}

function handleSet() {
    const i = readZeroIndex(els.indexInput, "index", "Index i");
    if (i === null) return;
    const value = readBoundedValue("Value");
    if (value === null) return;

    const res = fenwick.set(i, value);
    if (!res.ok) {
        notify(res.error, "error", "delta");
        return;
    }

    els.buildInput.value = fenwick.toArray().join(", ");
    loadSteps(res.steps, { autoPlay: res.steps.length > 1 });
    notify(`Set a[${i}] = ${res.value}.`, "success");
}

function handlePrefixSum() {
    const i = readZeroIndex(els.indexInput, "index", "Index i");
    if (i === null) return;

    const res = fenwick.prefixSum(i);
    if (!res.ok) {
        notify(res.error, "error", "index");
        return;
    }

    loadSteps(res.steps, { autoPlay: true });
    notify(`Prefix sum a[0..${i}] = ${res.value}.`, "info");
}

function handleRangeSum() {
    const l = readZeroIndex(els.leftInput, "left", "Left index l");
    if (l === null) return;
    const r = readZeroIndex(els.rightInput, "right", "Right index r");
    if (r === null) return;

    if (l > r) {
        notify(
            `Range bounds invalid: left index l (${l}) must be <= right index r (${r}).`,
            "error",
            "left",
        );
        els.leftInput.focus();
        return;
    }

    const res = fenwick.rangeSum(l, r);
    if (!res.ok) {
        notify(res.error, "error", "left");
        return;
    }

    loadSteps(res.steps, { autoPlay: true });
    notify(`Range sum a[${l}..${r}] = ${res.value}.`, "info");
}

/* ---------- event bindings ---------- */

els.buildForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleBuild({ autoPlay: true });
});

els.pointForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleUpdate();
});

els.rangeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleRangeSum();
});

els.randomBtn.addEventListener("click", handleRandom);
els.clearBtn.addEventListener("click", handleClear);
els.setBtn.addEventListener("click", handleSet);
els.prefixBtn.addEventListener("click", handlePrefixSum);

els.playBtn.addEventListener("click", () => playerControls.toggle());
els.stepFwdBtn.addEventListener("click", () => {
    autoPlayingOp = false;
    player.pause();
    player.next();
});
els.stepBackBtn.addEventListener("click", () => playerControls.prev());
els.resetBtn.addEventListener("click", () => playerControls.reset());
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value)));

els.progress.addEventListener("input", () => {
    const target = Number(els.progress.value);
    suppressStepLive = true;
    autoPlayingOp = false;
    player.pause();
    player.goTo(target);
    suppressStepLive = false;
    els.stepMessage.setAttribute("aria-live", "polite");
});

bindPlayerKeys(document, playerControls);

/* ---------- concept card & complexity table population ---------- */

$("fenwickName").textContent = FENWICK_INFO.name;
$("fenwickSummary").textContent = FENWICK_INFO.summary;
$("cxBuild").textContent = FENWICK_INFO.complexity.build;
$("cxUpdate").textContent = FENWICK_INFO.complexity.update;
$("cxSet").textContent = FENWICK_INFO.complexity.set;
$("cxPrefixSum").textContent = FENWICK_INFO.complexity.prefixSum;
$("cxRangeSum").textContent = FENWICK_INFO.complexity.rangeSum;
$("cxSpace").textContent = FENWICK_INFO.complexity.space;

const CX_ROWS = [
    ["Build (bottom-up)", FENWICK_INFO.complexity.build, "Copies a[0..n−1] into tree[1..n] and propagates each tree[j] once into parent j + lowbit(j)."],
    ["Point Update (+delta)", FENWICK_INFO.complexity.update, "Updates a[i] and climbs parents via j += lowbit(j) while j ≤ n (at most ⌊log₂ n⌋ + 1 cells)."],
    ["Point Set (=value)", FENWICK_INFO.complexity.set, "Computes delta = value − a[i] (no-op if delta = 0) and delegates to the same upward lowbit climb."],
    ["Prefix Sum (0..i)", FENWICK_INFO.complexity.prefixSum, "Accumulates tree[j] while stripping the lowest set bit via j −= lowbit(j) until j = 0."],
    ["Range Sum (l..r)", FENWICK_INFO.complexity.rangeSum, "Computes prefix(r) − prefix(l − 1) in at most two O(log n) downward walks (skips left walk when l = 0)."],
    ["Space", FENWICK_INFO.complexity.space, "Stores n logical values plus n + 1 tree entries (1-based, tree[0] unused); capped at n = 32 here."],
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

/* ---------- initial starter state (silent O(n) build landed on final frame) ---------- */

handleBuild({ autoPlay: false, silent: true });
suppressStepLive = true;
player.goTo(player.length - 1);
suppressStepLive = false;
announceReady = true;
els.stepMessage.setAttribute("aria-live", "polite");
