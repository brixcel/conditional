import { test } from "node:test";
import assert from "node:assert/strict";
import {
    Trie,
    TrieNode,
    TRIE_INFO,
    WORD_LIMITS,
    validateWord,
    parseWordListInput,
} from "../src/structures/trie.js";

function seeded(seed) {
    // mulberry32 PRNG, matching the other suites for reproducible runs.
    return () => {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const ALPHABET = "abcd";

function randomWord(rand, minLen = 1, maxLen = 5) {
    const len = minLen + Math.floor(rand() * (maxLen - minLen + 1));
    let out = "";
    for (let i = 0; i < len; i++) {
        out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
    }
    return out;
}

/** Exact expected node count (including root) for a pruned Trie storing `wordSet`. */
function expectedNodeCount(wordSet) {
    const prefixes = new Set();
    for (const w of wordSet) {
        for (let i = 1; i <= w.length; i++) {
            prefixes.add(w.slice(0, i));
        }
    }
    return 1 + prefixes.size;
}

/** How many new nodes inserting `word` into a trie holding `wordSet` would add. */
function newNodesForInsert(wordSet, word) {
    const prefixes = new Set();
    for (const w of wordSet) {
        for (let i = 1; i <= w.length; i++) {
            prefixes.add(w.slice(0, i));
        }
    }
    let added = 0;
    for (let i = 1; i <= word.length; i++) {
        if (!prefixes.has(word.slice(0, i))) added++;
    }
    return added;
}

function assertValidSteps(result, label = "", { allowEmpty = false } = {}) {
    assert.ok(Array.isArray(result.steps), `${label}: steps is array`);
    if (!allowEmpty) {
        assert.ok(result.steps.length >= 1, `${label}: at least one step`);
    }
    for (let i = 0; i < result.steps.length; i++) {
        const s = result.steps[i];
        const lines = TRIE_INFO.pseudocode[s.operation];
        assert.ok(Array.isArray(lines), `${label} step ${i}: unknown operation "${s.operation}"`);
        assert.ok(
            Number.isInteger(s.line) && s.line >= 1 && s.line <= lines.length,
            `${label} step ${i}: line ${s.line} out of 1..${lines.length} for ${s.operation}`,
        );
        assert.equal(typeof s.type, "string", `${label} step ${i}: type`);
        assert.equal(typeof s.message, "string", `${label} step ${i}: message`);
        assert.ok(s.message.length > 0, `${label} step ${i}: non-empty message`);
        assert.equal(typeof s.prefix, "string", `${label} step ${i}: prefix`);
        assert.ok(Array.isArray(s.nodeIds), `${label} step ${i}: nodeIds array`);
        assert.ok(Array.isArray(s.pathIds), `${label} step ${i}: pathIds array`);
        assert.ok(s.snapshot && Array.isArray(s.snapshot.nodes), `${label} step ${i}: snapshot`);
        assert.ok(
            s.snapshot.rootId !== -1 && !s.nodeIds.includes(-1) && !s.pathIds.includes(-1),
            `${label} step ${i}: no -1 sentinels`,
        );
        const byId = new Map(s.snapshot.nodes.map((n) => [n.id, n]));
        for (const id of s.nodeIds) {
            assert.ok(byId.has(id), `${label} step ${i}: nodeId ${id} missing from snapshot`);
        }
        for (const id of s.pathIds) {
            assert.ok(byId.has(id), `${label} step ${i}: pathId ${id} missing from snapshot`);
        }
        if (s.pathIds.length > 0) {
            const pathPrefix = s.pathIds.map((id) => byId.get(id).char).join("");
            assert.equal(s.prefix, pathPrefix, `${label} step ${i}: prefix matches pathIds`);
        }
    }
}

function assertMatchesModel(trie, model, probeWord, probePrefix, label) {
    assert.equal(trie.integrityError(), null, `${label}: integrityError`);
    const sortedModel = [...model].sort();
    assert.deepEqual(trie.toArray(), sortedModel, `${label}: toArray`);
    assert.equal(trie.size, model.size, `${label}: size`);
    assert.equal(trie.nodeCount, expectedNodeCount(model), `${label}: exact nodeCount`);
    assert.equal(trie.isEmpty(), model.size === 0, `${label}: isEmpty`);

    // Check search on probeWord
    const sRes = trie.search(probeWord);
    assertValidSteps(sRes, `${label} search(${probeWord})`);
    assert.equal(sRes.ok, true);
    assert.equal(sRes.value.found, model.has(probeWord), `${label}: search(${probeWord}) found`);
    if (model.has(probeWord)) {
        assert.ok(Number.isInteger(sRes.value.nodeId) && sRes.value.nodeId >= 1);
    } else {
        assert.equal(sRes.value.nodeId, null, `${label}: not-found nodeId must be null`);
    }

    // Check startsWith on probePrefix
    const swRes = trie.startsWith(probePrefix);
    assertValidSteps(swRes, `${label} startsWith(${probePrefix})`);
    assert.equal(swRes.ok, true);
    const expectedStartsWith = sortedModel.some((w) => w.startsWith(probePrefix));
    assert.equal(swRes.value.found, expectedStartsWith, `${label}: startsWith(${probePrefix})`);
    if (expectedStartsWith) {
        assert.ok(Number.isInteger(swRes.value.nodeId) && swRes.value.nodeId >= 1);
    } else {
        assert.equal(swRes.value.nodeId, null);
    }

    // Check wordsWithPrefix on probePrefix
    const wpRes = trie.wordsWithPrefix(probePrefix);
    assertValidSteps(wpRes, `${label} wordsWithPrefix(${probePrefix})`);
    assert.equal(wpRes.ok, true);
    const expectedMatches = sortedModel.filter((w) => w.startsWith(probePrefix));
    assert.deepEqual(wpRes.value, expectedMatches, `${label}: wordsWithPrefix(${probePrefix})`);
}

/* ---------------- 300 seeded mulberry32 sequences vs Set<string> model ---------------- */

test("Trie: matches Set<string> model over 300 seeded mulberry32 sequences (a-d, len 1-5)", () => {
    const rand = seeded(202609);

    for (let round = 0; round < 300; round++) {
        const maxWords = 1 + Math.floor(rand() * WORD_LIMITS.maxWords);
        // Mix tight and generous node limits so atomic node-limit rejection is exercised too.
        const maxNodes = round % 5 === 0
            ? 4 + Math.floor(rand() * 14)
            : 25 + Math.floor(rand() * (WORD_LIMITS.maxNodes - 24));
        const trie = new Trie({ maxWords, maxNodes });
        const model = new Set();

        for (let op = 0; op < 45; op++) {
            const label = `round=${round} op=${op}`;
            const r = rand();
            const modelList = [...model];

            const beforeSnap = trie.snapshot();
            const beforeClone = structuredClone(beforeSnap);

            let res;
            if (r < 0.50) {
                // Insert: sometimes pick an existing word or prefix/extension of an existing word
                let word;
                const pick = rand();
                if (modelList.length > 0 && pick < 0.16) {
                    word = modelList[Math.floor(rand() * modelList.length)];
                } else if (modelList.length > 0 && pick < 0.36) {
                    const base = modelList[Math.floor(rand() * modelList.length)];
                    if (base.length > 1 && rand() < 0.5) {
                        word = base.slice(0, 1 + Math.floor(rand() * (base.length - 1)));
                    } else if (base.length < 5) {
                        word = base + ALPHABET[Math.floor(rand() * ALPHABET.length)];
                    } else {
                        word = randomWord(rand, 1, 5);
                    }
                } else {
                    word = randomWord(rand, 1, 5);
                }

                const isDup = model.has(word);
                const wouldExceedWords = model.size >= maxWords;
                const neededNodes = newNodesForInsert(model, word);
                const wouldExceedNodes = expectedNodeCount(model) + neededNodes > maxNodes;

                res = trie.insert(word);
                assertValidSteps(res, `${label} insert(${word})`);

                if (isDup) {
                    assert.equal(res.ok, false, `${label}: duplicate insert should fail`);
                    assert.match(res.error, /already/i);
                    assert.equal(res.steps.at(-1).type, "duplicate");
                } else if (wouldExceedWords) {
                    assert.equal(res.ok, false, `${label}: maxWords overflow should fail`);
                    assert.match(res.error, /word limit/i);
                    assert.equal(res.steps[0].type, "overflow");
                } else if (wouldExceedNodes) {
                    assert.equal(res.ok, false, `${label}: maxNodes overflow should fail`);
                    assert.match(res.error, /node limit/i);
                    assert.equal(res.steps[0].type, "overflow");
                } else {
                    assert.equal(res.ok, true, `${label}: insert(${word}) failed: ${res.error}`);
                    assert.equal(res.value.word, word);
                    assert.equal(res.value.createdNodes, neededNodes);
                    assert.equal(res.steps.at(-1).type, "mark-end");
                    model.add(word);
                }
            } else if (r < 0.85) {
                // Delete: frequently pick existing words (including prefixes/extensions) to stress pruning
                let word;
                if (modelList.length > 0 && rand() < 0.72) {
                    word = modelList[Math.floor(rand() * modelList.length)];
                } else if (modelList.length > 0 && rand() < 0.5) {
                    // Sometimes pick a proper prefix of a stored word
                    const base = modelList[Math.floor(rand() * modelList.length)];
                    word = base.length > 1 ? base.slice(0, base.length - 1) : randomWord(rand, 1, 5);
                } else {
                    word = randomWord(rand, 1, 5);
                }

                const existed = model.has(word);
                res = trie.delete(word);
                assertValidSteps(res, `${label} delete(${word})`);

                if (!existed) {
                    assert.equal(res.ok, false, `${label}: delete absent "${word}" should fail`);
                    assert.equal(res.steps.at(-1).type, "not-found");
                } else {
                    assert.equal(res.ok, true, `${label}: delete("${word}") failed: ${res.error}`);
                    assert.equal(res.value.word, word);
                    assert.equal(res.steps.at(-1).type, "done");
                    model.delete(word);
                }
            } else if (r < 0.96) {
                // Explicit query step
                const q = modelList.length > 0 && rand() < 0.6
                    ? modelList[Math.floor(rand() * modelList.length)].slice(0, 1 + Math.floor(rand() * 3))
                    : randomWord(rand, 1, 4);
                res = trie.wordsWithPrefix(q);
                assertValidSteps(res, `${label} wordsWithPrefix(${q})`);
                assert.equal(res.ok, true);
                assert.deepEqual(res.value, [...model].filter((w) => w.startsWith(q)).sort());
            } else {
                // Occasional clear
                const prevSize = model.size;
                res = trie.clear();
                assertValidSteps(res, `${label} clear`);
                assert.equal(res.ok, true);
                assert.equal(res.value, prevSize);
                model.clear();
            }

            // Prior snapshot must be completely untouched.
            assert.deepEqual(beforeSnap, beforeClone, `${label}: prior snapshot mutated`);

            // Mutating a returned step's snapshot must not corrupt the live trie.
            const lastSnap = res.steps.at(-1).snapshot;
            if (lastSnap.nodes.length > 0) {
                lastSnap.nodes[0].char = "Z";
                lastSnap.nodes[0].isEnd = true;
                lastSnap.nodes[0].children.push(999999);
            }

            // Verify every query and invariant against the model after EVERY operation.
            const probeWord = model.size > 0 && rand() < 0.5
                ? [...model][Math.floor(rand() * model.size)]
                : randomWord(rand, 1, 5);
            const probePrefix = probeWord.slice(0, 1 + Math.floor(rand() * Math.min(3, probeWord.length)));
            assertMatchesModel(trie, model, probeWord, probePrefix, label);
        }
    }
});

/* ---------------- Real TrieNode objects & stable monotonically increasing ids ---------------- */

test("Trie: real linked TrieNode objects with Map children and stable non-reused ids", () => {
    const trie = new Trie();
    assert.ok(trie.root instanceof TrieNode);
    assert.ok(trie.root.children instanceof Map);
    assert.equal(trie.root.char, "");
    assert.equal(trie.root.isEnd, false);
    assert.equal(trie.root.id, 1);
    assert.equal(trie.nodeCount, 1);
    assert.equal(trie.size, 0);

    const r1 = trie.insert("ab");
    assert.equal(r1.ok, true);
    const nodeA = trie.root.children.get("a");
    const nodeB = nodeA.children.get("b");
    assert.ok(nodeA instanceof TrieNode);
    assert.ok(nodeB instanceof TrieNode);
    assert.equal(nodeA.id, 2);
    assert.equal(nodeB.id, 3);
    assert.equal(nodeB.isEnd, true);

    // Prune 'b' and re-insert "ab": 'a' keeps id 2, new 'b' gets id 4 (never reuses 3).
    trie.insert("ac");
    const nodeC = nodeA.children.get("c");
    assert.equal(nodeC.id, 4);

    trie.delete("ab");
    assert.equal(nodeA.id, 2);
    assert.equal(nodeA.children.has("b"), false);

    const r2 = trie.insert("ab");
    assert.equal(r2.ok, true);
    assert.equal(nodeA.children.get("b").id, 5, "pruned node id must never be reused");
    assert.equal(trie.root.id, 1);
    assert.equal(trie.integrityError(), null);
});

/* ---------------- Delete outcomes: unmark-only, partial-prune (end & branch), full-prune ---------------- */

test("Trie delete: word that is a prefix of another -> unmark-only (0 nodes pruned)", () => {
    const trie = new Trie();
    trie.insert("cat");
    trie.insert("cats");
    const beforeNodes = trie.nodeCount; // root + c,a,t,s = 5

    const res = trie.delete("cat");
    assertValidSteps(res, "delete prefix word");
    assert.equal(res.ok, true);
    assert.equal(res.value.outcome, "unmark-only");
    assert.equal(res.value.prunedCount, 0);
    assert.equal(trie.nodeCount, beforeNodes);
    assert.equal(trie.size, 1);
    assert.deepEqual(trie.toArray(), ["cats"]);
    assert.equal(trie.search("cat").value.found, false);
    assert.equal(trie.search("cats").value.found, true);
    assert.equal(trie.startsWith("cat").value.found, true);
    assert.equal(trie.integrityError(), null);

    const types = res.steps.map((s) => s.type);
    assert.ok(types.includes("unmark-end"));
    assert.ok(!types.includes("prune"));
    assert.equal(types.at(-1), "done");
    assert.match(res.steps.at(-1).message, /another word passes through/i);
});

test("Trie delete: longer word sharing prefix with shorter word -> partial-prune stops at isEnd node", () => {
    const trie = new Trie();
    trie.insert("cat");
    trie.insert("cats");
    trie.insert("catnip");
    trie.delete("catnip"); // ensure clean setup with just "cat" and "cats"

    const res = trie.delete("cats");
    assertValidSteps(res, "delete longer sharing shorter word");
    assert.equal(res.ok, true);
    assert.equal(res.value.outcome, "partial-prune");
    assert.equal(res.value.prunedCount, 1);
    assert.deepEqual(res.value.prunedNodes.map((n) => n.char), ["s"]);
    assert.equal(trie.size, 1);
    assert.equal(trie.nodeCount, 4); // root + c,a,t
    assert.deepEqual(trie.toArray(), ["cat"]);
    assert.equal(trie.search("cat").value.found, true);
    assert.equal(trie.search("cats").value.found, false);
    assert.equal(trie.integrityError(), null);

    const types = res.steps.map((s) => s.type);
    assert.ok(types.includes("unmark-end"));
    assert.ok(types.includes("prune"));
    assert.equal(types.at(-1), "done");
    assert.match(res.steps.at(-1).message, /another word \("cat"\) ends/i);
});

test("Trie delete: word sharing a branch point -> partial-prune stops at branch node", () => {
    const trie = new Trie();
    trie.insert("car");
    trie.insert("cart");
    trie.insert("cat");
    // Delete "cat": should prune 't' and stop at 'a' because 'r' branches from 'a'.
    const res = trie.delete("cat");
    assertValidSteps(res, "delete branch word");
    assert.equal(res.ok, true);
    assert.equal(res.value.outcome, "partial-prune");
    assert.equal(res.value.prunedCount, 1);
    assert.deepEqual(res.value.prunedNodes.map((n) => n.char), ["t"]);
    assert.deepEqual(trie.toArray(), ["car", "cart"]);
    assert.equal(trie.search("car").value.found, true);
    assert.equal(trie.search("cart").value.found, true);
    assert.equal(trie.search("cat").value.found, false);
    assert.equal(trie.integrityError(), null);
    assert.match(res.steps.at(-1).message, /another word passes through/i);
});

test("Trie delete: disjoint word -> full-prune all the way back to root", () => {
    const trie = new Trie();
    trie.insert("cat");
    trie.insert("dog");

    const res = trie.delete("dog");
    assertValidSteps(res, "delete disjoint word");
    assert.equal(res.ok, true);
    assert.equal(res.value.outcome, "full-prune");
    assert.equal(res.value.prunedCount, 3);
    assert.deepEqual(res.value.prunedNodes.map((n) => n.char), ["g", "o", "d"]);
    assert.equal(trie.root.children.has("d"), false);
    assert.deepEqual(trie.toArray(), ["cat"]);
    assert.equal(trie.nodeCount, 4); // root + c,a,t
    assert.equal(trie.integrityError(), null);
    assert.match(res.steps.at(-1).message, /reached root/i);
});

test("Trie delete: each prune step shows the node BEFORE removal; the next step shows it gone", () => {
    const hasNode = (snap, id) => snap.nodes.some((n) => n.id === id);
    const scenarios = [
        { words: ["cat", "dog"], del: "dog", pruned: 3 }, // full prune
        { words: ["car", "cart", "cat"], del: "cat", pruned: 1 }, // partial prune at branch
        { words: ["cat", "cats"], del: "cats", pruned: 1 }, // partial prune at word end
        { words: ["cat", "cats"], del: "cat", pruned: 0 }, // unmark-only
    ];
    for (const { words, del, pruned } of scenarios) {
        const trie = new Trie();
        for (const w of words) trie.insert(w);
        const res = trie.delete(del);
        assertValidSteps(res, `prune frames ${del}`);
        assert.equal(res.ok, true);

        const pruneIdx = res.steps.map((s, i) => (s.type === "prune" ? i : -1)).filter((i) => i >= 0);
        assert.equal(pruneIdx.length, pruned, `${del}: one prune step per pruned node`);
        assert.deepEqual(
            pruneIdx.map((i) => res.steps[i].nodeIds[0]),
            res.value.prunedNodes.map((n) => n.id),
            `${del}: prune steps target the pruned nodes in order`,
        );

        for (const i of pruneIdx) {
            const step = res.steps[i];
            assert.equal(step.nodeIds.length, 1, `${del} step ${i}: one target node`);
            const id = step.nodeIds[0];
            const target = step.snapshot.nodes.find((n) => n.id === id);
            assert.ok(target, `${del} step ${i}: pruned node #${id} still in its own snapshot`);
            assert.equal(target.children.length, 0, `${del} step ${i}: target is a leaf`);
            assert.equal(target.isEnd, false, `${del} step ${i}: target is not a word end`);
            assert.ok(step.pathIds.includes(id), `${del} step ${i}: path reaches the target`);
            assert.match(step.message, new RegExp(`#${id}\\b`), `${del} step ${i}: message names the node`);
            assert.match(step.message, new RegExp(`'${target.char}'`), `${del} step ${i}: message names the char`);

            const next = res.steps[i + 1];
            assert.ok(next, `${del} step ${i}: a following step exists to show the removal`);
            assert.equal(hasNode(next.snapshot, id), false, `${del} step ${i + 1}: node #${id} gone`);
            assert.equal(next.snapshot.nodeCount, step.snapshot.nodeCount - 1, `${del} step ${i + 1}: one fewer node`);
        }

        // Final frame matches the live structure.
        assert.deepEqual(res.steps.at(-1).snapshot, trie.snapshot());
    }
});

test("Trie delete: empty trie, absent word, and prefix-only word fail cleanly", () => {
    const trie = new Trie();
    const emptyRes = trie.delete("cat");
    assertValidSteps(emptyRes, "delete empty");
    assert.equal(emptyRes.ok, false);
    assert.match(emptyRes.error, /empty/i);
    assert.equal(emptyRes.steps[0].type, "not-found");

    trie.insert("cats");

    const missRes = trie.delete("dog");
    assertValidSteps(missRes, "delete missing");
    assert.equal(missRes.ok, false);
    assert.match(missRes.error, /not in the trie/i);
    assert.equal(missRes.steps.at(-1).type, "not-found");

    const prefixRes = trie.delete("cat");
    assertValidSteps(prefixRes, "delete prefix-only");
    assert.equal(prefixRes.ok, false);
    assert.match(prefixRes.error, /prefix/i);
    assert.equal(prefixRes.steps.at(-1).type, "not-found");

    assert.deepEqual(trie.toArray(), ["cats"]);
    assert.equal(trie.integrityError(), null);
});

/* ---------------- Search, startsWith, wordsWithPrefix details ---------------- */

test("Trie queries: search explains prefix-only miss; wordsWithPrefix collects alphabetically", () => {
    const trie = new Trie();
    for (const w of ["zebra", "cat", "car", "card", "care", "apple"]) {
        assert.equal(trie.insert(w).ok, true);
    }

    assert.deepEqual(trie.toArray(), ["apple", "car", "card", "care", "cat", "zebra"]);

    const prefixMiss = trie.search("ca");
    assertValidSteps(prefixMiss, "search prefix-only");
    assert.equal(prefixMiss.ok, true);
    assert.equal(prefixMiss.value.found, false);
    assert.equal(prefixMiss.value.nodeId, null);
    assert.match(prefixMiss.steps.at(-1).message, /only a prefix/i);

    const sw = trie.startsWith("ca");
    assertValidSteps(sw, "startsWith ca");
    assert.equal(sw.ok, true);
    assert.equal(sw.value.found, true);
    assert.ok(Number.isInteger(sw.value.nodeId) && sw.value.nodeId >= 1);

    const auto = trie.wordsWithPrefix("ca");
    assertValidSteps(auto, "wordsWithPrefix ca");
    assert.equal(auto.ok, true);
    assert.deepEqual(auto.value, ["car", "card", "care", "cat"]);

    const collectSteps = auto.steps.filter((s) => s.type === "collect");
    assert.equal(collectSteps.length, 4);
    assert.deepEqual(collectSteps[0].matches, ["car"]);
    assert.deepEqual(collectSteps[1].matches, ["car", "card"]);
    assert.deepEqual(collectSteps[2].matches, ["car", "card", "care"]);
    assert.deepEqual(collectSteps[3].matches, ["car", "card", "care", "cat"]);
    assert.equal(auto.steps.at(-1).type, "done");

    const autoMiss = trie.wordsWithPrefix("qu");
    assertValidSteps(autoMiss, "wordsWithPrefix miss");
    assert.equal(autoMiss.ok, true);
    assert.deepEqual(autoMiss.value, []);
    assert.equal(autoMiss.steps.at(-1).type, "not-found");
});

/* ---------------- Validation, normalization, and parseWordListInput ---------------- */

test("Trie validation: trims & lowercases valid words; rejects empty, digits, symbols, non-ASCII, >12 letters", () => {
    const trie = new Trie();

    // Normalization works across every operation
    assert.equal(trie.insert("  CaT  ").ok, true);
    assert.equal(trie.insert("\tAbCdEfGhIjKl\n").ok, true); // exactly 12 letters
    assert.equal(trie.search("  CAT").value.found, true);
    assert.equal(trie.startsWith("  CA ").value.found, true);
    assert.deepEqual(trie.wordsWithPrefix("  cA ").value, ["cat"]);
    assert.equal(trie.delete("  CAT ").ok, true);
    assert.equal(trie.search("cat").value.found, false);

    // Invalid strings return { ok: false, error, steps: [] } without mutating the trie
    const badInputs = ["", "   ", "\t\n", "cat123", "123", "a-b", "cat dog", "cat!", "café", "abcdefghijklm"];
    const before = trie.toArray();
    for (const bad of badInputs) {
        for (const op of ["insert", "search", "startsWith", "wordsWithPrefix", "delete"]) {
            const res = trie[op](bad);
            assert.equal(res.ok, false, `${op}(${JSON.stringify(bad)}) should fail`);
            assert.equal(typeof res.error, "string");
            assert.ok(res.error.length > 0);
            assert.deepEqual(res.steps, []);
        }
    }
    assert.deepEqual(trie.toArray(), before);
    assert.equal(trie.integrityError(), null);

    // Direct helper checks
    assert.deepEqual(validateWord("  HeLLo "), { ok: true, value: "hello" });
    assert.equal(validateWord(42).ok, false);
    assert.equal(validateWord("abcdefghijklm").ok, false);

    assert.deepEqual(parseWordListInput("  Cat,  CAR   cart "), {
        ok: true,
        words: ["cat", "car", "cart"],
    });
    assert.equal(parseWordListInput("").ok, false);
    assert.equal(parseWordListInput("   ").ok, false);
    assert.equal(parseWordListInput(",,,").ok, false);
    assert.equal(parseWordListInput(" , , ").ok, false);
    assert.equal(parseWordListInput("cat, dog2").ok, false);
    assert.equal(parseWordListInput("cat, CAT").ok, false);
    assert.deepEqual(parseWordListInput("cat, CAT", { allowDuplicates: true }), {
        ok: true,
        words: ["cat", "cat"],
    });
    assert.equal(parseWordListInput("a b c d", { maxWords: 3 }).ok, false);
});

/* ---------------- Both limits full (maxWords and atomic maxNodes) + duplicate precedence ---------------- */

test("Trie limits: maxWords full (1 and 20) and duplicate wins over overflow", () => {
    const tiny = new Trie({ maxWords: 1, maxNodes: 20 });
    assert.equal(tiny.insert("hi").ok, true);
    assert.equal(tiny.isFull(), true);

    // Duplicate into a full trie reports duplicate, not overflow.
    const dup = tiny.insert("HI");
    assertValidSteps(dup, "duplicate into full");
    assert.equal(dup.ok, false);
    assert.match(dup.error, /already/i);
    assert.equal(dup.steps.at(-1).type, "duplicate");

    // New word overflows maxWords.
    const over = tiny.insert("yo");
    assertValidSteps(over, "overflow maxWords 1");
    assert.equal(over.ok, false);
    assert.match(over.error, /word limit/i);
    assert.equal(over.steps[0].type, "overflow");
    assert.equal(tiny.size, 1);
    assert.equal(tiny.integrityError(), null);

    // Default maxWords = 20
    const fullWords = new Trie();
    const twenty = [
        "a", "b", "c", "d", "e", "f", "g", "h", "i", "j",
        "k", "l", "m", "n", "o", "p", "q", "r", "s", "t",
    ];
    for (const w of twenty) {
        assert.equal(fullWords.insert(w).ok, true);
    }
    assert.equal(fullWords.size, 20);
    assert.equal(fullWords.isFull(), true);
    const over20 = fullWords.insert("u");
    assert.equal(over20.ok, false);
    assert.match(over20.error, /word limit \(20\)/i);
    assert.equal(fullWords.size, 20);
    assert.equal(fullWords.integrityError(), null);
});

test("Trie limits: maxNodes full rejects atomically with zero orphan nodes created", () => {
    // maxNodes = 5 (root + 4 chars)
    const tight = new Trie(20, 5);
    assert.equal(tight.insert("abcd").ok, true);
    assert.equal(tight.nodeCount, 5);
    assert.equal(tight.isFull(), true);

    // Inserting "abce" needs 1 new node (5 + 1 > 5): must fail atomically.
    const overOne = tight.insert("abce");
    assertValidSteps(overOne, "maxNodes over by 1");
    assert.equal(overOne.ok, false);
    assert.match(overOne.error, /node limit \(5\)/i);
    assert.equal(overOne.steps[0].type, "overflow");
    assert.equal(tight.nodeCount, 5);
    assert.equal(tight.integrityError(), null);

    // Inserting "xyz" needs 3 new nodes: must NOT partially attach 'x' or 'y'.
    const overThree = tight.insert("xyz");
    assert.equal(overThree.ok, false);
    assert.match(overThree.error, /node limit \(5\)/i);
    assert.equal(tight.root.children.has("x"), false, "atomic reject must leave no partial branch");
    assert.equal(tight.nodeCount, 5);
    assert.equal(tight.integrityError(), null);

    // Inserting an existing prefix "ab" needs 0 new nodes (5 + 0 <= 5): must succeed!
    const prefixInsert = tight.insert("ab");
    assert.equal(prefixInsert.ok, true);
    assert.equal(prefixInsert.value.createdNodes, 0);
    assert.equal(tight.nodeCount, 5);
    assert.deepEqual(tight.toArray(), ["ab", "abcd"]);
    assert.equal(tight.integrityError(), null);

    // Full 120-node limit test: 10 disjoint 11-letter words = 1 + 110 = 111 nodes;
    // then 1 more 9-letter word = 120 nodes exact; next 1-letter disjoint word fails atomically.
    const maxTrie = new Trie();
    const baseLetters = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    for (const ch of baseLetters) {
        assert.equal(maxTrie.insert(ch.repeat(11)).ok, true);
    }
    assert.equal(maxTrie.nodeCount, 111);
    assert.equal(maxTrie.insert("k".repeat(9)).ok, true);
    assert.equal(maxTrie.nodeCount, 120);
    assert.equal(maxTrie.isFull(), true);

    const over120 = maxTrie.insert("zzzz");
    assert.equal(over120.ok, false);
    assert.match(over120.error, /node limit \(120\)/i);
    assert.equal(maxTrie.root.children.has("z"), false);
    assert.equal(maxTrie.nodeCount, 120);
    assert.equal(maxTrie.integrityError(), null);

    // minNodes = 1 boundary (root only; every non-empty word needs >= 1 node and must fail atomically)
    const rootOnly = new Trie(1, 1);
    assert.equal(rootOnly.nodeCount, 1);
    assert.equal(rootOnly.isFull(), true);
    const overRoot = rootOnly.insert("a");
    assertValidSteps(overRoot, "minNodes=1 overflow");
    assert.equal(overRoot.ok, false);
    assert.match(overRoot.error, /node limit \(1\)/i);
    assert.equal(rootOnly.nodeCount, 1);
    assert.equal(rootOnly.integrityError(), null);
});

test("Trie delete: partial-prune stopping at node with both isEnd and remaining children", () => {
    const trie = new Trie();
    trie.insert("car");
    trie.insert("card");
    trie.insert("care");

    const del = trie.delete("card");
    assertValidSteps(del, "delete card (isEnd + branch stop)");
    assert.equal(del.ok, true);
    assert.equal(del.value.outcome, "partial-prune");
    assert.equal(del.value.prunedCount, 1);
    const doneStep = del.steps.at(-1);
    assert.match(doneStep.message, /another word \("car"\) ends here/i);
    assert.match(doneStep.message, /1 child edge still branch/i);
    assert.deepEqual(trie.toArray(), ["car", "care"]);
    assert.equal(trie.integrityError(), null);
});

/* ---------------- clear(), integrityError() corruption checks, and invalid args ---------------- */

test("Trie clear(): resets size and nodeCount, preserves root id, keeps monotonic ids", () => {
    const trie = new Trie();
    trie.insert("cat");
    trie.insert("dog");
    const rootId = trie.root.id;

    const cleared = trie.clear();
    assertValidSteps(cleared, "clear");
    assert.equal(cleared.ok, true);
    assert.equal(cleared.value, 2);
    assert.equal(trie.size, 0);
    assert.equal(trie.nodeCount, 1);
    assert.equal(trie.root.id, rootId);
    assert.deepEqual(trie.toArray(), []);
    assert.equal(trie.integrityError(), null);

    const after = trie.insert("a");
    assert.equal(after.ok, true);
    assert.ok(after.value.nodeId > 7, "ids continue monotonically after clear");
});

test("Trie integrityError(): catches dangling leaves, count mismatches, root corruption, and cycles", () => {
    // 1. Dangling non-root leaf (isEnd === false)
    const dangling = new Trie();
    dangling.insert("cat");
    dangling.root.children.get("c").children.get("a").children.get("t").isEnd = false;
    assert.match(dangling.integrityError(), /dangling/i);

    // 2. Size mismatch
    const badSize = new Trie();
    badSize.insert("cat");
    badSize._size = 3;
    assert.match(badSize.integrityError(), /size/i);

    // 3. nodeCount mismatch
    const badNodes = new Trie();
    badNodes.insert("cat");
    badNodes._nodeCount = 2;
    assert.match(badNodes.integrityError(), /nodeCount/i);

    // 4. Root marked as word end
    const badRoot = new Trie();
    badRoot.root.isEnd = true;
    assert.match(badRoot.integrityError(), /root/i);

    // 5. Cycle / shared child
    const cyclic = new Trie();
    cyclic.insert("ab");
    const nodeA = cyclic.root.children.get("a");
    nodeA.children.set("a", nodeA);
    assert.match(cyclic.integrityError(), /cycle|shared/i);

    const shared = new Trie();
    shared.insert("ba");
    shared.insert("ca");
    const nodeBA = shared.root.children.get("b").children.get("a");
    shared.root.children.get("c").children.set("a", nodeBA);
    assert.match(shared.integrityError(), /cycle|shared/i);

    // 6. Edge key disagrees with child.char
    const mismatchChar = new Trie();
    mismatchChar.insert("a");
    mismatchChar.root.children.get("a").char = "z";
    assert.match(mismatchChar.integrityError(), /disagrees/i);
});

test("Trie: invalid constructor limits throw RangeError and non-string method args throw TypeError", () => {
    for (const badWords of [0, -1, 21, 1.5, NaN, Infinity, "10", null, []]) {
        assert.throws(() => new Trie(badWords), RangeError, `maxWords=${String(badWords)}`);
        assert.throws(() => new Trie({ maxWords: badWords }), RangeError, `{ maxWords: ${String(badWords)} }`);
    }
    for (const badNodes of [0, -5, 121, 2.5, NaN, Infinity, "50", null]) {
        assert.throws(() => new Trie(10, badNodes), RangeError, `maxNodes=${String(badNodes)}`);
        assert.throws(() => new Trie({ maxNodes: badNodes }), RangeError, `{ maxNodes: ${String(badNodes)} }`);
    }

    const trie = new Trie();
    for (const badArg of [null, undefined, 42, true, {}, ["a"]]) {
        assert.throws(() => trie.insert(badArg), TypeError, `insert(${String(badArg)})`);
        assert.throws(() => trie.search(badArg), TypeError, `search(${String(badArg)})`);
        assert.throws(() => trie.startsWith(badArg), TypeError, `startsWith(${String(badArg)})`);
        assert.throws(() => trie.wordsWithPrefix(badArg), TypeError, `wordsWithPrefix(${String(badArg)})`);
        assert.throws(() => trie.delete(badArg), TypeError, `delete(${String(badArg)})`);
    }
});
