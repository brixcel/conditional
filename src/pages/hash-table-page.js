/**
 * Hash Table page controller.
 * All hashing, chaining, linear/quadratic probing, tombstone and rehash logic lives in
 * src/structures/hash-table.js; this file renders snapshots via StepPlayer.
 */
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import {
    HashTable,
    HASH_STRATEGIES,
    QUADRATIC_CAPACITIES,
    fitCapacity,
    maxEntriesFor,
    parseKeyInput,
    parseCapacityInput,
    parseValueInput,
    sampleDataset,
} from "../structures/hash-table.js";

const $ = (id) => document.getElementById(id);

const els = {
    strategy: $("strategySelect"),
    capacity: $("capacityInput"),
    capacityHint: $("capacityHint"),
    rehashBtn: $("rehashBtn"),
    demoBtn: $("demoBtn"),
    clearBtn: $("clearBtn"),
    opForm: $("opForm"),
    keyInput: $("keyInput"),
    valueInput: $("valueInput"),
    insertBtn: $("insertBtn"),
    searchBtn: $("searchBtn"),
    deleteBtn: $("deleteBtn"),
    message: $("htMessage"),
    resetBtn: $("resetBtn"),
    prevBtn: $("prevBtn"),
    playBtn: $("playBtn"),
    nextBtn: $("nextBtn"),
    speed: $("speedSelect"),
    progress: $("progress"),
    counter: $("stepCounter"),
    stageLabel: $("stageLabel"),
    stage: $("hashStage"),
    stepMessage: $("stepMessage"),
    codeHeading: $("codeHeading"),
    code: $("pseudocode"),
    statFormula: $("statFormula"),
    statSize: $("statSize"),
    statCap: $("statCap"),
    statLoad: $("statLoad"),
    statTombstones: $("statTombstones"),
    statProbes: $("statProbes"),
    statProbeStep: $("statProbeStep"),
    statCollisions: $("statCollisions"),
};

// Highlight classes for the active bucket/slot (defined in main.css section 13, theme-aware).
const TONE_CLASSES = {
    select: "ht-tone-select",
    compare: "ht-tone-compare",
    sorted: "ht-tone-sorted",
    swap: "ht-tone-swap",
};

const STAGE_LABELS = {
    chaining: "Separate Chaining — Bucket Array & Linked Chains",
    linear: "Linear Probing — Open-Addressing Slot Array",
    quadratic: "Quadratic Probing — Open-Addressing Slot Array (h + i²)",
};

const OP_LABELS = {
    insert: "Insert / Update",
    search: "Search",
    delete: "Delete",
    rehash: "Rehash / Resize",
};

let table = new HashTable(HashTable.DEFAULT_CAPACITY, { strategy: "chaining" });

/**
 * Build a table without letting a RangeError escape into the page.
 * Returns { ok: true, table } or { ok: false, error } with the module's readable message.
 */
function makeTable(capacity, strategy) {
    try {
        return { ok: true, table: new HashTable(capacity, { strategy }) };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/** Allowed table sizes for the field label: a range, or the prime list for quadratic. */
function capacityHintText(strategy) {
    return strategy === "quadratic"
        ? `(prime: ${QUADRATIC_CAPACITIES.join(", ")})`
        : `(${HashTable.MIN_CAPACITY}–${HashTable.MAX_CAPACITY})`;
}

function updateCapacityHint(strategy) {
    const text = capacityHintText(strategy);
    if (els.capacityHint.textContent !== text) els.capacityHint.textContent = text;
}
let currentCodeKey = "";
let announceReady = false; // no banner announcements during page setup

const player = new StepPlayer({ onStep: render, baseDelay: 800 });

// Screen readers: #stepMessage is a polite live region, but it only speaks for steps the
// user asked for (player buttons, keys, slider) and for the last step of an autoplay run
// (insert/search/… announce their result through the banner, then autoplay). During autoplay it is aria-live="off", so a reader is not flooded with a
// new sentence every step (several per second at 4x). Page load stays silent.
let userStep = false;
let liveReady = false;
const byUser = (fn) => (...args) => {
    userStep = true;
    try { return fn(...args); } finally { userStep = false; }
};
function setStepMessage(text, p) {
    els.stepMessage.setAttribute("aria-live", liveReady && (userStep || p.atEnd) ? "polite" : "off");
    if (els.stepMessage.textContent !== text) els.stepMessage.textContent = text;
}
// Keyboard shortcuts go through the same wrappers so they count as user steps.
const userControls = {
    toggle: byUser(() => player.toggle()),
    pause: byUser(() => player.pause()),
    next: byUser(() => player.next()),
    prev: byUser(() => player.prev()),
    reset: byUser(() => player.reset()),
};

function notify(msg, type = "info", invalidField = null) {
    const isError = type === "error";
    els.message.className = `alert-banner alert-live alert-${type}`;
    els.message.textContent = msg || "";
    els.message.hidden = !msg;
    if (announceReady) window.DSA_UI?.announce?.(msg, isError ? "assertive" : "polite");

    els.keyInput.setAttribute("aria-invalid", invalidField === "key" ? "true" : "false");
    els.valueInput.setAttribute("aria-invalid", invalidField === "value" ? "true" : "false");
    els.capacity.setAttribute("aria-invalid", invalidField === "capacity" ? "true" : "false");
}

function clearNotify() {
    notify("");
}

function stepTone(type) {
    if (type === "hash" || type === "rehash") return "select";
    if (type === "probe") return "compare";
    if (type === "insert" || type === "update" || type === "found") return "sorted";
    if (type === "delete" || type === "not-found" || type === "overflow") return "swap";
    return null;
}

function updateStrategyInfo(strategyKey) {
    const info = HASH_STRATEGIES[strategyKey];
    $("strategyName").textContent = info.name;
    $("strategySummary").textContent = info.summary;
    $("cxInsert").textContent = info.complexity.insertAvg;
    $("cxSearch").textContent = info.complexity.searchAvg;
    $("cxDelete").textContent = info.complexity.deleteAvg;
    $("cxWorst").textContent = info.complexity.worst;
    $("cxLoad").textContent = info.complexity.loadFactor;
    els.stageLabel.textContent = STAGE_LABELS[strategyKey] ?? info.name;
    updateCapacityHint(strategyKey);
}

/**
 * Quadratic probe detail for a recorded step, e.g. "i=2: (h + 2²) mod m = (3 + 4) mod 11 = slot 7".
 * Uses only fields the module recorded (probeIndex, offset, homeIndex, indices); null otherwise.
 */
function probeDetail(step) {
    if (step.probeIndex === null || step.probeIndex === undefined) return null;
    const i = step.probeIndex;
    const slot = step.indices.length ? step.indices[0] : null;
    const base = `i=${i}: (h + ${i}²) mod m`;
    if (step.homeIndex === null || slot === null) return base;
    return `${base} = (${step.homeIndex} + ${step.offset}) mod ${step.snapshot.capacity} = slot ${slot}`;
}

function renderPseudocode(strategyKey, operation) {
    const op = HASH_STRATEGIES[strategyKey].pseudocode[operation] ? operation : "insert";
    const key = `${strategyKey}:${op}`;
    if (key === currentCodeKey) return;
    currentCodeKey = key;
    els.codeHeading.textContent = `Pseudocode (${OP_LABELS[op] ?? op})`;
    els.code.replaceChildren(...HASH_STRATEGIES[strategyKey].pseudocode[op].map(line => {
        const li = document.createElement("li");
        li.textContent = line;
        return li;
    }));
}

function createEntryNode(entry, tone) {
    const node = document.createElement("div");
    node.className = "node-box";
    const keyEl = document.createElement("span");
    keyEl.className = "mono";
    keyEl.textContent = String(entry.key);
    node.append(keyEl);

    if (entry.value !== null) {
        const valEl = document.createElement("span");
        valEl.className = "slot-label";
        valEl.textContent = entry.value;
        node.append(valEl);
    }

    if (tone && TONE_CLASSES[tone]) node.classList.add(TONE_CLASSES[tone]);
    return node;
}

function renderChainingStage(step) {
    const snap = step.snapshot;
    const activeSet = new Set(step.indices);
    const tone = stepTone(step.type);

    const tbl = document.createElement("table");
    tbl.className = "cx-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const thBucket = document.createElement("th");
    thBucket.textContent = "Bucket";
    const thChain = document.createElement("th");
    thChain.textContent = "Linked Chain (Head → Tail)";
    headRow.append(thBucket, thChain);
    thead.append(headRow);
    tbl.append(thead);

    const tbody = document.createElement("tbody");
    snap.buckets.forEach((chain, i) => {
        const tr = document.createElement("tr");
        const isBucketActive = activeSet.has(i);
        const isHome = step.homeIndex === i;

        if (isBucketActive && tone && TONE_CLASSES[tone]) tr.classList.add(TONE_CLASSES[tone]);

        const th = document.createElement("th");
        th.scope = "row";
        th.className = isBucketActive || isHome ? "mono slot-label-active" : "mono";
        th.textContent = isHome ? `[${i}] h(k)` : `[${i}]`;

        const td = document.createElement("td");
        const container = document.createElement("div");
        container.className = "node-container";

        if (chain.length === 0) {
            const emptySpan = document.createElement("span");
            emptySpan.className = "text-muted text-italic";
            emptySpan.textContent = "empty (null)";
            container.append(emptySpan);
        } else {
            chain.forEach((entry, j) => {
                if (j > 0) {
                    const arrow = document.createElement("span");
                    arrow.className = "arrow";
                    arrow.setAttribute("aria-hidden", "true");
                    arrow.textContent = "→";
                    container.append(arrow);
                }
                const nodeTone = isBucketActive && step.chainIndex === j ? tone : null;
                const node = createEntryNode(entry, nodeTone);
                node.setAttribute("aria-label", `Bucket ${i}, node ${j}: key ${entry.key}${entry.value !== null ? `, value ${entry.value}` : ""}`);
                container.append(node);
            });
            const tailArrow = document.createElement("span");
            tailArrow.className = "arrow";
            tailArrow.setAttribute("aria-hidden", "true");
            tailArrow.textContent = "→";
            const nullTag = document.createElement("span");
            nullTag.className = "text-muted mono";
            nullTag.textContent = "null";
            container.append(tailArrow, nullTag);
        }

        td.append(container);
        tr.append(th, td);
        tbody.append(tr);
    });

    tbl.append(tbody);
    els.stage.replaceChildren(tbl);
    revealActive();
}

/**
 * Keep the highlighted slot/node visible on narrow screens: scroll the nearest
 * horizontally scrolling container (never the page) so it sits in the middle.
 */
function revealActive() {
    const active = els.stage.querySelector('[class*="ht-tone-"]');
    if (!active) return;
    for (let el = active.parentElement; el && el !== els.stage.parentElement; el = el.parentElement) {
        if (el.scrollWidth <= el.clientWidth) continue;
        const a = active.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        if (a.left < box.left || a.right > box.right) {
            el.scrollLeft += (a.left + a.width / 2) - (box.left + box.width / 2);
        }
        return;
    }
}

/** Slot strip for the open-addressing strategies (linear and quadratic probing). */
function renderSlotStage(step) {
    const snap = step.snapshot;
    const activeSet = new Set(step.indices);
    const tone = stepTone(step.type);

    const strip = document.createElement("div");
    strip.className = "queue-display";

    snap.slots.forEach((slot, i) => {
        const wrap = document.createElement("div");
        wrap.className = "slot-wrap";

        const isActive = activeSet.has(i);
        const isHome = step.homeIndex === i;

        const lbl = document.createElement("span");
        lbl.className = isActive || isHome ? "slot-label slot-label-active mono" : "slot-label mono";
        const tags = [];
        if (isHome) tags.push("HOME");
        if (isActive && step.probeIndex !== null && step.probeIndex !== undefined) tags.push(`i=${step.probeIndex}`);
        if (isActive && step.type === "probe") tags.push("PROBE");
        else if (isActive && (step.type === "found" || step.type === "insert" || step.type === "update")) tags.push("HIT");
        else if (isActive && step.type === "delete") tags.push("DEL");
        lbl.textContent = tags.length ? `[${i}] ${tags.join("·")}` : `[${i}]`;

        const box = document.createElement("div");
        if (slot.state === "occupied") {
            box.className = "node-box";
            const keyEl = document.createElement("span");
            keyEl.className = "mono";
            keyEl.textContent = String(slot.key);
            box.append(keyEl);
            if (slot.value !== null) {
                const valEl = document.createElement("span");
                valEl.className = "slot-label";
                valEl.textContent = slot.value;
                box.append(valEl);
            }
            box.setAttribute("aria-label", `Slot ${i}: key ${slot.key}${slot.value !== null ? `, value ${slot.value}` : ""}`);
        } else if (slot.state === "deleted") {
            box.className = "node-box car-empty ht-tombstone";
            const delEl = document.createElement("span");
            delEl.className = "mono";
            delEl.textContent = "DELETED";
            const subEl = document.createElement("span");
            subEl.className = "slot-label";
            subEl.textContent = "tombstone";
            box.append(delEl, subEl);
            box.setAttribute("aria-label", `Slot ${i}: deleted tombstone`);
        } else {
            box.className = "node-box car-empty";
            const emptyEl = document.createElement("span");
            emptyEl.className = "mono";
            emptyEl.textContent = "EMPTY";
            box.append(emptyEl);
            box.setAttribute("aria-label", `Slot ${i}: empty`);
        }

        if (isActive && tone && TONE_CLASSES[tone]) box.classList.add(TONE_CLASSES[tone]);

        wrap.append(lbl, box);
        strip.append(wrap);
    });

    els.stage.replaceChildren(strip);
    revealActive();
}

function render(step, index, p) {
    const snap = step.snapshot;
    updateStrategyInfo(snap.strategy);
    renderPseudocode(snap.strategy, step.operation);

    if (snap.strategy === "chaining") renderChainingStage(step);
    else renderSlotStage(step);

    [...els.code.children].forEach((li, i) => li.classList.toggle("active", i + 1 === step.line));

    setStepMessage(step.message, p);
    els.statFormula.textContent = `h(k) = ((k mod ${snap.capacity}) + ${snap.capacity}) mod ${snap.capacity}`;
    els.statSize.textContent = snap.maxSize === null || snap.maxSize === undefined
        ? String(snap.size)
        : `${snap.size} / max ${snap.maxSize}${snap.strategy === "quadratic" ? " (α ≤ 0.5)" : ""}`;
    els.statCap.textContent = String(snap.capacity);
    els.statLoad.textContent = `${snap.loadFactor.toFixed(2)} (${snap.size}/${snap.capacity})`;
    els.statTombstones.textContent = snap.strategy !== "chaining" ? String(snap.tombstones) : "N/A";
    els.statProbeStep.textContent = probeDetail(step) ?? "N/A";
    els.statProbes.textContent = String(step.probes);
    els.statCollisions.textContent = String(snap.totalCollisions);

    els.counter.textContent = `Step ${index + 1} / ${p.length}`;
    els.progress.max = Math.max(0, p.length - 1);
    els.progress.value = index;

    // One text node (icon + space + label), as in the static markup: .btn is inline-flex with no gap.
    const playLabel = p.isPlaying ? "\u23F8 Pause" : (p.atEnd ? "\u21BB Replay" : "\u25B6 Play");
    if (els.playBtn.textContent !== playLabel) els.playBtn.textContent = playLabel;
    els.playBtn.setAttribute("aria-label", p.isPlaying ? "Pause" : (p.atEnd ? "Replay" : "Play"));
    els.progress.setAttribute("aria-valuetext", `Step ${index + 1} of ${p.length}`);
    const focused = document.activeElement;
    els.prevBtn.disabled = p.atStart;
    els.resetBtn.disabled = p.atStart;
    els.nextBtn.disabled = p.atEnd;
    // A focused Back/Reset/Step button that just became disabled would drop focus to <body>.
    if (focused && focused.disabled) els.playBtn.focus();
}

function playSteps(steps, { autoPlay = true } = {}) {
    if (!steps || steps.length === 0) return;
    player.load(steps);
    if (autoPlay && steps.length > 1) player.play();
}

function loadDemoData({ initial = false } = {}) {
    clearNotify();
    const strategy = els.strategy.value;
    const capRes = parseCapacityInput(els.capacity.value, strategy);
    let capacity;
    if (capRes.ok) {
        capacity = capRes.value;
    } else if (initial) {
        // Page setup (e.g. the browser restored an odd field value): fall back quietly to a valid size.
        capacity = fitCapacity(strategy, HashTable.DEFAULT_CAPACITY, 0) ?? HashTable.DEFAULT_CAPACITY;
    } else {
        notify(capRes.error, "error", "capacity");
        els.capacity.focus();
        return;
    }
    const made = makeTable(capacity, strategy);
    if (!made.ok) { notify(made.error, "error", "capacity"); els.capacity.focus(); return; }
    els.capacity.value = String(capacity);

    table = made.table;
    currentCodeKey = "";
    const items = sampleDataset(capacity, Math.random, strategy);
    let lastSteps = [];
    for (const item of items) {
        const res = table.insert(item.key, item.value);
        if (res.ok) lastSteps = res.steps;
    }
    if (lastSteps.length) {
        // Show final populated table immediately on the last step, while letting users scrub back through the last insert.
        player.load(lastSteps);
        player.goTo(lastSteps.length - 1);
    } else {
        player.load(table.clear().steps);
    }
    notify(`Loaded ${items.length} sample entries into a ${HASH_STRATEGIES[strategy].name} table (m = ${capacity}) with intentional collisions.`, "info");
}

function handleInsert(e) {
    e.preventDefault();
    const keyRes = parseKeyInput(els.keyInput.value);
    if (!keyRes.ok) { notify(keyRes.error, "error", "key"); els.keyInput.focus(); return; }
    const valRes = parseValueInput(els.valueInput.value);
    if (!valRes.ok) { notify(valRes.error, "error", "value"); els.valueInput.focus(); return; }

    clearNotify();
    const res = table.insert(keyRes.value, valRes.value);
    playSteps(res.steps);
    if (!res.ok) {
        notify(res.error, "error");
    } else {
        const summary = res.value.updated
            ? `Updated key ${res.value.key} at index ${res.value.bucket}.`
            : `Inserted key ${res.value.key} at index ${res.value.bucket}${res.value.collision ? " (resolved collision)" : ""}.`;
        notify(summary, "success");
        els.keyInput.value = "";
        els.valueInput.value = "";
        els.keyInput.focus();
    }
}

function handleSearch() {
    const keyRes = parseKeyInput(els.keyInput.value);
    if (!keyRes.ok) { notify(keyRes.error, "error", "key"); els.keyInput.focus(); return; }

    clearNotify();
    const res = table.search(keyRes.value);
    playSteps(res.steps);
    if (res.value.found) {
        notify(`Found key ${res.value.key}${res.value.value !== null ? ` ("${res.value.value}")` : ""} at index ${res.value.bucket} in ${res.value.probes} probe${res.value.probes === 1 ? "" : "s"}.`, "success");
    } else {
        notify(`Key ${res.value.key} was not found (${res.value.probes} probe${res.value.probes === 1 ? "" : "s"}).`, "warning");
    }
}

function handleDelete() {
    const keyRes = parseKeyInput(els.keyInput.value);
    if (!keyRes.ok) { notify(keyRes.error, "error", "key"); els.keyInput.focus(); return; }

    clearNotify();
    const res = table.delete(keyRes.value);
    playSteps(res.steps);
    if (res.ok) {
        notify(`Deleted key ${res.value.key} from index ${res.value.bucket}.`, "info");
        els.keyInput.value = "";
        els.valueInput.value = "";
        els.keyInput.focus();
    } else {
        notify(res.error, "warning");
    }
}

function handleRehash() {
    const capRes = parseCapacityInput(els.capacity.value, table.strategy);
    if (!capRes.ok) { notify(capRes.error, "error", "capacity"); els.capacity.focus(); return; }

    clearNotify();
    const res = table.rehash(capRes.value);
    if (!res.ok) {
        notify(res.error, "error", "capacity");
        els.capacity.focus();
        return;
    }
    playSteps(res.steps);
    notify(`Rehashed table to size m = ${res.value.capacity} (${res.value.size} entries re-inserted${res.value.clearedTombstones ? `, ${res.value.clearedTombstones} tombstones cleared` : ""}).`, "success");
}

function handleStrategyChange() {
    const nextStrategy = els.strategy.value;
    const existing = table.entries();

    // Requested size: the typed value if valid for the new strategy, else the typed integer
    // (fitCapacity rounds it up to an allowed size, e.g. the next prime), else the current size.
    const capRes = parseCapacityInput(els.capacity.value, nextStrategy);
    const rawRes = capRes.ok ? capRes : parseCapacityInput(els.capacity.value);
    const requested = rawRes.ok ? rawRes.value : table.capacity;

    // Smallest allowed size >= requested that holds every carried-over entry. If none exists,
    // use the largest allowed size and carry over only as many entries as it may hold.
    let nextCap = fitCapacity(nextStrategy, requested, existing.length);
    let carryLimit = existing.length;
    if (nextCap === null) {
        nextCap = largestCapacity(nextStrategy);
        const limit = maxEntriesFor(nextCap, nextStrategy);
        carryLimit = limit === null ? existing.length : Math.min(existing.length, limit);
    }

    const made = makeTable(nextCap, nextStrategy);
    if (!made.ok) {
        // Not expected (fitCapacity only returns allowed sizes): keep the old table and selection.
        els.strategy.value = table.strategy;
        notify(made.error, "error", "capacity");
        return;
    }
    els.capacity.value = String(nextCap);
    table = made.table;

    const carried = existing.slice(0, carryLimit);
    let lastSteps = [];
    let failed = 0;
    for (const entry of carried) {
        const res = table.insert(entry.key, entry.value);
        if (res.ok) lastSteps = res.steps;
        else failed++;
    }

    currentCodeKey = "";
    if (lastSteps.length) {
        player.load(lastSteps);
        player.goTo(lastSteps.length - 1);
    } else {
        const cleared = table.clear();
        player.load(cleared.steps);
    }

    const kept = carried.length - failed;
    const dropped = existing.length - kept;
    const parts = [`m = ${nextCap}`, `${kept} entries carried over`];
    if (nextCap !== requested) {
        parts.push(nextStrategy === "quadratic"
            ? `size changed from ${requested} to the prime ${nextCap} so the entries fit at α ≤ 0.5`
            : `size changed from ${requested} to ${nextCap} so the entries fit`);
    }
    if (dropped > 0) {
        const limit = maxEntriesFor(nextCap, nextStrategy);
        parts.push(nextStrategy === "quadratic"
            ? `${dropped} omitted: the largest prime size ${nextCap} holds at most ${limit} entries at α ≤ 0.5`
            : `${dropped} omitted due to max capacity ${HashTable.MAX_CAPACITY}`);
    }
    notify(`Switched to ${HASH_STRATEGIES[nextStrategy].name} (${parts.join(", ")}).`, dropped > 0 ? "warning" : "info");
}

/** Largest table size allowed for `strategy` (searched from MAX_CAPACITY down). */
function largestCapacity(strategy) {
    for (let m = HashTable.MAX_CAPACITY; m >= HashTable.MIN_CAPACITY; m--) {
        if (fitCapacity(strategy, m, 0) === m) return m;
    }
    return HashTable.DEFAULT_CAPACITY;
}

function handleClear() {
    clearNotify();
    const res = table.clear();
    playSteps(res.steps, { autoPlay: false });
    notify("Table cleared.", "info");
}

els.opForm.addEventListener("submit", handleInsert);
els.searchBtn.addEventListener("click", handleSearch);
els.deleteBtn.addEventListener("click", handleDelete);
els.rehashBtn.addEventListener("click", handleRehash);
els.demoBtn.addEventListener("click", loadDemoData);
els.clearBtn.addEventListener("click", handleClear);
els.strategy.addEventListener("change", handleStrategyChange);
els.capacity.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleRehash(); }
});

els.playBtn.addEventListener("click", userControls.toggle);
els.nextBtn.addEventListener("click", () => { userControls.pause(); userControls.next(); });
els.prevBtn.addEventListener("click", userControls.prev);
els.resetBtn.addEventListener("click", userControls.reset);
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value)));
els.progress.addEventListener("input", byUser(() => {
    // Read the slider before pausing: pause() re-renders and can reset els.progress.value.
    const target = Number(els.progress.value);
    player.pause();
    player.goTo(target);
}));

bindPlayerKeys(document, userControls);

// Populate comparison table from the static HASH_STRATEGIES registry.
$("cxTable").replaceChildren(...Object.values(HASH_STRATEGIES).map(s => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = s.name;
    tr.append(th);
    const c = s.complexity;
    for (const text of [c.insertAvg, c.searchAvg, c.deleteAvg, c.worst, c.space]) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.append(td);
    }
    return tr;
}));

loadDemoData({ initial: true });
announceReady = true;
liveReady = true;
