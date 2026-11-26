// Static check on every page controller (C17): pages with a StepPlayer and a Play button
// must get their shortcuts from bindPlayerKeys(document, ...) in src/core/player-keys.js,
// and no page may add its own document/window keydown handler or a local scroll-region
// workaround. The shared guard already skips .hp-scroll-region / .scroll-box /
// [data-player-keys="ignore"], form controls, buttons and the open nav drawer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "pages");
const pages = readdirSync(DIR).filter((f) => f.endsWith(".js")).sort();

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");
const sources = pages.map((f) => [f, stripComments(readFileSync(join(DIR, f), "utf8"))]);

const hasPlayer = (src) => /new\s+StepPlayer\s*\(/.test(src) && /\bplayBtn\b/.test(src);
const playerPages = sources.filter(([, src]) => hasPlayer(src));

test("found page controllers with a StepPlayer and a Play button", () => {
    assert.ok(playerPages.length >= 6, `only ${playerPages.length} player pages found`);
});

for (const [page, src] of playerPages) {
    test(`${page}: keyboard shortcuts come from bindPlayerKeys(document, ...)`, () => {
        assert.match(src, /import\s*\{[^}]*\bbindPlayerKeys\b[^}]*\}\s*from\s*["']\.\.\/core\/player-keys\.js["']/,
            "does not import bindPlayerKeys");
        const calls = src.match(/\bbindPlayerKeys\s*\(\s*[^,)]*/g) || [];
        assert.equal(calls.length, 1, `expected exactly one bindPlayerKeys call, found ${calls.length}`);
        assert.match(calls[0], /bindPlayerKeys\s*\(\s*document\s*$/,
            "bindPlayerKeys must target document directly (no wrapper target re-implementing the guard)");
    });
}

for (const [page, src] of sources) {
    test(`${page}: no local player key handling`, () => {
        assert.doesNotMatch(src, /\b(document|window)\.addEventListener\(\s*["']keydown["']/,
            "registers its own document/window keydown handler");
        assert.doesNotMatch(src, /["'](ArrowLeft|ArrowRight|Home)["']/,
            "handles ArrowLeft/ArrowRight/Home itself instead of via bindPlayerKeys");
        assert.doesNotMatch(src, /hp-scroll-region|scroll-box/,
            "touches scroll regions in JS (the shared guard covers keys inside them)");
    });
}
