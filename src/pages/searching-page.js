import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import {
    SEARCHING_ALGORITHMS,
    traceSearch,
    parseArrayInput,
    parseTargetInput,
    randomSearchCase,
} from "../algorithms/searching.js";

const $ = (id) => document.getElementById(id);

const els = {
    form: $("inputForm"),
    algo: $("algoSelect"),
    input: $("arrayInput"),
    target: $("targetInput"),
    error: $("inputError"),
    random: $("randomBtn"),
    reset: $("resetBtn"),
    prev: $("prevBtn"),
    play: $("playBtn"),
    next: $("nextBtn"),
    speed: $("speedSelect"),
    progress: $("progress"),
    counter: $("stepCounter"),
    bars: $("bars"),
    message: $("stepMessage"),
    code: $("pseudocode"),
    statTarget: $("statTarget"),
    statCompare: $("statCompare"),
    statLow: $("statLow"),
    statMid: $("statMid"),
    statHigh: $("statHigh"),
    statRange: $("statRange"),
    statResult: $("statResult"),
};

let values = [];
let target = 0;
let valueBounds = { min: 0, max: 1 };

const player = new StepPlayer({ onStep: render });

// Screen readers: #stepMessage is a polite live region, but it only speaks for steps the
// user asked for (buttons, keys, slider, loading new input) and for the last step of an
// autoplay run. During autoplay it is aria-live="off", so a reader is not flooded with a
// new sentence every step (several per second at 4x). Page load stays silent.
let userStep = false;
let liveReady = false;
const byUser = (fn) => (...args) => {
    userStep = true;
    try { return fn(...args); } finally { userStep = false; }
};
function setStepMessage(text, p) {
    els.message.setAttribute("aria-live", liveReady && (userStep || p.atEnd) ? "polite" : "off");
    if (els.message.textContent !== text) els.message.textContent = text;
}
// Keyboard shortcuts go through the same wrappers so they count as user steps.
const userControls = {
    toggle: byUser(() => player.toggle()),
    pause: byUser(() => player.pause()),
    next: byUser(() => player.next()),
    prev: byUser(() => player.prev()),
    reset: byUser(() => player.reset()),
};

function pointerLabel(i, step) {
    const tags = [];
    if (step.low === i) tags.push("L");
    if (step.mid === i) tags.push("M");
    if (step.high === i) tags.push("H");
    return tags.join("·");
}

function render(step, index, p) {
    const highlight = new Set(step.indices);
    const bars = els.bars.children;
    const [lo, hi] = step.range ?? [-1, -1];

    step.array.forEach((v, i) => {
        const bar = bars[i];
        if (!bar) return;
        const pct = 12 + 88 * ((v - valueBounds.min) / (valueBounds.max - valueBounds.min || 1));
        bar.style.setProperty("--h", `${pct}%`);
        bar.querySelector(".bar-value").textContent = v;

        const tags = pointerLabel(i, step);
        const idxEl = bar.querySelector(".bar-index");
        idxEl.textContent = tags ? `${i} ${tags}` : String(i);

        bar.className = "bar";
        const isFoundBar = step.foundIndex === i && (step.type === "found" || step.type === "done");
        if (isFoundBar) {
            bar.classList.add("is-sorted");
        } else if (highlight.has(i)) {
            if (step.type === "compare") bar.classList.add("is-compare");
            else if (step.type === "narrow") bar.classList.add("is-select");
            else if (step.type === "not-found") bar.classList.add("is-swap");
        }

        // Fade bars outside the active [low..high] search window (matches sorting-page.js pattern).
        const outOfRange = step.range !== null && (i < lo || i > hi);
        const searchExhausted = step.type === "not-found" || (step.type === "done" && step.foundIndex === null);
        bar.style.opacity = outOfRange || searchExhausted ? "0.3" : "";
    });

    [...els.code.children].forEach((li, i) => li.classList.toggle("active", i + 1 === step.line));

    setStepMessage(step.message, p);
    els.statTarget.textContent = String(target);
    els.statCompare.textContent = String(step.comparisons);
    els.statLow.textContent = step.low !== null ? String(step.low) : "—";
    els.statMid.textContent = step.mid !== null ? String(step.mid) : "—";
    els.statHigh.textContent = step.high !== null ? String(step.high) : "—";
    els.statRange.textContent = step.range ? `A[${step.range[0]}..${step.range[1]}]` : "empty";
    els.statResult.textContent = step.foundIndex !== null
        ? `Found at index ${step.foundIndex}`
        : (step.type === "not-found" || step.type === "done" ? "Not found" : "Searching…");

    els.counter.textContent = `Step ${index + 1} / ${p.length}`;
    els.progress.max = p.length - 1;
    els.progress.value = index;

    els.play.innerHTML = p.isPlaying ? "&#x23F8; Pause" : (p.atEnd ? "&#x21BB; Replay" : "&#x25B6; Play");
    els.play.setAttribute("aria-label", p.isPlaying ? "Pause" : (p.atEnd ? "Replay" : "Play"));
    els.progress.setAttribute("aria-valuetext", `Step ${index + 1} of ${p.length}`);
    const focused = document.activeElement;
    els.prev.disabled = p.atStart;
    els.reset.disabled = p.atStart;
    els.next.disabled = p.atEnd;
    // A focused Back/Reset/Step button that just became disabled would drop focus to <body>.
    if (focused && focused.disabled) els.play.focus();
}

function buildBars(n) {
    els.bars.replaceChildren(...Array.from({ length: n }, (_, i) => {
        const bar = document.createElement("div");
        bar.className = "bar";
        bar.innerHTML = `<span class="bar-fill"><span class="bar-value"></span></span><span class="bar-index">${i}</span>`;
        return bar;
    }));
    els.bars.style.setProperty("--n", n);
}

function showAlgorithmInfo(key) {
    const a = SEARCHING_ALGORITHMS[key];
    $("algoName").textContent = a.name;
    $("algoSummary").textContent = a.summary;
    $("cxBest").textContent = a.complexity.best;
    $("cxAvg").textContent = a.complexity.average;
    $("cxWorst").textContent = a.complexity.worst;
    $("cxSpace").textContent = a.complexity.space;
    $("cxSorted").textContent = a.complexity.requiresSorted ? "Yes (auto-sorted)" : "No";
    els.code.replaceChildren(...a.pseudocode.map(line => {
        const li = document.createElement("li");
        li.textContent = line;
        return li;
    }));
}

function load(newValues, newTarget) {
    values = newValues;
    target = newTarget;
    valueBounds = { min: Math.min(...values), max: Math.max(...values) };
    showAlgorithmInfo(els.algo.value);
    buildBars(values.length);
    player.load(traceSearch(els.algo.value, values, target));
}

function setError(msg, invalidField = null) {
    els.error.textContent = msg || "";
    els.error.hidden = !msg;
    if (msg) window.DSA_UI?.announce?.(msg, "assertive");
    els.input.setAttribute("aria-invalid", invalidField === "array" ? "true" : "false");
    els.target.setAttribute("aria-invalid", invalidField === "target" ? "true" : "false");
}

function loadFromInput() {
    const parsedArr = parseArrayInput(els.input.value);
    if (!parsedArr.ok) {
        setError(parsedArr.error, "array");
        els.input.focus();
        return;
    }
    const parsedTarget = parseTargetInput(els.target.value);
    if (!parsedTarget.ok) {
        setError(parsedTarget.error, "target");
        els.target.focus();
        return;
    }
    setError("");
    load(parsedArr.values, parsedTarget.value);
}

els.form.addEventListener("submit", byUser((e) => { e.preventDefault(); loadFromInput(); }));
els.random.addEventListener("click", byUser(() => {
    const next = randomSearchCase(10);
    els.input.value = next.values.join(", ");
    els.target.value = String(next.target);
    setError("");
    load(next.values, next.target);
}));
els.algo.addEventListener("change", byUser(() => load(values, target)));
els.play.addEventListener("click", userControls.toggle);
els.next.addEventListener("click", () => { userControls.pause(); userControls.next(); });
els.prev.addEventListener("click", userControls.prev);
els.reset.addEventListener("click", userControls.reset);
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value)));
els.progress.addEventListener("input", byUser(() => {
    // Read the slider before pausing: pause() re-renders and can reset els.progress.value.
    const target = Number(els.progress.value);
    player.pause();
    player.goTo(target);
}));

bindPlayerKeys(document, userControls);

$("cxTable").innerHTML = Object.values(SEARCHING_ALGORITHMS).map(a =>
    `<tr><th scope="row">${a.name}</th><td>${a.complexity.best}</td><td>${a.complexity.average}</td>` +
    `<td>${a.complexity.worst}</td><td>${a.complexity.space}</td><td>${a.complexity.requiresSorted ? "Yes" : "No"}</td></tr>`
).join("");

loadFromInput();
liveReady = true;
