import { StepPlayer } from "../core/step-player.js";
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

    els.message.textContent = step.message;
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
    els.play.setAttribute("aria-label", p.isPlaying ? "Pause" : "Play");
    els.prev.disabled = p.atStart;
    els.reset.disabled = p.atStart;
    els.next.disabled = p.atEnd;
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

els.form.addEventListener("submit", (e) => { e.preventDefault(); loadFromInput(); });
els.random.addEventListener("click", () => {
    const next = randomSearchCase(10);
    els.input.value = next.values.join(", ");
    els.target.value = String(next.target);
    setError("");
    load(next.values, next.target);
});
els.algo.addEventListener("change", () => load(values, target));
els.play.addEventListener("click", () => player.toggle());
els.next.addEventListener("click", () => { player.pause(); player.next(); });
els.prev.addEventListener("click", () => player.prev());
els.reset.addEventListener("click", () => player.reset());
els.speed.addEventListener("change", () => player.setSpeed(Number(els.speed.value)));
els.progress.addEventListener("input", () => { player.pause(); player.goTo(Number(els.progress.value)); });

document.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
    if (e.key === " ") { e.preventDefault(); player.toggle(); }
    else if (e.key === "ArrowRight") { player.pause(); player.next(); }
    else if (e.key === "ArrowLeft") player.prev();
    else if (e.key === "Home") player.reset();
});

$("cxTable").innerHTML = Object.values(SEARCHING_ALGORITHMS).map(a =>
    `<tr><th scope="row">${a.name}</th><td>${a.complexity.best}</td><td>${a.complexity.average}</td>` +
    `<td>${a.complexity.worst}</td><td>${a.complexity.space}</td><td>${a.complexity.requiresSorted ? "Yes" : "No"}</td></tr>`
).join("");

loadFromInput();
