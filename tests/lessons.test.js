// Validates every real lesson in content/lessons/ against the schema
// (content/lessons/_schema.md) using src/learn/lesson.js, with a ctx built from
// the real repo: real files, the real registry modules, the real page HTML.
// Also unit-tests each rule family with small hand-made lessons.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import {
    validateLesson,
    validateLessonSource,
    extractControlTexts,
    extractCurlyQuoted,
    htmlToText,
    isBigO,
} from "../src/learn/lesson.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LESSON_DIR = join(ROOT, "content", "lessons");
const lessonFiles = readdirSync(LESSON_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();

const moduleCache = new Map();
async function loadModule(rel) {
    if (!moduleCache.has(rel)) moduleCache.set(rel, await import(pathToFileURL(join(ROOT, rel)).href));
    return moduleCache.get(rel);
}
function walkDotted(obj, dotted) {
    let cur = obj;
    for (const part of dotted.split(".")) {
        if (cur === null || cur === undefined || !Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
        cur = cur[part];
    }
    return cur;
}

/** ctx backed by the real repository. Modules are imported up front so validateLesson stays synchronous. */
async function repoCtx(fileName, lesson) {
    const modules = {};
    for (const rel of [lesson.module]) {
        if (typeof rel === "string" && existsSync(join(ROOT, rel))) modules[rel] = await loadModule(rel);
    }
    const html = (page) => readFileSync(join(ROOT, page), "utf8");
    return {
        fileName,
        fileExists: (rel) => existsSync(join(ROOT, rel)),
        registryLookup: (dotted, modulePath) => (modules[modulePath] ? walkDotted(modules[modulePath], dotted) : undefined),
        pageControls: (page) => extractControlTexts(html(page)),
        pageText: (page) => htmlToText(html(page)),
    };
}

const readLesson = (f) => JSON.parse(readFileSync(join(LESSON_DIR, f), "utf8"));
const fmt = (errors) => errors.map((e) => `  ${e.rule} ${e.path}: ${e.message}`).join("\n");

test("there is at least one lesson file", () => {
    assert.ok(lessonFiles.length >= 1, "no content/lessons/*.json found");
});

for (const file of lessonFiles) {
    test(`lesson ${file}: validates against the schema with the real repo`, async () => {
        const text = readFileSync(join(LESSON_DIR, file), "utf8");
        const lesson = JSON.parse(text);
        const result = validateLessonSource(text, await repoCtx(file, lesson));
        assert.deepEqual(result.skipped, [], "every ctx-dependent check must run");
        assert.ok(result.ok, `${file} has schema errors:\n${fmt(result.errors)}`);
    });

    test(`lesson ${file}: registry-backed pseudocode and complexity equal the registry exactly`, async () => {
        const lesson = readLesson(file);
        const mod = await loadModule(lesson.module);
        for (const block of lesson.pseudocode) {
            if (!block.registry) continue;
            assert.deepEqual(block.lines, walkDotted(mod, block.registry), `${block.name} vs ${block.registry}`);
        }
        for (const [key, entry] of Object.entries(lesson.complexity)) {
            if (!entry.registry) continue;
            const reg = walkDotted(mod, entry.registry);
            assert.ok(reg && typeof reg === "object", `${key}: ${entry.registry} not found`);
            if (typeof reg.complexity === "string") {
                for (const f of ["best", "average", "worst"]) assert.equal(entry[f], reg.complexity, `${key}.${f}`);
            } else {
                for (const f of ["best", "average", "worst", "space"]) assert.equal(entry[f], reg[f], `${key}.${f}`);
                if ("stable" in reg) assert.equal(entry.stable, reg.stable, `${key}.stable`);
            }
        }
    });

    test(`lesson ${file}: every “…” control in tryIt.action is a real control and appears in the page text`, () => {
        const lesson = readLesson(file);
        const html = readFileSync(join(ROOT, lesson.page), "utf8");
        const controls = extractControlTexts(html);
        const text = htmlToText(html);
        let n = 0;
        for (const t of lesson.tryIt) {
            for (const name of extractCurlyQuoted(t.action)) {
                n++;
                assert.ok(controls.includes(name), `“${name}” is not a control on ${lesson.page}`);
                assert.ok(text.includes(name), `“${name}” is not in the text of ${lesson.page}`);
            }
        }
        assert.ok(n > 0, "expected at least one quoted control name");
    });

    test(`lesson ${file}: a one-line pseudocode change in a copy is caught (P3)`, async () => {
        const lesson = readLesson(file);
        const idx = lesson.pseudocode.findIndex((b) => b.registry);
        if (idx < 0) return; // nothing registry-backed to mutate
        const copy = structuredClone(lesson);
        copy.pseudocode[idx].lines[0] = copy.pseudocode[idx].lines[0] + " x";
        const r = validateLesson(copy, await repoCtx(file, copy));
        assert.ok(r.errors.some((e) => e.rule === "P3" && e.path === `pseudocode[${idx}].lines[0]`), fmt(r.errors));
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
test("extractControlTexts decodes entities and finds buttons, options, field labels", () => {
    const html = `<label class="field"><span class="field-label">Capacity (1&ndash;12)</span></label>
        <button class="btn">&#x25B6;  Play</button><select><option value="a">Bubble
        Sort</option></select><!-- <button>Hidden</button> -->`;
    assert.deepEqual(extractControlTexts(html).sort(), ["Bubble Sort", "Capacity (1–12)", "▶ Play"].sort());
    assert.equal(htmlToText("<p>a &amp; b</p><script>x()</script>"), "a & b");
});

test("isBigO accepts the page's formats and rejects others", () => {
    for (const s of ["O(1)", "O(n²)", "O(n log n)", "O(n + k)", "O(d·(n + 10))", "O(log n) avg stack"]) assert.ok(isBigO(s), s);
    for (const s of ["", "n²", "O(n", "O()", "O(n))", "o(n)", "O(n)x", "O(n) qualifier that is far too long", "Θ(n)"]) assert.ok(!isBigO(s), s);
});

// ---------------------------------------------------------------------------
// Unit tests: a minimal valid lesson, then one failing example per rule family.
// ---------------------------------------------------------------------------
const FAKE_HTML = `<span class="field-label">Value</span><button>Push</button><button>&#x25B6; Play</button>`;
const FAKE_REGISTRY = {
    ALGOS: { a: { pseudocode: ["if x  = 1", "    return x"], complexity: { best: "O(1)", average: "O(n)", worst: "O(n)", space: "O(1)", stable: true } } },
    INFO: { operations: { push: { complexity: "O(1)" } } },
};
const fakeCtx = {
    fileName: "demo.json",
    fileExists: (p) => ["demo.html", "src/demo.js", "src/pages/demo-page.js"].includes(p),
    registryLookup: (dotted) => walkDotted(FAKE_REGISTRY, dotted),
    pageControls: () => extractControlTexts(FAKE_HTML),
};

function baseLesson() {
    return {
        id: "demo",
        title: "Demo",
        page: "demo.html",
        module: "src/demo.js",
        controller: "src/pages/demo-page.js",
        summary: "A demo lesson that exists only to exercise the validator rules.",
        prerequisites: ["arrays"],
        objectives: [
            "Students can trace push on a small stack.",
            "Students can explain why push costs O(1).",
            "Students can predict the value of top after each step.",
        ],
        levels: {
            beginner: ["A beginner paragraph that is long enough to pass the limit."],
            intermediate: ["An intermediate paragraph that is long enough to pass."],
            advanced: ["An advanced paragraph that is long enough to pass the limit."],
        },
        pseudocode: [
            { name: "A", lines: ["if x  = 1", "    return x"], registry: "ALGOS.a.pseudocode" },
            { name: "push(x)", lines: ["top ← top + 1", "    A[top] ← x"] },
        ],
        complexity: {
            a: { best: "O(1)", average: "O(n)", worst: "O(n)", space: "O(1)", stable: true, inPlace: true, registry: "ALGOS.a.complexity" },
            push: { best: "O(1)", average: "O(1)", worst: "O(1)", space: "O(1)", note: "Constant time because one slot is touched.", registry: "INFO.operations.push" },
        },
        applications: ["Undo in a text editor pops the most recent edit.", "Function calls return in reverse order of calling."],
        misconceptions: [
            { mistake: "Peek removes the top.", correction: "Peek only reads the top value; the size stays the same." },
            { mistake: "Top is the size.", correction: "Top is an index, so top = size − 1 in this version." },
        ],
        tryIt: [
            { label: "Push one", action: "Type the input in “Value” and press “Push”, then “▶ Play”.", input: "-2", expect: "The page shows “Pushed -2 (top = 0)” and size 1." },
        ],
        references: ["Cormen et al. Introduction to Algorithms, 4th ed. MIT Press, 2022."],
        reviewed: null,
    };
}

function rulesOf(mutate, ctx = fakeCtx) {
    const l = baseLesson();
    mutate(l);
    return validateLesson(l, ctx).errors;
}
function expectRule(rule, mutate, pathPrefix) {
    const errors = rulesOf(mutate);
    const hit = errors.filter((e) => e.rule === rule && (pathPrefix === undefined || e.path.startsWith(pathPrefix)));
    assert.ok(hit.length > 0, `expected ${rule}${pathPrefix ? ` at ${pathPrefix}` : ""}, got:\n${fmt(errors) || "  (no errors)"}`);
}

test("minimal hand-made lesson passes with every ctx check active", () => {
    const r = validateLesson(baseLesson(), fakeCtx);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.skipped, []);
    assert.equal(r.ok, true);
    assert.equal(validateLesson({ ...baseLesson(), reviewed: { by: "QA Reviewer", date: "2026-11-26" } }, fakeCtx).ok, true);
});

test("without ctx, file/registry/page checks are reported as skipped, not passed silently", () => {
    const r = validateLesson(baseLesson());
    assert.deepEqual([...r.skipped].sort(), ["C2", "L2", "L3", "L4", "P3", "T2"]);
});

test("JSON / BOM source checks", () => {
    assert.equal(validateLessonSource("{ not json", fakeCtx).errors[0].rule, "JSON");
    assert.equal(validateLessonSource("﻿" + JSON.stringify(baseLesson()), fakeCtx).errors[0].rule, "JSON");
    assert.equal(validateLessonSource(JSON.stringify(baseLesson(), null, 2), fakeCtx).ok, true);
    assert.equal(validateLesson([], fakeCtx).errors[0].rule, "L1");
});

test("L1: unknown key, missing key, wrong order", () => {
    expectRule("L1", (l) => { l.extra = 1; }, "extra");
    expectRule("L1", (l) => { delete l.summary; }, "summary");
    const l = baseLesson();
    const { title, ...rest } = l;
    const reordered = { ...rest, title }; // title moved to the end
    assert.ok(validateLesson(reordered, fakeCtx).errors.some((e) => e.rule === "L1" && e.path === "title"));
    // optional keys may be omitted
    assert.ok(validateLesson((({ controller, prerequisites, references, ...x }) => x)(baseLesson()), fakeCtx).ok);
});

test("L2 and PATTERN: id must be kebab-case and equal the file name", () => {
    expectRule("L2", (l) => { l.id = "other"; });
    expectRule("PATTERN", (l) => { l.id = "Demo_Lesson"; }, "id");
    expectRule("PATTERN", (l) => { l.prerequisites = ["Arrays"]; }, "prerequisites[0]");
});

test("L3/L4: page, module and controller patterns and existence", () => {
    expectRule("L3", (l) => { l.page = "pages/demo.html"; });
    expectRule("L3", (l) => { l.page = "missing.html"; });
    expectRule("L4", (l) => { l.module = "lib/demo.js"; }, "module");
    expectRule("L4", (l) => { l.module = "src/missing.js"; }, "module");
    expectRule("L4", (l) => { l.controller = "src/demo-page.js"; }, "controller");
    expectRule("L4", (l) => { l.controller = "src/pages/missing.js"; }, "controller");
});

test("TYPE, LEN, COUNT, KEYS families", () => {
    expectRule("TYPE", (l) => { l.title = 5; }, "title");
    expectRule("LEN", (l) => { l.title = "ab"; }, "title");
    expectRule("LEN", (l) => { l.summary = "Too short."; }, "summary");
    expectRule("LEN", (l) => { l.summary = "x".repeat(201); }, "summary");
    expectRule("COUNT", (l) => { l.prerequisites = ["a", "b", "c", "d", "e", "f"]; }, "prerequisites");
    expectRule("COUNT", (l) => { l.objectives = l.objectives.slice(0, 2); }, "objectives");
    expectRule("COUNT", (l) => { l.pseudocode = []; }, "pseudocode");
    expectRule("COUNT", (l) => { l.complexity = {}; }, "complexity");
    expectRule("COUNT", (l) => { l.misconceptions = l.misconceptions.slice(0, 1); }, "misconceptions");
    expectRule("COUNT", (l) => { l.tryIt = []; }, "tryIt");
    expectRule("COUNT", (l) => { l.references = Array(6).fill(l.references[0]); }, "references");
    expectRule("LEN", (l) => { l.references = ["Too short."]; }, "references[0]");
    expectRule("LEN", (l) => { l.applications[0] = "Short."; }, "applications[0]");
    expectRule("LEN", (l) => { l.misconceptions[0].mistake = "Short"; }, "misconceptions[0].mistake");
    expectRule("LEN", (l) => { l.tryIt[0].input = "1".repeat(81); }, "tryIt[0].input");
    expectRule("LEN", (l) => { l.tryIt[0].label = "ab"; }, "tryIt[0].label");
    expectRule("LEN", (l) => { l.pseudocode[1].name = "n".repeat(41); }, "pseudocode[1].name");
    expectRule("KEYS", (l) => { l.tryIt[0].extra = "x"; }, "tryIt[0].extra");
    expectRule("KEYS", (l) => { delete l.tryIt[0].expect; }, "tryIt[0].expect");
    expectRule("KEYS", (l) => { l.misconceptions[1].why = "x"; }, "misconceptions[1].why");
    expectRule("KEYS", (l) => { l.pseudocode[1].code = []; }, "pseudocode[1].code");
    expectRule("KEYS", (l) => { delete l.complexity.push.space; }, "complexity.push.space");
    expectRule("TYPE", (l) => { l.complexity.a.inPlace = "yes"; }, "complexity.a.inPlace");
    expectRule("PATTERN", (l) => { l.complexity.Push = l.complexity.push; }, "complexity.Push");
    // lengths count code points, so "²" and "←" are one char each
    assert.ok(validateLesson({ ...baseLesson(), title: "O(n²)" }, fakeCtx).ok);
});

test("A1: 2–5 applications", () => {
    expectRule("A1", (l) => { l.applications = [l.applications[0]]; });
    expectRule("A1", (l) => { l.applications = Array(6).fill(l.applications[0]); });
});

test("O1–O4: objectives", () => {
    expectRule("O1", (l) => { l.objectives[0] = "Learners can trace push on a small stack."; });
    expectRule("O1", (l) => { l.objectives[0] = "Students can trace push on a small stack"; });
    expectRule("O2", (l) => { l.objectives[0] = "Students can trace."; });
    expectRule("O2", (l) => { l.objectives[0] = `Students can trace ${"x".repeat(140)}.`; });
    expectRule("O3", (l) => { l.objectives[0] = "Students can carefully trace push on a stack."; });
    expectRule("O3", (l) => { l.objectives[0] = "Students can memorize the push algorithm."; });
    expectRule("O4", (l) => { l.objectives[0] = "Students can understand how push works here."; });
    expectRule("O4", (l) => { l.objectives[0] = "Students can be aware of overflow on push."; });
    expectRule("O4", (l) => { l.objectives[0] = "Students can explain and know why push is O(1)."; });
});

test("V1–V3: levels", () => {
    expectRule("V1", (l) => { l.levels = { intermediate: l.levels.intermediate, beginner: l.levels.beginner, advanced: l.levels.advanced }; });
    expectRule("V1", (l) => { delete l.levels.advanced; });
    expectRule("V1", (l) => { l.levels.expert = ["An expert paragraph that is long enough to pass it."]; });
    expectRule("V2", (l) => { l.levels.beginner = []; });
    expectRule("V2", (l) => { l.levels.beginner = Array(7).fill(l.levels.beginner[0]); });
    expectRule("V3", (l) => { l.levels.advanced = ["Too short."]; });
    expectRule("V3", (l) => { l.levels.advanced = ["x".repeat(421)]; });
});

test("P1–P3: pseudocode lines and registry equality", () => {
    expectRule("P1", (l) => { l.pseudocode[1].lines = []; });
    expectRule("P1", (l) => { l.pseudocode[1].lines = Array(13).fill("x ← 1"); });
    expectRule("P1", (l) => { l.pseudocode[1].lines[0] = "x".repeat(81); });
    expectRule("P2", (l) => { l.pseudocode[1].lines[1] = "\tA[top] ← x"; });
    expectRule("P2", (l) => { l.pseudocode[1].lines[1] = "  A[top] ← x"; });
    expectRule("P3", (l) => { l.pseudocode[0].lines[0] = "if x = 1"; }, "pseudocode[0].lines[0]"); // double space dropped
    expectRule("P3", (l) => { l.pseudocode[0].lines.reverse(); });
    expectRule("P3", (l) => { l.pseudocode[0].lines.pop(); });
    expectRule("P3", (l) => { l.pseudocode[0].registry = "ALGOS.missing.pseudocode"; });
    expectRule("P3", (l) => { l.pseudocode[0].registry = "ALGOS.a.complexity"; });
});

test("C1–C4: complexity format and registry equality", () => {
    expectRule("C1", (l) => { l.complexity.push.worst = "O(1"; });
    expectRule("C1", (l) => { l.complexity.push.space = "constant"; });
    expectRule("C1", (l) => { l.complexity.push.best = "O(1) and a qualifier that is too long"; });
    expectRule("C2", (l) => { l.complexity.a.average = "O(n log n)"; }, "complexity.a.average");
    expectRule("C2", (l) => { l.complexity.a.stable = false; }, "complexity.a.stable");
    expectRule("C2", (l) => { l.complexity.a.registry = "ALGOS.nope"; });
    expectRule("C2", (l) => { l.complexity.a.registry = "ALGOS.a.pseudocode"; });
    expectRule("C3", (l) => { l.complexity.push.worst = "O(n)"; }, "complexity.push.worst");
    expectRule("C4", (l) => { delete l.complexity.a.stable; }, "complexity.a.stable");
});

test("T2: quoted control names must be real page controls", () => {
    expectRule("T2", (l) => { l.tryIt[0].action = "Type 3 in “Value” and press “Pop”, then watch."; });
    expectRule("T2", (l) => { l.tryIt[0].action = "Type 3 in “value” and press “Push” to see it."; }); // case matters
    expectRule("T2", (l) => { l.tryIt[0].action = "Type 3 in “Value and press “Push” to see it."; }); // unbalanced
    // pageText fallback: substring match
    const textCtx = { ...fakeCtx, pageControls: undefined, pageText: () => htmlToText(FAKE_HTML) };
    assert.ok(validateLesson(baseLesson(), textCtx).ok);
    const l = baseLesson();
    l.tryIt[0].action = "Press “Pop (Remove)” and watch the bars.";
    assert.ok(validateLesson(l, textCtx).errors.some((e) => e.rule === "T2"));
});

test("R1: reviewed is null or { by, date }", () => {
    expectRule("R1", (l) => { l.reviewed = "yes"; });
    expectRule("R1", (l) => { l.reviewed = {}; });
    expectRule("R1", (l) => { l.reviewed = { by: "A", date: "2026-11-26" }; });
    expectRule("R1", (l) => { l.reviewed = { by: "QA", date: "26/11/2026" }; });
    expectRule("R1", (l) => { l.reviewed = { by: "QA", date: "2026-02-30" }; });
    expectRule("R1", (l) => { l.reviewed = { by: "QA", date: "2026-11-26", note: "x" }; });
    expectRule("L1", (l) => { delete l.reviewed; }, "reviewed");
});

test("X1: no HTML or Markdown", () => {
    expectRule("X1", (l) => { l.summary = "A stack <b>adds</b> and removes values at one end, the top."; });
    expectRule("X1", (l) => { l.summary = "A stack **adds** and removes values at one end, the top."; });
    expectRule("X1", (l) => { l.summary = "A stack `push` adds and removes values at one end, the top."; });
    expectRule("X1", (l) => { l.applications[0] = "- Undo in a text editor pops the most recent edit."; });
    expectRule("X1", (l) => { l.levels.beginner[0] = "# A beginner paragraph that is long enough to pass."; });
    // a lone < or > between spaces is fine
    const ok = baseLesson();
    ok.pseudocode[1].lines[0] = "if A[j] > key and j < n";
    assert.ok(validateLesson(ok, fakeCtx).ok, fmt(validateLesson(ok, fakeCtx).errors));
});

test("X2: ASCII stand-ins banned in prose, with the quote and input exceptions", () => {
    const prose = (s) => (l) => { l.misconceptions[0].correction = `Peek only reads the top value ${s} here.`; };
    for (const s of ["a <= b", "a >= b", "a != b", "a -> b", "a <- b", "n^2", "a * b", "a - b", "(-2)", "1-12", "and so on..."]) {
        expectRule("X2", prose(s), "misconceptions[0].correction");
    }
    // exceptions: inside “…” and in input
    const ok = baseLesson();
    ok.tryIt[0].expect = "The page shows “k = 3 − (-2) + 1 = 6 slots” for the input.";
    ok.tryIt[0].input = "3 -2 0 a<=b";
    assert.ok(validateLesson(ok, fakeCtx).ok, fmt(validateLesson(ok, fakeCtx).errors));
    // pseudocode without registry is prose-checked; registry lines are exempt (copied exactly)
    expectRule("X2", (l) => { l.pseudocode[1].lines[0] = "top <- top + 1"; }, "pseudocode[1].lines[0]");
    expectRule("X2", (l) => { l.complexity.push.note = "Constant time, O(n^2) never happens."; });
    expectRule("X2", (l) => { l.tryIt[0].expect = "The page shows “Pushed -2 and size 1 after it."; }); // unbalanced
});

test("X3: whitespace rules", () => {
    expectRule("X3", (l) => { l.title = " Demo"; });
    expectRule("X3", (l) => { l.title = "Demo "; });
    expectRule("X3", (l) => { l.title = "Demo  Two"; });
    expectRule("X3", (l) => { l.title = "Demo\tTwo"; });
    expectRule("X3", (l) => { l.summary = "A demo lesson that exists only to exercise\nthe validator rules."; });
    expectRule("X3", (l) => { l.pseudocode[1].lines[1] = "    A[top]  ← x"; }); // double space after indent, no registry
    expectRule("X3", (l) => { l.pseudocode[1].lines[1] = "    A[top] ← x "; });
    // registry lines keep their double spaces (base lesson already has "if x  = 1")
    assert.ok(validateLesson(baseLesson(), fakeCtx).ok);
});
