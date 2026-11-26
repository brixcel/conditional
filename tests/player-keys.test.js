import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldHandlePlayerKey, bindPlayerKeys } from "../src/core/player-keys.js";

function el(tagName, attrs = {}, extra = {}) {
    return { tagName, getAttribute: (n) => (n in attrs ? attrs[n] : null), ...extra };
}
const BODY = el("BODY");

function keyEvent(key, target = BODY, opts = {}) {
    const ev = { key, target, ctrlKey: false, altKey: false, metaKey: false, repeat: false, defaultPrevented: false, ...opts };
    ev.preventDefault = () => { ev.defaultPrevented = true; };
    return ev;
}

function spyPlayer() {
    const calls = [];
    const p = {};
    for (const m of ["toggle", "next", "prev", "reset", "pause"]) p[m] = () => calls.push(m);
    p.calls = calls;
    return p;
}

function fakeTarget() {
    const listeners = new Map();
    return {
        listeners,
        addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
        removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn)); },
        dispatch(type, ev) { for (const fn of listeners.get(type) || []) fn(ev); },
        count(type) { return (listeners.get(type) || []).length; },
    };
}

function setup() {
    const target = fakeTarget();
    const player = spyPlayer();
    const unbind = bindPlayerKeys(target, player);
    const press = (key, t, opts) => { const ev = keyEvent(key, t, opts); target.dispatch("keydown", ev); return ev; };
    return { target, player, unbind, press };
}

test("Space on BODY toggles and prevents default", () => {
    const { player, press } = setup();
    const ev = press(" ");
    assert.deepEqual(player.calls, ["toggle"]);
    assert.equal(ev.defaultPrevented, true);
});

for (const [label, target] of [
    ["BUTTON", el("BUTTON")],
    ["A", el("A")],
    ["SUMMARY", el("SUMMARY")],
    ["lowercase button", el("button")],
    ["DIV[role=button]", el("DIV", { role: "button" })],
    ["SPAN[role=link]", el("SPAN", { role: "link" })],
    ["DIV[role=slider]", el("DIV", { role: "slider" })],
    ["DIV[role=tab]", el("DIV", { role: "tab" })],
]) {
    test(`Space on ${label} does not toggle or preventDefault`, () => {
        const { player, press } = setup();
        const ev = press(" ", target);
        assert.deepEqual(player.calls, []);
        assert.equal(ev.defaultPrevented, false);
    });
}

test("arrows and Home on BODY call the right player methods", () => {
    const { player, press } = setup();
    press("ArrowRight");
    assert.deepEqual(player.calls, ["pause", "next"]);
    player.calls.length = 0;
    press("ArrowLeft");
    assert.deepEqual(player.calls, ["prev"]);
    player.calls.length = 0;
    press("Home");
    assert.deepEqual(player.calls, ["reset"]);
});

test("unmapped keys do nothing and do not preventDefault", () => {
    const { player, press } = setup();
    for (const k of ["End", "Enter", "a", "ArrowUp", "Tab"]) {
        const ev = press(k);
        assert.equal(ev.defaultPrevented, false, k);
    }
    assert.deepEqual(player.calls, []);
});

for (const mod of ["ctrlKey", "altKey", "metaKey"]) {
    test(`${mod} combos are ignored`, () => {
        const { player, press } = setup();
        for (const k of [" ", "ArrowRight", "ArrowLeft", "Home"]) {
            const ev = press(k, BODY, { [mod]: true });
            assert.equal(ev.defaultPrevented, false);
        }
        assert.deepEqual(player.calls, []);
    });
}

test("repeated Space is ignored, repeated arrows still step", () => {
    const { player, press } = setup();
    const ev = press(" ", BODY, { repeat: true });
    assert.equal(ev.defaultPrevented, false);
    assert.deepEqual(player.calls, []);
    press("ArrowLeft", BODY, { repeat: true });
    assert.deepEqual(player.calls, ["prev"]);
});

for (const tag of ["INPUT", "SELECT", "TEXTAREA"]) {
    test(`keys in ${tag} are ignored`, () => {
        const { player, press } = setup();
        for (const k of [" ", "ArrowRight", "ArrowLeft", "Home"]) press(k, el(tag));
        assert.deepEqual(player.calls, []);
    });
}

test("contentEditable target is ignored", () => {
    const { player, press } = setup();
    press(" ", el("DIV", {}, { isContentEditable: true }));
    assert.deepEqual(player.calls, []);
});

test("DIV without a role is handled", () => {
    assert.equal(shouldHandlePlayerKey(keyEvent(" ", el("DIV"))), true);
    assert.equal(shouldHandlePlayerKey(keyEvent(" ", el("DIV", { role: "region" }))), true);
});

test("defensive about odd targets", () => {
    assert.equal(shouldHandlePlayerKey(keyEvent(" ", null)), true);
    assert.equal(shouldHandlePlayerKey(keyEvent(" ", {})), true); // e.g. document: no tagName/getAttribute
    assert.equal(shouldHandlePlayerKey(keyEvent(" ", { tagName: 42 })), true);
    assert.equal(shouldHandlePlayerKey(keyEvent(" ", { tagName: "DIV", getAttribute: "nope" })), true);
    assert.equal(shouldHandlePlayerKey(undefined), false);
});

test("unbind removes the listener", () => {
    const { target, player, unbind, press } = setup();
    assert.equal(target.count("keydown"), 1);
    unbind();
    assert.equal(target.count("keydown"), 0);
    press(" ");
    assert.deepEqual(player.calls, []);
});
