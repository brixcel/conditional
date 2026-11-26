/**
 * Trie (Prefix Tree) page controller (G9).
 * Logic comes from src/structures/trie.js; coordinates from src/core/tree-layout.js;
 * playback & shortcuts from src/core/step-player.js and src/core/player-keys.js.
 * Reuses main.css sections 14-16 classes — zero inline attribute writes, zero raw HTML writes.
 */
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import { layoutGeneralTree } from "../core/tree-layout.js";
import {
    Trie,
    TRIE_INFO,
    WORD_LIMITS,
    validateWord,
    parseWordListInput,
} from "../structures/trie.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const LAYOUT_OPTS = { levelGap: 88, minGap: 68 };
const TREE_PAD_X = 32;
const TREE_PAD_TOP = 38;
const TREE_PAD_BOTTOM = 32;
const NODE_RADIUS = 19;
const END_RING_RADIUS = 14.5;
const STAR_OFFSET_X = 16;
const STAR_OFFSET_Y = -14;

const RANDOM_WORD_FAMILIES = [
    ["cat", "car", "card", "care", "cart"],
    ["dog", "door", "dot", "dove"],
    ["app", "apple", "apply", "apt"],
    ["bat", "bath", "ball", "band"],
    ["sun", "star", "start", "stay"],
    ["tree", "trie", "trip", "try"],
    ["cod", "code", "coder", "coin"],
];

const OP_HEADINGS = {
    insert: "Pseudocode (Insert)",
    search: "Pseudocode (Search)",
    startsWith: "Pseudocode (Starts With)",
    wordsWithPrefix: "Pseudocode (Autocomplete)",
    delete: "Pseudocode (Delete)",
    clear: "Pseudocode (Clear)",
};

const OP_LABELS = {
    insert: "Insert",
    search: "Search",
    startsWith: "Starts With",
    wordsWithPrefix: "Autocomplete",
    delete: "Delete",
    clear: "Clear",
};

const $ = (id) => document.getElementById(id);

const els = {
    wordForm: $("wordForm"),
    wordInput: $("wordInput"),
    insertBtn: $("insertBtn"),
    searchBtn: $("searchBtn"),
    startsWithBtn: $("startsWithBtn"),
    autocompleteBtn: $("autocompleteBtn"),
    deleteBtn: $("deleteBtn"),
    clearBtn: $("clearBtn"),
    buildForm: $("buildForm"),
    buildInput: $("buildInput"),
    buildBtn: $("buildBtn"),
    randomBtn: $("randomBtn"),
    errorBanner: $("trieError"),
    statusBanner: $("trieStatus"),
    resetBtn: $("resetBtn"),
    stepBackBtn: $("stepBackBtn"),
    playBtn: $("playBtn"),
    playIcon: $("playIcon"),
    playLabel: $("playLabel"),
    stepFwdBtn: $("stepFwdBtn"),
    speed: $("speedSelect"),
    progress: $("progress"),
    counter: $("stepCounter"),
    prefixTiles: $("prefixTiles"),
    prefixReadout: $("prefixReadout"),
    treeStage: $("treeStage"),
    svg: $("trieSvg"),
    svgTitle: $("trieSvgTitle"),
    svgDesc: $("trieSvgDesc"),
    wordsStageLabel: $("wordsStageLabel"),
    wordsStage: $("wordsStage"),
    stepMessage: $("stepMessage"),
    codeHeading: $("codeHeading"),
    code: $("pseudocode"),
    statWords: $("statWords"),
    statNodes: $("statNodes"),
    statPrefix: $("statPrefix"),
    statOperation: $("statOperation"),
    statIntegrity: $("statIntegrity"),
};

const reducedMotionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function prefersReducedMotion() {
    return Boolean(reducedMotionQuery && reducedMotionQuery.matches);
}

let trie = new Trie(WORD_LIMITS.maxWords, WORD_LIMITS.maxNodes);
let currentCodeKey = "";
let lastRenderedStep = null;
let lastTopoKey = "";
let lastNodePosMap = new Map(); // id -> { entry, pos }
let lastEdgeEntries = [];       // [{ fromId, toId, entry }]
let notifyTimerId = 0;
let revealRafId = 0;
let announceReady = false;
let suppressStepLive = false;

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

const edgesLayer = svgEl("g", { class: "tr-edges-layer" });
const nodesLayer = svgEl("g", { class: "tr-nodes-layer" });
els.svg.append(edgesLayer, nodesLayer);

const edgePool = [];   // [{ g, lineEl, textEl }]
const nodePool = [];   // [{ g, titleEl, circleEl, endRingEl, valueEl, starEl, rootTagEl }]
const prefixPool = []; // [{ li, glyph, sr }]
const wordPool = [];   // [{ li, lbl, box, sr }]

const wordsEmptyItem = document.createElement("li");
wordsEmptyItem.className = "text-muted text-italic hp-empty tr-hidden";
els.wordsStage.append(wordsEmptyItem);

function ensureEdgePool(needed) {
    while (edgePool.length < needed) {
        const g = svgEl("g", { class: "tr-edge-group tr-hidden" });
        const lineEl = svgEl("line", { class: "hp-edge tr-edge" });
        const textEl = svgEl("text", { class: "tr-edge-label" });
        g.append(lineEl, textEl);
        edgesLayer.append(g);
        edgePool.push({ g, lineEl, textEl });
    }
}

function ensureNodePool(needed) {
    while (nodePool.length < needed) {
        const g = svgEl("g", { class: "hp-node tr-hidden" });
        const titleEl = svgEl("title");
        const circleEl = svgEl("circle", { class: "hp-node-circle", r: NODE_RADIUS });
        const endRingEl = svgEl("circle", { class: "tr-node-end-ring", r: END_RING_RADIUS });
        const valueEl = svgEl("text", { class: "hp-node-value" });
        const starEl = svgEl("text", { class: "tr-end-marker", "aria-hidden": "true" });
        starEl.textContent = "★";
        const rootTagEl = svgEl("text", { class: "hp-node-index tr-hidden" });
        rootTagEl.textContent = "ROOT";
        g.append(titleEl, circleEl, endRingEl, valueEl, starEl, rootTagEl);
        nodesLayer.append(g);
        nodePool.push({ g, titleEl, circleEl, endRingEl, valueEl, starEl, rootTagEl });
    }
}

function ensurePrefixPool(needed) {
    while (prefixPool.length < needed) {
        const li = document.createElement("li");
        li.className = "tr-prefix-tile tr-hidden";

        const glyph = document.createElement("span");
        glyph.setAttribute("aria-hidden", "true");

        const sr = document.createElement("span");
        sr.className = "visually-hidden";

        li.append(glyph, sr);
        els.prefixTiles.append(li);
        prefixPool.push({ li, glyph, sr });
    }
}

function ensureWordPool(needed) {
    while (wordPool.length < needed) {
        const li = document.createElement("li");
        li.className = "slot-wrap tr-hidden";

        const lbl = document.createElement("span");
        lbl.className = "slot-label mono";
        lbl.setAttribute("aria-hidden", "true");

        const box = document.createElement("div");
        box.className = "node-box hp-cell bst-cell tr-word-pill mono";
        box.setAttribute("aria-hidden", "true");

        const sr = document.createElement("span");
        sr.className = "bst-sr-only";

        li.append(lbl, box, sr);
        els.wordsStage.append(li);
        wordPool.push({ li, lbl, box, sr });
    }
}

/* ---------- feedback banners & screen-reader announcements ---------- */

const LIVE_BASE_CLASS = "alert-banner alert-live bst-live";

function setFieldValidity(input, isInvalid) {
    input.setAttribute("aria-invalid", isInvalid ? "true" : "false");
    if (isInvalid) {
        input.setAttribute("aria-describedby", "trieError");
    } else {
        input.removeAttribute("aria-describedby");
    }
}

function clearBanner(el) {
    el.textContent = "";
    el.className = LIVE_BASE_CLASS;
}

/**
 * Shows inline feedback without duplicate screen-reader announcements:
 * - Errors write to `#trieError` (static `role="alert"`, never `[hidden]`).
 * - Status/info/success/warning messages write to visual `#trieStatus` and
 *   announce politely via `window.DSA_UI.announce`.
 */
function notify(msg, type = "info", invalidField = null) {
    if (notifyTimerId) {
        clearTimeout(notifyTimerId);
        notifyTimerId = 0;
    }

    setFieldValidity(els.wordInput, invalidField === "word");
    setFieldValidity(els.buildInput, invalidField === "build");

    if (!msg) {
        clearBanner(els.errorBanner);
        clearBanner(els.statusBanner);
        if (announceReady) window.DSA_UI?.announce?.("", "polite");
        return;
    }

    const isError = type === "error";
    if (isError) {
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

/* ---------- snapshot analysis & integrity ---------- */

function stepHighlightClass(type) {
    if (type === "visit") return "hp-compare";
    if (type === "create-node") return "hp-select";
    if (type === "mark-end" || type === "found" || type === "collect" || type === "done") return "hp-settled";
    if (
        type === "unmark-end" ||
        type === "prune" ||
        type === "not-found" ||
        type === "duplicate" ||
        type === "overflow"
    ) {
        return "hp-swap";
    }
    return "";
}

/**
 * Pure snapshot summary: computes prefix strings, alphabetical stored words,
 * topology key, and structural invariants for the currently displayed frame.
 */
function analyzeSnapshot(snapshot, stepType) {
    const byId = new Map();
    for (const node of snapshot.nodes) {
        byId.set(node.id, node);
    }

    const prefixById = new Map();
    const storedWords = [];
    const seen = new Set();
    const topoTokens = [];
    let endCount = 0;
    let structuralErr = null;

    if (snapshot.rootId === null || !byId.has(snapshot.rootId)) {
        return {
            byId,
            prefixById,
            storedWords,
            topoKey: "empty",
            integrityText: "Error (missing root)",
        };
    }

    const rootNode = byId.get(snapshot.rootId);
    if (rootNode.char !== "" || rootNode.isEnd) {
        structuralErr = "invalid root";
    }

    function walk(id, builtPrefix, isRoot) {
        if (seen.has(id)) {
            structuralErr = structuralErr || `cycle at #${id}`;
            return;
        }
        const node = byId.get(id);
        if (!node) return;
        seen.add(id);
        prefixById.set(id, builtPrefix);

        if (node.isEnd) {
            endCount++;
            storedWords.push({ word: builtPrefix, endNodeId: id });
        }

        const children = Array.isArray(node.children) ? node.children : [];
        if (!isRoot && children.length === 0 && !node.isEnd) {
            structuralErr = structuralErr || `dangling leaf #${id}`;
        }

        topoTokens.push(`${id}:${node.char}[${children.join(",")}]`);
        for (const childId of children) {
            const child = byId.get(childId);
            if (!child) continue;
            walk(childId, builtPrefix + child.char, false);
        }
    }

    walk(snapshot.rootId, "", true);

    if (seen.size !== snapshot.nodeCount) {
        structuralErr = structuralErr || `nodes ${seen.size} ≠ ${snapshot.nodeCount}`;
    } else if (endCount !== snapshot.size) {
        structuralErr = structuralErr || `words ${endCount} ≠ ${snapshot.size}`;
    }

    let integrityText = "OK";
    if (stepType === "create-node") {
        integrityText = "Inserting…";
    } else if (stepType === "unmark-end" || stepType === "prune") {
        integrityText = "Pruning…";
    } else if (structuralErr !== null) {
        integrityText = `Error (${structuralErr})`;
    }

    return {
        byId,
        prefixById,
        storedWords,
        topoKey: `${snapshot.rootId}|${topoTokens.join(";")}`,
        integrityText,
    };
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
    const op = TRIE_INFO.pseudocode[step.operation] ? step.operation : "insert";
    if (op !== currentCodeKey) {
        currentCodeKey = op;
        els.codeHeading.textContent = OP_HEADINGS[op] ?? "Pseudocode";
        els.code.replaceChildren(
            ...TRIE_INFO.pseudocode[op].map((line) => {
                const li = document.createElement("li");
                li.textContent = line;
                return li;
            }),
        );
    }

    const activeLine = step.line ?? 0;
    [...els.code.children].forEach((li, i) => {
        li.classList.toggle("active", i + 1 === activeLine);
    });
}

/* ---------- prefix strip rendering (pooled) ---------- */

function renderPrefixStrip(step) {
    const prefix = typeof step.prefix === "string" ? step.prefix : "";
    const toneClass = stepHighlightClass(step.type);

    if (prefix.length === 0) {
        ensurePrefixPool(1);
        const slot = prefixPool[0];
        slot.li.className = "tr-prefix-tile tr-tile-root";
        slot.glyph.textContent = "∅";
        slot.sr.textContent = "Empty prefix (root)";
        for (let i = 1; i < prefixPool.length; i++) {
            prefixPool[i].li.className = "tr-prefix-tile tr-hidden";
            prefixPool[i].glyph.textContent = "";
            prefixPool[i].sr.textContent = "";
        }
        els.prefixReadout.textContent = "∅ (root)";
        return;
    }

    ensurePrefixPool(prefix.length);
    for (let i = 0; i < prefix.length; i++) {
        const slot = prefixPool[i];
        const ch = prefix[i];
        const isLast = i === prefix.length - 1;
        const classes = ["tr-prefix-tile"];
        if (isLast && toneClass) classes.push(toneClass);
        slot.li.className = classes.join(" ");
        slot.glyph.textContent = ch;
        slot.sr.textContent = `Character ${i + 1}: ${ch}`;
    }
    for (let i = prefix.length; i < prefixPool.length; i++) {
        prefixPool[i].li.className = "tr-prefix-tile tr-hidden";
        prefixPool[i].glyph.textContent = "";
        prefixPool[i].sr.textContent = "";
    }
    els.prefixReadout.textContent = `"${prefix}" (len ${prefix.length})`;
}

/* ---------- SVG Trie rendering (pooled) ---------- */

function syncSvgLayout(snap, stats) {
    const layout = layoutGeneralTree(snap, LAYOUT_OPTS);
    const svgW = Math.max(120, Math.ceil(layout.width + TREE_PAD_X * 2));
    const svgH = Math.max(100, Math.ceil(layout.height + TREE_PAD_TOP + TREE_PAD_BOTTOM));

    els.svg.setAttribute("width", String(svgW));
    els.svg.setAttribute("height", String(svgH));
    els.svg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);

    const layoutById = new Map(layout.nodes.map((n) => [n.id, n]));

    ensureEdgePool(layout.edges.length);
    lastEdgeEntries = [];
    for (let i = 0; i < layout.edges.length; i++) {
        const edge = layout.edges[i];
        const from = layoutById.get(edge.from);
        const to = layoutById.get(edge.to);
        const entry = edgePool[i];
        if (!from || !to) {
            entry.g.setAttribute("class", "tr-edge-group tr-hidden");
            continue;
        }
        const x1 = from.x + TREE_PAD_X;
        const y1 = from.y + TREE_PAD_TOP;
        const x2 = to.x + TREE_PAD_X;
        const y2 = to.y + TREE_PAD_TOP;

        entry.lineEl.setAttribute("x1", x1.toFixed(1));
        entry.lineEl.setAttribute("y1", y1.toFixed(1));
        entry.lineEl.setAttribute("x2", x2.toFixed(1));
        entry.lineEl.setAttribute("y2", y2.toFixed(1));

        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        entry.textEl.setAttribute("x", mx.toFixed(1));
        entry.textEl.setAttribute("y", my.toFixed(1));

        const childNode = stats.byId.get(edge.to);
        entry.textEl.textContent = childNode ? childNode.char : "";

        lastEdgeEntries.push({ fromId: edge.from, toId: edge.to, entry });
    }
    for (let i = layout.edges.length; i < edgePool.length; i++) {
        edgePool[i].g.setAttribute("class", "tr-edge-group tr-hidden");
    }

    ensureNodePool(layout.nodes.length);
    lastNodePosMap = new Map();
    for (let i = 0; i < layout.nodes.length; i++) {
        const pos = layout.nodes[i];
        const entry = nodePool[i];
        const cx = pos.x + TREE_PAD_X;
        const cy = pos.y + TREE_PAD_TOP;
        const cxStr = cx.toFixed(1);
        const cyStr = cy.toFixed(1);

        entry.circleEl.setAttribute("cx", cxStr);
        entry.circleEl.setAttribute("cy", cyStr);
        entry.endRingEl.setAttribute("cx", cxStr);
        entry.endRingEl.setAttribute("cy", cyStr);
        entry.valueEl.setAttribute("x", cxStr);
        entry.valueEl.setAttribute("y", cyStr);
        entry.starEl.setAttribute("x", (cx + STAR_OFFSET_X).toFixed(1));
        entry.starEl.setAttribute("y", (cy + STAR_OFFSET_Y).toFixed(1));
        entry.rootTagEl.setAttribute("x", cxStr);
        entry.rootTagEl.setAttribute("y", (cy - NODE_RADIUS - 8).toFixed(1));

        lastNodePosMap.set(pos.id, { entry, pos });
    }
    for (let i = layout.nodes.length; i < nodePool.length; i++) {
        nodePool[i].g.setAttribute("class", "hp-node tr-hidden");
    }

    lastTopoKey = stats.topoKey;
}

function renderTrieSvg(step, stats) {
    const snap = step.snapshot;
    if (stats.topoKey !== lastTopoKey) {
        syncSvgLayout(snap, stats);
    }

    const wordsSummary = stats.storedWords.length > 0
        ? stats.storedWords.map((w) => w.word).join(", ")
        : "none";
    els.svgTitle.textContent =
        `Trie with ${snap.size} word${snap.size === 1 ? "" : "s"} and ${snap.nodeCount} node${snap.nodeCount === 1 ? "" : "s"}`;
    const prefixDesc = step.prefix ? `"${step.prefix}"` : "empty (root)";
    els.svgDesc.textContent =
        `${step.message} Current prefix: ${prefixDesc}. Stored words: ${wordsSummary}.`;

    const activeIds = Array.isArray(step.nodeIds) ? step.nodeIds : [];
    const pathIds = Array.isArray(step.pathIds) ? step.pathIds : [];
    const activeSet = new Set(activeIds);
    const pathSet = new Set(pathIds);
    const toneClass = stepHighlightClass(step.type);

    const pathEdgeKeys = new Set();
    for (let k = 0; k < pathIds.length - 1; k++) {
        pathEdgeKeys.add(`${pathIds[k]}->${pathIds[k + 1]}`);
    }

    for (const { fromId, toId, entry } of lastEdgeEntries) {
        const key = `${fromId}->${toId}`;
        const onPath = pathEdgeKeys.has(key);
        const isActiveEdge = onPath && activeSet.has(toId) && Boolean(toneClass);

        if (isActiveEdge) {
            entry.g.setAttribute("class", `tr-edge-group ${toneClass}`);
        } else if (onPath) {
            entry.g.setAttribute("class", "tr-edge-group bst-path");
        } else {
            entry.g.setAttribute("class", "tr-edge-group");
        }
    }

    for (const [id, { entry }] of lastNodePosMap.entries()) {
        const snapNode = stats.byId.get(id);
        if (!snapNode) {
            entry.g.setAttribute("class", "hp-node tr-hidden");
            continue;
        }

        const isRoot = id === snap.rootId;
        const isEnd = Boolean(snapNode.isEnd);
        const isActive = activeSet.has(id) && Boolean(toneClass);
        const isOnPath = !isActive && pathSet.has(id);

        const classes = ["hp-node"];
        if (isRoot) classes.push("hp-root");
        if (isEnd) classes.push("tr-node-end");
        if (isActive) classes.push(toneClass);
        else if (isOnPath) classes.push("bst-path");

        entry.g.setAttribute("class", classes.join(" "));
        const nextVal = isRoot ? "∅" : snapNode.char;
        if (entry.valueEl.textContent !== nextVal) entry.valueEl.textContent = nextVal;
        const nextRootClass = isRoot ? "hp-node-index" : "hp-node-index tr-hidden";
        if (entry.rootTagEl.getAttribute("class") !== nextRootClass) {
            entry.rootTagEl.setAttribute("class", nextRootClass);
        }

        const nodePrefix = stats.prefixById.get(id) ?? "";
        const nextTitle = isRoot
            ? `Root node #${id} (empty prefix)`
            : `Node #${id}: "${snapNode.char}" (prefix "${nodePrefix}") — ${isEnd ? "word end" : "internal node"}`;
        if (entry.titleEl.textContent !== nextTitle) entry.titleEl.textContent = nextTitle;
    }

    const focusId = activeIds.length > 0
        ? activeIds[activeIds.length - 1]
        : (pathIds.length > 0 ? pathIds[pathIds.length - 1] : null);
    return focusId !== null && lastNodePosMap.has(focusId)
        ? lastNodePosMap.get(focusId).entry.g
        : null;
}

/* ---------- autocomplete / stored words list rendering (pooled) ---------- */

function renderWordsPanel(step, stats) {
    const isAutocomplete = step.operation === "wordsWithPrefix" && Array.isArray(step.matches);

    if (isAutocomplete) {
        const matches = step.matches;
        const count = matches.length;
        els.wordsStageLabel.textContent = `Autocomplete Matches (${count})`;

        if (count === 0) {
            wordsEmptyItem.textContent = step.type === "not-found"
                ? "No stored words match this prefix."
                : step.line === 1
                    ? "Walking prefix edges — no matches collected yet."
                    : "Exploring prefix subtree (DFS) — no complete words collected yet.";
            wordsEmptyItem.className = "text-muted text-italic hp-empty";
            for (const slot of wordPool) slot.li.className = "slot-wrap tr-hidden";
            return null;
        }

        wordsEmptyItem.className = "text-muted text-italic hp-empty tr-hidden";
        ensureWordPool(count);

        const isCollect = step.type === "collect";
        const lastIdx = count - 1;

        for (let i = 0; i < count; i++) {
            const word = matches[i];
            const isNewest = isCollect && i === lastIdx;
            const slot = wordPool[i];

            slot.li.className = "slot-wrap";
            slot.lbl.className = isNewest ? "slot-label slot-label-active mono" : "slot-label mono";
            slot.lbl.textContent = `#${i + 1}`;
            slot.box.className = `node-box hp-cell bst-cell tr-word-pill mono ${isNewest ? "hp-compare" : "hp-settled"}`;
            slot.box.textContent = word;
            slot.sr.textContent = `Autocomplete match ${i + 1}: ${word}${isNewest ? " (collected now)" : ""}`;
        }
        for (let i = count; i < wordPool.length; i++) {
            wordPool[i].li.className = "slot-wrap tr-hidden";
        }

        return wordPool[lastIdx].li;
    }

    const words = stats.storedWords;
    const count = words.length;
    els.wordsStageLabel.textContent = `Stored Words (${count} / ${step.snapshot.maxWords})`;

    if (count === 0) {
        wordsEmptyItem.textContent = "Trie is empty (0 stored words). Insert a word or build from a word list.";
        wordsEmptyItem.className = "text-muted text-italic hp-empty";
        for (const slot of wordPool) slot.li.className = "slot-wrap tr-hidden";
        return null;
    }

    wordsEmptyItem.className = "text-muted text-italic hp-empty tr-hidden";
    ensureWordPool(count);

    const activeSet = new Set(Array.isArray(step.nodeIds) ? step.nodeIds : []);
    const toneClass = stepHighlightClass(step.type);
    let activeItem = null;

    for (let i = 0; i < count; i++) {
        const entry = words[i];
        const isActive = step.type !== "prune" && activeSet.has(entry.endNodeId) && Boolean(toneClass);
        const slot = wordPool[i];

        slot.li.className = "slot-wrap";
        slot.lbl.className = isActive ? "slot-label slot-label-active mono" : "slot-label mono";
        slot.lbl.textContent = `[${i + 1}]`;

        const boxClasses = ["node-box", "hp-cell", "bst-cell", "tr-word-pill", "mono"];
        if (isActive) boxClasses.push(toneClass);
        slot.box.className = boxClasses.join(" ");
        slot.box.textContent = entry.word;
        slot.sr.textContent = `Stored word ${i + 1}: ${entry.word}${isActive ? ` (${step.type})` : ""}`;

        if (isActive) activeItem = slot.li;
    }
    for (let i = count; i < wordPool.length; i++) {
        wordPool[i].li.className = "slot-wrap tr-hidden";
    }

    return activeItem;
}

/* ---------- main render ---------- */

function render(step, index, p) {
    const activeBefore = document.activeElement;
    const stepChanged = step !== lastRenderedStep;
    lastRenderedStep = step;

    if (stepChanged) {
        const snap = step.snapshot;
        const stats = analyzeSnapshot(snap, step.type);

        updatePseudocode(step);
        renderPrefixStrip(step);
        const treeTarget = renderTrieSvg(step, stats);
        const wordTarget = renderWordsPanel(step, stats);
        scheduleReveal([
            [els.treeStage, treeTarget],
            [els.wordsStage, wordTarget],
        ]);

        // Set aria-live BEFORE updating textContent so startup, initial load, and autoplay stay quiet
        // while manual stepping and autoplay completion announce cleanly without duplicating notify().
        const liveMode = p.isPlaying || suppressStepLive || !announceReady ? "off" : "polite";
        els.stepMessage.setAttribute("aria-live", liveMode);
        els.stepMessage.textContent = step.message;

        els.statWords.textContent = `${snap.size} / ${snap.maxWords}`;
        els.statNodes.textContent = `${snap.nodeCount} / ${snap.maxNodes}`;
        els.statPrefix.textContent = step.prefix ? `"${step.prefix}"` : "∅ (root)";
        els.statOperation.textContent = OP_LABELS[step.operation] ?? step.operation;
        els.statIntegrity.textContent = stats.integrityText;
    } else {
        const liveMode = p.isPlaying || suppressStepLive || !announceReady ? "off" : "polite";
        els.stepMessage.setAttribute("aria-live", liveMode);
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
        els.wordInput,
    );
}

/* ---------- playback helpers ---------- */

function loadSteps(steps, { autoPlay = true } = {}) {
    if (!steps || steps.length === 0) return;
    lastRenderedStep = null;
    suppressStepLive = true;
    player.load(steps);
    suppressStepLive = false;
    if (autoPlay && steps.length > 1 && !prefersReducedMotion()) {
        player.play();
    }
}

function isDrawerOpen() {
    return Boolean(document.getElementById("sideNavbar")?.classList.contains("active"));
}

const playerControls = {
    toggle() {
        if (isDrawerOpen() || player.length <= 1) return;
        player.toggle();
    },
    pause() {
        if (isDrawerOpen()) return;
        player.pause();
    },
    next() {
        if (isDrawerOpen()) return;
        player.next();
    },
    prev() {
        if (isDrawerOpen()) return;
        player.prev();
    },
    reset() {
        if (isDrawerOpen()) return;
        player.reset();
    },
};

/* ---------- operation handlers ---------- */

function readValidWord(label = "Word") {
    const checked = validateWord(els.wordInput.value, { label });
    if (!checked.ok) {
        notify(checked.error, "error", "word");
        els.wordInput.focus();
        return null;
    }
    return checked.value;
}

function handleInsert() {
    const word = readValidWord("Word");
    if (word === null) return;

    const res = trie.insert(word);
    if (!res.ok) {
        loadSteps(res.steps, { autoPlay: res.steps.length > 1 });
        notify(res.error, "error");
        return;
    }

    loadSteps(res.steps);
    notify(
        `Inserted "${res.value.word}" (${res.value.createdNodes} new node${res.value.createdNodes === 1 ? "" : "s"}; ${trie.size}/${trie.maxWords} words).`,
        "success",
    );
    els.wordInput.value = "";
    els.wordInput.focus();
}

function handleSearch() {
    const word = readValidWord("Word");
    if (word === null) return;

    const res = trie.search(word);
    loadSteps(res.steps);
    if (res.value.found) {
        notify(`Found word "${res.value.word}" in the trie.`, "success");
    } else {
        notify(`Word "${res.value.word}" is not stored in the trie.`, "warning");
    }
}

function handleStartsWith() {
    const prefix = readValidWord("Prefix");
    if (prefix === null) return;

    const res = trie.startsWith(prefix);
    loadSteps(res.steps);
    if (res.value.found) {
        notify(`Prefix "${res.value.prefix}" exists in the trie.`, "success");
    } else {
        notify(`No stored word starts with "${res.value.prefix}".`, "warning");
    }
}

function handleAutocomplete() {
    const prefix = readValidWord("Prefix");
    if (prefix === null) return;

    const res = trie.wordsWithPrefix(prefix);
    loadSteps(res.steps);
    const count = res.value.length;
    if (count === 0) {
        notify(`Autocomplete for "${prefix}": 0 matching words.`, "warning");
    } else {
        notify(
            `Autocomplete for "${prefix}" found ${count} word${count === 1 ? "" : "s"}: ${res.value.join(", ")}.`,
            "info",
        );
    }
}

function handleDelete() {
    const word = readValidWord("Word");
    if (word === null) return;

    const res = trie.delete(word);
    loadSteps(res.steps);
    if (!res.ok) {
        notify(res.error, "error");
        return;
    }

    const { outcome, prunedCount } = res.value;
    const outcomeDetail =
        outcome === "unmark-only"
            ? "unmark-only (0 nodes pruned — still a prefix of longer word(s))"
            : outcome === "full-prune"
                ? `full-prune (${prunedCount} node${prunedCount === 1 ? "" : "s"} pruned back to root)`
                : `partial-prune (${prunedCount} unused node${prunedCount === 1 ? "" : "s"} pruned)`;

    notify(`Deleted "${res.value.word}": ${outcomeDetail}.`, "info");
    els.wordInput.value = "";
    els.wordInput.focus();
}

function handleClear() {
    const res = trie.clear();
    loadSteps(res.steps, { autoPlay: false });
    notify(`Cleared ${res.value} word${res.value === 1 ? "" : "s"}. Only the root node remains.`, "info");
}

function handleBuild({ autoPlay = true, silent = false } = {}) {
    const parsed = parseWordListInput(els.buildInput.value, {
        maxWords: WORD_LIMITS.maxWords,
        allowDuplicates: false,
    });
    if (!parsed.ok) {
        notify(parsed.error, "error", "build");
        els.buildInput.focus();
        return false;
    }

    const nextTrie = new Trie(WORD_LIMITS.maxWords, WORD_LIMITS.maxNodes);
    const allSteps = [];
    for (const w of parsed.words) {
        const res = nextTrie.insert(w);
        if (!res.ok) {
            notify(res.error, "error", "build");
            els.buildInput.focus();
            return false;
        }
        allSteps.push(...res.steps);
    }

    trie = nextTrie;
    loadSteps(allSteps, { autoPlay });
    if (!silent) {
        notify(
            `Built trie with ${trie.size} word${trie.size === 1 ? "" : "s"} (${trie.nodeCount}/${trie.maxNodes} nodes).`,
            "success",
        );
    }
    return true;
}

function pickRandomWords() {
    const families = RANDOM_WORD_FAMILIES.slice();
    for (let i = families.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [families[i], families[j]] = [families[j], families[i]];
    }

    // Pick 3 words from family 0 (shared prefix + prefix-is-word), 2–3 from family 1, and 1–2 from family 2
    // so unmark-only, partial-prune, and full-prune are all immediately testable.
    const chosen = [
        ...families[0].slice(0, 3),
        ...families[1].slice(0, 3),
        families[2][0],
    ];
    return chosen;
}

function handleRandomWords() {
    const words = pickRandomWords();
    els.buildInput.value = words.join(", ");
    handleBuild({ autoPlay: true });
}

/* ---------- event bindings ---------- */

els.wordForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleInsert();
});

els.buildForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleBuild();
});

els.searchBtn.addEventListener("click", handleSearch);
els.startsWithBtn.addEventListener("click", handleStartsWith);
els.autocompleteBtn.addEventListener("click", handleAutocomplete);
els.deleteBtn.addEventListener("click", handleDelete);
els.clearBtn.addEventListener("click", handleClear);
els.randomBtn.addEventListener("click", handleRandomWords);

els.playBtn.addEventListener("click", () => playerControls.toggle());
els.stepFwdBtn.addEventListener("click", () => {
    player.pause();
    player.next();
});
els.stepBackBtn.addEventListener("click", () => player.prev());
els.resetBtn.addEventListener("click", () => player.reset());
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value)));
els.progress.addEventListener("input", () => {
    const target = Number(els.progress.value);
    player.pause();
    player.goTo(target);
});

bindPlayerKeys(document, playerControls);

/* ---------- concept card & complexity table population ---------- */

$("trieName").textContent = TRIE_INFO.name;
$("trieSummary").textContent = TRIE_INFO.summary;
$("cxInsert").textContent = TRIE_INFO.complexity.insert;
$("cxSearch").textContent = TRIE_INFO.complexity.search;
$("cxStartsWith").textContent = TRIE_INFO.complexity.startsWith;
$("cxAutocomplete").textContent = TRIE_INFO.complexity.wordsWithPrefix;
$("cxDelete").textContent = TRIE_INFO.complexity.delete;
$("cxSpace").textContent = TRIE_INFO.complexity.space;

const CX_ROWS = [
    ["Insert", TRIE_INFO.complexity.insert, "Follows shared prefix edges; allocates nodes only for missing suffix letters."],
    ["Search", TRIE_INFO.complexity.search, "Walks L edges; succeeds only if final node has isEnd === true."],
    ["Starts with", TRIE_INFO.complexity.startsWith, "Walks L prefix edges; ignores isEnd on the target node."],
    ["Autocomplete (wordsWithPrefix)", TRIE_INFO.complexity.wordsWithPrefix, "Walks L prefix edges in O(L), then DFS traverses the prefix subtree in alphabetical order to collect K total output characters."],
    ["Delete", TRIE_INFO.complexity.delete, "Unmarks isEnd and prunes unused nodes bottom-up until a branch or another word end."],
    ["Space", TRIE_INFO.complexity.space, "Worst case when no prefixes are shared (one node per character); shared prefixes reuse ancestor nodes. Bounded here to 20 words and 120 nodes."],
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

/* ---------- initial starter trie (silent, landed on final frame) ---------- */

handleBuild({ autoPlay: false, silent: true });
player.goTo(player.length - 1);
announceReady = true;
els.stepMessage.setAttribute("aria-live", "polite");
