// Static accessibility checks on every root HTML page (C11).
// Plain string/regex parsing of the files on disk: no DOM, no browser. These
// catch regressions in markup only; behaviour (focus, announcements) still
// needs a browser and screen-reader pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();

const read = (page) => readFileSync(join(ROOT, page), "utf8");
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, "");
const attr = (tag, name) => {
    const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
    return m ? (m[2] ?? m[3]) : null;
};
const hasAttr = (tag, name) => new RegExp(`\\s${name}(\\s|=|>|/)`, "i").test(tag);
const visibleText = (inner) => inner
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x[0-9a-f]+;|&#\d+;/gi, " ")   // glyph entities (▶, ⏮ …) are decorative
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

test("found the site pages", () => {
    assert.ok(PAGES.includes("index.html"));
    assert.ok(PAGES.length >= 13, `expected at least 13 pages, found ${PAGES.length}`);
});

for (const page of PAGES) {
    const html = stripComments(read(page));

    test(`${page}: has lang, a meaningful title and exactly one h1`, () => {
        assert.match(html, /<html[^>]*\slang="[a-z]{2}(-[A-Za-z]+)?"/i, "missing <html lang>");
        const title = html.match(/<title>([^<]*)<\/title>/i);
        assert.ok(title && title[1].trim().length > 3, "missing or empty <title>");
        assert.equal((html.match(/<h1[\s>]/gi) || []).length, 1, "expected exactly one <h1>");
    });

    test(`${page}: every input, select and textarea has a label`, () => {
        const labelFor = new Set([...html.matchAll(/<label\b[^>]*\sfor="([^"]+)"/gi)].map((m) => m[1]));
        // Ranges covered by a wrapping <label> … </label>.
        const wraps = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gi)].map((m) => [m.index, m.index + m[0].length]);
        const unlabeled = [];
        for (const m of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
            const tag = m[0];
            const type = (attr(tag, "type") || "").toLowerCase();
            if (["hidden", "submit", "button", "reset"].includes(type)) continue;
            const id = attr(tag, "id");
            const ok = (id && labelFor.has(id))
                || wraps.some(([a, b]) => m.index > a && m.index < b)
                || (attr(tag, "aria-label") || "").trim() !== ""
                || (attr(tag, "aria-labelledby") || "").trim() !== "";
            if (!ok) unlabeled.push(id ? `#${id}` : tag);
        }
        assert.deepEqual(unlabeled, [], `unlabeled form fields: ${unlabeled.join(", ")}`);
    });

    test(`${page}: buttons have an explicit type and a name that contains their visible text`, () => {
        const problems = [];
        for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
            const open = `<button${m[1]}>`;
            const id = attr(open, "id") || visibleText(m[2]) || open;
            if (!attr(open, "type")) problems.push(`${id}: no type attribute`);
            const text = visibleText(m[2]);
            const label = attr(open, "aria-label");
            if (!text && !(label || "").trim() && !attr(open, "aria-labelledby")) problems.push(`${id}: no accessible name`);
            // WCAG 2.5.3 Label in Name: speech users say what they see.
            if (label && text && !label.toLowerCase().includes(text.toLowerCase())) {
                problems.push(`${id}: aria-label "${label}" does not contain visible text "${text}"`);
            }
        }
        assert.deepEqual(problems, []);
    });

    test(`${page}: live regions are rendered at load (not [hidden])`, () => {
        // A live region that is display:none when its text changes is often not announced.
        // Messages that start hidden go through DSA_UI.announce() (shared.js) instead.
        const bad = [...html.matchAll(/<[a-z]+\b[^>]*>/gi)]
            .map((m) => m[0])
            .filter((tag) => (hasAttr(tag, "aria-live") && attr(tag, "aria-live") !== "off")
                || /^(alert|status|log)$/.test(attr(tag, "role") || ""))
            .filter((tag) => hasAttr(tag, "hidden"));
        assert.deepEqual(bad, []);
        if (/id="stepMessage"/.test(html)) {
            assert.match(html, /<[a-z]+[^>]*id="stepMessage"[^>]*aria-live="polite"|<[a-z]+[^>]*aria-live="polite"[^>]*id="stepMessage"/,
                "#stepMessage should start as a polite live region");
        }
    });

    test(`${page}: no clickable divs or spans`, () => {
        const bad = [...html.matchAll(/<(div|span)\b[^>]*\sonclick=/gi)].map((m) => m[0]);
        assert.deepEqual(bad, []);
    });
}

// WCAG 1.4.1 Use of Color (C14): bar states on the algorithm players must not rely on
// hue alone. Every legend entry carries a swatch, and main.css gives that swatch a
// non-colour cue (pattern, glyph or opacity) shared with the bar state it describes.
const CSS = readFileSync(join(ROOT, "main.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const cssRulesFor = (cls) => [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => m[1].split(",").some((sel) => new RegExp(`\.${cls}(?![\w-])`).test(sel)))
    .map((m) => m[2]);
const NON_COLOUR_CUE = /background-image\s*:|content\s*:|opacity\s*:|border-style\s*:|outline-style\s*:/;

for (const page of ["sorting.html", "searching.html"]) {
    test(`${page}: every bar legend item has a non-colour cue`, () => {
        const html = stripComments(read(page));
        const legend = html.match(/<div class="bar-legend"[^>]*>([\s\S]*?)<\/div>/);
        assert.ok(legend, "missing .bar-legend");
        const items = [...legend[1].matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => m[1]);
        assert.ok(items.length >= 3, `expected at least 3 legend items, found ${items.length}`);
        const problems = [];
        for (const item of items) {
            const label = visibleText(item);
            const sw = item.match(/<i class="sw (sw-[a-z-]+)"/);
            if (!sw) { problems.push(`"${label}": no swatch marker`); continue; }
            if (!label) problems.push(`${sw[1]}: no text label`);
            if (!cssRulesFor(sw[1]).some((body) => NON_COLOUR_CUE.test(body))) {
                problems.push(`"${label}": .${sw[1]} has no pattern, glyph or opacity cue in main.css`);
            }
        }
        assert.deepEqual(problems, []);
    });
}

test("main.css: every coloured bar state also has a non-colour cue", () => {
    const states = new Set([...CSS.matchAll(/\.bar\.is-([a-z-]+)/g)].map((m) => m[1]));
    const missing = [...states].filter((s) => !cssRulesFor(`is-${s}`).some((body) => NON_COLOUR_CUE.test(body)));
    assert.deepEqual(missing, [], `bar states without a pattern/glyph/opacity cue: ${missing.join(", ")}`);
});
