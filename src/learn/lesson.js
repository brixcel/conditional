// Lesson validator for content/lessons/*.json (rules in content/lessons/_schema.md).
//
// Pure and DOM-free: no Node-only imports, no file system, no fetch. Anything that
// needs the outside world comes in through `ctx`, so the same code can run in Node
// tests and in a browser page.
//
//   validateLesson(lesson, ctx?) -> { ok, errors: [{ rule, path, message }], skipped: [rule] }
//
// ctx (every member optional; a check whose input is missing is listed in `skipped`):
//   fileName                     "stack.json" (L2: id must equal it without .json)
//   fileExists(path) -> bool     repo-relative path (L3, L4)
//   registryLookup(dotted, modulePath) -> value | undefined   (P3, C2, C3, C4)
//   pageControls(page) -> string[]   visible text of buttons, options, .field-label (T2, exact match)
//   pageText(page) -> string         visible page text; used for T2 only if pageControls is absent
//
// Rule IDs are the schema's (L1..L4, O1..O4, V1..V3, P1..P3, C1..C4, A1, T2, X1..X3, R1).
// Rules the schema states without an ID use these extra IDs:
//   JSON   file is not valid JSON or starts with a BOM (validateLessonSource only)
//   TYPE   wrong value type
//   KEYS   missing or unknown key inside a nested object
//   COUNT  array or object entry count outside its range
//   LEN    string length outside its range (lengths count Unicode code points)
//   PATTERN  string does not match its required pattern

export const TOP_LEVEL_KEYS = [
    "id", "title", "page", "module", "controller", "summary", "prerequisites",
    "objectives", "levels", "pseudocode", "complexity", "applications",
    "misconceptions", "tryIt", "references", "reviewed",
];
const OPTIONAL_TOP = new Set(["controller", "prerequisites", "references"]);

export const ALLOWED_VERBS = [
    "trace", "predict", "state", "explain", "compare", "identify", "compute", "choose",
    "describe", "give", "name", "apply", "distinguish", "justify", "write",
];
export const BANNED_VERBS = ["understand", "know", "learn", "appreciate", "be aware"];
export const LEVEL_KEYS = ["beginner", "intermediate", "advanced"];

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PAGE_RE = /^[a-z0-9-]+\.html$/;
const MODULE_RE = /^src\/.+\.js$/;
const CONTROLLER_RE = /^src\/pages\/.+\.js$/;
const CAMEL = /^[a-z][A-Za-z0-9]*$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const PSEUDO_KEYS = ["name", "lines", "registry"];
const COMPLEXITY_KEYS = ["best", "average", "worst", "space", "stable", "inPlace", "note", "registry"];
const MISCONCEPTION_KEYS = ["mistake", "correction"];
const TRYIT_KEYS = ["label", "action", "input", "expect"];
const REVIEWED_KEYS = ["by", "date"];

// X2: ASCII stand-ins banned in prose. Checked on text with “…” segments removed.
const ASCII_STANDINS = [
    { re: /<=/, what: "\"<=\" (use ≤)" },
    { re: />=/, what: "\">=\" (use ≥)" },
    { re: /!=/, what: "\"!=\" (use ≠)" },
    { re: /->/, what: "\"->\" (use →)" },
    { re: /<-/, what: "\"<-\" (use ←)" },
    { re: /\^\d/, what: "\"^2\"-style power (use ²)" },
    { re: / \* /, what: "\" * \" (use ×)" },
    { re: / - /, what: "\" - \" (use − for minus, – or — for a dash)" },
    { re: /(^|[\s([{=,;:])-(?=\d)/, what: "ASCII \"-\" as a minus sign (use −)" },
    { re: /\d-\d/, what: "ASCII \"-\" in a number range (use –)" },
    { re: /\.\.\./, what: "\"...\" (use …)" },
];

const cp = (s) => [...s].length;
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Remove every “…” segment (text copied from the page keeps the page's characters). */
export function stripCurlyQuoted(s) {
    return s.replace(/“[^“”]*”/g, "“”");
}

/** Return the contents of every “…” segment in order. */
export function extractCurlyQuoted(s) {
    return [...s.matchAll(/“([^“”]*)”/g)].map((m) => m[1]);
}

function curlyBalanced(s) {
    let open = false;
    for (const ch of s) {
        if (ch === "“") { if (open) return false; open = true; }
        else if (ch === "”") { if (!open) return false; open = false; }
    }
    return !open;
}

/** Decode the HTML entities a page is likely to use (named basics plus numeric). */
export function decodeEntities(s) {
    const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", times: "×", minus: "−", larr: "←", rarr: "→", le: "≤", ge: "≥", ne: "≠", middot: "·" };
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body) => {
        if (body[0] === "#") {
            const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : m;
        }
        return Object.prototype.hasOwnProperty.call(named, body) ? named[body] : m;
    });
}

const collapse = (s) => s.replace(/\s+/g, " ").trim();
const stripTags = (s) => s.replace(/<[^>]*>/g, " ");

/** Visible text of an HTML document: no scripts, styles, comments or tags; entities decoded; whitespace collapsed. */
export function htmlToText(html) {
    const body = html
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, " ");
    return collapse(decodeEntities(stripTags(body)));
}

/** Visible text of every <button>, <option> and .field-label element (T2 candidates). */
export function extractControlTexts(html) {
    const src = html.replace(/<!--[\s\S]*?-->/g, " ");
    const out = [];
    const push = (inner) => { const t = collapse(decodeEntities(stripTags(inner))); if (t) out.push(t); };
    for (const m of src.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button\s*>/gi)) push(m[1]);
    for (const m of src.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option\s*>/gi)) push(m[1]);
    for (const m of src.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*\bclass\s*=\s*"[^"]*\bfield-label\b[^"]*"[^>]*>([\s\S]*?)<\/\1\s*>/g)) push(m[2]);
    return out;
}

/** O1/C1 helper: is `s` an O-notation string per the schema? */
export function isBigO(s) {
    if (typeof s !== "string" || !s.startsWith("O(")) return false;
    let depth = 0;
    let close = -1;
    for (let i = 1; i < s.length; i++) {
        if (s[i] === "(") depth++;
        else if (s[i] === ")") { depth--; if (depth === 0) { close = i; break; } }
    }
    if (close < 0 || close === 2) return false; // unbalanced or "O()"
    const rest = s.slice(close + 1);
    if (rest === "") return true;
    if (!rest.startsWith(" ")) return false;
    const qualifier = rest.slice(1);
    return qualifier.length > 0 && cp(qualifier) <= 20 && !/[()]/.test(qualifier);
}

function isRealDate(s) {
    const m = ISO_DATE.exec(s);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * Validate a parsed lesson object. See the file header for `ctx`.
 * @returns {{ ok: boolean, errors: {rule:string, path:string, message:string}[], skipped: string[] }}
 */
export function validateLesson(lesson, ctx = {}) {
    const errors = [];
    const skipped = new Set();
    const err = (rule, path, message) => errors.push({ rule, path, message });

    if (!isPlainObject(lesson)) {
        err("L1", "", "lesson must be a JSON object");
        return { ok: false, errors, skipped: [] };
    }

    // ---- L1: key order, unknown keys, required keys ----
    const keys = Object.keys(lesson);
    for (const k of keys) if (!TOP_LEVEL_KEYS.includes(k)) err("L1", k, `unknown top-level key "${k}"`);
    for (const k of TOP_LEVEL_KEYS) if (!OPTIONAL_TOP.has(k) && !(k in lesson)) err("L1", k, `missing required key "${k}"`);
    const known = keys.filter((k) => TOP_LEVEL_KEYS.includes(k));
    for (let i = 1; i < known.length; i++) {
        if (TOP_LEVEL_KEYS.indexOf(known[i]) < TOP_LEVEL_KEYS.indexOf(known[i - 1])) {
            err("L1", known[i], `key "${known[i]}" must come before "${known[i - 1]}" (order: ${TOP_LEVEL_KEYS.join(", ")})`);
        }
    }

    // ---- helpers ----
    const str = (path, v, min, max) => {
        if (typeof v !== "string") { err("TYPE", path, "must be a string"); return false; }
        const n = cp(v);
        if (n < min || n > max) err("LEN", path, `length ${n} is outside ${min}–${max}`);
        return true;
    };
    const arr = (path, v, min, max, rule = "COUNT") => {
        if (!Array.isArray(v)) { err("TYPE", path, "must be an array"); return false; }
        if (v.length < min || v.length > max) err(rule, path, `has ${v.length} items, allowed ${min}–${max}`);
        return true;
    };
    const exactKeys = (path, obj, allowed, required) => {
        for (const k of Object.keys(obj)) if (!allowed.includes(k)) err("KEYS", `${path}.${k}`, `unknown key "${k}"`);
        for (const k of required) if (!(k in obj)) err("KEYS", `${path}.${k}`, `missing required key "${k}"`);
    };
    const lookup = (dotted, path, rule) => {
        if (typeof ctx.registryLookup !== "function") { skipped.add(rule); return { found: false, checked: false }; }
        let value;
        try { value = ctx.registryLookup(dotted, lesson.module); } catch { value = undefined; }
        if (value === undefined) { err(rule, path, `registry path "${dotted}" not found in ${lesson.module}`); return { found: false, checked: true }; }
        return { found: true, checked: true, value };
    };
    const fileCheck = (rule, path, file) => {
        if (typeof ctx.fileExists !== "function") { skipped.add(rule); return; }
        if (!ctx.fileExists(file)) err(rule, path, `file "${file}" does not exist`);
    };

    // ---- id, title, page, module, controller, summary ----
    if (typeof lesson.id === "string") {
        if (!KEBAB.test(lesson.id)) err("PATTERN", "id", `"${lesson.id}" is not kebab-case`);
        if (typeof ctx.fileName === "string") {
            const base = ctx.fileName.replace(/^.*[\\/]/, "").replace(/\.json$/, "");
            if (base !== lesson.id) err("L2", "id", `id "${lesson.id}" must equal the file name "${base}"`);
        } else skipped.add("L2");
    } else if ("id" in lesson) err("TYPE", "id", "must be a string");

    if ("title" in lesson) str("title", lesson.title, 3, 60);

    if ("page" in lesson && str("page", lesson.page, 1, Infinity)) {
        if (!PAGE_RE.test(lesson.page)) err("L3", "page", `"${lesson.page}" must match ${PAGE_RE}`);
        else fileCheck("L3", "page", lesson.page);
    }
    if ("module" in lesson && str("module", lesson.module, 1, Infinity)) {
        if (!MODULE_RE.test(lesson.module)) err("L4", "module", `"${lesson.module}" must match ${MODULE_RE}`);
        else fileCheck("L4", "module", lesson.module);
    }
    if ("controller" in lesson && str("controller", lesson.controller, 1, Infinity)) {
        if (!CONTROLLER_RE.test(lesson.controller)) err("L4", "controller", `"${lesson.controller}" must match ${CONTROLLER_RE}`);
        else fileCheck("L4", "controller", lesson.controller);
    }
    if ("summary" in lesson) str("summary", lesson.summary, 40, 200);

    if ("prerequisites" in lesson && arr("prerequisites", lesson.prerequisites, 0, 5)) {
        lesson.prerequisites.forEach((p, i) => {
            if (typeof p !== "string") err("TYPE", `prerequisites[${i}]`, "must be a string");
            else if (!KEBAB.test(p)) err("PATTERN", `prerequisites[${i}]`, `"${p}" is not a kebab-case id`);
        });
    }

    // ---- objectives O1–O4 ----
    if ("objectives" in lesson && arr("objectives", lesson.objectives, 3, 6)) {
        lesson.objectives.forEach((o, i) => {
            const path = `objectives[${i}]`;
            if (typeof o !== "string") { err("TYPE", path, "must be a string"); return; }
            const n = cp(o);
            if (n < 20 || n > 150) err("O2", path, `length ${n} is outside 20–150`);
            if (!o.startsWith("Students can ")) err("O1", path, "must start with \"Students can \"");
            if (!o.endsWith(".")) err("O1", path, "must end with \".\"");
            const lower = o.toLowerCase();
            const banned = BANNED_VERBS.filter((v) => new RegExp(`\\b${v}\\b`).test(lower));
            if (banned.length) err("O4", path, `uses banned verb(s): ${banned.join(", ")}`);
            if (o.startsWith("Students can ")) {
                const verb = (o.slice("Students can ".length).match(/^[A-Za-z]+/) || [""])[0];
                if (!ALLOWED_VERBS.includes(verb)) err("O3", path, `verb "${verb}" right after "Students can " is not in the allowed list`);
            }
        });
    }

    // ---- levels V1–V3 ----
    if ("levels" in lesson) {
        const lv = lesson.levels;
        if (!isPlainObject(lv)) err("TYPE", "levels", "must be an object");
        else {
            const lk = Object.keys(lv);
            if (lk.length !== LEVEL_KEYS.length || lk.some((k, i) => k !== LEVEL_KEYS[i])) {
                err("V1", "levels", `keys must be exactly ${LEVEL_KEYS.join(", ")} in that order (got ${lk.join(", ") || "none"})`);
            }
            for (const k of lk) {
                const paras = lv[k];
                if (!Array.isArray(paras)) { err("TYPE", `levels.${k}`, "must be an array"); continue; }
                if (paras.length < 1 || paras.length > 6) err("V2", `levels.${k}`, `has ${paras.length} paragraphs, allowed 1–6`);
                paras.forEach((p, i) => {
                    if (typeof p !== "string") { err("TYPE", `levels.${k}[${i}]`, "must be a string"); return; }
                    const n = cp(p);
                    if (n < 40 || n > 420) err("V3", `levels.${k}[${i}]`, `length ${n} is outside 40–420`);
                });
            }
        }
    }

    // ---- pseudocode P1–P3 ----
    const registryLines = new Set(); // paths of lines exempt from X2 and double-space checks
    if ("pseudocode" in lesson && arr("pseudocode", lesson.pseudocode, 1, 12)) {
        lesson.pseudocode.forEach((block, i) => {
            const path = `pseudocode[${i}]`;
            if (!isPlainObject(block)) { err("TYPE", path, "must be an object"); return; }
            exactKeys(path, block, PSEUDO_KEYS, ["name", "lines"]);
            if ("name" in block) str(`${path}.name`, block.name, 1, 40);
            if (!("lines" in block)) return;
            if (!Array.isArray(block.lines)) { err("TYPE", `${path}.lines`, "must be an array"); return; }
            if (block.lines.length < 1 || block.lines.length > 12) err("P1", `${path}.lines`, `has ${block.lines.length} lines, allowed 1–12`);
            const hasRegistry = typeof block.registry === "string";
            block.lines.forEach((line, j) => {
                const lp = `${path}.lines[${j}]`;
                if (typeof line !== "string") { err("TYPE", lp, "must be a string"); return; }
                if (hasRegistry) registryLines.add(lp);
                const n = cp(line);
                if (n < 1 || n > 80) err("P1", lp, `length ${n} is outside 1–80`);
                if (/\t/.test(line)) err("P2", lp, "contains a tab (indent with 4 spaces)");
                const indent = line.match(/^ */)[0].length;
                if (indent % 4 !== 0) err("P2", lp, `indent of ${indent} spaces is not a multiple of 4`);
            });
            if ("registry" in block && typeof block.registry !== "string") err("TYPE", `${path}.registry`, "must be a string");
            if (hasRegistry) {
                const r = lookup(block.registry, `${path}.registry`, "P3");
                if (r.found) {
                    const reg = r.value;
                    if (!Array.isArray(reg) || reg.some((x) => typeof x !== "string")) {
                        err("P3", `${path}.registry`, `"${block.registry}" is not an array of strings`);
                    } else {
                        if (reg.length !== block.lines.length) err("P3", `${path}.lines`, `has ${block.lines.length} lines, registry has ${reg.length}`);
                        const m = Math.max(reg.length, block.lines.length);
                        for (let j = 0; j < m; j++) {
                            if (j < reg.length && j < block.lines.length && reg[j] !== block.lines[j]) {
                                err("P3", `${path}.lines[${j}]`, `differs from registry line ${j + 1}: expected ${JSON.stringify(reg[j])}, got ${JSON.stringify(block.lines[j])}`);
                            }
                        }
                    }
                }
            }
        });
    }

    // ---- complexity C1–C4 ----
    if ("complexity" in lesson) {
        const cx = lesson.complexity;
        if (!isPlainObject(cx)) err("TYPE", "complexity", "must be an object");
        else {
            const ck = Object.keys(cx);
            if (ck.length < 1 || ck.length > 12) err("COUNT", "complexity", `has ${ck.length} entries, allowed 1–12`);
            for (const key of ck) {
                const path = `complexity.${key}`;
                if (!CAMEL.test(key)) err("PATTERN", path, `key "${key}" is not camelCase`);
                const e = cx[key];
                if (!isPlainObject(e)) { err("TYPE", path, "must be an object"); continue; }
                exactKeys(path, e, COMPLEXITY_KEYS, ["best", "average", "worst", "space"]);
                for (const f of ["best", "average", "worst", "space"]) {
                    if (!(f in e)) continue;
                    if (typeof e[f] !== "string") err("TYPE", `${path}.${f}`, "must be a string");
                    else if (!isBigO(e[f])) err("C1", `${path}.${f}`, `"${e[f]}" is not an O-notation string`);
                }
                for (const f of ["stable", "inPlace"]) {
                    if (f in e && typeof e[f] !== "boolean") err("TYPE", `${path}.${f}`, "must be a boolean");
                }
                if ("note" in e) str(`${path}.note`, e.note, 20, 260);
                if ("registry" in e && typeof e.registry !== "string") err("TYPE", `${path}.registry`, "must be a string");
                if (typeof e.registry === "string") {
                    const r = lookup(e.registry, `${path}.registry`, "C2");
                    if (r.found) {
                        const reg = r.value;
                        if (isPlainObject(reg) && ["best", "average", "worst", "space"].every((f) => typeof reg[f] === "string")) {
                            for (const f of ["best", "average", "worst", "space"]) {
                                if (e[f] !== reg[f]) err("C2", `${path}.${f}`, `expected registry value ${JSON.stringify(reg[f])}, got ${JSON.stringify(e[f])}`);
                            }
                            if ("stable" in reg) {
                                if (!("stable" in e)) err("C4", `${path}.stable`, `required because the registry entry has stable = ${reg.stable}`);
                                else if (e.stable !== reg.stable) err("C2", `${path}.stable`, `expected registry value ${reg.stable}, got ${e.stable}`);
                            }
                        } else if (isPlainObject(reg) && typeof reg.complexity === "string") {
                            for (const f of ["best", "average", "worst"]) {
                                if (e[f] !== reg.complexity) err("C3", `${path}.${f}`, `expected registry complexity ${JSON.stringify(reg.complexity)}, got ${JSON.stringify(e[f])}`);
                            }
                        } else {
                            err("C2", `${path}.registry`, `"${e.registry}" is neither a {best, average, worst, space} object nor a { complexity } object`);
                        }
                    }
                }
            }
        }
    }

    // ---- applications A1 ----
    if ("applications" in lesson && arr("applications", lesson.applications, 2, 5, "A1")) {
        lesson.applications.forEach((a, i) => str(`applications[${i}]`, a, 20, 220));
    }

    // ---- misconceptions ----
    if ("misconceptions" in lesson && arr("misconceptions", lesson.misconceptions, 2, 4)) {
        lesson.misconceptions.forEach((m, i) => {
            const path = `misconceptions[${i}]`;
            if (!isPlainObject(m)) { err("TYPE", path, "must be an object"); return; }
            exactKeys(path, m, MISCONCEPTION_KEYS, MISCONCEPTION_KEYS);
            if ("mistake" in m) str(`${path}.mistake`, m.mistake, 10, 160);
            if ("correction" in m) str(`${path}.correction`, m.correction, 20, 320);
        });
    }

    // ---- tryIt T2 ----
    if ("tryIt" in lesson && arr("tryIt", lesson.tryIt, 1, 6)) {
        let controls = null;
        let text = null;
        if (typeof lesson.page === "string") {
            if (typeof ctx.pageControls === "function") controls = ctx.pageControls(lesson.page);
            else if (typeof ctx.pageText === "function") text = ctx.pageText(lesson.page);
        }
        if (controls === null && text === null) skipped.add("T2");
        lesson.tryIt.forEach((t, i) => {
            const path = `tryIt[${i}]`;
            if (!isPlainObject(t)) { err("TYPE", path, "must be an object"); return; }
            exactKeys(path, t, TRYIT_KEYS, TRYIT_KEYS);
            if ("label" in t) str(`${path}.label`, t.label, 3, 60);
            if ("action" in t) str(`${path}.action`, t.action, 20, 320);
            if ("input" in t) str(`${path}.input`, t.input, 0, 80);
            if ("expect" in t) str(`${path}.expect`, t.expect, 20, 320);
            if (typeof t.action !== "string") return;
            if (!curlyBalanced(t.action)) { err("T2", `${path}.action`, "curly quotes “…” are not balanced"); return; }
            for (const name of extractCurlyQuoted(t.action)) {
                if (controls !== null) {
                    if (!controls.includes(name)) err("T2", `${path}.action`, `control “${name}” is not a button, option or field label on ${lesson.page}`);
                } else if (text !== null) {
                    if (!text.includes(name)) err("T2", `${path}.action`, `control “${name}” does not appear in the text of ${lesson.page}`);
                }
            }
        });
    }

    // ---- references ----
    if ("references" in lesson && arr("references", lesson.references, 0, 5)) {
        lesson.references.forEach((r, i) => str(`references[${i}]`, r, 20, 220));
    }

    // ---- reviewed R1 ----
    if ("reviewed" in lesson) {
        const rv = lesson.reviewed;
        if (rv !== null) {
            if (!isPlainObject(rv)) err("R1", "reviewed", "must be null or { by, date }");
            else {
                for (const k of Object.keys(rv)) if (!REVIEWED_KEYS.includes(k)) err("R1", `reviewed.${k}`, `unknown key "${k}"`);
                if (typeof rv.by !== "string" || cp(rv.by) < 2 || cp(rv.by) > 60) err("R1", "reviewed.by", "must be a string of 2–60 chars");
                if (typeof rv.date !== "string" || !isRealDate(rv.date)) err("R1", "reviewed.date", "must be a real date in YYYY-MM-DD form");
            }
        }
    }

    // ---- text rules X1–X3 on every string ----
    // Structural strings (ids, paths, dates) and `input` are exempt from X2.
    const x2Exempt = (path) =>
        /^(id|page|module|controller)$/.test(path) ||
        /^prerequisites\[\d+\]$/.test(path) ||
        /\.registry$/.test(path) ||
        /^reviewed\.date$/.test(path) ||
        /^tryIt\[\d+\]\.input$/.test(path) ||
        registryLines.has(path);
    const walk = (v, path) => {
        if (typeof v === "string") textRules(v, path);
        else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
        else if (isPlainObject(v)) for (const k of Object.keys(v)) walk(v[k], path ? `${path}.${k}` : k);
    };
    const textRules = (s, path) => {
        // X1: no HTML, no Markdown.
        if (/<[A-Za-z/!]/.test(s)) err("X1", path, "contains HTML-like markup (<tag)");
        if (s.includes("**")) err("X1", path, "contains Markdown \"**\"");
        if (s.includes("`")) err("X1", path, "contains a backtick");
        if (/^(# |- )/.test(s)) err("X1", path, "starts with a Markdown heading or list marker");
        // X2: Unicode symbols, not ASCII stand-ins (outside “…”).
        if (!x2Exempt(path)) {
            if (!curlyBalanced(s) && !/^tryIt\[\d+\]\.action$/.test(path)) err("X2", path, "curly quotes “…” are not balanced");
            const prose = stripCurlyQuoted(s);
            for (const { re, what } of ASCII_STANDINS) if (re.test(prose)) err("X2", path, `uses ASCII stand-in ${what}`);
        }
        // X3: whitespace.
        const isPseudoLine = /^pseudocode\[\d+\]\.lines\[\d+\]$/.test(path);
        if (/\t/.test(s)) err("X3", path, "contains a tab");
        if (/[\r\n\u2028\u2029]/.test(s)) err("X3", path, "contains a line break");
        const body = isPseudoLine ? s.replace(/^ +/, "") : s;
        if (!isPseudoLine && /^\s/.test(s)) err("X3", path, "has leading whitespace");
        if (/\s$/.test(s)) err("X3", path, "has trailing whitespace");
        if (!registryLines.has(path) && / {2}/.test(body)) err("X3", path, "contains a double space");
    };
    walk(lesson, "");

    return { ok: errors.length === 0, errors, skipped: [...skipped] };
}

/**
 * Validate raw file text: rejects a BOM and invalid JSON, then runs validateLesson.
 */
export function validateLessonSource(text, ctx = {}) {
    if (typeof text !== "string") return { ok: false, errors: [{ rule: "JSON", path: "", message: "source must be a string" }], skipped: [] };
    if (text.charCodeAt(0) === 0xfeff) return { ok: false, errors: [{ rule: "JSON", path: "", message: "file starts with a BOM" }], skipped: [] };
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) {
        return { ok: false, errors: [{ rule: "JSON", path: "", message: `invalid JSON: ${e.message}` }], skipped: [] };
    }
    return validateLesson(parsed, ctx);
}
