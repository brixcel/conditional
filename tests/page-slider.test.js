// Static check on every page controller (C12 fix): the progress slider's input handler
// must read the slider value BEFORE calling pause(). While playing, pause() emits a
// render that writes the current index back into the slider, so reading afterwards
// makes a drag during playback do nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "pages");
const pages = readdirSync(DIR).filter((f) => f.endsWith(".js")).sort();

/** Body of the first `<x>.progress.addEventListener("input", …)` handler, by brace matching. */
function sliderHandler(src) {
    const m = src.match(/\.progress\.addEventListener\(\s*["']input["']/);
    if (!m) return null;
    const open = src.indexOf("{", m.index);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
    }
    return null;
}

test("found page controllers with a progress slider", () => {
    assert.ok(pages.filter((f) => sliderHandler(readFileSync(join(DIR, f), "utf8"))).length >= 3);
});

for (const page of pages) {
    const src = readFileSync(join(DIR, page), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const body = sliderHandler(src);
    if (body === null) continue;
    test(`${page}: slider handler reads progress.value before pause()`, () => {
        const read = body.search(/progress\.value/);
        const pause = body.search(/\bpause\s*\(/);
        assert.ok(read !== -1, "handler never reads progress.value");
        if (pause !== -1) assert.ok(read < pause, "progress.value is read after pause(), so a drag during playback is lost");
    });
}
