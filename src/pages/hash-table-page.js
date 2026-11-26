/**
 * Hash Table page controller.
 * All hashing, chaining, linear probing, tombstone and rehash logic lives in
 * src/structures/hash-table.js; this file renders snapshots via StepPlayer.
 */
import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import {
    HashTable,
    HASH_STRATEGIES,
    parseKeyInput,
    parseCapacityInput,
    parseValueInput,
    sampleDataset,
} from "../structures/hash-table.js";

const $ = (id) => document.getElementById(id);

const els = {
    strategy: $("strategySelect"),
    capacity: $("capacityInput"),
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
    statCollisions: $("statCollisions"),
};

// Highlight classes for the active bucket/slot (defined in main.css section 13, theme-aware).
const TONE_CLASSES = {
    select: "ht-tone-select",
    compare: "ht-tone-compare",
    sorted: "ht-tone-sorted",
    swap: "ht-tone-swap",
};

const OP_LABELS = {
    insert: "Insert / Update",
    search: "Search",
    delete: "Delete",
    rehash: "Rehash / Resize",
};

let table = new HashTable(HashTable.DEFAULT_CAPACITY, { strategy: "chaining" });
let currentCodeKey = "";

const player = new StepPlayer({ onStep: render, baseDelay: 800 });

function notify(msg, type = "info", invalidField = null) {
    const isError = type === "error";
    els.message.className = `alert-banner alert-live alert-${type}`;
    els.message.setAttribute("role", isError ? "alert" : "status");
    els.message.setAttribute("aria-live", isError ? "assertive" : "polite");
    els.message.textContent = msg || "";
    els.message.hidden = !msg;

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
    els.stageLabel.textContent = strategyKey === "chaining"
        ? "Separate Chaining — Bucket Array & Linked Chains"
        : "Linear Probing — Open-Addressing Slot Array";
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

function renderLinearStage(step) {
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
    else renderLinearStage(step);

    [...els.code.children].forEach((li, i) => li.classList.toggle("active", i + 1 === step.line));

    els.stepMessage.textContent = step.message;
    els.statFormula.textContent = `h(k) = ((k mod ${snap.capacity}) + ${snap.capacity}) mod ${snap.capacity}`;
    els.statSize.textContent = String(snap.size);
    els.statCap.textContent = String(snap.capacity);
    els.statLoad.textContent = `${snap.loadFactor.toFixed(2)} (${snap.size}/${snap.capacity})`;
    els.statTombstones.textContent = snap.strategy === "linear" ? String(snap.tombstones) : "N/A";
    els.statProbes.textContent = String(step.probes);
    els.statCollisions.textContent = String(snap.totalCollisions);

    els.counter.textContent = `Step ${index + 1} / ${p.length}`;
    els.progress.max = Math.max(0, p.length - 1);
    els.progress.value = index;

    els.playBtn.innerHTML = p.isPlaying ? "&#x23F8; Pause" : (p.atEnd ? "&#x21BB; Replay" : "&#x25B6; Play");
    els.playBtn.setAttribute("aria-label", p.isPlaying ? "Pause" : (p.atEnd ? "Replay" : "Play"));
    els.prevBtn.disabled = p.atStart;
    els.resetBtn.disabled = p.atStart;
    els.nextBtn.disabled = p.atEnd;
}

function playSteps(steps, { autoPlay = true } = {}) {
    if (!steps || steps.length === 0) return;
    player.load(steps);
    if (autoPlay && steps.length > 1) player.play();
}

function loadDemoData() {
    clearNotify();
    const strategy = els.strategy.value;
    const capRes = parseCapacityInput(els.capacity.value);
    const capacity = capRes.ok ? capRes.value : table.capacity;
    els.capacity.value = String(capacity);

    table = new HashTable(capacity, { strategy });
    const items = sampleDataset(capacity);
    let lastSteps = [];
    for (const item of items) {
        const res = table.insert(item.key, item.value);
        if (res.ok) lastSteps = res.steps;
    }
    if (lastSteps.length) {
        // Show final populated table immediately on the last step, while letting users scrub back through the last insert.
        player.load(lastSteps);
        player.goTo(lastSteps.length - 1);
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
    const capRes = parseCapacityInput(els.capacity.value);
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
    const capRes = parseCapacityInput(els.capacity.value);
    const nextCap = capRes.ok ? capRes.value : table.capacity;
    const existing = table.entries();

    // Ensure linear probing has room for carried-over entries.
    const requiredCap = nextStrategy === "linear"
        ? Math.min(HashTable.MAX_CAPACITY, Math.max(nextCap, existing.length))
        : nextCap;
    els.capacity.value = String(requiredCap);

    table = new HashTable(requiredCap, { strategy: nextStrategy });
    const carried = existing.slice(0, nextStrategy === "linear" ? requiredCap : existing.length);
    let lastSteps = [];
    for (const entry of carried) {
        const res = table.insert(entry.key, entry.value);
        if (res.ok) lastSteps = res.steps;
    }

    currentCodeKey = "";
    if (lastSteps.length) {
        player.load(lastSteps);
        player.goTo(lastSteps.length - 1);
    } else {
        const cleared = table.clear();
        player.load(cleared.steps);
    }

    const dropped = existing.length - carried.length;
    notify(
        `Switched to ${HASH_STRATEGIES[nextStrategy].name} (m = ${requiredCap}, ${carried.length} entries carried over${dropped > 0 ? `, ${dropped} omitted due to max capacity ${HashTable.MAX_CAPACITY}` : ""}).`,
        "info",
    );
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

els.playBtn.addEventListener("click", () => player.toggle());
els.nextBtn.addEventListener("click", () => { player.pause(); player.next(); });
els.prevBtn.addEventListener("click", () => player.prev());
els.resetBtn.addEventListener("click", () => player.reset());
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value)));
els.progress.addEventListener("input", () => {
    // Read the slider before pausing: pause() re-renders and can reset els.progress.value.
    const target = Number(els.progress.value);
    player.pause();
    player.goTo(target);
});

bindPlayerKeys(document, player);

// Populate comparison table from the static HASH_STRATEGIES registry (no user text).
$("cxTable").innerHTML = Object.values(HASH_STRATEGIES).map(s =>
    `<tr><th scope="row">${s.name}</th><td>${s.complexity.insertAvg}</td><td>${s.complexity.searchAvg}</td>` +
    `<td>${s.complexity.deleteAvg}</td><td>${s.complexity.worst}</td><td>${s.complexity.space}</td></tr>`
).join("");

loadDemoData();
