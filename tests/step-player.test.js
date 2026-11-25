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
