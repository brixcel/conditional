import { test } from "node:test";
import assert from "node:assert/strict";
import { StepPlayer } from "../src/core/step-player.js";

/** Manual timer so tests control time instead of waiting. */
function fakeTimers() {
    const queue = [];
    return {
        setTimer: (fn, ms) => { const id = { fn, ms }; queue.push(id); return id; },
        clearTimer: (id) => { const i = queue.indexOf(id); if (i >= 0) queue.splice(i, 1); },
        tick() { const t = queue.shift(); if (t) t.fn(); return t; },
        pending: () => queue.length,
        lastDelay: () => queue.at(-1)?.ms,
    };
}

function make(steps = ["a", "b", "c", "d"]) {
    const timers = fakeTimers();
    const seen = [];
    const p = new StepPlayer({ onStep: (s, i) => seen.push([s, i]), baseDelay: 100, ...timers });
    p.load(steps);
    return { p, timers, seen };
}

test("load renders the first step", () => {
    const { p, seen } = make();
    assert.deepEqual(seen, [["a", 0]]);
    assert.equal(p.atStart, true);
    assert.equal(p.atEnd, false);
});

test("next / prev / goTo stay within bounds", () => {
    const { p } = make();
    p.prev();
    assert.equal(p.index, 0);
    p.goTo(99);
    assert.equal(p.index, 3);
    assert.equal(p.next(), false);
    assert.equal(p.index, 3);
    p.goTo(-5);
    assert.equal(p.index, 0);
});

test("play advances on each tick and stops at the end", () => {
    const { p, timers } = make();
    p.play();
    assert.equal(p.isPlaying, true);
    timers.tick(); timers.tick(); timers.tick();
    assert.equal(p.index, 3);
    assert.equal(p.isPlaying, false);
    assert.equal(timers.pending(), 0);
});

test("pause stops further ticks", () => {
    const { p, timers } = make();
    p.play();
    timers.tick();
    p.pause();
    assert.equal(timers.pending(), 0);
    assert.equal(p.index, 1);
});

test("play at the end restarts from the beginning (replay)", () => {
    const { p, timers } = make(["x", "y"]);
    p.goTo(1);
    p.play();
    assert.equal(p.index, 0);
    timers.tick();
    assert.equal(p.index, 1);
});

test("speed changes the delay", () => {
    const { p, timers } = make();
    p.setSpeed(4);
    p.play();
    assert.equal(timers.lastDelay(), 25);
    assert.throws(() => p.setSpeed(0), RangeError);
});

test("load and constructor validate input", () => {
    assert.throws(() => new StepPlayer({}), TypeError);
    const { p } = make();
    assert.throws(() => p.load([]), /non-empty/);
});

test("prev while playing pauses playback", () => {
    const { p, timers } = make();
    p.play();
    timers.tick();
    p.prev();
    assert.equal(p.isPlaying, false);
    assert.equal(p.index, 0);
});

test("default timers work when the browser checks the receiver (Illegal invocation regression)", async () => {
    // Browsers throw "Illegal invocation" if setTimeout/clearTimeout are called with `this`
    // set to anything but the global object. Node does not, so simulate that check here.
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    const strict = (real) => function (...args) {
        if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
        return real(...args);
    };
    globalThis.setTimeout = strict(realSet);
    globalThis.clearTimeout = strict(realClear);
    try {
        const seen = [];
        const p = new StepPlayer({ onStep: (s) => seen.push(s), baseDelay: 1 });
        p.load(["a", "b", "c"]);
        p.play();                      // schedules with the default setTimer
        p.pause();                     // cancels with the default clearTimer
        p.play();
        // Wait for playback to finish (up to 2 s, so a busy test machine doesn't flake).
        for (let waited = 0; !p.atEnd && waited < 2000; waited += 10) {
            await new Promise((resolve) => realSet(resolve, 10));
        }
        assert.equal(p.atEnd, true, "playback reached the last step");
        assert.deepEqual([...new Set(seen)], ["a", "b", "c"]);
    } finally {
        globalThis.setTimeout = realSet;
        globalThis.clearTimeout = realClear;
    }
});

/** Player whose onStep records [index, isPlaying] at every emit. */
function makeTracked(steps = ["a", "b", "c", "d"]) {
    const timers = fakeTimers();
    const emits = [];
    const p = new StepPlayer({ onStep: (s, i, pl) => emits.push([i, pl.isPlaying]), baseDelay: 100, ...timers });
    p.load(steps);
    emits.length = 0; // ignore the load render
    return { p, timers, emits };
}

test("isPlaying is true at every intermediate emit during autoplay and false at the final one", () => {
    const { p, timers, emits } = makeTracked();
    p.play();
    while (timers.tick()) { /* run to the end */ }
    assert.equal(p.index, 3);
    assert.equal(p.isPlaying, false);
    assert.deepEqual(emits, [[0, true], [1, true], [2, true], [3, false]]);
});

test("pausing mid-run emits isPlaying false", () => {
    const { p, timers, emits } = makeTracked();
    p.play();
    timers.tick();
    p.pause();
    assert.deepEqual(emits, [[0, true], [1, true], [1, false]]);
    assert.equal(timers.pending(), 0);
});

test("play -> pause -> play resumes and reports isPlaying true", () => {
    const { p, timers, emits } = makeTracked();
    p.play();
    timers.tick();
    p.pause();
    emits.length = 0;
    p.play();
    assert.deepEqual(emits, [[1, true]]);
    timers.tick();
    assert.deepEqual(emits, [[1, true], [2, true]]);
    timers.tick();
    assert.deepEqual(emits, [[1, true], [2, true], [3, false]]);
    assert.equal(timers.pending(), 0);
});

test("pausing from inside onStep during autoplay stops playback", () => {
    const timers = fakeTimers();
    const p = new StepPlayer({ onStep: (s, i, pl) => { if (i === 1 && pl.isPlaying) pl.pause(); }, baseDelay: 100, ...timers });
    p.load(["a", "b", "c", "d"]);
    p.play();
    timers.tick();
    assert.equal(p.index, 1);
    assert.equal(p.isPlaying, false);
    assert.equal(timers.pending(), 0);
});
