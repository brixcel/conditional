import { ok, fail, assertCapacity } from "./result.js";

/**
 * Trie (Prefix Tree) made of real linked node objects:
 *   { id, char, children: Map<string, TrieNode>, isEnd }
 * Every node has a stable, monotonically increasing positive integer `id` so
 * visualizers can track individual nodes across steps and animations (ids are
 * never reused after pruning or clearing).
 *
 * Rules:
 * - Words and prefixes are trimmed and lowercased, then must match `/^[a-z]{1,12}$/`.
 *   Non-string arguments throw `TypeError`; invalid strings return `{ ok: false, error, steps: [] }`.
 * - Limits: `maxWords` in 1..20 (default 20) and `maxNodes` in 1..120 (default 120),
 *   validated with `assertCapacity`. `nodeCount` includes the root node (an empty trie
 *   starts with `nodeCount === 1`).
 * - Node-limit checks on `insert()` are atomic: if inserting a word would exceed
 *   `maxNodes`, no partial nodes are created and `integrityError()` stays `null`.
 * - No `-1` sentinels anywhere: absent words/prefixes return `nodeId: null`.
 *
 * DOM-free. Every operation returns `{ ok, value?, error?, steps }`.
 * Each step has the shape:
 *   { type, operation, nodeIds, pathIds, line, message, prefix, matches?, snapshot }
 * where `line` is a 1-based line number in `TRIE_INFO.pseudocode[operation]`,
 * `prefix` is the string built letter by letter up to that step, and `snapshot` is a
 * plain deep copy `{ nodes: [{ id, char, isEnd, children }], rootId, size, nodeCount, maxWords, maxNodes }`.
 */

export const WORD_LIMITS = Object.freeze({
    minLength: 1,
    maxLength: 12,
    minWords: 1,
    maxWords: 20,
    minNodes: 1,
    maxNodes: 120,
});

const LOWERCASE_LETTERS_RE = /^[a-z]+$/;

/** Registry entry, matching the site's shared metadata pattern. */
export const TRIE_INFO = Object.freeze({
    name: "Trie (Prefix Tree)",
    summary:
        "A multi-way prefix tree where each edge carries one lowercase letter (a–z) " +
        "and word-end markers identify complete stored words. Insert, search, prefix check, " +
        "and delete walk one edge per character in O(L) time for word or prefix length L, independent " +
        "of how many words are stored.",
    complexity: Object.freeze({
        insert: "O(L) — L is word length",
        search: "O(L) — L is word length",
        startsWith: "O(L) — L is prefix length",
        wordsWithPrefix: "O(L + K) — prefix length L + K total characters in matched words",
        delete: "O(L) — walk down + prune bottom-up",
        space: "O(total characters)",
    }),
    pseudocode: Object.freeze({
        insert: Object.freeze([
            "check limits (maxWords, maxNodes)",
            "curr ← root",
            "for each char ch in word:",
            "    if ch not in curr.children: create child node(ch)",
            "    curr ← curr.children[ch]",
            "if curr.isEnd: reject duplicate word",
            "curr.isEnd ← true;  size ← size + 1",
        ]),
        search: Object.freeze([
            "curr ← root",
            "for each char ch in word:",
            "    if ch not in curr.children: return not found",
            "    curr ← curr.children[ch]",
            "return curr.isEnd  // must be marked word end",
        ]),
        startsWith: Object.freeze([
            "curr ← root",
            "for each char ch in prefix:",
            "    if ch not in curr.children: return not found",
            "    curr ← curr.children[ch]",
            "return found (prefix exists in trie)",
        ]),
        wordsWithPrefix: Object.freeze([
            "curr ← root;  walk prefix edges",
            "if prefix edge missing: return []",
            "dfs(node, prefix) in alphabetical child order:",
            "    if node.isEnd: collect(prefix)",
            "    for each (ch, child) sorted: dfs(child, prefix + ch)",
            "return collected words",
        ]),
        delete: Object.freeze([
            "curr ← root;  walk word edges (recording path)",
            "if missing edge or !curr.isEnd: return not found",
            "curr.isEnd ← false;  size ← size - 1",
            "walk path bottom-up while node != root:",
            "    if node.children.size > 0 or node.isEnd: stop pruning and return",
            "    unlink node from parent.children (prune)",
            "return deleted",
        ]),
        clear: Object.freeze([
            "unlink all children from root;  size ← 0;  nodeCount ← 1",
        ]),
    }),
});

/**
 * Validates and normalizes one word or prefix: trims whitespace, lowercases,
 * and requires 1..12 ASCII letters `a-z`. Never throws.
 *
 * @param {unknown} text
 * @param {{ label?: string }} [options]
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateWord(text, { label = "Word" } = {}) {
    if (typeof text !== "string") {
        return { ok: false, error: `${label} must be a string of ${WORD_LIMITS.minLength}–${WORD_LIMITS.maxLength} letters (a–z).` };
    }
    const normalized = text.trim().toLowerCase();
    if (normalized.length === 0) {
        return {
            ok: false,
            error: `${label} is required (enter ${WORD_LIMITS.minLength} to ${WORD_LIMITS.maxLength} letters a–z).`,
        };
    }
    if (!LOWERCASE_LETTERS_RE.test(normalized)) {
        return {
            ok: false,
            error: `${label} "${normalized}" must contain only letters a–z (no spaces, digits, or symbols).`,
        };
    }
    if (normalized.length > WORD_LIMITS.maxLength) {
        return {
            ok: false,
            error: `${label} "${normalized}" is too long (${normalized.length} letters; maximum is ${WORD_LIMITS.maxLength}).`,
        };
    }
    return { ok: true, value: normalized };
}

/**
 * Parses a comma- or whitespace-separated list of words for batch building a Trie.
 * Normalizes each word with `validateWord` and rejects duplicates by default.
 *
 * @param {unknown} text
 * @param {{ maxWords?: number, allowDuplicates?: boolean }} [options]
 * @returns {{ ok: true, words: string[] } | { ok: false, error: string }}
 */
export function parseWordListInput(text, { maxWords = WORD_LIMITS.maxWords, allowDuplicates = false } = {}) {
    const raw = text === null || text === undefined ? "" : String(text).trim();
    if (raw === "") {
        return { ok: false, error: "Enter at least one word (letters a–z, separated by spaces or commas)." };
    }

    const tokens = raw.split(/[\s,]+/).filter(Boolean);
    if (tokens.length === 0) {
        return { ok: false, error: "Enter at least one word (letters a–z, separated by spaces or commas)." };
    }
    const words = [];
    const seen = new Set();

    for (const token of tokens) {
        const checked = validateWord(token, { label: "Word" });
        if (!checked.ok) return checked;
        if (!allowDuplicates && seen.has(checked.value)) {
            return {
                ok: false,
                error: `Duplicate word "${checked.value}" in list. Each word in the list must be unique.`,
            };
        }
        seen.add(checked.value);
        words.push(checked.value);
    }

    if (words.length > maxWords) {
        return {
            ok: false,
            error: `Enter at most ${maxWords} words (got ${words.length}).`,
        };
    }

    return { ok: true, words };
}

export class TrieNode {
    /**
     * @param {number} id stable positive integer identifier
     * @param {string} [char=""] edge letter leading to this node ("" for root)
     * @param {boolean} [isEnd=false] true when a stored word terminates at this node
     */
    constructor(id, char = "", isEnd = false) {
        this.id = id;
        this.char = char;
        /** @type {Map<string, TrieNode>} */
        this.children = new Map();
        this.isEnd = isEnd;
    }
}

export class Trie {
    static MAX_WORDS = WORD_LIMITS.maxWords;
    static MAX_NODES = WORD_LIMITS.maxNodes;

    #nextId = 1;

    /**
     * Accepts either positional `(maxWords, maxNodes)` or an options object
     * `{ maxWords, maxNodes }`. `maxWords` must be an integer in 1..20 and
     * `maxNodes` must be an integer in 1..120 (root counts as 1 node).
     *
     * @param {number | { maxWords?: number, maxNodes?: number }} [maxWordsOrOptions=20]
     * @param {number} [maxNodes=120]
     */
    constructor(maxWordsOrOptions = WORD_LIMITS.maxWords, maxNodes = WORD_LIMITS.maxNodes) {
        let wordLimit;
        let nodeLimit;

        if (
            maxWordsOrOptions !== null &&
            typeof maxWordsOrOptions === "object" &&
            !Array.isArray(maxWordsOrOptions)
        ) {
            wordLimit = maxWordsOrOptions.maxWords === undefined ? WORD_LIMITS.maxWords : maxWordsOrOptions.maxWords;
            nodeLimit = maxWordsOrOptions.maxNodes === undefined ? WORD_LIMITS.maxNodes : maxWordsOrOptions.maxNodes;
        } else {
            wordLimit = maxWordsOrOptions;
            nodeLimit = maxNodes;
        }

        assertCapacity(wordLimit, WORD_LIMITS.minWords, WORD_LIMITS.maxWords, "Trie word");
        assertCapacity(nodeLimit, WORD_LIMITS.minNodes, WORD_LIMITS.maxNodes, "Trie node");

        this.maxWords = wordLimit;
        this.maxNodes = nodeLimit;
        this.root = new TrieNode(this.#nextId++, "", false);
        this._size = 0;
        this._nodeCount = 1;
    }

    /* ---------- queries ---------- */

    /** Number of complete words currently stored in the trie. */
    get size() {
        return this._size;
    }

    /** Total number of live nodes in the trie (including the root node). */
    get nodeCount() {
        return this._nodeCount;
    }

    isEmpty() {
        return this._size === 0;
    }

    /**
     * Returns true when either the word limit or node limit is at its ceiling.
     * Note: when only `nodeCount === maxNodes`, inserting an existing prefix that
     * needs 0 new nodes is still allowed.
     */
    isFull() {
        return this._size >= this.maxWords || this._nodeCount >= this.maxNodes;
    }

    /**
     * Returns all stored words in strictly alphabetical order. O(total characters).
     *
     * @returns {string[]}
     */
    toArray() {
        const words = [];
        const walk = (node, prefix) => {
            if (node.isEnd) words.push(prefix);
            const chars = [...node.children.keys()].sort();
            for (const ch of chars) {
                walk(node.children.get(ch), prefix + ch);
            }
        };
        walk(this.root, "");
        return words;
    }

    /**
     * Returns a plain deep copy of the trie suitable for layout, rendering, and step replay:
     * `{ nodes: [{ id, char, isEnd, children: [ids sorted by char] }], rootId, size, nodeCount, maxWords, maxNodes }`.
     * Guards against cycles if links were corrupted externally.
     */
    snapshot() {
        const nodes = [];
        const seen = new Set();

        const walk = (node) => {
            if (node === null || node === undefined || seen.has(node)) return;
            seen.add(node);

            const sortedChars = [...node.children.keys()].sort();
            const childIds = [];
            for (const ch of sortedChars) {
                const child = node.children.get(ch);
                if (child !== null && child !== undefined) {
                    childIds.push(child.id);
                }
            }

            nodes.push({
                id: node.id,
                char: node.char,
                isEnd: Boolean(node.isEnd),
                children: childIds,
            });

            for (const ch of sortedChars) {
                walk(node.children.get(ch));
            }
        };

        walk(this.root);

        return {
            nodes,
            rootId: this.root ? this.root.id : null,
            size: this._size,
            nodeCount: this._nodeCount,
            maxWords: this.maxWords,
            maxNodes: this.maxNodes,
        };
    }

    /**
     * Verifies all structural Trie invariants:
     * 1. `root` is a `TrieNode` with `char === ""` and `isEnd === false`.
     * 2. `size` is in `0..maxWords` and `nodeCount` is in `1..maxNodes`.
     * 3. No cycle, no shared child node, and no duplicate node ids.
     * 4. Every child edge key is a single lowercase letter `a-z` matching `child.char`.
     * 5. Every non-root leaf (`children.size === 0`) has `isEnd === true` (no dangling unpruned branches).
     * 6. Reachable node count equals `nodeCount`, and count of `isEnd === true` nodes equals `size`.
     *
     * @returns {string | null} `null` when sound, otherwise a descriptive error string.
     */
    integrityError() {
        if (!(this.root instanceof TrieNode)) {
            return "root is missing or not a TrieNode";
        }
        if (this.root.char !== "") {
            return `root node must have empty char "" (got "${this.root.char}")`;
        }
        if (this.root.isEnd) {
            return "root node must never be marked as a word end";
        }
        if (!Number.isInteger(this._size) || this._size < 0 || this._size > this.maxWords) {
            return `size (${this._size}) is outside 0..${this.maxWords}`;
        }
        if (!Number.isInteger(this._nodeCount) || this._nodeCount < 1 || this._nodeCount > this.maxNodes) {
            return `nodeCount (${this._nodeCount}) is outside 1..${this.maxNodes}`;
        }

        const seenNodes = new Set();
        const seenIds = new Set();
        let endCount = 0;

        const walk = (node, isRoot) => {
            if (seenNodes.has(node)) {
                return `cycle or shared child detected at node #${node.id} ('${node.char}')`;
            }
            if (!Number.isInteger(node.id) || node.id < 1) {
                return `invalid node id (${node.id})`;
            }
            if (seenIds.has(node.id)) {
                return `duplicate node id #${node.id}`;
            }
            if (!(node.children instanceof Map)) {
                return `node #${node.id} children is not a Map`;
            }

            seenNodes.add(node);
            seenIds.add(node.id);

            if (node.isEnd) endCount++;

            if (!isRoot && node.children.size === 0 && !node.isEnd) {
                return `dangling non-root leaf at node #${node.id} ('${node.char}') with isEnd === false`;
            }

            for (const [ch, child] of node.children.entries()) {
                if (typeof ch !== "string" || ch.length !== 1 || !LOWERCASE_LETTERS_RE.test(ch)) {
                    return `invalid edge key "${ch}" on node #${node.id}`;
                }
                if (!(child instanceof TrieNode)) {
                    return `child for edge '${ch}' on node #${node.id} is not a TrieNode`;
                }
                if (child.char !== ch) {
                    return `edge key '${ch}' disagrees with child node #${child.id} char '${child.char}'`;
                }
                const err = walk(child, false);
                if (err !== null) return err;
            }
            return null;
        };

        const err = walk(this.root, true);
        if (err !== null) return err;

        if (seenNodes.size !== this._nodeCount) {
            return `reachable node count (${seenNodes.size}) does not equal nodeCount (${this._nodeCount})`;
        }
        if (endCount !== this._size) {
            return `word-end node count (${endCount}) does not equal size (${this._size})`;
        }
        return null;
    }

    /* ---------- mutating & traced operations ---------- */

    /**
     * Inserts `word` into the trie. O(L) time where L is the word length.
     * - Trims and lowercases; rejects invalid strings with `{ ok: false, error, steps: [] }`.
     * - Duplicate words fail with steps tracing to the existing end node (duplicate wins over overflow).
     * - Word-limit and node-limit checks happen atomically before any node is allocated.
     *
     * @param {string} word
     */
    insert(word) {
        const parsed = this.#parseArg(word, "Word");
        if (!parsed.ok) return fail(parsed.error, []);
        const w = parsed.value;

        // Pre-probe without mutating so duplicate and node-limit checks are atomic.
        let probe = this.root;
        let matchedLen = 0;
        for (let i = 0; i < w.length; i++) {
            const next = probe.children.get(w[i]);
            if (next === undefined) break;
            probe = next;
            matchedLen++;
        }
        const isDuplicate = matchedLen === w.length && probe.isEnd;
        const newNodesNeeded = w.length - matchedLen;

        if (isDuplicate) {
            const steps = [];
            const pathIds = [this.root.id];
            let curr = this.root;
            let prefix = "";
            for (const ch of w) {
                curr = curr.children.get(ch);
                prefix += ch;
                pathIds.push(curr.id);
                steps.push(
                    this.#step("visit", "insert", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 5,
                        prefix,
                        message: `Follow existing edge '${ch}' to node #${curr.id} (prefix "${prefix}").`,
                    }),
                );
            }
            const error = `Word "${w}" is already in the trie.`;
            steps.push(
                this.#step("duplicate", "insert", {
                    nodeIds: [curr.id],
                    pathIds: pathIds.slice(),
                    line: 6,
                    prefix: w,
                    message: `Node #${curr.id} is already a word end for "${w}". Duplicate insertion rejected.`,
                }),
            );
            return fail(error, steps);
        }

        if (this._size >= this.maxWords) {
            const error =
                `Trie word limit (${this.maxWords}) reached: cannot insert "${w}".`;
            return fail(error, [
                this.#step("overflow", "insert", {
                    nodeIds: [this.root.id],
                    pathIds: [this.root.id],
                    line: 1,
                    prefix: "",
                    message: error,
                }),
            ]);
        }

        if (this._nodeCount + newNodesNeeded > this.maxNodes) {
            const error =
                `Trie node limit (${this.maxNodes}) would be exceeded: inserting "${w}" requires ` +
                `${newNodesNeeded} new node${newNodesNeeded === 1 ? "" : "s"} ` +
                `(${this._nodeCount} + ${newNodesNeeded} > ${this.maxNodes}).`;
            return fail(error, [
                this.#step("overflow", "insert", {
                    nodeIds: [this.root.id],
                    pathIds: [this.root.id],
                    line: 1,
                    prefix: "",
                    message: error,
                }),
            ]);
        }

        const steps = [];
        const pathIds = [this.root.id];
        let curr = this.root;
        let prefix = "";

        for (const ch of w) {
            prefix += ch;
            const existing = curr.children.get(ch);
            if (existing !== undefined) {
                curr = existing;
                pathIds.push(curr.id);
                steps.push(
                    this.#step("visit", "insert", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 5,
                        prefix,
                        message: `Follow existing edge '${ch}' to node #${curr.id} (prefix "${prefix}").`,
                    }),
                );
            } else {
                const parentId = curr.id;
                const next = new TrieNode(this.#nextId++, ch, false);
                curr.children.set(ch, next);
                this._nodeCount++;
                curr = next;
                pathIds.push(curr.id);
                steps.push(
                    this.#step("create-node", "insert", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 4,
                        prefix,
                        message: `No edge '${ch}' from node #${parentId}: create node #${curr.id} for '${ch}' (prefix "${prefix}").`,
                    }),
                );
            }
        }

        curr.isEnd = true;
        this._size++;
        steps.push(
            this.#step("mark-end", "insert", {
                nodeIds: [curr.id],
                pathIds: pathIds.slice(),
                line: 7,
                prefix: w,
                message: `Mark node #${curr.id} as word end for "${w}". The trie now stores ${this._size} word${this._size === 1 ? "" : "s"}.`,
            }),
        );

        return ok({ word: w, nodeId: curr.id, createdNodes: newNodesNeeded }, steps);
    }

    /**
     * Searches for an exact stored word. O(L) time.
     * Returns `ok({ found: true, word, nodeId }, steps)` or
     * `ok({ found: false, word, nodeId: null }, steps)` (no -1 sentinels).
     *
     * @param {string} word
     */
    search(word) {
        const parsed = this.#parseArg(word, "Word");
        if (!parsed.ok) return fail(parsed.error, []);
        const w = parsed.value;

        const steps = [];
        const pathIds = [this.root.id];
        let curr = this.root;
        let prefix = "";

        for (const ch of w) {
            const next = curr.children.get(ch);
            if (next === undefined) {
                const where = prefix ? `from node #${curr.id} after "${prefix}"` : `from root node #${curr.id}`;
                steps.push(
                    this.#step("not-found", "search", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 3,
                        prefix,
                        message: `No edge '${ch}' ${where}: "${w}" is not in the trie.`,
                    }),
                );
                return ok({ found: false, word: w, nodeId: null }, steps);
            }
            prefix += ch;
            curr = next;
            pathIds.push(curr.id);
            steps.push(
                this.#step("visit", "search", {
                    nodeIds: [curr.id],
                    pathIds: pathIds.slice(),
                    line: 4,
                    prefix,
                    message: `Follow edge '${ch}' to node #${curr.id} (prefix "${prefix}").`,
                }),
            );
        }

        if (curr.isEnd) {
            steps.push(
                this.#step("found", "search", {
                    nodeIds: [curr.id],
                    pathIds: pathIds.slice(),
                    line: 5,
                    prefix: w,
                    message: `Found word "${w}" at node #${curr.id} (isEnd is true).`,
                }),
            );
            return ok({ found: true, word: w, nodeId: curr.id }, steps);
        }

        steps.push(
            this.#step("not-found", "search", {
                nodeIds: [curr.id],
                pathIds: pathIds.slice(),
                line: 5,
                prefix: w,
                message: `Reached node #${curr.id} for "${w}", but isEnd is false: "${w}" is only a prefix of longer word(s), not a stored word.`,
            }),
        );
        return ok({ found: false, word: w, nodeId: null }, steps);
    }

    /**
     * Checks whether any stored word starts with `prefix`. O(L) time.
     * Returns `ok({ found: true, prefix, nodeId }, steps)` or
     * `ok({ found: false, prefix, nodeId: null }, steps)`.
     *
     * @param {string} prefixInput
     */
    startsWith(prefixInput) {
        const parsed = this.#parseArg(prefixInput, "Prefix");
        if (!parsed.ok) return fail(parsed.error, []);
        const p = parsed.value;

        const steps = [];
        const pathIds = [this.root.id];
        let curr = this.root;
        let built = "";

        for (const ch of p) {
            const next = curr.children.get(ch);
            if (next === undefined) {
                const where = built ? `from node #${curr.id} after "${built}"` : `from root node #${curr.id}`;
                steps.push(
                    this.#step("not-found", "startsWith", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 3,
                        prefix: built,
                        message: `No edge '${ch}' ${where}: no stored word starts with "${p}".`,
                    }),
                );
                return ok({ found: false, prefix: p, nodeId: null }, steps);
            }
            built += ch;
            curr = next;
            pathIds.push(curr.id);
            steps.push(
                this.#step("visit", "startsWith", {
                    nodeIds: [curr.id],
                    pathIds: pathIds.slice(),
                    line: 4,
                    prefix: built,
                    message: `Follow edge '${ch}' to node #${curr.id} (prefix "${built}").`,
                }),
            );
        }

        steps.push(
            this.#step("found", "startsWith", {
                nodeIds: [curr.id],
                pathIds: pathIds.slice(),
                line: 5,
                prefix: p,
                message: `Prefix "${p}" exists in the trie at node #${curr.id}.`,
            }),
        );
        return ok({ found: true, prefix: p, nodeId: curr.id }, steps);
    }

    /**
     * Autocomplete: finds every stored word starting with `prefix`, in strictly
     * alphabetical order. O(L + K) time where L is the prefix length and K is the
     * total characters across all matched words. Each `collect` step carries a
     * snapshot of the growing `matches` list.
     *
     * @param {string} prefixInput
     */
    wordsWithPrefix(prefixInput) {
        const parsed = this.#parseArg(prefixInput, "Prefix");
        if (!parsed.ok) return fail(parsed.error, []);
        const p = parsed.value;

        const steps = [];
        const pathIds = [this.root.id];
        let curr = this.root;
        let built = "";

        for (const ch of p) {
            const next = curr.children.get(ch);
            if (next === undefined) {
                const where = built ? `from node #${curr.id} after "${built}"` : `from root node #${curr.id}`;
                steps.push(
                    this.#step("not-found", "wordsWithPrefix", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 2,
                        prefix: built,
                        matches: [],
                        message: `No edge '${ch}' ${where}: 0 words start with "${p}".`,
                    }),
                );
                return ok([], steps);
            }
            built += ch;
            curr = next;
            pathIds.push(curr.id);
            steps.push(
                this.#step("visit", "wordsWithPrefix", {
                    nodeIds: [curr.id],
                    pathIds: pathIds.slice(),
                    line: 1,
                    prefix: built,
                    matches: [],
                    message: `Follow edge '${ch}' to node #${curr.id} (prefix "${built}").`,
                }),
            );
        }

        const matches = [];
        const dfs = (node, currentWord, trail) => {
            if (node.isEnd) {
                matches.push(currentWord);
                steps.push(
                    this.#step("collect", "wordsWithPrefix", {
                        nodeIds: [node.id],
                        pathIds: trail.slice(),
                        line: 4,
                        prefix: currentWord,
                        matches: matches.slice(),
                        message: `Collect word "${currentWord}" at node #${node.id} (${matches.length} found: [${matches.join(", ")}]).`,
                    }),
                );
            }
            const sortedChars = [...node.children.keys()].sort();
            for (const ch of sortedChars) {
                const child = node.children.get(ch);
                const nextWord = currentWord + ch;
                const nextTrail = [...trail, child.id];
                steps.push(
                    this.#step("visit", "wordsWithPrefix", {
                        nodeIds: [child.id],
                        pathIds: nextTrail.slice(),
                        line: 5,
                        prefix: nextWord,
                        matches: matches.slice(),
                        message: `Explore edge '${ch}' to node #${child.id} (prefix "${nextWord}").`,
                    }),
                );
                dfs(child, nextWord, nextTrail);
            }
        };

        dfs(curr, p, pathIds);

        steps.push(
            this.#step("done", "wordsWithPrefix", {
                nodeIds: [curr.id],
                pathIds: pathIds.slice(),
                line: 6,
                prefix: p,
                matches: matches.slice(),
                message: `Autocomplete for "${p}" found ${matches.length} word${matches.length === 1 ? "" : "s"}: [${matches.join(", ")}].`,
            }),
        );

        return ok(matches, steps);
    }

    /**
     * Deletes `word` from the trie and prunes unused nodes bottom-up. O(L) time.
     * Covers all three structural outcomes:
     * - `"unmark-only"`: word is a prefix of another stored word, so 0 nodes are pruned.
     * - `"partial-prune"`: prunes leafward nodes until hitting a node another word passes through or ends at.
     * - `"full-prune"`: prunes every character node of the word all the way back to the root.
     *
     * @param {string} word
     */
    delete(word) {
        const parsed = this.#parseArg(word, "Word");
        if (!parsed.ok) return fail(parsed.error, []);
        const w = parsed.value;

        if (this._size === 0) {
            const error = `Cannot delete "${w}": the trie is empty.`;
            return fail(error, [
                this.#step("not-found", "delete", {
                    nodeIds: [this.root.id],
                    pathIds: [this.root.id],
                    line: 2,
                    prefix: "",
                    message: error,
                }),
            ]);
        }

        const steps = [];
        const pathIds = [this.root.id];
        const stack = [];
        let curr = this.root;
        let built = "";

        for (const ch of w) {
            const next = curr.children.get(ch);
            if (next === undefined) {
                const where = built ? `after "${built}"` : "from root";
                const error = `Word "${w}" is not in the trie (missing edge '${ch}' ${where}), so it cannot be deleted.`;
                steps.push(
                    this.#step("not-found", "delete", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 2,
                        prefix: built,
                        message: error,
                    }),
                );
                return fail(error, steps);
            }
            built += ch;
            stack.push({ node: next, parent: curr, char: ch, prefix: built });
            curr = next;
            pathIds.push(curr.id);
            steps.push(
                this.#step("visit", "delete", {
                    nodeIds: [curr.id],
                    pathIds: pathIds.slice(),
                    line: 1,
                    prefix: built,
                    message: `Follow edge '${ch}' to node #${curr.id} (prefix "${built}").`,
                }),
            );
        }

        if (!curr.isEnd) {
            const error = `Word "${w}" is not stored in the trie (it is only a prefix of another word), so it cannot be deleted.`;
            steps.push(
                this.#step("not-found", "delete", {
                    nodeIds: [curr.id],
                    pathIds: pathIds.slice(),
                    line: 2,
                    prefix: w,
                    message: error,
                }),
            );
            return fail(error, steps);
        }

        curr.isEnd = false;
        this._size--;
        steps.push(
            this.#step("unmark-end", "delete", {
                nodeIds: [curr.id],
                pathIds: pathIds.slice(),
                line: 3,
                prefix: w,
                message: `Unmark node #${curr.id} as word end for "${w}" (${this._size} word${this._size === 1 ? "" : "s"} remaining).`,
            }),
        );

        let prunedCount = 0;
        const prunedNodes = [];
        let stoppedEarly = false;

        for (let i = stack.length - 1; i >= 0; i--) {
            const { node, parent, char, prefix: nodePrefix } = stack[i];
            const remainingPath = pathIds.slice(0, i + 2);

            if (node.children.size > 0 && node.isEnd) {
                stoppedEarly = true;
                steps.push(
                    this.#step("done", "delete", {
                        nodeIds: [node.id],
                        pathIds: remainingPath,
                        line: 5,
                        prefix: nodePrefix,
                        message:
                            `Stop pruning at node #${node.id} ('${char}', prefix "${nodePrefix}"): ` +
                            `another word ("${nodePrefix}") ends here and ${node.children.size} child ` +
                            `edge${node.children.size === 1 ? "" : "s"} still branch below it. ` +
                            `Deleted "${w}" (${prunedCount} node${prunedCount === 1 ? "" : "s"} pruned).`,
                    }),
                );
                break;
            }

            if (node.children.size > 0) {
                stoppedEarly = true;
                steps.push(
                    this.#step("done", "delete", {
                        nodeIds: [node.id],
                        pathIds: remainingPath,
                        line: 5,
                        prefix: nodePrefix,
                        message:
                            `Stop pruning at node #${node.id} ('${char}', prefix "${nodePrefix}"): ` +
                            `another word passes through this node (${node.children.size} child edge${node.children.size === 1 ? "" : "s"}). ` +
                            `Deleted "${w}" (${prunedCount} node${prunedCount === 1 ? "" : "s"} pruned).`,
                    }),
                );
                break;
            }

            if (node.isEnd) {
                stoppedEarly = true;
                steps.push(
                    this.#step("done", "delete", {
                        nodeIds: [node.id],
                        pathIds: remainingPath,
                        line: 5,
                        prefix: nodePrefix,
                        message:
                            `Stop pruning at node #${node.id} ('${char}'): another word ("${nodePrefix}") ends at this node. ` +
                            `Deleted "${w}" (${prunedCount} node${prunedCount === 1 ? "" : "s"} pruned).`,
                    }),
                );
                break;
            }

            const parentPrefix = nodePrefix.slice(0, -1);
            const pruneMessage =
                `Prune unused node #${node.id} (edge '${char}' from node #${parent.id}): ` +
                `no remaining children and not a word end.`;
            parent.children.delete(char);
            this._nodeCount--;
            prunedCount++;
            prunedNodes.push({ id: node.id, char });

            steps.push(
                this.#step("prune", "delete", {
                    nodeIds: [parent.id],
                    pathIds: pathIds.slice(0, i + 1),
                    line: 6,
                    prefix: parentPrefix,
                    message: pruneMessage,
                }),
            );
        }

        if (!stoppedEarly) {
            steps.push(
                this.#step("done", "delete", {
                    nodeIds: [this.root.id],
                    pathIds: [this.root.id],
                    line: 7,
                    prefix: "",
                    message:
                        `Reached root node #${this.root.id}: stopped pruning. ` +
                        `Deleted "${w}" (full prune: ${prunedCount} node${prunedCount === 1 ? "" : "s"} removed).`,
                }),
            );
        }

        const outcome =
            prunedCount === 0
                ? "unmark-only"
                : prunedCount === stack.length
                    ? "full-prune"
                    : "partial-prune";

        return ok({ word: w, prunedCount, prunedNodes, outcome }, steps);
    }

    /**
     * Removes all words and non-root nodes from the trie while preserving the
     * root node and monotonic id counter. O(total nodes) time.
     * Returns `ok(removedWordCount, [step])`.
     */
    clear() {
        const removedWords = this._size;
        const unlink = (node) => {
            for (const child of node.children.values()) {
                unlink(child);
            }
            node.children.clear();
            node.isEnd = false;
        };
        unlink(this.root);
        this._size = 0;
        this._nodeCount = 1;

        const message = `Cleared ${removedWords} word${removedWords === 1 ? "" : "s"}. The trie now has only the root node.`;
        return ok(removedWords, [
            this.#step("done", "clear", {
                nodeIds: [this.root.id],
                pathIds: [this.root.id],
                line: 1,
                prefix: "",
                message,
            }),
        ]);
    }

    /* ---------- internals ---------- */

    #parseArg(input, label) {
        if (typeof input !== "string") {
            throw new TypeError(`${label} must be a string (got ${typeof input})`);
        }
        return validateWord(input, { label });
    }

    #step(type, operation, { nodeIds = [], pathIds = [], line, message, prefix = "", matches } = {}) {
        const lines = TRIE_INFO.pseudocode[operation];
        if (!lines || !Number.isInteger(line) || line < 1 || line > lines.length) {
            throw new RangeError(`Invalid pseudocode line ${line} for operation "${operation}"`);
        }
        const step = {
            type,
            operation,
            nodeIds,
            pathIds,
            line,
            message,
            prefix,
            snapshot: this.snapshot(),
        };
        if (matches !== undefined) {
            step.matches = matches;
        }
        return step;
    }
}
