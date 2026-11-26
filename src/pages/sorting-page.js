import { StepPlayer } from "../core/step-player.js";
import { bindPlayerKeys } from "../core/player-keys.js";
import { SORTING_ALGORITHMS, traceSort, parseArrayInput, randomArray } from "../algorithms/sorting.js";

const $ = (id) => document.getElementById(id);

const els = {
    form: $("inputForm"), algo: $("algoSelect"), input: $("arrayInput"), error: $("inputError"),
    random: $("randomBtn"), reset: $("resetBtn"), prev: $("prevBtn"), play: $("playBtn"), next: $("nextBtn"),
    speed: $("speedSelect"), progress: $("progress"), counter: $("stepCounter"), bars: $("bars"),
    message: $("stepMessage"), code: $("pseudocode"), compare: $("statCompare"), writes: $("statWrites"), key: $("statKey"),
    depth: $("statDepth"), range: $("statRange"),
};

let values = [];
let range = { min: 0, max: 1 };

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

function render(step, index, p) {
    const highlight = new Set(step.indices);
    const sorted = new Set(step.sorted);
    const bars = els.bars.children;
    const [lo, hi] = step.range ?? [0, step.array.length - 1];

    step.array.forEach((v, i) => {
        const bar = bars[i];
        const pct = 12 + 88 * ((v - range.min) / (range.max - range.min || 1));
        bar.style.setProperty("--h", `${pct}%`);
        bar.querySelector(".bar-value").textContent = v;
        bar.className = "bar";
        if (sorted.has(i)) bar.classList.add("is-sorted");
        if (highlight.has(i)) bar.classList.add(`is-${step.type}`);
        // Fade bars outside the subarray a recursive sort is working on.
        // Runtime style (not markup) so no new CSS is needed while main.css is owned by task G3.
        bar.style.opacity = i < lo || i > hi ? "0.3" : "";
    });

    // role="img" hides the bars, so the chart's name carries the values; colour-coded
    // state is repeated in words (the step message describes the compare/swap itself).
    const finalIdx = [...sorted].sort((a, b) => a - b);
    els.bars.setAttribute("aria-label", `Array of ${step.array.length}: ${step.array.join(", ")}.` +
        (step.range ? ` Working on A[${lo}..${hi}].` : "") +
        (finalIdx.length ? ` In final position: ${finalIdx.length === step.array.length ? "all" : "indices " + finalIdx.join(", ")}.` : ""));

    [...els.code.children].forEach((li, i) => li.classList.toggle("active", i + 1 === step.line));

    setStepMessage(step.message, p);
    els.compare.textContent = step.comparisons;
    els.writes.textContent = step.writes;
    els.key.textContent = step.key ?? "—";
    els.depth.textContent = step.depth ?? "—";
    els.range.textContent = step.range ? `A[${lo}..${hi}]` : "whole array";
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
    const a = SORTING_ALGORITHMS[key];
    $("algoName").textContent = a.name;
    $("algoSummary").textContent = a.summary;
    $("cxBest").textContent = a.complexity.best;
    $("cxAvg").textContent = a.complexity.average;
    $("cxWorst").textContent = a.complexity.worst;
    $("cxSpace").textContent = a.complexity.space;
    $("cxStable").textContent = a.complexity.stable ? "Yes" : "No";
    els.code.replaceChildren(...a.pseudocode.map(line => {
        const li = document.createElement("li");
        li.textContent = line;
        return li;
    }));
}

function load(newValues) {
    values = newValues;
    range = { min: Math.min(...values), max: Math.max(...values) };
    showAlgorithmInfo(els.algo.value);
    buildBars(values.length);
    player.load(traceSort(els.algo.value, values));
}

function setError(msg) {
    els.error.textContent = msg || "";
    els.error.hidden = !msg;
    if (msg) window.DSA_UI?.announce?.(msg, "assertive");
    els.input.setAttribute("aria-invalid", msg ? "true" : "false");
}

function loadFromInput() {
    const parsed = parseArrayInput(els.input.value);
    if (!parsed.ok) { setError(parsed.error); els.input.focus(); return; }
    setError("");
    load(parsed.values);
}

els.form.addEventListener("submit", byUser((e) => { e.preventDefault(); loadFromInput(); }));
els.random.addEventListener("click", byUser(() => {
    const r = randomArray(10);
    els.input.value = r.join(", ");
    setError("");
    load(r);
}));
els.algo.addEventListener("change", byUser(() => load(values)));
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

$("cxTable").innerHTML = Object.values(SORTING_ALGORITHMS).map(a =>
    `<tr><th scope="row">${a.name}</th><td>${a.complexity.best}</td><td>${a.complexity.average}</td>` +
    `<td>${a.complexity.worst}</td><td>${a.complexity.space}</td><td>${a.complexity.stable ? "Yes" : "No"}</td></tr>`
).join("");

loadFromInput();
liveReady = true;
