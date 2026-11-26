/**
 * Binary Search Tree page controller (G8).
 * Logic comes from src/structures/bst.js; coordinates from src/core/tree-layout.js;
 * input parsing reuses src/core/validate.js and src/algorithms/sorting.js.
 * Reuses main.css section 14/15 classes — zero inline style writes, zero HTML string injection.
 */
import { StepPlayer } from "../core/step-player.js";
import { parseInteger } from "../core/validate.js";
import { layoutBinaryTree } from "../core/tree-layout.js";
import { parseArrayInput } from "../algorithms/sorting.js";
import { BinarySearchTree, BST_INFO, TRAVERSAL_ORDERS } from "../structures/bst.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const BST_CAPACITY = 31;
const VALUE_LIMITS = { min: -99, max: 999 };
const LAYOUT_OPTS = { levelGap: 68, minGap: 48 };
const TREE_PAD_X = 24;
const TREE_PAD_TOP = 28;
const TREE_PAD_BOTTOM = 38;
const NODE_RADIUS = 18;
const RANDOM_COUNT = 9;

const $ = (id) => document.getElementById(id);

const els = {
    keyForm: $("keyForm"),
    valueInput: $("valueInput"),
    insertBtn: $("insertBtn"),
    searchBtn: $("searchBtn"),
    deleteBtn: $("deleteBtn"),
    minBtn: $("minBtn"),
    maxBtn: $("maxBtn"),
    clearBtn: $("clearBtn"),
    traversalForm: $("traversalForm"),
    traversalSelect: $("traversalSelect"),
    traverseBtn: $("traverseBtn"),
    buildForm: $("buildForm"),
    buildInput: $("buildInput"),
    buildBtn: $("buildBtn"),
    randomBtn: $("randomBtn"),
    alertBanner: $("bstAlert"),
    statusBanner: $("bstStatus"),
    resetBtn: $("resetBtn"),
    prevBtn: $("prevBtn"),
    playBtn: $("playBtn"),
    playIcon: $("playIcon"),
    playLabel: $("playLabel"),
    nextBtn: $("nextBtn"),
    speed: $("speedSelect"),
    progress: $("progress"),
    counter: $("stepCounter"),
    treeStageLabel: $("treeStageLabel"),
    treeStage: $("treeStage"),
    traversalStageLabel: $("traversalStageLabel"),
    traversalStage: $("traversalStage"),
    stepMessage: $("stepMessage"),
    codeHeading: $("codeHeading"),
    code: $("pseudocode"),
    statRoot: $("statRoot"),
    statSize: $("statSize"),
    statHeight: $("statHeight"),
    statMin: $("statMin"),
    statMax: $("statMax"),
    statComparisons: $("statComparisons"),
    statValid: $("statValid"),
};

const OP_TITLES = {
    insert: "Pseudocode (Insert)",
    search: "Pseudocode (Search)",
    delete: "Pseudocode (Delete)",
    min: "Pseudocode (Find Minimum)",
    max: "Pseudocode (Find Maximum)",
    inorder: "Pseudocode (In-Order Traversal)",
    preorder: "Pseudocode (Pre-Order Traversal)",
    postorder: "Pseudocode (Post-Order Traversal)",
    levelorder: "Pseudocode (Level-Order Traversal)",
    clear: "Pseudocode (Clear)",
};

const TRAVERSAL_STAGE_LABELS = {
    inorder: "Traversal Output: In-Order (L → Root → R)",
    preorder: "Traversal Output: Pre-Order (Root → L → R)",
    postorder: "Traversal Output: Post-Order (L → R → Root)",
    levelorder: "Traversal Output: Level-Order (BFS)",
};

const TRAVERSAL_NAMES = {
    inorder: "In-Order",
    preorder: "Pre-Order",
    postorder: "Post-Order",
    levelorder: "Level-Order",
};

const reducedMotionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function prefersReducedMotion() {
    return Boolean(reducedMotionQuery && reducedMotionQuery.matches);
}

let bst = new BinarySearchTree(BST_CAPACITY);
let currentCodeKey = "";
let lastRenderedStep = null;
let treePool = null;       // { topoKey, svg, titleEl, descEl, edgeEls, nodeEls }
let traversalPool = null;  // { count, items: [{ li, lbl, box, sr }] }
let notifyRafId = 0;
let revealRafId = 0;
let autoPlaying = false;   // Tracks playback across StepPlayer's timer tick where p.isPlaying dips false.

const player = new StepPlayer({ onStep: render, baseDelay: 750 });
player.setSpeed(Number(els.speed.value) || 1);

function setFieldValidity(input, isInvalid) {
    input.setAttribute("aria-invalid", isInvalid ? "true" : "false");
    if (isInvalid) {
        input.setAttribute("aria-describedby", "bstAlert");
    } else {
        input.removeAttribute("aria-describedby");
    }
}

/**
 * Displays inline feedback using two static live regions (`#bstAlert` with fixed
 * role="alert" for errors, `#bstStatus` with fixed role="status" for info/success/warning).
 * Both stay rendered from page load (never [hidden]) so the first message is announced;
 * only their text and tone class change here. Empty regions collapse via `.bst-live:empty`.
 */
const LIVE_BASE_CLASS = "alert-banner alert-live bst-live";

function clearLive(region) {
    region.textContent = "";
    region.className = LIVE_BASE_CLASS;
}

function notify(msg, type = "info", invalidField = null) {
    if (notifyRafId) {
        cancelAnimationFrame(notifyRafId);
        notifyRafId = 0;
    }

    setFieldValidity(els.valueInput, invalidField === "value");
    setFieldValidity(els.buildInput, invalidField === "build");

    if (!msg) {
        clearLive(els.alertBanner);
        clearLive(els.statusBanner);
        return;
    }

    const isError = type === "error";
    const active = isError ? els.alertBanner : els.statusBanner;
    const other = isError ? els.statusBanner : els.alertBanner;

    clearLive(other);

    const isRepeated = active.textContent === msg;
    active.className = `${LIVE_BASE_CLASS} alert-${type}`;

    if (isRepeated) {
        // Empty then refill on the next frame so an identical message is re-announced.
        active.textContent = "";
        notifyRafId = requestAnimationFrame(() => {
            notifyRafId = 0;
            active.textContent = msg;
        });
    } else {
        active.textContent = msg;
    }
}

function stepHighlightClass(type) {
    if (type === "visit" || type === "go-left" || type === "go-right") return "hp-compare";
    if (type === "find-successor" || type === "copy-successor") return "hp-select";
    if (type === "found" || type === "insert" || type === "done") return "hp-settled";
    if (
        type === "delete-leaf" ||
        type === "delete-one-child" ||
        type === "not-found" ||
        type === "duplicate" ||
        type === "overflow" ||
        type === "empty"
    ) {
        return "hp-swap";
    }
    return "";
}

function updatePseudocode(step) {
    const op = BST_INFO.pseudocode[step.operation] ? step.operation : "insert";
    if (op !== currentCodeKey) {
        currentCodeKey = op;
        els.codeHeading.textContent = OP_TITLES[op] ?? "Pseudocode";
        els.code.replaceChildren(
            ...BST_INFO.pseudocode[op].map((line) => {
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

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, String(v));
    }
    return el;
}

/**
 * Pure BST-order check on a step snapshot: the in-order walk must be strictly
 * increasing and reach exactly `snapshot.size` nodes. Returns null when valid.
 */
function snapshotOrderError(snapshot, stats) {
    const order = stats.inorderNodes;
    for (let i = 1; i < order.length; i++) {
        if (order[i].value <= order[i - 1].value) {
            return `in-order ${order[i].value} follows ${order[i - 1].value}`;
        }
    }
    if (order.length !== snapshot.size) {
        return `${order.length} reachable nodes, size ${snapshot.size}`;
    }
    return null;
}

/**
 * Pure snapshot summary so stats, topology key, and live in-order keys match the
 * currently displayed frame without recomputing layout when topology is unchanged.
 */
function analyzeSnapshot(snapshot) {
    const byId = new Map();
    for (const node of snapshot.nodes) {
        byId.set(node.id, node);
    }

    if (snapshot.rootId === null || !byId.has(snapshot.rootId)) {
        return {
            byId,
            rootValue: null,
            height: -1,
            min: null,
            max: null,
            inorderNodes: [],
            topoKey: "empty",
        };
    }

    const seen = new Set();
    const inorderNodes = [];
    const edgeTokens = [];

    function walk(id) {
        if (id === null || seen.has(id)) return -1;
        const node = byId.get(id);
        if (!node) return -1;
        seen.add(id);
        if (node.left !== null && byId.has(node.left)) edgeTokens.push(`${id}L${node.left}`);
        const lh = walk(node.left);
        inorderNodes.push({ id: node.id, value: node.value });
        if (node.right !== null && byId.has(node.right)) edgeTokens.push(`${id}R${node.right}`);
        const rh = walk(node.right);
        return 1 + Math.max(lh, rh);
    }

    const height = walk(snapshot.rootId);
    const rootNode = byId.get(snapshot.rootId);

    let minNode = rootNode;
    const minSeen = new Set([minNode.id]);
    while (minNode.left !== null && byId.has(minNode.left) && !minSeen.has(minNode.left)) {
        minNode = byId.get(minNode.left);
        minSeen.add(minNode.id);
    }

    let maxNode = rootNode;
    const maxSeen = new Set([maxNode.id]);
    while (maxNode.right !== null && byId.has(maxNode.right) && !maxSeen.has(maxNode.right)) {
        maxNode = byId.get(maxNode.right);
        maxSeen.add(maxNode.id);
    }

    const topoKey = `${snapshot.rootId}|${inorderNodes.map((nd) => nd.id).join(",")}|${edgeTokens.join(",")}`;

    return {
        byId,
        rootValue: rootNode.value,
        height,
        min: minNode.value,
        max: maxNode.value,
        inorderNodes,
        topoKey,
    };
}

/**
 * Coalesced rAF scroll helper: batches all layout reads across both scroll regions
 * before issuing scrollTo writes, eliminating mid-render layout thrash.
 */
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

function buildTreePool(snap, topoKey) {
    const layout = layoutBinaryTree(snap, LAYOUT_OPTS);
    const svgW = Math.ceil(layout.width + TREE_PAD_X * 2);
    const svgH = Math.ceil(layout.height + TREE_PAD_TOP + TREE_PAD_BOTTOM);

    const svg = svgEl("svg", {
        class: "hp-svg bst-svg",
        width: svgW,
        height: svgH,
        viewBox: `0 0 ${svgW} ${svgH}`,
        role: "img",
        "aria-labelledby": "bstSvgTitle",
        "aria-describedby": "bstSvgDesc",
    });

    const titleEl = svgEl("title", { id: "bstSvgTitle" });
    const descEl = svgEl("desc", { id: "bstSvgDesc" });
    svg.append(titleEl, descEl);

    const layoutById = new Map(layout.nodes.map((n) => [n.id, n]));
    const edgeEls = [];

    for (const edge of layout.edges) {
        const from = layoutById.get(edge.from);
        const to = layoutById.get(edge.to);
        if (!from || !to) continue;
        const lineEl = svgEl("line", {
            class: "hp-edge",
            x1: (from.x + TREE_PAD_X).toFixed(1),
            y1: (from.y + TREE_PAD_TOP).toFixed(1),
            x2: (to.x + TREE_PAD_X).toFixed(1),
            y2: (to.y + TREE_PAD_TOP).toFixed(1),
        });
        edgeEls.push({
            key: `${edge.from}->${edge.to}`,
            fromId: edge.from,
            toId: edge.to,
            lineEl,
        });
        svg.append(lineEl);
    }

    const nodeEls = new Map();
    for (const pos of layout.nodes) {
        const cx = pos.x + TREE_PAD_X;
        const cy = pos.y + TREE_PAD_TOP;
        const g = svgEl("g", { class: "hp-node" });

        g.append(
            svgEl("circle", {
                class: "hp-node-circle",
                cx: cx.toFixed(1),
                cy: cy.toFixed(1),
                r: NODE_RADIUS,
            }),
        );

        const valueEl = svgEl("text", {
            class: "hp-node-value",
            x: cx.toFixed(1),
            y: cy.toFixed(1),
        });

        const labelEl = svgEl("text", {
            class: "hp-node-index",
            x: cx.toFixed(1),
            y: (cy + NODE_RADIUS + 13).toFixed(1),
        });

        g.append(valueEl, labelEl);
        svg.append(g);
        nodeEls.set(pos.id, { g, valueEl, labelEl });
    }

    els.treeStage.replaceChildren(svg);
    return { topoKey, svg, titleEl, descEl, edgeEls, nodeEls };
}

function renderTree(step, stats) {
    const snap = step.snapshot;
    const n = stats.inorderNodes.length;

    if (n === 0) {
        treePool = null;
        const empty = document.createElement("p");
        empty.className = "text-muted text-italic hp-empty";
        empty.textContent = "BST is empty. Insert a key or build a tree from a list.";
        els.treeStage.replaceChildren(empty);
        return null;
    }

    if (!treePool || treePool.topoKey !== stats.topoKey) {
        treePool = buildTreePool(snap, stats.topoKey);
    }

    treePool.titleEl.textContent = `Binary Search Tree with ${n} node${n === 1 ? "" : "s"}, root ${stats.rootValue}`;
    treePool.descEl.textContent =
        `${step.message} Height ${stats.height}, min ${stats.min}, max ${stats.max}. ` +
        `In-order keys: ${stats.inorderNodes.map((nd) => nd.value).join(", ")}.`;

    const activeIds = Array.isArray(step.nodeIds) ? step.nodeIds : [];
    const pathIds = Array.isArray(step.pathIds) ? step.pathIds : [];
    const activeSet = new Set(activeIds);
    const pathSet = new Set(pathIds);
    const toneClass = stepHighlightClass(step.type);
    const isTraversalOp = TRAVERSAL_ORDERS.includes(step.operation);
    const isSuccessorStep = step.type === "find-successor" || step.type === "copy-successor";

    const pathEdgeKeys = new Set();
    if (!isTraversalOp) {
        for (let k = 0; k < pathIds.length - 1; k++) {
            pathEdgeKeys.add(`${pathIds[k]}->${pathIds[k + 1]}`);
        }
    }

    for (const { key, fromId, toId, lineEl } of treePool.edgeEls) {
        const bothActive = activeSet.has(fromId) && activeSet.has(toId) && Boolean(toneClass);
        const onPath = pathEdgeKeys.has(key);

        if (bothActive) {
            lineEl.setAttribute("class", `hp-edge ${toneClass}`);
        } else if (onPath) {
            lineEl.setAttribute("class", "hp-edge bst-path");
        } else {
            lineEl.setAttribute("class", "hp-edge");
        }
    }

    for (const [id, entry] of treePool.nodeEls.entries()) {
        const snapNode = stats.byId.get(id);
        if (!snapNode) continue;

        const isRoot = id === snap.rootId;
        const isActive = activeSet.has(id) && Boolean(toneClass);
        const isTraversalDone = isTraversalOp && step.type === "done" && pathSet.has(id);
        const isOnPath = !isActive && !isTraversalDone && pathSet.has(id);

        const classes = ["hp-node"];
        if (isRoot) classes.push("hp-root");
        if (isActive) classes.push(toneClass);
        else if (isTraversalDone) classes.push("hp-settled");
        else if (isOnPath) classes.push("bst-path");

        entry.g.setAttribute("class", classes.join(" "));
        entry.valueEl.textContent = String(snapNode.value);

        let subLabel = isRoot ? "ROOT" : `#${id}`;
        if (isSuccessorStep && activeIds[0] === id) {
            subLabel = "TARGET";
        } else if (isSuccessorStep && activeIds[1] === id) {
            subLabel = "SUCC";
        }
        entry.labelEl.textContent = subLabel;
    }

    const focusId = activeIds.length > 0
        ? activeIds[activeIds.length - 1]
        : (pathIds.length > 0 ? pathIds[pathIds.length - 1] : null);
    return focusId !== null && treePool.nodeEls.has(focusId)
        ? treePool.nodeEls.get(focusId).g
        : null;
}

function mountTraversalPool(count) {
    const items = Array.from({ length: count }, () => {
        const li = document.createElement("li");
        li.className = "slot-wrap";

        const lbl = document.createElement("span");
        lbl.className = "slot-label mono";
        lbl.setAttribute("aria-hidden", "true");

        const box = document.createElement("div");
        box.className = "node-box hp-cell bst-cell mono";
        box.setAttribute("aria-hidden", "true");

        const sr = document.createElement("span");
        sr.className = "bst-sr-only";

        li.append(lbl, box, sr);
        return { li, lbl, box, sr };
    });

    els.traversalStage.replaceChildren(...items.map((it) => it.li));
    traversalPool = { count, items };
}

function renderTraversalOutput(step, stats) {
    const isTraversal = Array.isArray(step.visited);

    if (isTraversal) {
        els.traversalStageLabel.textContent =
            TRAVERSAL_STAGE_LABELS[step.operation] ?? "Traversal Output";

        const count = step.visited.length;
        if (count === 0) {
            traversalPool = null;
            const empty = document.createElement("li");
            empty.className = "text-muted text-italic hp-empty";
            empty.textContent = "No nodes visited (BST is empty).";
            els.traversalStage.replaceChildren(empty);
            return null;
        }

        if (!traversalPool || traversalPool.count !== count) mountTraversalPool(count);

        const isDone = step.type === "done";
        const lastIdx = count - 1;

        for (let i = 0; i < count; i++) {
            const val = step.visited[i];
            const isNewest = !isDone && i === lastIdx;
            const slot = traversalPool.items[i];

            slot.lbl.className = isNewest ? "slot-label slot-label-active mono" : "slot-label mono";
            slot.lbl.textContent = `#${i + 1}`;
            slot.box.className = `node-box hp-cell bst-cell mono ${isNewest ? "hp-compare" : "hp-settled"}`;
            slot.box.textContent = String(val);
            slot.sr.textContent = `Visit ${i + 1}: value ${val}${isNewest ? " (visiting now)" : ""}`;
        }

        return traversalPool.items[lastIdx].li;
    }

    els.traversalStageLabel.textContent = "In-Order Keys (Sorted)";

    const count = stats.inorderNodes.length;
    if (count === 0) {
        traversalPool = null;
        const empty = document.createElement("li");
        empty.className = "text-muted text-italic hp-empty";
        empty.textContent = "BST is empty (0 keys).";
        els.traversalStage.replaceChildren(empty);
        return null;
    }

    if (!traversalPool || traversalPool.count !== count) mountTraversalPool(count);

    const activeSet = new Set(Array.isArray(step.nodeIds) ? step.nodeIds : []);
    const toneClass = stepHighlightClass(step.type);
    let activeItem = null;

    for (let i = 0; i < count; i++) {
        const nd = stats.inorderNodes[i];
        const isRoot = nd.id === step.snapshot.rootId;
        const isActive = activeSet.has(nd.id) && Boolean(toneClass);
        const slot = traversalPool.items[i];

        slot.lbl.className = isActive || isRoot ? "slot-label slot-label-active mono" : "slot-label mono";
        slot.lbl.textContent = isRoot ? `[${i}] ROOT` : `[${i}]`;

        const boxClasses = ["node-box", "hp-cell", "bst-cell", "mono"];
        if (isRoot) boxClasses.push("hp-root");
        if (isActive) boxClasses.push(toneClass);
        slot.box.className = boxClasses.join(" ");
        slot.box.textContent = String(nd.value);
        slot.sr.textContent = `Sorted index ${i}, value ${nd.value}${isRoot ? ", root" : ""}${isActive ? `, ${step.type}` : ""}`;

        if (isActive) activeItem = slot.li;
    }

    return activeItem;
}

function render(step, index, p) {
    if (p.atEnd && !p.isPlaying) autoPlaying = false;
    const isActivelyPlaying = p.isPlaying || (autoPlaying && !p.atEnd);

    const stepChanged = step !== lastRenderedStep;
    lastRenderedStep = step;

    if (stepChanged) {
        const snap = step.snapshot;
        const stats = analyzeSnapshot(snap);

        updatePseudocode(step);
        const treeTarget = renderTree(step, stats);
        const traversalTarget = renderTraversalOutput(step, stats);
        scheduleReveal([
            [els.treeStage, treeTarget],
            [els.traversalStage, traversalTarget],
        ]);

        // Silence rapid announcements while auto-playing. Set aria-live BEFORE writing the
        // text so the final frame (playback ended), pauses and manual steps are announced.
        els.stepMessage.setAttribute("aria-live", isActivelyPlaying ? "off" : "polite");
        els.stepMessage.textContent = step.message;

        els.statRoot.textContent = stats.rootValue !== null ? String(stats.rootValue) : "— (empty)";
        els.statSize.textContent = `${snap.size} / ${snap.capacity}`;
        els.statHeight.textContent = String(stats.height);
        els.statMin.textContent = stats.min !== null ? String(stats.min) : "—";
        els.statMax.textContent = stats.max !== null ? String(stats.max) : "—";
        els.statComparisons.textContent = String(step.comparisons ?? 0);

        // Validity of the frame being shown (its snapshot), not of the live tree.
        const integrityErr = snapshotOrderError(snap, stats);
        els.statValid.textContent = step.type === "copy-successor"
            ? "Relinking…"
            : (integrityErr !== null ? `Invalid (${integrityErr})` : "Valid");
    } else {
        // Same frame re-rendered (pause, playback ended): restore announcements.
        els.stepMessage.setAttribute("aria-live", isActivelyPlaying ? "off" : "polite");
    }

    els.counter.textContent = `Step ${index + 1} / ${p.length}`;
    els.progress.max = Math.max(0, p.length - 1);
    els.progress.value = String(index);
    els.progress.disabled = p.length <= 1;
    els.progress.setAttribute("aria-valuetext", `Step ${index + 1} of ${p.length}: ${step.message}`);

    if (isActivelyPlaying) {
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
    els.prevBtn.disabled = p.atStart;
    els.resetBtn.disabled = p.atStart;
    els.nextBtn.disabled = p.atEnd;
}

function startPlayback() {
    if (player.length <= 1) return;
    autoPlaying = true;
    player.play();
}

function pausePlayback() {
    autoPlaying = false;
    player.pause();
}

function togglePlayback() {
    if (player.length <= 1) return;
    if (player.isPlaying || autoPlaying) pausePlayback();
    else startPlayback();
}

function loadSteps(steps, { autoPlay = true } = {}) {
    if (!steps || steps.length === 0) return;
    autoPlaying = false;
    lastRenderedStep = null;
    player.load(steps);
    if (autoPlay && steps.length > 1 && !prefersReducedMotion()) {
        startPlayback();
    }
}

function parseSingleKey() {
    const parsed = parseInteger(els.valueInput.value, {
        min: VALUE_LIMITS.min,
        max: VALUE_LIMITS.max,
        label: "Value",
    });
    if (!parsed.ok) {
        notify(parsed.error, "error", "value");
        els.valueInput.focus();
        return null;
    }
    return parsed.value;
}

function handleInsert(e) {
    e.preventDefault();
    const key = parseSingleKey();
    if (key === null) return;

    const res = bst.insert(key);
    if (!res.ok) {
        loadSteps(res.steps, { autoPlay: res.steps.length > 1 });
        notify(res.error, "error");
        return;
    }
    loadSteps(res.steps);
    notify(`Inserted ${key} into the BST (size ${bst.size}/${bst.capacity}).`, "success");
    els.valueInput.value = "";
    els.valueInput.focus();
}

function handleSearch() {
    const key = parseSingleKey();
    if (key === null) return;

    const res = bst.search(key);
    loadSteps(res.steps);
    if (res.value.found) {
        notify(`Found ${key} at node #${res.value.id}.`, "success");
    } else {
        notify(`Value ${key} is not in the BST.`, "warning");
    }
}

function handleDelete() {
    const key = parseSingleKey();
    if (key === null) return;

    const res = bst.delete(key);
    loadSteps(res.steps);
    if (!res.ok) {
        notify(res.error, "error");
        return;
    }

    const detail = res.value.case === "leaf"
        ? `Deleted leaf ${res.value.value}.`
        : res.value.case === "one-child"
            ? `Deleted ${res.value.value} by promoting its sole child.`
            : `Deleted ${res.value.value} using in-order successor ${res.value.successorValue}.`;
    notify(detail, "info");
    els.valueInput.value = "";
    els.valueInput.focus();
}

function handleMin() {
    const res = bst.min();
    loadSteps(res.steps);
    if (!res.ok) {
        notify(res.error, "error");
        return;
    }
    notify(`Minimum key is ${res.value.value} (node #${res.value.id}).`, "info");
}

function handleMax() {
    const res = bst.max();
    loadSteps(res.steps);
    if (!res.ok) {
        notify(res.error, "error");
        return;
    }
    notify(`Maximum key is ${res.value.value} (node #${res.value.id}).`, "info");
}

function handleClear() {
    const res = bst.clear();
    loadSteps(res.steps, { autoPlay: false });
    notify("BST cleared.", "info");
}

function handleTraverse(e) {
    e.preventDefault();
    const order = els.traversalSelect.value;
    const res = bst.traverse(order);
    loadSteps(res.steps);
    if (res.value.length === 0) {
        notify("BST is empty: 0 nodes visited.", "info");
    } else {
        notify(`${TRAVERSAL_NAMES[order] ?? order} traversal: [${res.value.join(", ")}].`, "info");
    }
}

function findDuplicates(values) {
    const seen = new Set();
    const dupes = [];
    for (const v of values) {
        if (seen.has(v)) {
            if (!dupes.includes(v)) dupes.push(v);
        } else {
            seen.add(v);
        }
    }
    return dupes;
}

function handleBuild(e, { autoPlay = true, silent = false } = {}) {
    if (e) e.preventDefault();
    const parsed = parseArrayInput(els.buildInput.value, {
        minLength: 1,
        maxLength: BST_CAPACITY,
        min: VALUE_LIMITS.min,
        max: VALUE_LIMITS.max,
    });
    if (!parsed.ok) {
        notify(parsed.error, "error", "build");
        els.buildInput.focus();
        return false;
    }

    const dupes = findDuplicates(parsed.values);
    if (dupes.length > 0) {
        notify(
            `BST keys must be unique. Remove duplicate value${dupes.length === 1 ? "" : "s"}: ${dupes.join(", ")}.`,
            "error",
            "build",
        );
        els.buildInput.focus();
        return false;
    }

    const nextTree = new BinarySearchTree(BST_CAPACITY);
    const allSteps = [];
    for (const v of parsed.values) {
        const res = nextTree.insert(v);
        if (!res.ok) {
            notify(res.error, "error", "build");
            els.buildInput.focus();
            return false;
        }
        allSteps.push(...res.steps);
    }

    bst = nextTree;
    loadSteps(allSteps, { autoPlay });
    if (!silent) {
        notify(
            `Built BST with ${bst.size} unique key${bst.size === 1 ? "" : "s"} (height ${bst.height()}).`,
            "success",
        );
    }
    return true;
}

function randomDistinctValues(count = RANDOM_COUNT, min = 1, max = 99) {
    const chosen = new Set();
    while (chosen.size < count) {
        chosen.add(min + Math.floor(Math.random() * (max - min + 1)));
    }
    return [...chosen];
}

function handleRandomBuild() {
    const values = randomDistinctValues(RANDOM_COUNT, 1, 99);
    els.buildInput.value = values.join(", ");
    handleBuild(null, { autoPlay: true });
}

els.keyForm.addEventListener("submit", handleInsert);
els.searchBtn.addEventListener("click", handleSearch);
els.deleteBtn.addEventListener("click", handleDelete);
els.minBtn.addEventListener("click", handleMin);
els.maxBtn.addEventListener("click", handleMax);
els.clearBtn.addEventListener("click", handleClear);
els.traversalForm.addEventListener("submit", handleTraverse);
els.buildForm.addEventListener("submit", handleBuild);
els.randomBtn.addEventListener("click", handleRandomBuild);

els.playBtn.addEventListener("click", togglePlayback);
els.nextBtn.addEventListener("click", () => {
    pausePlayback();
    player.next();
});
els.prevBtn.addEventListener("click", () => {
    autoPlaying = false;
    player.prev();
});
els.resetBtn.addEventListener("click", () => {
    autoPlaying = false;
    player.reset();
});
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value)));
els.progress.addEventListener("input", () => {
    const target = Number(els.progress.value);
    pausePlayback();
    player.goTo(target);
});

document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const sidebar = $("sideNavbar");
    if (sidebar && sidebar.classList.contains("active")) return;

    const target = e.target;
    if (!target || target.isContentEditable) return;
    const tag = target.tagName;
    if (
        tag === "INPUT" ||
        tag === "SELECT" ||
        tag === "TEXTAREA" ||
        tag === "BUTTON" ||
        tag === "A"
    ) {
        return;
    }
    if (target.closest && target.closest(".hp-scroll-region, button, a, input, select, textarea")) {
        return;
    }

    if (e.key === " ") {
        if (player.length <= 1) return;
        e.preventDefault();
        togglePlayback();
    } else if (e.key === "ArrowRight") {
        if (player.atEnd) return;
        e.preventDefault();
        pausePlayback();
        player.next();
    } else if (e.key === "ArrowLeft") {
        if (player.atStart) return;
        e.preventDefault();
        autoPlaying = false;
        player.prev();
    } else if (e.key === "Home") {
        if (player.atStart) return;
        e.preventDefault();
        autoPlaying = false;
        player.reset();
    }
});

// Populate concept card and complexity table from BST_INFO using DOM nodes.
$("bstName").textContent = BST_INFO.name;
$("bstSummary").textContent = BST_INFO.summary;
$("cxSearch").textContent = BST_INFO.complexity.search;
$("cxInsert").textContent = BST_INFO.complexity.insert;
$("cxDelete").textContent = BST_INFO.complexity.delete;
$("cxMinMax").textContent = BST_INFO.complexity.minMax;
$("cxTraverse").textContent = BST_INFO.complexity.traverse;
$("cxSpace").textContent = BST_INFO.complexity.space;

const CX_ROWS = [
    ["Search", "O(1)", "O(log n)", "O(n)", `${BST_INFO.complexity.search}.`],
    ["Insert", "O(1)", "O(log n)", "O(n)", `${BST_INFO.complexity.insert}; unique keys only.`],
    ["Delete", "O(1)", "O(log n)", "O(n)", `${BST_INFO.complexity.delete}; O(1) at root with ≤ 1 child or direct right-child successor; leaf, 1 child, or in-order successor.`],
    ["Min / Max", "O(1)", "O(log n)", "O(n)", `${BST_INFO.complexity.minMax}; follow left or right spine.`],
    ["Traverse (All 4)", "O(n)", "O(n)", "O(n)", `${BST_INFO.complexity.traverse}; visits every node once (O(h) stack for DFS, O(n) queue for BFS).`],
    ["Space", "O(n)", "O(n)", "O(n)", `${BST_INFO.complexity.space} tree storage (1 node per key); O(1) extra space for iterative ops.`],
];

const cxBody = $("cxTable");
cxBody.replaceChildren(
    ...CX_ROWS.map(([op, best, avg, worst, note]) => {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.scope = "row";
        th.textContent = op;
        const cells = [best, avg, worst, note].map((text) => {
            const td = document.createElement("td");
            td.textContent = text;
            return td;
        });
        tr.append(th, ...cells);
        return tr;
    }),
);

// Build initial demo tree silently and land on its final step so the tree is immediately visible.
handleBuild(null, { autoPlay: false, silent: true });
player.goTo(player.length - 1);
