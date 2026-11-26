import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import {
    validateBank, prepareQuiz, grade, score, normalizeAnswer, mulberry32, shuffle, QUESTION_TYPES, DIFFICULTIES,
} from "../src/quiz/quiz.js";
import { createProgressStore, getDefaultStorage, DEFAULT_KEY, MAX_ATTEMPTS_KEPT } from "../src/quiz/progress.js";
import { Stack, STACK_INFO } from "../src/structures/stack.js";
import { traceSort, SORTING_ALGORITHMS } from "../src/algorithms/sorting.js";

const QUIZ_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "content", "quizzes");
const bankFiles = readdirSync(QUIZ_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const loadBank = (file) => JSON.parse(readFileSync(join(QUIZ_DIR, file), "utf8"));
const stackBank = loadBank("stack.json");
const sortingBank = loadBank("sorting.json");
const clone = (v) => JSON.parse(JSON.stringify(v));
const byId = (bank, id) => bank.questions.find((q) => q.id === id);

/* ------------------------------------------------------------------ */
/* Every bank on disk                                                  */
/* ------------------------------------------------------------------ */

test("content/quizzes has the stack and sorting banks", () => {
    assert.ok(bankFiles.includes("stack.json"));
    assert.ok(bankFiles.includes("sorting.json"));
});

for (const file of bankFiles) {
    test(`${file}: validates, id matches file name, covers every type and difficulty, at least 10 questions`, () => {
        const bank = loadBank(file);
        const r = validateBank(bank);
        assert.deepEqual(r.errors, []);
        assert.equal(r.ok, true);
        assert.equal(`${bank.id}.json`, file);
        assert.ok(bank.questions.length >= 10, `${file} has ${bank.questions.length} questions`);
        assert.ok("reviewed" in bank);
        for (const t of QUESTION_TYPES) assert.ok(bank.questions.some((q) => q.type === t), `${file}: no ${t} question`);
        for (const d of DIFFICULTIES) assert.ok(bank.questions.some((q) => q.difficulty === d), `${file}: no ${d} question`);
    });

    test(`${file}: every question can be answered correctly after preparation`, () => {
        const quiz = prepareQuiz(loadBank(file), { seed: 7 });
        for (const q of quiz.questions) {
            const right = q.type === "predict" ? (Array.isArray(q.answer) ? q.answer[0] : q.answer)
                : q.type === "multi" ? q.answerIndices : q.answerIndex;
            assert.equal(grade(q, right).correct, true, q.id);
            assert.ok(grade(q, right).explanation.length > 0);
        }
    });
}

test("stack and sorting banks have at least 12 questions and start unreviewed", () => {
    for (const bank of [stackBank, sortingBank]) {
        assert.ok(bank.questions.length >= 12);
        assert.equal(bank.reviewed, null);
    }
});

/* ------------------------------------------------------------------ */
/* Validator rejects malformed banks                                   */
/* ------------------------------------------------------------------ */

function mutated(fn) {
    const bank = clone(stackBank);
    fn(bank);
    return validateBank(bank);
}
const rejects = (r, pattern) => {
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}, got ${JSON.stringify(r.errors)}`);
};

test("validator rejects a missing answer", () => {
    rejects(mutated((b) => { delete b.questions[0].answer; }), /answer is required/);
    rejects(mutated((b) => { b.questions[0].answer = null; }), /answer is required/);
});

test("validator rejects duplicate ids", () => {
    rejects(mutated((b) => { b.questions[1].id = b.questions[0].id; }), /duplicate id/);
});

test("validator rejects an answer that is not among the choices", () => {
    rejects(mutated((b) => { byId(b, "stack-001").answer = "42"; }), /not among choices/);
    rejects(mutated((b) => { byId(b, "stack-007").answer = ["push", "enqueue"]; }), /"enqueue" is not among choices/);
    rejects(mutated((b) => { byId(b, "stack-005").answer = "O(2ⁿ)"; }), /not among choices/);
});

test("validator rejects an unknown type", () => {
    rejects(mutated((b) => { b.questions[0].type = "essay"; }), /unknown type "essay"/);
});

test("validator rejects an empty or too-short explanation", () => {
    rejects(mutated((b) => { b.questions[0].explanation = "   "; }), /explanation is required/);
    rejects(mutated((b) => { delete b.questions[0].explanation; }), /explanation is required/);
    rejects(mutated((b) => { b.questions[0].explanation = "Because LIFO."; }), /too short/);
});

test("validator rejects other schema violations", () => {
    rejects(mutated((b) => { b.questions[0].difficulty = "beginner"; }), /difficulty/);
    rejects(mutated((b) => { b.questions[0].explaination = "typo"; }), /unknown key "explaination"/);
    rejects(mutated((b) => { byId(b, "stack-002").answer = "false"; }), /truefalse answer must be true or false/);
    rejects(mutated((b) => { byId(b, "stack-002").choices = ["True", "False"]; }), /must not have choices/);
    rejects(mutated((b) => { byId(b, "stack-003").answer = ""; }), /predict answer/);
    rejects(mutated((b) => { byId(b, "stack-007").answer = []; }), /multi answer/);
    rejects(mutated((b) => { byId(b, "stack-007").answer = ["push", "push"]; }), /twice/);
    rejects(mutated((b) => { byId(b, "stack-001").choices = ["9"]; }), /at least 2/);
    rejects(mutated((b) => { byId(b, "stack-001").choices = ["9", "9", "4"]; }), /unique/);
    rejects(mutated((b) => { byId(b, "stack-005").choices = ["O(1)", "constant", "O(n)"]; }), /Big-O/);
    rejects(mutated((b) => { delete b.questions[0].tags; }), /tags/);
    rejects(mutated((b) => { delete b.reviewed; }), /reviewed is required/);
    rejects(mutated((b) => { b.reviewed = "yes"; }), /reviewed must be null/);
    rejects(mutated((b) => { b.questions = []; }), /non-empty array/);
    rejects(mutated((b) => { b.id = "Stack Bank"; }), /bank.id/);
    assert.equal(validateBank(null).ok, false);
    assert.equal(validateBank([]).ok, false);
    assert.equal(mutated((b) => { b.reviewed = { by: "learning-content", date: "2026-11-26" }; }).ok, true);
});

test("prepareQuiz throws on an invalid bank instead of running a broken quiz", () => {
    const bad = clone(stackBank);
    bad.questions[0].type = "essay";
    assert.throws(() => prepareQuiz(bad, { seed: 1 }), TypeError);
});

/* ------------------------------------------------------------------ */
/* Seeded shuffle                                                      */
/* ------------------------------------------------------------------ */

test("mulberry32 is deterministic and in [0, 1)", () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
        const x = a();
        assert.equal(x, b());
        assert.ok(x >= 0 && x < 1);
    }
    assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test("shuffle returns a permutation and does not mutate its input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(input, mulberry32(3));
    assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(out.slice().sort((x, y) => x - y), input);
});

test("prepareQuiz: same seed gives the same quiz, different seeds give different orders", () => {
    const a = prepareQuiz(sortingBank, { seed: 123 });
    const b = prepareQuiz(sortingBank, { seed: 123 });
    assert.deepEqual(a, b);
    const orders = new Set();
    for (let s = 0; s < 20; s++) orders.add(prepareQuiz(sortingBank, { seed: s }).questions.map((q) => q.id).join());
    assert.ok(orders.size > 15, `only ${orders.size} distinct orders from 20 seeds`);
    // String seeds work too and are stable.
    assert.deepEqual(prepareQuiz(stackBank, { seed: "retry-2" }), prepareQuiz(stackBank, { seed: "retry-2" }));
});

test("prepareQuiz does not mutate the bank", () => {
    const before = clone(sortingBank);
    prepareQuiz(sortingBank, { seed: 99, count: 5, difficulty: "hard" });
    assert.deepEqual(sortingBank, before);
});

test("prepareQuiz filters by difficulty and caps the count", () => {
    const hard = prepareQuiz(sortingBank, { seed: 1, difficulty: "hard" });
    assert.ok(hard.questions.length > 0);
    assert.ok(hard.questions.every((q) => q.difficulty === "hard"));
    assert.equal(hard.questions.length, sortingBank.questions.filter((q) => q.difficulty === "hard").length);

    const two = prepareQuiz(stackBank, { seed: 1, difficulty: ["easy", "medium"] });
    assert.ok(two.questions.every((q) => q.difficulty !== "hard"));

    const five = prepareQuiz(stackBank, { seed: 1, count: 5 });
    assert.equal(five.questions.length, 5);
    assert.equal(new Set(five.questions.map((q) => q.id)).size, 5);
    assert.equal(prepareQuiz(stackBank, { seed: 1, count: 999 }).questions.length, stackBank.questions.length);
    assert.equal(prepareQuiz(stackBank, { seed: 1, difficulty: "all" }).questions.length, stackBank.questions.length);
    assert.equal(five.bankId, "stack");
});

test("a question's choice order depends only on the seed and its id, not on filtering", () => {
    const all = prepareQuiz(sortingBank, { seed: 5 });
    const hard = prepareQuiz(sortingBank, { seed: 5, difficulty: "hard" });
    for (const q of hard.questions) {
        assert.deepEqual(q.choices, all.questions.find((x) => x.id === q.id).choices);
    }
});

test("property: the correct answer survives choice shuffling for 500 seeds", () => {
    const banks = [stackBank, sortingBank];
    let shuffledAtLeastOnce = 0;
    for (let seed = 0; seed < 500; seed++) {
        for (const bank of banks) {
            for (const q of prepareQuiz(bank, { seed }).questions) {
                const original = byId(bank, q.id);
                if (q.type === "mcq" || q.type === "complexity") {
                    assert.deepEqual(q.choices.slice().sort(), original.choices.slice().sort());
                    assert.equal(q.choices[q.answerIndex], original.answer, `${q.id} seed ${seed}`);
                    if (q.choices.join() !== original.choices.join()) shuffledAtLeastOnce++;
                    // Grading by the position of the correct TEXT in the shuffled list must be right,
                    // and every other position wrong.
                    q.choices.forEach((c, i) => assert.equal(grade(q, i).correct, c === original.answer, `${q.id} seed ${seed} idx ${i}`));
                } else if (q.type === "multi") {
                    const picked = q.answerIndices.map((i) => q.choices[i]).sort();
                    assert.deepEqual(picked, original.answer.slice().sort(), `${q.id} seed ${seed}`);
                    const byText = q.choices.map((c, i) => (original.answer.includes(c) ? i : -1)).filter((i) => i >= 0);
                    assert.equal(grade(q, byText.slice().reverse()).correct, true);
                    assert.equal(grade(q, byText.slice(1)).correct, false); // missing one correct choice
                } else if (q.type === "truefalse") {
                    assert.deepEqual(q.choices, ["True", "False"]);
                    assert.equal(grade(q, original.answer).correct, true);
                    assert.equal(grade(q, !original.answer).correct, false);
                }
            }
        }
    }
    assert.ok(shuffledAtLeastOnce > 1000, "choices were hardly ever shuffled, so the property was not exercised");
});

test("shuffleChoices: false and per-question shuffle: false keep the written order", () => {
    const quiz = prepareQuiz(stackBank, { seed: 11, shuffleChoices: false });
    for (const q of quiz.questions) if (q.choices && q.type !== "truefalse") assert.deepEqual(q.choices, byId(stackBank, q.id).choices);
    const bank = clone(stackBank);
    byId(bank, "stack-005").shuffle = false;
    for (let s = 0; s < 20; s++) {
        const q = prepareQuiz(bank, { seed: s }).questions.find((x) => x.id === "stack-005");
        assert.deepEqual(q.choices, ["O(1)", "O(log n)", "O(n)", "O(n²)"]);
        assert.equal(q.answerIndex, 0);
    }
});

/* ------------------------------------------------------------------ */
/* Grading and scoring                                                 */
/* ------------------------------------------------------------------ */

test("predict normalisation: case, whitespace, brackets, commas, lists, minus sign", () => {
    assert.equal(normalizeAnswer("  Hello   World "), "hello world");
    assert.equal(normalizeAnswer("1 ,2,3"), "1, 2, 3");
    assert.equal(normalizeAnswer("[1, 2, 3]"), "1, 2, 3");
    assert.equal(normalizeAnswer("14."), "14");
    assert.equal(normalizeAnswer("−14"), "-14");
    assert.equal(normalizeAnswer("O(N LOG N)"), "o(n log n)");
    assert.equal(normalizeAnswer("1 2 3", "list"), "1, 2, 3");
    assert.equal(normalizeAnswer("[1,2,  3]", "list"), "1, 2, 3");
    assert.equal(normalizeAnswer("1, , 2", "list"), "1, 2");
    assert.equal(normalizeAnswer(null), "");
    assert.equal(normalizeAnswer(14), "14");
});

test("grade predict: accepts equivalent formatting, rejects wrong values and empty input", () => {
    const quiz = prepareQuiz(sortingBank, { seed: 0 });
    const q = quiz.questions.find((x) => x.id === "sorting-002"); // list: 1, 4, 2, 5, 8
    for (const ok of ["1, 4, 2, 5, 8", "[1,4,2,5,8]", " 1 4 2 5 8 ", "1,4,2,5,8."]) assert.equal(grade(q, ok).correct, true, ok);
    for (const bad of ["1, 2, 4, 5, 8", "1 4 2 5", "", "   ", null, undefined, ["1"]]) assert.equal(grade(q, bad).correct, false, String(bad));

    const text = byId(stackBank, "stack-012"); // "14", raw bank question works too
    assert.equal(grade(text, " 14 ").correct, true);
    assert.equal(grade(text, 14).correct, true);
    assert.equal(grade(text, "-14").correct, false);

    const alt = { ...text, answer: ["14", "fourteen"] };
    assert.equal(grade(alt, "Fourteen").correct, true);
    assert.equal(grade(alt, "").correct, false);
});

test("grade always returns the explanation and the expected answer, right or wrong", () => {
    const quiz = prepareQuiz(stackBank, { seed: 3 });
    for (const q of quiz.questions) {
        for (const r of [grade(q, 0), grade(q, "nonsense"), grade(q, undefined)]) {
            assert.equal(r.explanation, byId(stackBank, q.id).explanation);
            assert.equal(typeof r.correct, "boolean");
            assert.ok(r.expected !== undefined && r.expected !== "");
        }
    }
    const tf = quiz.questions.find((q) => q.id === "stack-002");
    assert.equal(grade(tf, 1).correct, true);   // index 1 = "False"
    assert.equal(grade(tf, 0).correct, false);
    assert.equal(grade(tf, 2).correct, false);
    assert.equal(grade(tf, "false").correct, false);
    assert.equal(grade(tf, false).expected, "False");
});

test("grade multi: must pick exactly the right set; malformed answers are wrong, not errors", () => {
    const q = prepareQuiz(stackBank, { seed: 9 }).questions.find((x) => x.id === "stack-007");
    const right = q.answerIndices;
    const wrong = q.choices.findIndex((c) => c.startsWith("Listing"));
    assert.equal(grade(q, right).correct, true);
    assert.equal(grade(q, [...right, wrong]).correct, false);
    assert.equal(grade(q, right.slice(1)).correct, false);
    assert.equal(grade(q, [...right, right[0]]).correct, true); // duplicates are harmless
    assert.equal(grade(q, []).correct, false);
    assert.equal(grade(q, 0).correct, false);
    assert.equal(grade(q, ["push"]).correct, false);
});

test("grade mcq rejects non-integer and out-of-range answers", () => {
    const q = prepareQuiz(stackBank, { seed: 2 }).questions.find((x) => x.id === "stack-001");
    for (const bad of [-1, 99, 0.5, "0", null, undefined, [q.answerIndex]]) assert.equal(grade(q, bad).correct, false, String(bad));
});

test("score totals results and rounds the percentage", () => {
    assert.deepEqual(score([]), { correct: 0, total: 0, percent: 0 });
    assert.deepEqual(score([{ correct: true }, { correct: false }, { correct: true }]), { correct: 2, total: 3, percent: 67 });
    assert.deepEqual(score([true, true, true, true, false]), { correct: 4, total: 5, percent: 80 });
    assert.deepEqual(score(null), { correct: 0, total: 0, percent: 0 });
});

/* ------------------------------------------------------------------ */
/* Answers recomputed from the real modules                            */
/* ------------------------------------------------------------------ */

function stackWith(capacity, ops) {
    const s = new Stack(capacity);
    const results = ops.map((op) => (op === "pop" ? s.pop() : s.push(op)));
    return { s, results };
}

function possiblePopOrders(values) {
    const out = new Set();
    (function go(next, stack, popped) {
        if (popped.length === values.length) { out.add(popped.join(", ")); return; }
        if (next < values.length) {
            const st = new Stack(values.length);
            stack.forEach((v) => st.push(v));
            st.push(values[next]);
            go(next + 1, st.toArray(), popped);
        }
        if (stack.length) {
            const st = new Stack(values.length);
            stack.forEach((v) => st.push(v));
            const v = st.pop().value;
            go(next, st.toArray(), [...popped, v]);
        }
    })(0, [], []);
    return out;
}

function evalPostfix(text) {
    const st = new Stack(12);
    for (const tok of text.split(" ")) {
        if (/^\d+$/.test(tok)) { assert.ok(st.push(Number(tok)).ok); continue; }
        const b = st.pop().value, a = st.pop().value;
        st.push({ "+": a + b, "-": a - b, "*": a * b }[tok]);
    }
    assert.equal(st.size, 1);
    return st.peek();
}

const firstSortedStep = (key, input) => traceSort(key, input).find((s) => s.type === "sorted").array.join(", ");
const comparisons = (key, input) => traceSort(key, input).at(-1).comparisons;
const nameToKey = Object.fromEntries(Object.entries(SORTING_ALGORITHMS).map(([k, a]) => [a.name, k]));

/** id → () => value the stored answer must equal. */
const VERIFY = {
    "stack-001": () => stackWith(6, [4, 7, 9, "pop"]).results.at(-1).value.toString(),
    "stack-003": () => stackWith(6, [3, 8, "pop", 5]).s.toArray().join(", "),
    "stack-004": () => String(stackWith(3, [1, 2, 3, 4]).s.top),
    "stack-005": () => STACK_INFO.operations.push.complexity,
    "stack-007": () => ["push", "pop", "peek", "isFull"].filter((op) => STACK_INFO.operations[op].complexity === "O(1)"),
    "stack-008": () => {
        const { s, results } = stackWith(4, [1, 2, 3, 4, 10]);
        const last = results.at(-1);
        assert.equal(last.ok, false);
        assert.equal(last.error, "Stack overflow: all 4 slots are used, so 10 cannot be pushed.");
        assert.ok(byId(stackBank, "stack-008").explanation.includes(last.error));
        assert.deepEqual(s.toArray(), [1, 2, 3, 4]);
        assert.equal(s.capacity, 4);
        return "The push is rejected as a stack overflow and the stack is unchanged";
    },
    "stack-009": () => new Stack(3).top === -1 && stackWith(3, [5, "pop"]).s.top === -1,
    "stack-010": () => {
        const possible = possiblePopOrders([1, 2, 3, 4]);
        const impossible = byId(stackBank, "stack-010").choices.filter((c) => !possible.has(c));
        assert.equal(impossible.length, 1, "exactly one choice must be impossible");
        return impossible[0];
    },
    "stack-012": () => String(evalPostfix("5 1 2 + 4 * + 3 -")),
    "stack-013": () => {
        const s = new Stack(2);
        assert.equal(s.peek(), null);
        return s.pop().ok === true && s.pop().value === null;
    },
    "stack-015": () => {
        assert.equal(Stack.MAX_CAPACITY, 12);
        const rejected = byId(stackBank, "stack-015").choices.filter((c) => {
            try { new Stack(Number(c)); return false; } catch { return true; }
        });
        assert.equal(rejected.length, 1);
        return rejected[0];
    },

    "sorting-002": () => firstSortedStep("bubble", [5, 1, 4, 2, 8]),
    "sorting-003": () => firstSortedStep("selection", [29, 10, 14, 37, 13]),
    "sorting-004": () => {
        const step = traceSort("quick", [4, 7, 2, 6, 1, 5]).find((s) => s.type === "sorted");
        assert.deepEqual(step.indices, [3]);
        return step.array.join(", ");
    },
    "sorting-005": () => String(comparisons("insertion", [1, 2, 3, 4, 5])),
    "sorting-006": () => traceSort("radix", [170, 45, 75, 90, 802, 24, 2, 66])
        .find((s) => s.message.startsWith("After the ones pass")).array.join(", "),
    "sorting-007": () => SORTING_ALGORITHMS.bubble.complexity.worst,
    "sorting-008": () => SORTING_ALGORITHMS.merge.complexity.worst,
    "sorting-009": () => {
        assert.equal(comparisons("quick", [1, 2, 3, 4, 5, 6, 7, 8]), (8 * 7) / 2);
        return SORTING_ALGORITHMS.quick.complexity.worst;
    },
    "sorting-010": () => SORTING_ALGORITHMS.merge.complexity.space,
    "sorting-011": () => byId(sortingBank, "sorting-011").choices.filter((n) => SORTING_ALGORITHMS[nameToKey[n]].complexity.stable),
    "sorting-012": () => comparisons("selection", [1, 2, 3, 4, 5, 6]) < comparisons("selection", [6, 5, 4, 3, 2, 1]),
    "sorting-013": () => {
        assert.equal(comparisons("counting", [3, 1, 2, 3, 0, 9, 4]), 0);
        return false;
    },
    "sorting-014": () => SORTING_ALGORITHMS.heap.complexity.stable,
    "sorting-017": () => {
        const sorted = [1, 2, 3, 4, 5, 6, 7, 8];
        const counts = Object.fromEntries(byId(sortingBank, "sorting-017").choices.map((n) => [n, comparisons(nameToKey[n], sorted)]));
        // The explanation quotes these counts; keep them honest.
        const ex = byId(sortingBank, "sorting-017").explanation;
        for (const [n, c] of Object.entries(counts)) assert.ok(ex.includes(String(c)), `${n}: ${c} not in explanation`);
        return Object.keys(counts).filter((n) => counts[n] === sorted.length - 1);
    },
    "sorting-018": () => {
        const c = comparisons("selection", [3, 1, 4, 1, 5]);
        assert.equal(c, comparisons("selection", [5, 4, 3, 2, 1]));
        return String(c);
    },
};

for (const [bank, name] of [[stackBank, "stack"], [sortingBank, "sorting"]]) {
    test(`${name}: every predict question has a verifier that recomputes its answer`, () => {
        for (const q of bank.questions.filter((x) => x.type === "predict")) assert.ok(VERIFY[q.id], `${q.id} has no verifier`);
    });
}

for (const [id, compute] of Object.entries(VERIFY)) {
    test(`${id}: stored answer matches the real module`, () => {
        const q = byId(stackBank, id) ?? byId(sortingBank, id);
        assert.ok(q, `${id} not found`);
        const actual = compute();
        if (q.type === "predict") assert.equal(normalizeAnswer(actual, q.format), normalizeAnswer(q.answer, q.format));
        else if (q.type === "multi") assert.deepEqual(actual.slice().sort(), q.answer.slice().sort());
        else assert.equal(actual, q.answer);
    });
}

/* ------------------------------------------------------------------ */
/* Progress store                                                      */
/* ------------------------------------------------------------------ */

/** localStorage-compatible fake. `failSet` / `failGet` simulate quota and blocked storage. */
function fakeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        data,
        failSet: null,
        failGet: false,
        getItem(k) { if (this.failGet) throw new Error("SecurityError"); return data.has(k) ? data.get(k) : null; },
        setItem(k, v) { if (this.failSet) throw this.failSet; data.set(k, String(v)); },
        removeItem(k) { data.delete(k); },
    };
}
const quotaError = () => Object.assign(new Error("quota"), { name: "QuotaExceededError", code: 22 });

test("progress: records attempts, best score, mastery and survives a reload", () => {
    const storage = fakeStorage();
    const p = createProgressStore(storage);
    assert.equal(p.bestScore("stack"), null);
    assert.deepEqual(p.attempts("stack"), []);
    assert.equal(p.recordAttempt("stack", { score: 6, total: 10, date: "2026-11-01" }).saved, true);
    p.recordAttempt("stack", { score: 9, total: 10, date: "2026-11-02", hintsUsed: 2 });
    p.recordAttempt("stack", { score: 7, total: 10, date: "2026-11-03" });
    p.markLessonViewed("stack-intro", "2026-11-01");
    assert.equal(p.persistent, true);
    assert.equal(p.problem, null);

    const reloaded = createProgressStore(storage); // simulated page reload
    assert.deepEqual(reloaded.bestScore("stack"), { score: 9, total: 10, percent: 90, date: "2026-11-02", hintsUsed: 2 });
    assert.equal(reloaded.attempts("stack").length, 3);
    assert.equal(reloaded.lastAttempt("stack").date, "2026-11-03");
    assert.equal(reloaded.isMastered("stack"), true);
    assert.equal(reloaded.isMastered("stack", 95), false);
    assert.equal(reloaded.isMastered("sorting"), false);
    assert.equal(reloaded.hasViewedLesson("stack-intro"), true);
    assert.equal(reloaded.hasViewedLesson("sorting-intro"), false);
    assert.deepEqual(reloaded.export(), JSON.parse(storage.data.get(DEFAULT_KEY)));
    assert.equal(reloaded.export().version, 1);
});

test("progress: returned data are copies, so callers cannot corrupt the store", () => {
    const p = createProgressStore(fakeStorage());
    p.recordAttempt("stack", { score: 5, total: 10, date: "d" });
    p.attempts("stack")[0].score = 99;
    p.bestScore("stack").score = 99;
    p.export().banks.stack.attempts.push({});
    assert.equal(p.attempts("stack")[0].score, 5);
    assert.equal(p.attempts("stack").length, 1);
});

test("progress: dates come from the caller or an injected clock, never the system time", () => {
    const p = createProgressStore(fakeStorage());
    assert.equal(p.recordAttempt("a", { score: 1, total: 1 }).attempt.date, null);
    const q = createProgressStore(fakeStorage(), { clock: () => "2026-12-01T10:00:00Z" });
    assert.equal(q.recordAttempt("a", { score: 1, total: 1 }).attempt.date, "2026-12-01T10:00:00Z");
    assert.equal(q.recordAttempt("a", { score: 1, total: 1, date: "explicit" }).attempt.date, "explicit");
    const broken = createProgressStore(fakeStorage(), { clock: () => { throw new Error("no clock"); } });
    assert.equal(broken.recordAttempt("a", { score: 1, total: 1 }).ok, true);
});

test("progress: invalid input is refused with an error value, not a throw", () => {
    const p = createProgressStore(fakeStorage());
    for (const bad of [{ score: 11, total: 10 }, { score: -1, total: 10 }, { score: 1, total: 0 }, { score: 1.5, total: 3 }, {}, undefined]) {
        const r = p.recordAttempt("stack", bad);
        assert.equal(r.ok, false);
        assert.ok(r.error);
    }
    assert.equal(p.recordAttempt("", { score: 1, total: 1 }).ok, false);
    assert.equal(p.markLessonViewed(null).ok, false);
    assert.deepEqual(p.attempts("stack"), []);
});

test("progress: keeps only the latest attempts", () => {
    const p = createProgressStore(fakeStorage());
    for (let i = 0; i < MAX_ATTEMPTS_KEPT + 10; i++) p.recordAttempt("s", { score: i % 5, total: 5, date: String(i) });
    assert.equal(p.attempts("s").length, MAX_ATTEMPTS_KEPT);
    assert.equal(p.attempts("s")[0].date, "10");
});

test("progress: missing storage (null) works in memory and reports it", () => {
    for (const storage of [null, undefined]) {
        const p = createProgressStore(storage);
        assert.equal(p.recordAttempt("stack", { score: 8, total: 10, date: "d" }).saved, false);
        assert.equal(p.bestScore("stack").percent, 80);
        assert.equal(p.persistent, false);
        assert.equal(p.problem, "unavailable");
        assert.deepEqual(p.reset(), { ok: true, saved: false });
        assert.equal(p.bestScore("stack"), null);
    }
});

test("progress: storage that throws on every access (private mode) never throws", () => {
    const storage = fakeStorage();
    storage.failGet = true;
    storage.failSet = new Error("SecurityError");
    storage.removeItem = () => { throw new Error("SecurityError"); };
    const p = createProgressStore(storage);
    const r = p.recordAttempt("stack", { score: 3, total: 4, date: "d" });
    assert.equal(r.ok, true);
    assert.equal(r.saved, false);
    assert.equal(p.bestScore("stack").score, 3);
    assert.equal(p.markLessonViewed("x").saved, false);
    assert.equal(p.reset().ok, true);
    assert.equal(p.persistent, false);
    // An object whose methods are missing entirely.
    assert.doesNotThrow(() => createProgressStore({}).recordAttempt("s", { score: 1, total: 1 }));
});

test("progress: getDefaultStorage returns null when localStorage is absent or its getter throws", () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    try {
        Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
        assert.equal(getDefaultStorage(), null);
        Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined });
        assert.equal(getDefaultStorage(), null);
        const fake = fakeStorage();
        Object.defineProperty(globalThis, "localStorage", { configurable: true, value: fake });
        assert.equal(getDefaultStorage(), fake);
    } finally {
        if (desc) Object.defineProperty(globalThis, "localStorage", desc);
        else delete globalThis.localStorage;
    }
});

test("progress: corrupt JSON starts fresh, backs the old text up, and can save again", () => {
    for (const junk of ["{not json", "null", "42", "[]", "\"text\""]) {
        const storage = fakeStorage({ [DEFAULT_KEY]: junk });
        const p = createProgressStore(storage);
        assert.equal(p.problem, "corrupt", junk);
        assert.equal(p.bestScore("stack"), null);
        assert.equal(storage.data.get(`${DEFAULT_KEY}:backup`), junk);
        assert.equal(p.recordAttempt("stack", { score: 1, total: 2, date: "d" }).saved, true);
        assert.equal(createProgressStore(storage).bestScore("stack").score, 1);
    }
});

test("progress: valid JSON with the wrong shape keeps only well-formed parts", () => {
    const storage = fakeStorage({
        [DEFAULT_KEY]: JSON.stringify({
            version: 1,
            banks: {
                stack: { attempts: [{ score: 4, total: 5, date: "ok" }, { score: 9, total: 5 }, "junk", null, { score: "1", total: 2 }] },
                sorting: "not an object",
                queue: { attempts: "nope" },
            },
            lessons: ["array instead of object"],
        }),
    });
    const p = createProgressStore(storage);
    assert.deepEqual(p.attempts("stack"), [{ score: 4, total: 5, percent: 80, date: "ok", hintsUsed: 0 }]);
    assert.deepEqual(p.attempts("sorting"), []);
    assert.deepEqual(p.attempts("queue"), []);
    assert.deepEqual(p.export().lessons, {});
    assert.equal(createProgressStore(fakeStorage({ [DEFAULT_KEY]: "{\"version\":1}" })).bestScore("x"), null);
});

test("progress: wrong version resets safely (with backup) or migrates when a migration exists", () => {
    const newer = JSON.stringify({ version: 2, banks: { stack: { attempts: [{ score: 1, total: 1 }] } } });
    for (const text of [newer, JSON.stringify({ banks: {} }), JSON.stringify({ version: "1" })]) {
        const storage = fakeStorage({ [DEFAULT_KEY]: text });
        const p = createProgressStore(storage);
        assert.equal(p.problem, "version");
        assert.equal(p.bestScore("stack"), null);
        assert.equal(storage.data.get(`${DEFAULT_KEY}:backup`), text);
    }

    // v1 → v2 migration: v1 stored { results: { bankId: [ {score,total} ] } }.
    const v1 = JSON.stringify({ version: 1, results: { stack: [{ score: 3, total: 4, date: "old" }] } });
    const migrations = { 1: (old) => ({ version: 2, banks: Object.fromEntries(Object.entries(old.results).map(([k, a]) => [k, { attempts: a }])), lessons: {} }) };
    const storage = fakeStorage({ [DEFAULT_KEY]: v1 });
    const p = createProgressStore(storage, { version: 2, migrations });
    assert.equal(p.problem, null);
    assert.equal(p.bestScore("stack").percent, 75);

    // A migration that throws falls back to a fresh state instead of crashing.
    const bad = createProgressStore(fakeStorage({ [DEFAULT_KEY]: v1 }), { version: 2, migrations: { 1: () => { throw new Error("boom"); } } });
    assert.equal(bad.problem, "version");
    assert.equal(bad.bestScore("stack"), null);
});

test("progress: a quota error on save keeps the attempt in memory and reports it", () => {
    const storage = fakeStorage();
    const p = createProgressStore(storage);
    p.recordAttempt("stack", { score: 2, total: 4, date: "1" });
    storage.failSet = quotaError();
    const r = p.recordAttempt("stack", { score: 4, total: 4, date: "2" });
    assert.equal(r.ok, true);
    assert.equal(r.saved, false);
    assert.equal(p.persistent, false);
    assert.equal(p.problem, "quota");
    assert.equal(p.bestScore("stack").percent, 100);
    // Storage still holds the last good save.
    assert.equal(createProgressStore(storage).bestScore("stack").percent, 50);
    // When space frees up, the next save writes everything, including the attempt that failed.
    storage.failSet = null;
    p.recordAttempt("stack", { score: 1, total: 4, date: "3" });
    assert.equal(p.persistent, true);
    assert.equal(createProgressStore(storage).attempts("stack").length, 3);
});

test("progress: custom key keeps stores separate, and reset clears storage", () => {
    const storage = fakeStorage();
    const a = createProgressStore(storage);
    const b = createProgressStore(storage, { key: "other" });
    a.recordAttempt("stack", { score: 1, total: 1, date: "d" });
    assert.equal(b.bestScore("stack"), null);
    assert.equal(a.reset().saved, true);
    assert.equal(storage.data.has(DEFAULT_KEY), false);
    assert.equal(createProgressStore(storage).bestScore("stack"), null);
});
