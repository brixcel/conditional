/**
 * Quiz engine. Pure and DOM-free so it runs in Node tests and in any page.
 *
 * Bank format: see content/quizzes/_schema.md.
 *
 * Flow for a page:
 *   const check = validateBank(bank);              // { ok, errors[] }
 *   const quiz = prepareQuiz(bank, { seed, count, difficulty });
 *   for (const q of quiz.questions) {               // render q.prompt / q.choices
 *       const r = grade(q, userAnswer);             // { correct, explanation, expected }
 *   }
 *   score(results)                                  // { correct, total, percent }
 *
 * Answers in a bank are stored as the choice TEXT (not an index), so editing or
 * reordering choices cannot silently move the correct answer. prepareQuiz() shuffles
 * the choices and records where the correct one(s) ended up (answerIndex /
 * answerIndices); grade() takes indices into the prepared, shuffled choices.
 */

export const QUESTION_TYPES = Object.freeze(["mcq", "multi", "truefalse", "predict", "complexity"]);
export const DIFFICULTIES = Object.freeze(["easy", "medium", "hard"]);
const CHOICE_TYPES = new Set(["mcq", "multi", "complexity"]);
const TRUE_FALSE_CHOICES = Object.freeze(["True", "False"]);

const BANK_KEYS = new Set(["id", "title", "topic", "description", "version", "reviewed", "questions"]);
const QUESTION_KEYS = new Set(["id", "type", "difficulty", "prompt", "choices", "answer", "explanation",
    "tags", "page", "hint", "format", "shuffle"]);
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const BIG_O_PATTERN = /^[OΘΩ]\(.+\)$/;
const MIN_EXPLANATION = 20;

const isNonEmptyString = (v) => typeof v === "string" && v.trim() !== "";
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/* ------------------------------------------------------------------ */
/* Seeded randomness                                                   */
/* ------------------------------------------------------------------ */

/** mulberry32 PRNG: returns a function producing floats in [0, 1). */
export function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** FNV-1a 32-bit hash, used to turn string seeds and question ids into numbers. */
export function hashString(text) {
    let h = 0x811C9DC5;
    const s = String(text);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

const toSeed = (seed) => (typeof seed === "number" && Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : hashString(seed ?? 0));

/** Fisher–Yates shuffle into a new array. `random` returns floats in [0, 1). */
export function shuffle(items, random) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/* ------------------------------------------------------------------ */
/* Answer normalisation (predict questions)                            */
/* ------------------------------------------------------------------ */

/**
 * Normalise a typed answer so formatting differences do not count as wrong.
 * - trims, lower-cases, turns the Unicode minus "−" into "-"
 * - collapses runs of whitespace to one space
 * - drops one pair of wrapping brackets: "[1, 2]" → "1, 2", and a trailing "."
 * - normalises comma spacing: "1 ,2,3" → "1, 2, 3"
 * format "list": items may be separated by commas and/or spaces, so "1 2 3",
 *   "1,2,3" and "[1, 2, 3]" are all "1, 2, 3". Empty items are dropped.
 */
export function normalizeAnswer(text, format = "text") {
    let s = String(text ?? "").replace(/−/g, "-").trim().toLowerCase().replace(/\s+/g, " ");
    s = s.replace(/\.$/, "").trim();
    const wrapped = s.match(/^[[({](.*)[\])}]$/);
    if (wrapped) s = wrapped[1].trim();
    if (format === "list") {
        return s.split(/[\s,]+/).filter(Boolean).join(", ");
    }
    return s.split(",").map((part) => part.trim()).join(", ");
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Check a bank against the schema.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateBank(bank) {
    const errors = [];
    if (!isPlainObject(bank)) return { ok: false, errors: ["bank must be an object"] };

    for (const key of Object.keys(bank)) if (!BANK_KEYS.has(key)) errors.push(`bank: unknown key "${key}"`);
    if (!isNonEmptyString(bank.id) || !ID_PATTERN.test(bank.id)) errors.push("bank.id must be a lower-case slug like \"stack\"");
    if (!isNonEmptyString(bank.title)) errors.push("bank.title must be a non-empty string");
    if (bank.version !== undefined && !(Number.isInteger(bank.version) && bank.version >= 1)) {
        errors.push("bank.version must be a positive integer when present");
    }
    if (!("reviewed" in bank)) {
        errors.push("bank.reviewed is required (null until learning-content signs off)");
    } else if (bank.reviewed !== null &&
        !(isPlainObject(bank.reviewed) && isNonEmptyString(bank.reviewed.by) && isNonEmptyString(bank.reviewed.date))) {
        errors.push("bank.reviewed must be null or { by, date }");
    }
    if (!Array.isArray(bank.questions) || bank.questions.length === 0) {
        errors.push("bank.questions must be a non-empty array");
        return { ok: false, errors };
    }

    const seen = new Set();
    bank.questions.forEach((q, i) => {
        const where = `questions[${i}]${isPlainObject(q) && isNonEmptyString(q.id) ? ` (${q.id})` : ""}`;
        const err = (msg) => errors.push(`${where}: ${msg}`);
        if (!isPlainObject(q)) { err("must be an object"); return; }

        for (const key of Object.keys(q)) if (!QUESTION_KEYS.has(key)) err(`unknown key "${key}"`);
        if (!isNonEmptyString(q.id) || !ID_PATTERN.test(q.id)) err("id must be a lower-case slug");
        else if (seen.has(q.id)) err(`duplicate id "${q.id}"`);
        else seen.add(q.id);

        if (!QUESTION_TYPES.includes(q.type)) { err(`unknown type "${q.type}" (expected ${QUESTION_TYPES.join(", ")})`); return; }
        if (!DIFFICULTIES.includes(q.difficulty)) err(`difficulty must be one of ${DIFFICULTIES.join(", ")}`);
        if (!isNonEmptyString(q.prompt)) err("prompt must be a non-empty string");
        if (!isNonEmptyString(q.explanation)) err("explanation is required");
        else if (q.explanation.trim().length < MIN_EXPLANATION) err(`explanation is too short to explain why (min ${MIN_EXPLANATION} characters)`);
        if (!Array.isArray(q.tags) || q.tags.some((t) => !isNonEmptyString(t))) err("tags must be an array of non-empty strings");
        if (q.page !== undefined && !isNonEmptyString(q.page)) err("page must be a non-empty string when present");
        if (q.hint !== undefined && !isNonEmptyString(q.hint)) err("hint must be a non-empty string when present");
        if (q.shuffle !== undefined && typeof q.shuffle !== "boolean") err("shuffle must be true or false when present");
        if (!("answer" in q) || q.answer === undefined || q.answer === null) { err("answer is required"); return; }

        if (CHOICE_TYPES.has(q.type)) {
            if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.some((c) => !isNonEmptyString(c))) {
                err("choices must be an array of at least 2 non-empty strings");
                return;
            }
            const norm = q.choices.map((c) => c.trim());
            if (new Set(norm).size !== norm.length) err("choices must be unique");
            if (q.type === "complexity") {
                const bad = q.choices.filter((c) => !BIG_O_PATTERN.test(c.trim()));
                if (bad.length) err(`complexity choices must be Big-O expressions like "O(n log n)" (got ${bad.map((c) => `"${c}"`).join(", ")})`);
            }
            if (q.type === "multi") {
                if (!Array.isArray(q.answer) || q.answer.length === 0 || q.answer.some((a) => typeof a !== "string")) {
                    err("multi answer must be a non-empty array of choice strings");
                } else {
                    if (new Set(q.answer).size !== q.answer.length) err("multi answer lists a choice twice");
                    for (const a of q.answer) if (!q.choices.includes(a)) err(`answer "${a}" is not among choices`);
                }
            } else if (typeof q.answer !== "string") {
                err(`${q.type} answer must be the text of one choice`);
            } else if (!q.choices.includes(q.answer)) {
                err(`answer "${q.answer}" is not among choices`);
            }
            if (q.format !== undefined) err("format only applies to predict questions");
        } else {
            if (q.choices !== undefined) err(`${q.type} questions must not have choices`);
            if (q.type === "truefalse") {
                if (typeof q.answer !== "boolean") err("truefalse answer must be true or false");
                if (q.format !== undefined) err("format only applies to predict questions");
            } else { // predict
                const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
                if (answers.length === 0 || answers.some((a) => !isNonEmptyString(a))) {
                    err("predict answer must be a non-empty string or an array of accepted strings");
                }
                if (q.format !== undefined && q.format !== "text" && q.format !== "list") err("format must be \"text\" or \"list\"");
            }
        }
    });
    return { ok: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/* Preparing a quiz                                                    */
/* ------------------------------------------------------------------ */

/**
 * Build a quiz run: filter by difficulty, shuffle question order and choices with a seed,
 * optionally cap the number of questions. Same bank + same seed → same quiz.
 * Throws a TypeError for an invalid bank (validate first to show the errors).
 *
 * @param {object} bank
 * @param {{ seed?: number|string, count?: number, difficulty?: string|string[], shuffleChoices?: boolean }} [opts]
 * @returns {{ bankId: string, title: string, seed: number, questions: PreparedQuestion[] }}
 */
export function prepareQuiz(bank, { seed = 0, count, difficulty, shuffleChoices = true } = {}) {
    const check = validateBank(bank);
    if (!check.ok) throw new TypeError(`Invalid quiz bank: ${check.errors[0]}`);
    const numericSeed = toSeed(seed);

    const wanted = difficulty === undefined || difficulty === null || difficulty === "all"
        ? null : new Set(Array.isArray(difficulty) ? difficulty : [difficulty]);
    const pool = bank.questions.filter((q) => !wanted || wanted.has(q.difficulty));

    let ordered = shuffle(pool, mulberry32(numericSeed));
    if (Number.isInteger(count) && count >= 0) ordered = ordered.slice(0, count);

    return {
        bankId: bank.id,
        title: bank.title,
        seed: numericSeed,
        questions: ordered.map((q) => prepareQuestion(q, numericSeed, shuffleChoices)),
    };
}

/**
 * @typedef {object} PreparedQuestion
 * @property {string} id
 * @property {string} type
 * @property {string} difficulty
 * @property {string} prompt
 * @property {string[]} [choices]        display order (mcq, multi, complexity, truefalse)
 * @property {number} [answerIndex]      index into choices (mcq, complexity, truefalse)
 * @property {number[]} [answerIndices]  sorted indices into choices (multi)
 * @property {string} [format]           predict: "text" | "list"
 * @property {string|string[]|boolean} answer  the bank's original answer
 * @property {string} explanation
 * @property {string[]} tags
 * @property {string} [hint]
 * @property {string} [page]
 */
function prepareQuestion(q, seed, shuffleChoices) {
    const out = {
        id: q.id, type: q.type, difficulty: q.difficulty, prompt: q.prompt,
        answer: Array.isArray(q.answer) ? q.answer.slice() : q.answer,
        explanation: q.explanation, tags: q.tags.slice(),
    };
    if (q.hint !== undefined) out.hint = q.hint;
    if (q.page !== undefined) out.page = q.page;

    if (q.type === "truefalse") {
        out.choices = TRUE_FALSE_CHOICES.slice();
        out.answerIndex = q.answer ? 0 : 1;
    } else if (q.type === "predict") {
        out.format = q.format ?? "text";
    } else {
        // Seed the choice shuffle per question so a question's choice order does not
        // depend on which other questions were picked or filtered out.
        const choices = shuffleChoices && q.shuffle !== false
            ? shuffle(q.choices, mulberry32((seed ^ hashString(q.id)) >>> 0))
            : q.choices.slice();
        out.choices = choices;
        if (q.type === "multi") {
            out.answerIndices = q.answer.map((a) => choices.indexOf(a)).sort((x, y) => x - y);
        } else {
            out.answerIndex = choices.indexOf(q.answer);
        }
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Grading                                                             */
/* ------------------------------------------------------------------ */

/** Human-readable correct answer, for "The answer was …" after a wrong attempt. */
export function correctAnswerText(question) {
    switch (question.type) {
        case "truefalse": return question.answer ? "True" : "False";
        case "multi": return question.answer.join(", ");
        case "predict": return Array.isArray(question.answer) ? question.answer[0] : question.answer;
        default: return question.answer;
    }
}

/**
 * Grade one answer. Never throws: a malformed answer is simply not correct.
 * Answer shapes (indices refer to the prepared question's `choices`):
 *   mcq / complexity → number            multi → number[] (order ignored)
 *   truefalse        → boolean or 0/1    predict → string
 * A raw bank question (no answerIndex) is accepted too, using its own choice order.
 * @returns {{ correct: boolean, explanation: string, expected: string }}
 */
export function grade(question, answer) {
    const result = (correct) => ({ correct, explanation: question.explanation, expected: correctAnswerText(question) });
    const choices = question.type === "truefalse" ? TRUE_FALSE_CHOICES : question.choices;

    switch (question.type) {
        case "truefalse": {
            const given = typeof answer === "boolean" ? answer
                : answer === 0 ? true : answer === 1 ? false : undefined;
            return result(given === question.answer);
        }
        case "mcq":
        case "complexity": {
            const idx = question.answerIndex ?? choices.indexOf(question.answer);
            return result(Number.isInteger(answer) && answer === idx);
        }
        case "multi": {
            const expected = question.answerIndices ?? question.answer.map((a) => choices.indexOf(a));
            if (!Array.isArray(answer) || answer.some((a) => !Number.isInteger(a))) return result(false);
            const given = new Set(answer);
            return result(given.size === expected.length && expected.every((i) => given.has(i)));
        }
        case "predict": {
            if (typeof answer !== "string" && typeof answer !== "number") return result(false);
            const format = question.format ?? "text";
            const typed = normalizeAnswer(answer, format);
            const accepted = (Array.isArray(question.answer) ? question.answer : [question.answer])
                .map((a) => normalizeAnswer(a, format));
            return result(typed !== "" && accepted.includes(typed));
        }
        default:
            return result(false);
    }
}

/**
 * Total up graded results (anything with a boolean `correct`, or plain booleans).
 * percent is rounded to a whole number; an empty quiz scores 0%.
 */
export function score(results) {
    const list = Array.isArray(results) ? results : [];
    const correct = list.filter((r) => r === true || (r && r.correct === true)).length;
    const total = list.length;
    return { correct, total, percent: total === 0 ? 0 : Math.round((correct / total) * 100) };
}
