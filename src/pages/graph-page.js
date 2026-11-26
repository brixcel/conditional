/**
 * Graph Representation page controller (G10).
 * Pure logic comes from src/structures/graph.js; coordinates from src/core/graph-layout.js;
 * playback from src/core/step-player.js; keyboard binding from src/core/player-keys.js;
 * integer validation from src/core/validate.js.
 * Reuses main.css section 14–16 classes — zero inline styling writes, zero HTML string injection.
 */
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import { parseInteger } from "../core/validate.js";
import { layoutCircle } from "../core/graph-layout.js";
import { Graph, GRAPH_INFO, GRAPH_LIMITS } from "../structures/graph.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const NODE_RADIUS = 19;
const LAYOUT_PADDING = 48;

const SAMPLE_VERTICES = [0, 1, 2, 3, 4, 5];
const SAMPLE_EDGES = [
    { from: 0, to: 1, weight: 4 },
    { from: 0, to: 2, weight: 2 },
    { from: 1, to: 2, weight: 5 },
    { from: 1, to: 3, weight: 10 },
    { from: 2, to: 4, weight: 3 },
    { from: 3, to: 4, weight: 4 },
    { from: 3, to: 5, weight: 11 },
];
const SAMPLE_DIRECTED_EXTRA = { from: 2, to: 0, weight: 7 };

const OP_LABELS = {
    addVertex: "Add Vertex",
    removeVertex: "Remove Vertex",
    addEdge: "Add Edge",
    removeEdge: "Remove Edge",
    clear: "Clear",
    build: "Build",
};

const $ = (id) => document.getElementById(id);

const els = {
    directedToggle: $("directedToggle"),
    weightedToggle: $("weightedToggle"),
    modeHint: $("modeHint"),
    vertexForm: $("vertexForm"),
    vertexInput: $("vertexInput"),
    addVertexBtn: $("addVertexBtn"),
    removeVertexBtn: $("removeVertexBtn"),
    edgeForm: $("edgeForm"),
    fromInput: $("fromInput"),
    toInput: $("toInput"),
    weightInput: $("weightInput"),
    addEdgeBtn: $("addEdgeBtn"),
    removeEdgeBtn: $("removeEdgeBtn"),
    sampleBtn: $("sampleBtn"),
    randomBtn: $("randomBtn"),
    clearBtn: $("clearBtn"),
    errorBanner: $("graphError"),
    statusBanner: $("graphStatus"),
    resetBtn: $("resetBtn"),
    stepBackBtn: $("stepBackBtn"),
    playBtn: $("playBtn"),
    playIcon: $("playIcon"),
    playLabel: $("playLabel"),
    stepFwdBtn: $("stepFwdBtn"),
    speed: $("speedSelect"),
    progress: $("progress"),
    counter: $("stepCounter"),
    graphStageLabel: $("graphStageLabel"),
    graphStage: $("graphStage"),
    graphSvg: $("graphSvg"),
    graphSvgTitle: $("graphSvgTitle"),
    graphSvgDesc: $("graphSvgDesc"),
    graphEdgeLayer: $("graphEdgeLayer"),
    graphGhostLayer: $("graphGhostLayer"),
    graphNodeLayer: $("graphNodeLayer"),
    graphEmpty: $("graphEmpty"),
    adjListStage: $("adjListStage"),
    adjList: $("adjList"),
    adjListEmpty: $("adjListEmpty"),
    adjMatrixStage: $("adjMatrixStage"),
    adjMatrix: $("adjMatrix"),
    adjMatrixCaption: $("adjMatrixCaption"),
    adjMatrixHead: $("adjMatrixHead"),
    adjMatrixBody: $("adjMatrixBody"),
    adjMatrixEmpty: $("adjMatrixEmpty"),
    stepMessage: $("stepMessage"),
    codeHeading: $("codeHeading"),
    code: $("pseudocode"),
    statVertices: $("statVertices"),
    statEdges: $("statEdges"),
    statMode: $("statMode"),
    statOperation: $("statOperation"),
    statIntegrity: $("statIntegrity"),
};

const LIVE_BASE_CLASS = "alert-banner alert-live bst-live";

const reducedMotionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function prefersReducedMotion() {
    return Boolean(reducedMotionQuery && reducedMotionQuery.matches);
}

let graph = new Graph({ directed: false, weighted: false });
let currentCodeKey = "";
let lastRenderedStep = null;
let notifyTimerId = 0;

let announceReady = false;
let liveReady = false;
let loadingSteps = false;
let userStep = false;
let autoPlaying = false;
let userInitiatedPlay = false;

// Pooled SVG, Adjacency List, and Adjacency Matrix elements to avoid per-frame DOM teardown.
const edgePool = [];
const nodePool = [];
let ghostEdgePool = null;
const adjRowPool = [];
let lastMatrixIdsKey = "";
let matrixColHeaders = [];
let matrixBodyGrid = []; // [{ rowHdr, cells: [{ td, vis, sr }] }]

const player = new StepPlayer({ onStep: render, baseDelay: 750 });
player.setSpeed(Number(els.speed.value) || 1);

const byUser = (fn) => (...args) => {
    userStep = true;
    try {
        return fn(...args);
    } finally {
        userStep = false;
    }
};

function sidebarOpen() {
    const sidebar = $("sideNavbar");
    return Boolean(sidebar && sidebar.classList.contains("active"));
}

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, String(v));
    }
    return el;
}

function modeLabel(directed, weighted) {
    return `${directed ? "Directed" : "Undirected"} · ${weighted ? "Weighted" : "Unweighted"}`;
}

function modeProse(directed, weighted) {
    return `${directed ? "directed" : "undirected"}, ${weighted ? "weighted" : "unweighted"}`;
}

function setFieldValidity(input, isInvalid) {
    input.setAttribute("aria-invalid", isInvalid ? "true" : "false");
    if (isInvalid) {
        input.setAttribute("aria-describedby", "graphError");
    } else {
        input.removeAttribute("aria-describedby");
    }
}

function clearAllFieldValidity() {
    setFieldValidity(els.vertexInput, false);
    setFieldValidity(els.fromInput, false);
    setFieldValidity(els.toInput, false);
    setFieldValidity(els.weightInput, false);
}

function clearBanner(el) {
    el.textContent = "";
    el.className = LIVE_BASE_CLASS;
}

/**
 * Displays inline feedback without double screen-reader announcements:
 * - Errors render inside `#graphError` (which has role="alert" in HTML).
 * - Info/success/warning render visually inside `#graphStatus` and announce via `DSA_UI.announce`.
 */
function notify(msg, type = "info", invalidField = null) {
    if (notifyTimerId) {
        clearTimeout(notifyTimerId);
        notifyTimerId = 0;
    }

    setFieldValidity(els.vertexInput, invalidField === "vertex");
    setFieldValidity(els.fromInput, invalidField === "from");
    setFieldValidity(els.toInput, invalidField === "to");
    setFieldValidity(els.weightInput, invalidField === "weight");

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
        const repeated = els.errorBanner.textContent === msg;
        els.errorBanner.className = `${LIVE_BASE_CLASS} alert-error`;
        if (repeated) {
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
    if (announceReady) {
        window.DSA_UI?.announce?.(msg, "polite");
    }
}

function syncModeInputs() {
    const weighted = els.weightedToggle.checked;
    const directed = els.directedToggle.checked;
    els.weightInput.disabled = !weighted;
    if (!weighted) {
        setFieldValidity(els.weightInput, false);
    }
    const dirNote = directed
        ? "Directed edges are one-way (u → v)."
        : "Undirected edges are symmetric (u — v).";
    const wtNote = weighted
        ? "Weights (1–99) are required."
        : "Weights are disabled in unweighted mode.";
    els.modeHint.textContent = `${dirNote} ${wtNote}`;
}

/* ---------- Pure snapshot derivations (single source of truth per frame) ---------- */

function snapshotToAdjacencyList(snap) {
    const byId = new Map();
    for (const id of snap.vertices) {
        byId.set(id, []);
    }
    for (const { from, to, weight } of snap.edges) {
        if (byId.has(from) && byId.has(to)) {
            byId.get(from).push({ to, weight });
            if (!snap.directed) {
                byId.get(to).push({ to: from, weight });
            }
        }
    }
    for (const list of byId.values()) {
        list.sort((a, b) => a.to - b.to);
    }
    return snap.vertices.map((id) => ({
        id,
        neighbors: byId.get(id) ?? [],
    }));
}

function snapshotToAdjacencyMatrix(snap) {
    const ids = snap.vertices;
    const n = ids.length;
    const indexOf = new Map(ids.map((id, idx) => [id, idx]));
    const matrix = Array.from({ length: n }, () => new Array(n).fill(null));

    for (const { from, to, weight } of snap.edges) {
        const i = indexOf.get(from);
        const j = indexOf.get(to);
        if (i === undefined || j === undefined) continue;
        matrix[i][j] = weight;
        if (!snap.directed) {
            matrix[j][i] = weight;
        }
    }

    return { ids, matrix };
}

function snapshotIntegrityError(snap, adjList, matrixData) {
    const ids = snap.vertices;
    if (ids.length > GRAPH_LIMITS.maxVertices) {
        return `vertex count ${ids.length} exceeds ${GRAPH_LIMITS.maxVertices}`;
    }
    const idSet = new Set();
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (!Number.isInteger(id) || id < GRAPH_LIMITS.minId || id > GRAPH_LIMITS.maxId) {
            return `invalid vertex ${id}`;
        }
        if (i > 0 && id <= ids[i - 1]) {
            return `vertices out of order at ${id}`;
        }
        idSet.add(id);
    }

    const seenEdges = new Set();
    for (const e of snap.edges) {
        if (!idSet.has(e.from) || !idSet.has(e.to)) {
            return `dangling edge (${e.from}, ${e.to})`;
        }
        if (e.from === e.to) {
            return `self-loop at ${e.from}`;
        }
        const key = snap.directed
            ? `${e.from}->${e.to}`
            : `${Math.min(e.from, e.to)}--${Math.max(e.from, e.to)}`;
        if (seenEdges.has(key)) {
            return `duplicate edge ${key}`;
        }
        seenEdges.add(key);

        if (snap.weighted) {
            if (!Number.isInteger(e.weight) || e.weight < GRAPH_LIMITS.minWeight || e.weight > GRAPH_LIMITS.maxWeight) {
                return `invalid weight ${e.weight}`;
            }
        } else if (e.weight !== 1) {
            return `unweighted edge weight ${e.weight}`;
        }
    }

    const { matrix } = matrixData;
    for (let i = 0; i < ids.length; i++) {
        if (matrix[i][i] !== null) return `non-null diagonal at ${ids[i]}`;
        const row = adjList[i].neighbors;
        for (let k = 1; k < row.length; k++) {
            if (row[k].to <= row[k - 1].to) return `unsorted neighbors at ${ids[i]}`;
        }
        if (!snap.directed) {
            for (let j = i + 1; j < ids.length; j++) {
                if (matrix[i][j] !== matrix[j][i]) {
                    return `matrix asymmetry (${ids[i]}, ${ids[j]})`;
                }
            }
        }
    }

    return null;
}

/* ---------- View 1: Inline SVG Graph (pooled nodes & edges) ---------- */

function createPooledEdge(parentLayer) {
    const group = svgEl("g", { class: "gr-edge-group" });
    const pathEl = svgEl("path", { class: "hp-edge gr-edge" });
    const weightEl = svgEl("text", { class: "gr-edge-weight gr-hidden" });
    group.append(pathEl, weightEl);
    parentLayer.append(group);
    return { group, pathEl, weightEl };
}

function createPooledNode(parentLayer) {
    const group = svgEl("g", { class: "hp-node gr-node" });
    const circleEl = svgEl("circle", { class: "hp-node-circle gr-node-circle", r: NODE_RADIUS });
    const valueEl = svgEl("text", { class: "hp-node-value gr-node-value" });
    group.append(circleEl, valueEl);
    parentLayer.append(group);
    return { group, circleEl, valueEl };
}

function ensureEdgePool(count) {
    while (edgePool.length < count) {
        edgePool.push(createPooledEdge(els.graphEdgeLayer));
    }
}

function ensureNodePool(count) {
    while (nodePool.length < count) {
        nodePool.push(createPooledNode(els.graphNodeLayer));
    }
}

function ensureGhostEdge() {
    if (!ghostEdgePool) {
        ghostEdgePool = createPooledEdge(els.graphGhostLayer);
        ghostEdgePool.group.setAttribute("class", "gr-edge-group gr-hidden");
    }
    return ghostEdgePool;
}

function computeEdgeGeometry(p1, p2, { directed, curved }) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const endTrim = directed ? NODE_RADIUS + 3 : NODE_RADIUS;

    if (!curved) {
        const sx = p1.x + ux * NODE_RADIUS;
        const sy = p1.y + uy * NODE_RADIUS;
        const ex = p2.x - ux * endTrim;
        const ey = p2.y - uy * endTrim;
        return {
            d: `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`,
            mx: (sx + ex) / 2,
            my: (sy + ey) / 2,
        };
    }

    // Perpendicular normal: opposite direction for reverse edge (to -> from), so mutual edges bow apart.
    const nx = -uy;
    const ny = ux;
    const offset = Math.min(34, Math.max(20, dist * 0.16));
    const cx = (p1.x + p2.x) / 2 + nx * offset;
    const cy = (p1.y + p2.y) / 2 + ny * offset;

    const t1x = cx - p1.x;
    const t1y = cy - p1.y;
    const t1d = Math.hypot(t1x, t1y) || 1;
    const sx = p1.x + (t1x / t1d) * NODE_RADIUS;
    const sy = p1.y + (t1y / t1d) * NODE_RADIUS;

    const t2x = p2.x - cx;
    const t2y = p2.y - cy;
    const t2d = Math.hypot(t2x, t2y) || 1;
    const ex = p2.x - (t2x / t2d) * endTrim;
    const ey = p2.y - (t2y / t2d) * endTrim;

    // Quadratic Bézier midpoint at t = 0.5.
    const mx = 0.25 * sx + 0.5 * cx + 0.25 * ex;
    const my = 0.25 * sy + 0.5 * cy + 0.25 * ey;

    return {
        d: `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`,
        mx,
        my,
    };
}

function edgeMatchesStep(edge, stepEdge, directed) {
    if (!stepEdge) return false;
    if (edge.from === stepEdge.from && edge.to === stepEdge.to) return true;
    if (!directed && edge.from === stepEdge.to && edge.to === stepEdge.from) return true;
    return false;
}

function renderSvgGraph(step) {
    const snap = step.snapshot;
    const n = snap.vertices.length;
    const eCount = snap.edges.length;

    els.graphStageLabel.textContent = `View 1 — Graph (${modeLabel(snap.directed, snap.weighted)})`;

    if (n === 0) {
        els.graphSvg.classList.add("gr-hidden");
        els.graphEmpty.classList.remove("gr-hidden");
        els.graphSvgTitle.textContent = "Empty graph";
        els.graphSvgDesc.textContent = step.message;
        return;
    }

    els.graphSvg.classList.remove("gr-hidden");
    els.graphEmpty.classList.add("gr-hidden");

    const radius = n <= 2 ? 75 : n <= 4 ? 115 : 145;
    const layout = layoutCircle(snap.vertices, { radius, padding: LAYOUT_PADDING });
    els.graphSvg.setAttribute("width", String(layout.width));
    els.graphSvg.setAttribute("height", String(layout.height));
    els.graphSvg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);

    const edgeSummary = snap.edges
        .map((e) => `${e.from}${snap.directed ? "→" : "—"}${e.to}${snap.weighted ? `(${e.weight})` : ""}`)
        .join(", ");
    els.graphSvgTitle.textContent =
        `${snap.directed ? "Directed" : "Undirected"} ${snap.weighted ? "weighted" : "unweighted"} graph ` +
        `with ${n} ${n === 1 ? "vertex" : "vertices"} and ${eCount} ${eCount === 1 ? "edge" : "edges"}`;
    els.graphSvgDesc.textContent =
        `${step.message} Vertices: ${snap.vertices.join(", ")}. ` +
        `${eCount > 0 ? `Edges: ${edgeSummary}.` : "No edges."}`;

    const posById = new Map(layout.nodes.map((nd) => [nd.id, nd]));
    const edgeKeySet = new Set(snap.edges.map((e) => `${e.from}->${e.to}`));

    // Render live edges via pooled SVG groups.
    ensureEdgePool(eCount);
    for (let i = 0; i < eCount; i++) {
        const edge = snap.edges[i];
        const entry = edgePool[i];
        const p1 = posById.get(edge.from);
        const p2 = posById.get(edge.to);
        if (!p1 || !p2) {
            entry.group.setAttribute("class", "gr-edge-group gr-hidden");
            continue;
        }

        const hasReverse = snap.directed && edgeKeySet.has(`${edge.to}->${edge.from}`);
        const geom = computeEdgeGeometry(p1, p2, {
            directed: snap.directed,
            curved: hasReverse,
        });

        const isAdded = step.type === "add-edge" && edgeMatchesStep(edge, step.edge, snap.directed);

        entry.group.setAttribute("class", "gr-edge-group");
        entry.pathEl.setAttribute("d", geom.d);
        entry.pathEl.setAttribute("class", isAdded ? "hp-edge gr-edge gr-state-add" : "hp-edge gr-edge");

        if (snap.directed) {
            entry.pathEl.setAttribute(
                "marker-end",
                isAdded ? "url(#gr-arrow-add)" : "url(#gr-arrow-default)",
            );
        } else {
            entry.pathEl.removeAttribute("marker-end");
        }

        if (snap.weighted) {
            entry.weightEl.setAttribute("x", geom.mx.toFixed(1));
            entry.weightEl.setAttribute("y", geom.my.toFixed(1));
            entry.weightEl.setAttribute(
                "class",
                isAdded ? "gr-edge-weight gr-state-add" : "gr-edge-weight",
            );
            entry.weightEl.textContent = String(edge.weight);
        } else {
            entry.weightEl.setAttribute("class", "gr-edge-weight gr-hidden");
            entry.weightEl.textContent = "";
        }
    }
    for (let i = eCount; i < edgePool.length; i++) {
        edgePool[i].group.setAttribute("class", "gr-edge-group gr-hidden");
    }

    // Render crisp ghost indicator for a just-removed edge (whose endpoints are still in the snapshot).
    const ghost = ensureGhostEdge();
    if (
        step.type === "remove-edge" &&
        step.edge &&
        posById.has(step.edge.from) &&
        posById.has(step.edge.to)
    ) {
        const p1 = posById.get(step.edge.from);
        const p2 = posById.get(step.edge.to);
        const reverseExists = snap.directed && edgeKeySet.has(`${step.edge.to}->${step.edge.from}`);
        const geom = computeEdgeGeometry(p1, p2, {
            directed: snap.directed,
            curved: reverseExists,
        });

        ghost.group.setAttribute("class", "gr-edge-group");
        ghost.pathEl.setAttribute("d", geom.d);
        ghost.pathEl.setAttribute("class", "hp-edge gr-edge gr-edge-ghost");
        if (snap.directed) {
            ghost.pathEl.setAttribute("marker-end", "url(#gr-arrow-remove)");
        } else {
            ghost.pathEl.removeAttribute("marker-end");
        }

        if (snap.weighted) {
            ghost.weightEl.setAttribute("x", geom.mx.toFixed(1));
            ghost.weightEl.setAttribute("y", geom.my.toFixed(1));
            ghost.weightEl.setAttribute("class", "gr-edge-weight gr-state-remove");
            ghost.weightEl.textContent = String(step.edge.weight);
        } else {
            ghost.weightEl.setAttribute("class", "gr-edge-weight gr-hidden");
            ghost.weightEl.textContent = "";
        }
    } else {
        ghost.group.setAttribute("class", "gr-edge-group gr-hidden");
    }

    // Render vertices via pooled SVG node groups.
    const activeSet = new Set(Array.isArray(step.vertexIds) ? step.vertexIds : []);
    ensureNodePool(n);
    for (let i = 0; i < n; i++) {
        const pos = layout.nodes[i];
        const entry = nodePool[i];
        const id = pos.id;
        const isActive = activeSet.has(id);

        const nodeClasses = ["hp-node", "gr-node"];
        if (isActive && step.type === "add-vertex") {
            nodeClasses.push("gr-state-add");
        } else if (isActive && step.type === "add-edge") {
            nodeClasses.push("gr-state-endpoint");
        } else if (isActive && step.type === "remove-edge") {
            nodeClasses.push("gr-state-remove");
        }

        entry.group.setAttribute("class", nodeClasses.join(" "));
        entry.circleEl.setAttribute("cx", pos.x.toFixed(1));
        entry.circleEl.setAttribute("cy", pos.y.toFixed(1));
        entry.valueEl.setAttribute("x", pos.x.toFixed(1));
        entry.valueEl.setAttribute("y", pos.y.toFixed(1));
        entry.valueEl.textContent = String(id);
    }
    for (let i = n; i < nodePool.length; i++) {
        nodePool[i].group.setAttribute("class", "hp-node gr-node gr-hidden");
    }
}

/* ---------- View 2: Adjacency List (Pooled) ---------- */

function ensureAdjRowPool(count) {
    while (adjRowPool.length < count) {
        const li = document.createElement("li");
        li.className = "gr-adj-row gr-hidden";

        const badge = document.createElement("span");
        badge.className = "gr-adj-vertex mono";
        const badgeVis = document.createElement("span");
        badgeVis.setAttribute("aria-hidden", "true");
        const badgeSr = document.createElement("span");
        badgeSr.className = "visually-hidden";
        badge.append(badgeVis, badgeSr);

        const arrow = document.createElement("span");
        arrow.className = "gr-adj-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";

        const ul = document.createElement("ul");
        ul.className = "gr-adj-neighbors";
        ul.setAttribute("role", "list");

        const emptyLi = document.createElement("li");
        emptyLi.className = "gr-adj-empty-item gr-hidden";
        const emptyVis = document.createElement("span");
        emptyVis.setAttribute("aria-hidden", "true");
        const emptySr = document.createElement("span");
        emptySr.className = "visually-hidden";
        emptyLi.append(emptyVis, emptySr);
        ul.append(emptyLi);

        li.append(badge, arrow, ul);
        els.adjList.append(li);
        adjRowPool.push({ li, badge, badgeVis, badgeSr, ul, emptyLi, emptyVis, emptySr, chipPool: [] });
    }
}

function ensureAdjChipPool(row, count) {
    while (row.chipPool.length < count) {
        const chip = document.createElement("li");
        chip.className = "gr-adj-chip mono gr-hidden";

        const vis = document.createElement("span");
        vis.setAttribute("aria-hidden", "true");
        const toSpan = document.createElement("span");
        const wtSpan = document.createElement("span");
        wtSpan.className = "gr-chip-weight gr-hidden";
        vis.append(toSpan, wtSpan);

        const sr = document.createElement("span");
        sr.className = "visually-hidden";

        chip.append(vis, sr);
        row.ul.append(chip);
        row.chipPool.push({ chip, toSpan, wtSpan, sr });
    }
}

function renderAdjacencyList(step, adjList) {
    const snap = step.snapshot;
    if (adjList.length === 0) {
        els.adjList.classList.add("gr-hidden");
        els.adjListEmpty.classList.remove("gr-hidden");
        for (const row of adjRowPool) {
            row.li.className = "gr-adj-row gr-hidden";
        }
        return;
    }

    els.adjList.classList.remove("gr-hidden");
    els.adjListEmpty.classList.add("gr-hidden");
    ensureAdjRowPool(adjList.length);

    const activeSet = new Set(Array.isArray(step.vertexIds) ? step.vertexIds : []);
    const stepEdge = step.edge;

    for (let i = 0; i < adjList.length; i++) {
        const { id, neighbors } = adjList[i];
        const row = adjRowPool[i];

        const isAddedVertex = step.type === "add-vertex" && activeSet.has(id);
        const isAddedEdgeEndpoint =
            step.type === "add-edge" && stepEdge !== null && (id === stepEdge.from || id === stepEdge.to);
        const isRemovedEdgeEndpoint =
            step.type === "remove-edge" &&
            stepEdge !== null &&
            (id === stepEdge.from || id === stepEdge.to);

        const rowClasses = ["gr-adj-row"];
        const badgeClasses = ["gr-adj-vertex", "mono"];
        let vertexSrSuffix = "";

        if (isAddedVertex) {
            rowClasses.push("gr-adj-row-add");
            badgeClasses.push("gr-state-add");
            vertexSrSuffix = " (added)";
        } else if (isAddedEdgeEndpoint) {
            rowClasses.push("gr-adj-row-endpoint");
            badgeClasses.push("gr-state-endpoint");
            vertexSrSuffix = " (edge endpoint)";
        } else if (isRemovedEdgeEndpoint) {
            rowClasses.push("gr-adj-row-remove");
            badgeClasses.push("gr-state-remove");
            vertexSrSuffix = " (edge removed)";
        }

        row.li.className = rowClasses.join(" ");
        row.badge.className = badgeClasses.join(" ");
        row.badgeVis.textContent = `[${id}]`;
        row.badgeSr.textContent = `Vertex ${id}${vertexSrSuffix}: `;

        if (neighbors.length === 0) {
            row.emptyLi.className = "gr-adj-empty-item";
            row.emptyVis.textContent = snap.directed ? "∅ (no outgoing edges)" : "∅ (no edges)";
            row.emptySr.textContent = snap.directed ? "no outgoing edges" : "no edges";
            for (const c of row.chipPool) {
                c.chip.className = "gr-adj-chip mono gr-hidden";
                c.toSpan.textContent = "";
                c.wtSpan.textContent = "";
                c.sr.textContent = "";
            }
        } else {
            row.emptyLi.className = "gr-adj-empty-item gr-hidden";
            ensureAdjChipPool(row, neighbors.length);

            for (let j = 0; j < neighbors.length; j++) {
                const { to, weight } = neighbors[j];
                const slot = row.chipPool[j];
                const isAddedChip =
                    step.type === "add-edge" &&
                    stepEdge !== null &&
                    ((id === stepEdge.from && to === stepEdge.to) ||
                        (!snap.directed && id === stepEdge.to && to === stepEdge.from));

                slot.chip.className = isAddedChip ? "gr-adj-chip mono gr-chip-add" : "gr-adj-chip mono";
                slot.toSpan.textContent = String(to);
                if (snap.weighted) {
                    slot.wtSpan.className = "gr-chip-weight";
                    slot.wtSpan.textContent = ` (${weight})`;
                } else {
                    slot.wtSpan.className = "gr-chip-weight gr-hidden";
                    slot.wtSpan.textContent = "";
                }

                const weightNote = snap.weighted ? `, weight ${weight}` : "";
                const stateNote = isAddedChip ? ", added" : "";
                slot.sr.textContent = `neighbor ${to}${weightNote}${stateNote}`;
            }
            for (let j = neighbors.length; j < row.chipPool.length; j++) {
                row.chipPool[j].chip.className = "gr-adj-chip mono gr-hidden";
                row.chipPool[j].toSpan.textContent = "";
                row.chipPool[j].wtSpan.textContent = "";
                row.chipPool[j].sr.textContent = "";
            }
        }
    }

    for (let i = adjList.length; i < adjRowPool.length; i++) {
        adjRowPool[i].li.className = "gr-adj-row gr-hidden";
        adjRowPool[i].badgeVis.textContent = "";
        adjRowPool[i].badgeSr.textContent = "";
    }
}

/* ---------- View 3: Adjacency Matrix (Reused Grid) ---------- */

function headerHighlightClass(id, step, activeSet) {
    if (step.type === "add-vertex" && activeSet.has(id)) return "gr-matrix-hdr-add";
    if (step.type === "add-edge" && step.edge && (id === step.edge.from || id === step.edge.to)) {
        return "gr-matrix-hdr-endpoint";
    }
    if (step.type === "remove-edge" && step.edge && (id === step.edge.from || id === step.edge.to)) {
        return "gr-matrix-hdr-remove";
    }
    return "";
}

function rebuildMatrixStructure(ids) {
    const n = ids.length;
    const headRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.scope = "col";
    corner.className = "gr-matrix-corner";
    const cornerVis = document.createElement("span");
    cornerVis.setAttribute("aria-hidden", "true");
    cornerVis.textContent = "u \\ v";
    const cornerSr = document.createElement("span");
    cornerSr.className = "visually-hidden";
    cornerSr.textContent = "From row vertex to column vertex";
    corner.append(cornerVis, cornerSr);
    headRow.append(corner);

    matrixColHeaders = [];
    for (let j = 0; j < n; j++) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = String(ids[j]);
        headRow.append(th);
        matrixColHeaders.push(th);
    }
    els.adjMatrixHead.replaceChildren(headRow);

    matrixBodyGrid = [];
    const bodyRows = [];
    for (let i = 0; i < n; i++) {
        const tr = document.createElement("tr");
        const rowHdr = document.createElement("th");
        rowHdr.scope = "row";
        rowHdr.textContent = String(ids[i]);
        tr.append(rowHdr);

        const cells = [];
        for (let j = 0; j < n; j++) {
            const td = document.createElement("td");
            const vis = document.createElement("span");
            vis.setAttribute("aria-hidden", "true");
            const sr = document.createElement("span");
            sr.className = "visually-hidden";
            td.append(vis, sr);
            tr.append(td);
            cells.push({ td, vis, sr });
        }
        matrixBodyGrid.push({ rowHdr, cells });
        bodyRows.push(tr);
    }
    els.adjMatrixBody.replaceChildren(...bodyRows);
}

function renderAdjacencyMatrix(step, { ids, matrix }) {
    const snap = step.snapshot;
    const n = ids.length;

    if (n === 0) {
        els.adjMatrix.classList.add("gr-hidden");
        els.adjMatrixEmpty.classList.remove("gr-hidden");
        if (lastMatrixIdsKey !== "") {
            lastMatrixIdsKey = "";
            matrixColHeaders = [];
            matrixBodyGrid = [];
            els.adjMatrixHead.replaceChildren();
            els.adjMatrixBody.replaceChildren();
        }
        return;
    }

    els.adjMatrix.classList.remove("gr-hidden");
    els.adjMatrixEmpty.classList.add("gr-hidden");

    const idsKey = ids.join(",");
    if (idsKey !== lastMatrixIdsKey) {
        rebuildMatrixStructure(ids);
        lastMatrixIdsKey = idsKey;
    }

    els.adjMatrixCaption.textContent =
        `Adjacency matrix for ${n} ${n === 1 ? "vertex" : "vertices"} ` +
        `(${modeLabel(snap.directed, snap.weighted)}); dot indicates null (no edge).`;

    const activeSet = new Set(Array.isArray(step.vertexIds) ? step.vertexIds : []);
    const stepEdge = step.edge;

    for (let j = 0; j < n; j++) {
        matrixColHeaders[j].className = headerHighlightClass(ids[j], step, activeSet);
    }

    for (let i = 0; i < n; i++) {
        const u = ids[i];
        const row = matrixBodyGrid[i];
        row.rowHdr.className = headerHighlightClass(u, step, activeSet);

        for (let j = 0; j < n; j++) {
            const v = ids[j];
            const val = matrix[i][j];
            const isDiag = i === j;
            const cell = row.cells[j];

            const isAddedCell =
                step.type === "add-edge" &&
                stepEdge !== null &&
                ((u === stepEdge.from && v === stepEdge.to) ||
                    (!snap.directed && u === stepEdge.to && v === stepEdge.from));

            const isRemovedCell =
                step.type === "remove-edge" &&
                stepEdge !== null &&
                ((u === stepEdge.from && v === stepEdge.to) ||
                    (!snap.directed && u === stepEdge.to && v === stepEdge.from));

            let cls = "";
            if (isAddedCell) cls = "gr-matrix-cell-add";
            else if (isRemovedCell) cls = "gr-matrix-cell-remove";
            else if (val !== null) cls = "gr-matrix-edge";
            else if (isDiag) cls = "gr-matrix-diag";
            if (cell.td.className !== cls) cell.td.className = cls;

            const nextVis = val !== null ? String(val) : "·";
            if (cell.vis.textContent !== nextVis) cell.vis.textContent = nextVis;

            let nextSr;
            if (val !== null) {
                const desc = snap.weighted ? `weight ${val}` : "connected";
                nextSr = `${u} to ${v}: ${desc}${isAddedCell ? ", added" : ""}`;
            } else if (isDiag) {
                nextSr = `${u} to ${u}: no self-loop`;
            } else {
                nextSr = `${u} to ${v}: no edge${isRemovedCell ? ", removed" : ""}`;
            }
            if (cell.sr.textContent !== nextSr) cell.sr.textContent = nextSr;
        }
    }
}

/* ---------- Pseudocode, Live State & Player Render ---------- */

function updatePseudocode(step) {
    const op = GRAPH_INFO.pseudocode[step.operation] ? step.operation : "build";
    if (op !== currentCodeKey) {
        currentCodeKey = op;
        els.codeHeading.textContent = `Pseudocode (${OP_LABELS[op] ?? op})`;
        els.code.replaceChildren(
            ...GRAPH_INFO.pseudocode[op].map((line) => {
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
        if (isCurrent) li.setAttribute("aria-current", "step");
        else li.removeAttribute("aria-current");
    });
}

function render(step, index, p) {
    const prevFocused = document.activeElement;
    const wasAutoPlaying = autoPlaying;
    const wasUserPlay = userInitiatedPlay;
    if (p.atEnd && !p.isPlaying) {
        autoPlaying = false;
        userInitiatedPlay = false;
    }
    const isActivelyPlaying = p.isPlaying || (autoPlaying && !p.atEnd);

    const stepChanged = step !== lastRenderedStep;
    lastRenderedStep = step;

    // Route spoken step narration cleanly via DSA_UI.announce only on manual steps
    // or when user-initiated Play reaches the final frame (avoiding double announcements
    // with operation notify() and avoiding synchronous aria-live off->polite drops).
    const shouldSpeakStep =
        liveReady &&
        !loadingSteps &&
        !isActivelyPlaying &&
        (userStep || (wasUserPlay && wasAutoPlaying && p.atEnd));

    if (stepChanged) {
        const snap = step.snapshot;
        const adjList = snapshotToAdjacencyList(snap);
        const matrixData = snapshotToAdjacencyMatrix(snap);

        updatePseudocode(step);
        renderSvgGraph(step);
        renderAdjacencyList(step, adjList);
        renderAdjacencyMatrix(step, matrixData);

        els.stepMessage.setAttribute("aria-live", "off");
        if (els.stepMessage.textContent !== step.message) {
            els.stepMessage.textContent = step.message;
        }
        if (shouldSpeakStep) {
            window.DSA_UI?.announce?.(step.message, "polite");
        }

        els.statVertices.textContent = `${snap.vertices.length} / ${GRAPH_LIMITS.maxVertices}`;
        els.statEdges.textContent = String(snap.edges.length);
        els.statMode.textContent = modeLabel(snap.directed, snap.weighted);
        els.statOperation.textContent = OP_LABELS[step.operation] ?? step.operation;

        const err = snapshotIntegrityError(snap, adjList, matrixData);
        els.statIntegrity.textContent = err === null ? "OK" : `Error (${err})`;
    } else {
        els.stepMessage.setAttribute("aria-live", "off");
    }

    els.counter.textContent = `Step ${index + 1} / ${p.length}`;
    els.progress.max = String(Math.max(0, p.length - 1));
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
    els.stepBackBtn.disabled = p.atStart;
    els.resetBtn.disabled = p.atStart;
    els.stepFwdBtn.disabled = p.atEnd;

    window.DSA_UI?.rescueFocus?.(
        prevFocused,
        els.stepBackBtn,
        els.stepFwdBtn,
        els.playBtn,
        els.resetBtn,
        els.addVertexBtn,
    );
}

/* ---------- Playback Helpers ---------- */

function startPlayback({ byUserAction = false } = {}) {
    if (player.length <= 1) return;
    autoPlaying = true;
    userInitiatedPlay = byUserAction;
    player.play();
}

function pausePlayback() {
    autoPlaying = false;
    userInitiatedPlay = false;
    player.pause();
}

function togglePlayback() {
    if (player.length <= 1) return;
    if (player.isPlaying || autoPlaying) pausePlayback();
    else startPlayback({ byUserAction: true });
}

function loadSteps(steps, { autoPlay = false, landAtEnd = false } = {}) {
    if (!steps || steps.length === 0) return;
    autoPlaying = false;
    userInitiatedPlay = false;
    lastRenderedStep = null;
    const shouldLandAtEnd = landAtEnd || (autoPlay && prefersReducedMotion());
    loadingSteps = true;
    try {
        player.load(steps);
        if (shouldLandAtEnd && steps.length > 1) {
            player.goTo(steps.length - 1);
        }
    } finally {
        loadingSteps = false;
    }
    if (autoPlay && !shouldLandAtEnd && steps.length > 1) {
        startPlayback({ byUserAction: false });
    }
}

/* ---------- Graph Operation Handlers ---------- */

function handleModeToggle() {
    const nextDirected = els.directedToggle.checked;
    const nextWeighted = els.weightedToggle.checked;
    const prevDirected = graph.directed;
    const prevWeighted = graph.weighted;

    const vertices = graph.vertices();
    const currentEdges = graph.edges();
    const nextEdges = [];
    let mergedDuplicates = 0;

    if (prevDirected && !nextDirected) {
        const seenPairs = new Set();
        for (const e of currentEdges) {
            const pairKey = `${Math.min(e.from, e.to)}--${Math.max(e.from, e.to)}`;
            if (seenPairs.has(pairKey)) {
                mergedDuplicates++;
                continue;
            }
            seenPairs.add(pairKey);
            nextEdges.push(
                nextWeighted
                    ? { from: e.from, to: e.to, weight: prevWeighted ? e.weight : 1 }
                    : { from: e.from, to: e.to },
            );
        }
    } else {
        for (const e of currentEdges) {
            nextEdges.push(
                nextWeighted
                    ? { from: e.from, to: e.to, weight: prevWeighted ? e.weight : 1 }
                    : { from: e.from, to: e.to },
            );
        }
    }

    const res = Graph.from({
        directed: nextDirected,
        weighted: nextWeighted,
        vertices,
        edges: nextEdges,
    });

    if (!res.ok) {
        els.directedToggle.checked = prevDirected;
        els.weightedToggle.checked = prevWeighted;
        syncModeInputs();
        notify(res.error, "error");
        return;
    }

    graph = res.value;
    syncModeInputs();
    clearAllFieldValidity();
    loadSteps(res.steps, { autoPlay: false, landAtEnd: true });

    let detail = `Switched to ${modeProse(nextDirected, nextWeighted)} mode.`;
    if (mergedDuplicates > 0) {
        detail =
            `Switched to ${modeProse(nextDirected, nextWeighted)} mode; collapsed ${mergedDuplicates} ` +
            `opposite-direction edge ${mergedDuplicates === 1 ? "pair" : "pairs"} (kept lower-ID → higher-ID edge).`;
    } else if (!prevDirected && nextDirected && nextEdges.length > 0) {
        detail = `Switched to ${modeProse(nextDirected, nextWeighted)} mode (existing edges oriented lower → higher ID).`;
    } else if (!prevWeighted && nextWeighted && nextEdges.length > 0) {
        detail = `Switched to ${modeProse(nextDirected, nextWeighted)} mode (existing edges set to weight 1).`;
    } else if (prevWeighted && !nextWeighted && nextEdges.length > 0) {
        detail = `Switched to ${modeProse(nextDirected, nextWeighted)} mode (custom weights removed).`;
    }

    notify(detail, mergedDuplicates > 0 ? "warning" : "info");
}

function parseVertexIdInput(inputEl, label, fieldKey) {
    const parsed = parseInteger(inputEl.value, {
        min: GRAPH_LIMITS.minId,
        max: GRAPH_LIMITS.maxId,
        label,
    });
    if (!parsed.ok) {
        notify(parsed.error, "error", fieldKey);
        inputEl.focus();
        return null;
    }
    return parsed.value;
}

function handleAddVertex(e) {
    e.preventDefault();
    const id = parseVertexIdInput(els.vertexInput, "Vertex ID", "vertex");
    if (id === null) return;

    const res = graph.addVertex(id);
    if (!res.ok) {
        notify(res.error, "error", "vertex");
        els.vertexInput.focus();
        return;
    }

    loadSteps(res.steps, { autoPlay: false });
    notify(`Added vertex ${id} (${graph.vertexCount}/${GRAPH_LIMITS.maxVertices} vertices).`, "success");
    els.vertexInput.value = "";
    els.vertexInput.focus();
}

function handleRemoveVertex() {
    const id = parseVertexIdInput(els.vertexInput, "Vertex ID", "vertex");
    if (id === null) return;

    const res = graph.removeVertex(id);
    if (!res.ok) {
        notify(res.error, "error", "vertex");
        els.vertexInput.focus();
        return;
    }

    loadSteps(res.steps, { autoPlay: res.steps.length > 1 });
    notify(res.steps[res.steps.length - 1].message, "info");
    els.vertexInput.value = "";
    els.vertexInput.focus();
}

function handleAddEdge(e) {
    e.preventDefault();
    const from = parseVertexIdInput(els.fromInput, "From vertex", "from");
    if (from === null) return;
    const to = parseVertexIdInput(els.toInput, "To vertex", "to");
    if (to === null) return;

    let res;
    if (graph.weighted) {
        const parsedWeight = parseInteger(els.weightInput.value, {
            min: GRAPH_LIMITS.minWeight,
            max: GRAPH_LIMITS.maxWeight,
            label: "Weight",
        });
        if (!parsedWeight.ok) {
            notify(parsedWeight.error, "error", "weight");
            els.weightInput.focus();
            return;
        }
        res = graph.addEdge(from, to, parsedWeight.value);
    } else {
        res = graph.addEdge(from, to);
    }

    if (!res.ok) {
        const invalidField = !graph.hasVertex(from) ? "from" : !graph.hasVertex(to) ? "to" : from === to ? "to" : null;
        notify(res.error, "error", invalidField);
        if (invalidField === "to") els.toInput.focus();
        else els.fromInput.focus();
        return;
    }

    loadSteps(res.steps, { autoPlay: false });
    notify(res.steps[0].message, "success");
    els.fromInput.value = "";
    els.toInput.value = "";
    if (graph.weighted) els.weightInput.value = "";
    els.fromInput.focus();
}

function handleRemoveEdge() {
    const from = parseVertexIdInput(els.fromInput, "From vertex", "from");
    if (from === null) return;
    const to = parseVertexIdInput(els.toInput, "To vertex", "to");
    if (to === null) return;

    const res = graph.removeEdge(from, to);
    if (!res.ok) {
        const invalidField = !graph.hasVertex(from) ? "from" : !graph.hasVertex(to) ? "to" : null;
        notify(res.error, "error", invalidField);
        if (invalidField === "to") els.toInput.focus();
        else els.fromInput.focus();
        return;
    }

    loadSteps(res.steps, { autoPlay: false });
    notify(res.steps[0].message, "info");
    els.fromInput.value = "";
    els.toInput.value = "";
    els.fromInput.focus();
}

function buildSampleGraph({ silent = false, landAtEnd = false, autoPlay = true } = {}) {
    const directed = els.directedToggle.checked;
    const weighted = els.weightedToggle.checked;
    const rawEdges = directed ? [...SAMPLE_EDGES, SAMPLE_DIRECTED_EXTRA] : SAMPLE_EDGES;
    const edges = rawEdges.map((e) =>
        weighted ? { from: e.from, to: e.to, weight: e.weight } : { from: e.from, to: e.to },
    );

    const res = Graph.from({
        directed,
        weighted,
        vertices: SAMPLE_VERTICES,
        edges,
    });
    if (!res.ok) {
        if (!silent) notify(res.error, "error");
        return;
    }

    graph = res.value;
    clearAllFieldValidity();
    loadSteps(res.steps, { autoPlay, landAtEnd });
    if (!silent) {
        notify(
            `Loaded sample ${modeProse(directed, weighted)} graph ` +
            `(${graph.vertexCount} vertices, ${graph.edgeCount} edges).`,
            "success",
        );
    }
}

function handleRandomGraph() {
    const directed = els.directedToggle.checked;
    const weighted = els.weightedToggle.checked;
    const vertexCount = 5 + Math.floor(Math.random() * 4); // 5..8 vertices
    const vertices = Array.from({ length: vertexCount }, (_, i) => i);

    const edgeSet = new Set();
    const edges = [];

    const addUniqueEdge = (u, v) => {
        if (u === v) return false;
        const key = directed ? `${u}->${v}` : `${Math.min(u, v)}--${Math.max(u, v)}`;
        if (edgeSet.has(key)) return false;
        edgeSet.add(key);
        const weight = 1 + Math.floor(Math.random() * 25);
        edges.push(weighted ? { from: u, to: v, weight } : { from: u, to: v });
        return true;
    };

    // Spanning backbone so the random graph starts connected.
    for (let i = 1; i < vertexCount; i++) {
        const parent = Math.floor(Math.random() * i);
        if (directed && Math.random() < 0.35) {
            addUniqueEdge(i, parent);
        } else {
            addUniqueEdge(parent, i);
        }
    }

    const extraTarget = 2 + Math.floor(Math.random() * 4);
    let attempts = 0;
    let addedExtra = 0;
    while (addedExtra < extraTarget && attempts < 40) {
        attempts++;
        const u = Math.floor(Math.random() * vertexCount);
        const v = Math.floor(Math.random() * vertexCount);
        if (addUniqueEdge(u, v)) addedExtra++;
    }

    const res = Graph.from({ directed, weighted, vertices, edges });
    if (!res.ok) {
        notify(res.error, "error");
        return;
    }

    graph = res.value;
    clearAllFieldValidity();
    loadSteps(res.steps, { autoPlay: true });
    notify(
        `Generated random ${modeProse(directed, weighted)} graph ` +
        `(${graph.vertexCount} vertices, ${graph.edgeCount} edges).`,
        "success",
    );
}

function handleClear() {
    const res = graph.clear();
    clearAllFieldValidity();
    loadSteps(res.steps, { autoPlay: false });
    notify(res.steps[0].message, "info");
}

/* ---------- Event Wiring ---------- */

els.directedToggle.addEventListener("change", handleModeToggle);
els.weightedToggle.addEventListener("change", handleModeToggle);

els.vertexForm.addEventListener("submit", handleAddVertex);
els.removeVertexBtn.addEventListener("click", handleRemoveVertex);
els.edgeForm.addEventListener("submit", handleAddEdge);
els.removeEdgeBtn.addEventListener("click", handleRemoveEdge);

els.sampleBtn.addEventListener("click", () => buildSampleGraph({ autoPlay: true }));
els.randomBtn.addEventListener("click", handleRandomGraph);
els.clearBtn.addEventListener("click", handleClear);

const playerControls = {
    toggle: byUser(() => {
        if (sidebarOpen() || player.length <= 1) return;
        togglePlayback();
    }),
    pause: byUser(() => {
        if (sidebarOpen()) return;
        pausePlayback();
    }),
    next: byUser(() => {
        if (sidebarOpen() || player.atEnd) return;
        pausePlayback();
        player.next();
    }),
    prev: byUser(() => {
        if (sidebarOpen() || player.atStart) return;
        autoPlaying = false;
        player.prev();
    }),
    reset: byUser(() => {
        if (sidebarOpen() || player.atStart) return;
        autoPlaying = false;
        player.reset();
    }),
};

els.playBtn.addEventListener("click", playerControls.toggle);
els.stepFwdBtn.addEventListener("click", playerControls.next);
els.stepBackBtn.addEventListener("click", playerControls.prev);
els.resetBtn.addEventListener("click", playerControls.reset);
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value)));
els.progress.addEventListener("input", byUser(() => {
    const target = Number(els.progress.value);
    pausePlayback();
    player.goTo(target);
}));

bindPlayerKeys(document, playerControls);

const SCROLL_STOP_KEYS = new Set([" ", "ArrowLeft", "ArrowRight", "Home"]);
document.querySelectorAll(".hp-scroll-region").forEach((region) => {
    region.addEventListener("keydown", (e) => {
        if (SCROLL_STOP_KEYS.has(e.key)) {
            e.stopPropagation();
        }
    });
});

/* ---------- Static Metadata & Complexity Table (from GRAPH_INFO) ---------- */

function parseComplexityPair(entry) {
    const parts = String(entry ?? "").split("|").map((s) => s.trim());
    const listPart = (parts[0] ?? "").replace(/^Adjacency List:\s*/i, "");
    const matrixPart = (parts[1] ?? "").replace(/^Adjacency Matrix:\s*/i, "");
    return [listPart || "—", matrixPart || "—"];
}

$("graphName").textContent = GRAPH_INFO.name;
$("graphSummary").textContent = GRAPH_INFO.summary;
$("cxAddEdge").textContent = GRAPH_INFO.complexity.addEdge;
$("cxHasEdge").textContent = GRAPH_INFO.complexity.hasEdge;
$("cxNeighbors").textContent = GRAPH_INFO.complexity.neighbors;
$("cxSpace").textContent = GRAPH_INFO.complexity.space;

const CX_SPEC = [
    ["Add Vertex", "addVertex", "Matrix reallocates and copies all V² entries into a (V + 1) × (V + 1) grid."],
    ["Remove Vertex", "removeVertex", "List scans all lists in directed mode to remove incoming edges; matrix rebuilds without that row and column."],
    ["Add Edge", "addEdge", "Sorted lists insert in order and reject duplicates (unsorted lists without duplicate checks are O(1))."],
    ["Remove Edge", "removeEdge", "Undirected mode updates both adj[u] and adj[v]; directed mode updates only adj[u]."],
    ["Edge Lookup (hasEdge)", "hasEdge", "List scans adj[u] linearly (binary search on a sorted array would be O(log deg(u))); matrix checks M[u][v] !== null in O(1)."],
    ["List Neighbors", "neighbors", "List visits only existing edges; matrix scans all V columns."],
    ["Space", "space", "Sparse graphs (E ≪ V²) save substantial memory with lists."],
];

const cxBody = $("cxTable");
cxBody.replaceChildren(
    ...CX_SPEC.map(([label, key, note]) => {
        const [listCx, matrixCx] = parseComplexityPair(GRAPH_INFO.complexity[key]);
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.scope = "row";
        th.textContent = label;
        const tdList = document.createElement("td");
        tdList.textContent = listCx;
        const tdMatrix = document.createElement("td");
        tdMatrix.textContent = matrixCx;
        const tdNote = document.createElement("td");
        tdNote.textContent = note;
        tr.append(th, tdList, tdMatrix, tdNote);
        return tr;
    }),
);

/* ---------- Silent Initial Load ---------- */

syncModeInputs();
buildSampleGraph({ silent: true, landAtEnd: true, autoPlay: false });
announceReady = true;
liveReady = true;
