# Gemini Handoff

Work packets for Gemini in Antigravity. Claude Code writes them, Gemini
implements them, and Claude reviews them before merge.

## Status (all times Philippine time, UTC+8)

Times from 22:20 on come from an internet clock (`sh scripts/now-pht.sh`). Earlier
times came from this PC's clock, which was about 8 minutes slow.

| | |
|---|---|
| Last updated by Claude | 2026-11-26 17:19 |
| Claude reviews Gemini branches | **paused since 02:26** (automatic review turned off to save usage). Ask Claude for a review when a branch is ready |
| Merged | G1, G2, G3 (2026-11-25); G4, G5, G6 (2026-11-26, G5/G6 at 10:56) |
| **Gemini: do next** | **G9**: Trie module + page (spec below). Start from fresh `main` on branch `gemini/g9-trie` **once `main` contains `bst.html`** (G8 merged). After G9 is reported, take **G10** (Graph) on `gemini/g10-graph`. Take only the task named here |
| Claude is working on | G8 approved at 17:19 (qa-engineer + visualization-engineer fixes + Claude browser check) on branch `claude/g8-bst-merge`, waiting for the user to merge. Then C12 AVL module, C13 heap-backed Priority Queue |

**Short prompt for Antigravity after the first time:**
> Continue: read the Status table in `GEMINI_HANDOFF.md`, do the task under
> "Gemini: do next" following the rules below, then file your report in
> `CLAUDE_HANDOFF.md` with the time you finished.

## How to start (paste this into Antigravity)

> You are working on the URSAC DSA Visualizer repo. Read `PROJECT_CONTEXT.md`
> and `GEMINI_HANDOFF.md` first. Take task **G_** only.
> 1. `git checkout main && git pull`, then `git checkout -b gemini/<task-id>-<short-name>`.
>    Always start from fresh `main`, even if your previous branch is still checked out.
> 2. Edit only the files listed under "Files you own" for that task. If you
>    need to change any other file, stop and write the request in your report instead.
> 3. Follow the conventions in `PROJECT_CONTEXT.md`. Do not add dependencies,
>    CDN scripts, a build step, React, or Tailwind.
> 4. Run `npm test` before you finish. It must pass. Paste the real summary lines.
> 5. Check the pages you changed in a browser at 375px and desktop width
>    (`npm run dev` → http://localhost:5501) and confirm there are no console errors.
> 6. Stage only the files your task owns (`git add <files>`, never `git add -A`),
>    commit to your branch and push it. Do not merge into `main`.
> 7. Append your report to `CLAUDE_HANDOFF.md` using its template (include the
>    time you finished, Philippine time), set the task to Review in `TASK_BOARD.md`,
>    and push. Claude's next automatic check picks it up.
> Never claim a check you did not run. If something is unclear, write the
> question in your report rather than guessing.

## Rules for every task
- **One task per branch.** Never edit a file another open task owns (see `TASK_BOARD.md`).
- **Never edit** `shared.js`, `index.html`, `package.json`, `src/core/*` or
  `.claude/*` unless your task says so. Claude integrates nav and core changes.
- **Do not change behaviour you were not asked to change.** Keep every existing
  operation working, including its current validation rules.
- **No fake functionality.** Every button must do what its label says.
- **Messages:** use the page's existing message area or an
  `.alert-banner.alert-live` element with `role="alert"` (errors) or
  `aria-live="polite"` (info). Never use `alert()`/`prompt()`/`confirm()`.

---

## G1: Replace native dialogs (AVL, Stack, Singly LL) <a id="g1"></a>
**Why:** `alert`/`prompt` block the page, look broken on phones, and screen readers handle them badly.
**Files you own:** `avl-tree.html`, `avl-tree.js`, `stack.html`, `stack.js`,
`singly-linked-list.html`, `singly-linked-list.js`.
**Do:**
1. Find every `alert(`, `prompt(` and `confirm(` in those files (avl-tree.js has 14,
   singly-linked-list.js has 8, stack.js has 2).
2. Each `prompt()` becomes a labelled `<input>` already on the page (reuse an
   existing input where it makes sense, such as AVL's `numberInput` for
   dequeue/update/siblings, or add one next to the button).
3. Each `alert()` becomes an inline message in the page's existing output
   (`#output` on AVL) or a new `.alert-banner.alert-live` element.
4. Fix the AVL falsy check: value `0` must be handled consistently (the page
   currently rejects `<= 0` on insert, so keep that rule but apply it the same way everywhere).
**Done when:** `grep -c "alert(\|prompt(\|confirm(" avl-tree.js stack.js singly-linked-list.js`
prints 0 for each file. Every operation still works, and error messages appear inline.
**Do not:** change the AVL insert/delete/rotation logic. `tests/avl-real.test.js`
must still pass untouched.

## G2: Replace native dialogs (Circular LL, Doubly LL) <a id="g2"></a>
**Files you own:** `circular-linked-list.html`, `circLL.js`, `doubly-linked-list.html`.
**Do:** the same as G1 (circLL.js has 29 calls, doubly-linked-list.html has 38).
Both pages already have address/value inputs, so reuse them for find/update/replace.
Also fix `find()` in circLL.js returning `-1` as "not found". Return `null` instead
and update its callers.
**Done when:** the grep count is 0 for all three files and every operation is checked by hand in the browser.

## G3: Dark theme tokens + inline style cleanup <a id="g3"></a>
**Files you own:** `main.css` only.
**Do:**
1. Add dark values for every colour token in section 1 under both
   `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }`
   and `:root[data-theme="dark"] { ... }`.
2. Replace hard-coded colours outside section 1 (e.g. `#0F172A`, `#F1F5F9`,
   `#94A3B8`, `#CBD5E1`) with tokens so they follow the theme. Add new tokens if needed.
3. Check contrast: text at least 4.5:1, UI parts and chart colours at least 3:1 in both themes.
4. Add utility classes that let G1/G2/Claude remove inline styles later
   (e.g. `.field-label`, `.input-sm`, `.input-md`, `.text-muted`, `.mono`). Document them in a comment.
**Done when:** the OS dark mode setting switches the whole site, including sorting
bars, pseudocode, the state monitor and the sidebar. No text is unreadable.
Add the contrast ratios you checked to your report.
**Note:** the theme *toggle button* is task C1 (Claude, `shared.js`), so G3 only needs to support `data-theme`.

## G4: Searching algorithms module + page <a id="g4"></a>
**Files you own (all new):** `src/algorithms/searching.js`,
`src/pages/searching-page.js`, `searching.html`, `tests/searching.test.js`.
**Copy the pattern from** `src/algorithms/sorting.js`, `src/pages/sorting-page.js`
and `sorting.html`. Reuse `src/core/step-player.js` without changing it.
**Do:**
1. Linear Search, Binary Search (iterative) and Interpolation Search, each recording
   real steps: `{ array, type: "start"|"compare"|"narrow"|"found"|"not-found"|"done",
   indices, low, high, mid, line, message, comparisons }`.
2. Binary and interpolation search require sorted input. Sort the input and say so
   in the first step's message. Do not silently search unsorted data.
3. Interpolation search: guard against division by zero when `A[high] === A[low]`.
4. Page: array input + target input, algorithm select, player controls, bars with
   `low`/`mid`/`high` markers, pseudocode, a comparison counter, and a complexity table.
   Reuse main.css section 12 classes. If you need new CSS, list it in your report
   rather than editing `main.css` (G3 owns it).
5. Tests: each algorithm agrees with `array.indexOf`-style ground truth (for
   duplicates, any matching index is fine but must be correct) over 300 seeded
   random cases, including target absent, target at either end, a single element,
   all-equal values, and input not mutated.
**Done when:** `npm test` passes with the new tests and the page works at 375px
and desktop with no console errors. In your report, include the nav entry and
homepage card you want added (Claude adds them to `shared.js`/`index.html`).

---
## G5: Remove remaining inline styles <a id="g5"></a>
**Why:** project rule 7 says no inline `style=""`. 24 are left in markup, and the Regular Queue page
sets empty-slot looks from JavaScript, so they can drift from the theme.
**Files you own:** `circular-linked-list.html`, `doubly-linked-list.html`, `circular-queue.html`,
`priority-queue.html`, `regular-queue.html`, `stack.html`, `index.html` (only its 2 `style=""`
attributes, nothing else), `main.css`, `src/pages/regular-queue-page.js`.
**Do not touch:** `singly-linked-list.html`, `singly-linked-list.js` (Claude is migrating them in C6), `shared.js`.
**Do:**
1. Replace every `style="..."` in your files with classes. Reuse G3's utilities first
   (`.input-sm/.input-md/.input-lg`, `.text-muted`, `.text-italic`, `.mono`, `.scroll-box-clean`,
   `.slot-label`, ...). Add a new class to `main.css` only when nothing fits, and list it in your report.
   Find them with: `grep -n 'style="' *.html`.
2. `src/pages/regular-queue-page.js`: delete `EMPTY_SLOT_STYLE` and the `Object.assign(car.style, ...)`
   call; toggle the existing `.car-empty` class instead (remove it again when a slot is filled).
   Check that a freed slot and an empty slot still look dashed, in light and dark theme.
3. `main.css`: at `max-width: 640px`, `.controls-row` stacks vertically and `.field-grow { flex: 1 1 260px; }`
   then makes fields 260px tall (you found this in G4). Fix it inside the existing 640px media query with
   `.field-grow { flex: 0 0 auto; }`. Check `sorting.html` and `searching.html` at 375px.
4. Do not change any behaviour, text, ids, or validation.
**Done when:** `grep -c 'style="'` prints 0 for every file you own; `grep -c EMPTY_SLOT_STYLE
src/pages/regular-queue-page.js` prints 0; `npm test` passes; every page you touched looks the same as
before at 375px and desktop in **both** themes (use the new theme button, top right), with no console errors.

---
## G7: Heap page + tree layout helper <a id="g7"></a>
**Why:** the min/max heap logic and tests are already on `main` (`src/structures/heap.js`, `tests/heap.test.js`) but students
cannot see it. A heap is a tree stored in an array, so the page shows **both views of the same `snapshot.items`**.
**Files you own (all new except `main.css`):** `heap.html`, `src/pages/heap-page.js`, `src/core/tree-layout.js`,
`tests/tree-layout.test.js`, and a **new section 14** at the end of `main.css` (add only; do not edit sections 1-13).
**Do not edit:** `src/structures/heap.js`, `tests/heap.test.js`, `src/core/step-player.js`, `shared.js`, `index.html`.
If the heap module seems wrong or missing something, stop and write it in your report.
**Reference pages:** `searching.html` + `src/pages/searching-page.js` (StepPlayer, pseudocode, counters) and
`hash-table.html` (operation buttons that play steps).
**Do:**
1. `src/core/tree-layout.js` (pure, DOM-free): `layoutCompleteTree(n, { levelGap, minGap })` returns, for array indices
   `0..n-1` of a complete binary tree, `{ nodes: [{ index, depth, x, y }], edges: [{ from, to }], width, height }`.
   Leaves at the deepest level are `minGap` apart; parents are centred over their children. Keep it general enough that
   G8 can add a BST layout next to it later; G7 only needs the complete-tree version.
   `tests/tree-layout.test.js`: n = 0, 1, 2, 3, 7, 31, 63; every edge is parent to child (`to = 2*from + 1` or `+ 2`);
   no two nodes on one level overlap (x differs by >= minGap); each parent's x is between its children's x; y = depth * levelGap.
2. `heap.html` + `src/pages/heap-page.js` (ES module, StepPlayer):
   - Controls: heap kind select (Min-heap / Max-heap), Value input + **Insert**, **Extract root**, **Peek**,
     Values list + **Build heap** (O(n) bottom-up via `BinaryHeap.from` / `build`), **Random values**, **Clear**.
     Page capacity **31** (5 levels, readable on a phone). Values: whole numbers -99 to 999 via `parseInteger`
     (`src/core/validate.js`); the list via `parseArrayInput` from `src/algorithms/sorting.js` (1-31 values).
     Changing the kind rebuilds the heap from the current items with `build` and plays those steps.
   - Errors (overflow, underflow, bad input) show inline in an `.alert-banner.alert-live` with `role="alert"`. No dialogs.
   - **Tree view:** inline **SVG** built with `document.createElementNS`, positions from `layoutCompleteTree`
     (set `x`/`y`/`cx`/`cy` attributes, never `style`). Each node shows its value and index. Put it inside a
     `.scroll-box.scroll-box-clean` so 31 nodes scroll sideways on a 375px screen instead of overflowing the page.
   - **Array view:** one row of cells `[0]..[n-1]` under the tree, highlighted the same way as the tree.
   - Highlight `step.indices` in both views with classes from your section 14 (e.g. `.hp-compare`, `.hp-swap`,
     `.hp-settled`, `.hp-root`), using existing colour tokens only (`--bar-compare`, `--bar-swap`, `--bar-sorted`,
     `--primary-*`, ...) so dark mode works. No hard-coded colours, no `.style` writes, no `innerHTML` with values.
   - Step message, counters (`comparisons`, `swaps` from the step), size / capacity, and the root (min or max).
   - Pseudocode panel from `HEAP_INFO.pseudocode`. Heap steps have **no `line` field**, so map step types to lines in the
     page, exactly like this (1-based):

     | Operation | Pseudocode shown | Step type -> line |
     |---|---|---|
     | Insert | `insert` | `insert`->1, `compare`->2, `swap`->3, `done`->2 |
     | Extract | `extract` | `extract`->1, `move-last`->2, `compare`/`swap`/`settled`->3, `done`->4 |
     | Build | `build` | `build-start`->1, `heapify`->2, `compare`/`swap`/`settled`->3, `done`->3 |
     | overflow / underflow | (keep current) | no highlight |

   - Complexity table from `HEAP_INFO.complexity`, and a short concept card (complete tree, parent = floor((i-1)/2),
     children 2i+1 / 2i+2, heap property for min vs max).
3. Player controls + keyboard shortcuts as on the Searching page. Check that **Play** really advances the step counter
   (Play was broken site-wide until today's fix, so start from fresh `main`).
**Done when:** `npm test` passes with your new layout tests; the page works at 375px and desktop in **both** themes with no
console errors and no horizontal page scroll; insert, extract (including on an empty heap), build of 31 values, kind switch,
clear and invalid input all behave; `grep -c 'style="' heap.html` is 0 and `src/pages/heap-page.js` has no `.style`.
In your report: the nav entry and homepage card you want (Claude adds them), and every class you added to section 14.

## G8: Binary Search Tree module + page <a id="g8"></a>
**Status: ready** (G7 merged 2026-11-26 11:17).
**Why:** a BST is the base for the AVL and Red-Black trees later. Students need to see search paths, the three delete cases
and the four traversals on real nodes.
**Files you own:** new `src/structures/bst.js`, `tests/bst.test.js`, `bst.html`, `src/pages/bst-page.js`; in
`src/core/tree-layout.js` you may **add** one new export (do not change `layoutCompleteTree`) and add tests for it to
`tests/tree-layout.test.js`; **add** a new section 15 at the end of `main.css` only if section 14 classes cannot be reused
(prefer reusing `.hp-*`; list anything new).
**Do not edit:** `src/structures/heap.js`, `src/core/step-player.js`, `shared.js`, `index.html`, `main.css` sections 1-14.
**Reference:** `src/structures/linked-list.js` (real node objects, `{ ok, value?, error?, steps }`, steps built before
mutation, `integrityError()`), `heap.html` + `src/pages/heap-page.js` (SVG tree, StepPlayer, pseudocode panel).
**Do:**
1. `src/structures/bst.js` (pure, DOM-free), class `BinarySearchTree` with real node objects
   `{ id, value, left, right }` (`id` is a stable number so the page can follow a node across steps). Unique integer keys;
   capacity 1-31 (constructor, `assertCapacity`). Operations, each returning `{ ok, value?, error?, steps }`:
   - `insert(value)` (duplicate → `{ ok:false }` with a readable error), `search(value)`, `delete(value)` covering
     **all three cases** (leaf; one child; two children using the **in-order successor**, and say so in the message),
     `min()`, `max()`, `height()` (empty = -1, single node = 0; say which convention in the JSDoc),
     `traverse(order)` for `"inorder" | "preorder" | "postorder" | "levelorder"` (visit steps, result array),
     `clear()`, `size`, `isEmpty()`, `isFull()`, `toArray()` (in-order).
   - Steps: `{ type, nodeIds, line, message, snapshot }` where `snapshot` is a plain copy of the tree
     (e.g. `{ nodes: [{ id, value, left, right }] , rootId }` with child ids or null) and `line` is the 1-based line of the
     matching pseudocode in a `BST_INFO` registry (`name`, `summary`, `complexity`, `pseudocode` per operation).
     Types such as `visit`, `go-left`, `go-right`, `found`, `not-found`, `insert`, `delete-leaf`, `delete-one-child`,
     `find-successor`, `copy-successor`, `done`. No `-1` sentinels.
   - `integrityError()`: in-order walk is strictly increasing, every child's value is on the correct side of **every
     ancestor** (not only its parent), node count equals `size`, no node reachable twice. Returns null when sound.
2. `tests/bst.test.js`: 300 seeded random sequences (insert / delete / search, values -50..50 so collisions and all delete
   cases happen) against a sorted-array model, checking `toArray()`, `size`, `min`/`max`, `height` against a reference
   computed from the model's insert order... (simplest: rebuild a reference tree the same way), and `integrityError()`
   after **every** operation. Plus edge cases: delete root with two children, delete in an empty tree, duplicate insert,
   each traversal on a known tree (write the expected arrays by hand), capacity full, bad arguments throw.
   **Mutation check yourself:** break delete (e.g. use predecessor/successor wrongly, or skip relinking the successor's
   right child) and confirm a test fails; mention it in your report.
3. `src/core/tree-layout.js`: add `layoutBinaryTree(snapshot, { levelGap, minGap })` that places nodes by **in-order
   position** (x = inorderIndex * minGap + minGap/2, y = depth * levelGap) and returns the same shape as
   `layoutCompleteTree` (`nodes` keyed by node id, `edges`, `width`, `height`). Tests: no two nodes share an x, every left
   child is left of its parent and every right child right of it, y matches depth, empty tree.
4. `bst.html` + `src/pages/bst-page.js`: Value input + **Insert**, **Search**, **Delete**, **Min**, **Max**, a traversal
   select + **Traverse**, list input + **Build** (inserts in the given order), **Random**, **Clear**. Same player,
   pseudocode panel, counters and theme/a11y rules as the heap page. Show the search path highlighted on the way down; for
   two-child delete, show the successor being found and copied. Show the traversal output growing as nodes are visited.
   Values -99..999, max 31 nodes; errors inline with `role="alert"`.
**Done when:** `npm test` passes with your new tests; the page works at 375px and desktop in both themes with no console
errors and no horizontal page scroll; Play advances; every delete case and every traversal shown on a real tree;
`grep -c 'style="' bst.html` is 0 and the page script has no `.style` / `innerHTML` with values. Report the nav entry and
homepage card you want (Claude adds them) and any CSS you added.

---
## G9: Trie (prefix tree) module + page <a id="g9"></a>
**Status: ready once G8 is on `main`** (check that `bst.html` exists on `main`).
**Why:** tries are the standard way to teach prefix search and autocomplete, and the first tree in the course where a node
can have more than two children.
**Files you own:** new `src/structures/trie.js`, `tests/trie.test.js`, `trie.html`, `src/pages/trie-page.js`; in
`src/core/tree-layout.js` you may **add** one export (do not change `layoutCompleteTree` or `layoutBinaryTree`) and add tests
for it to `tests/tree-layout.test.js`; **add** a new section 16 at the end of `main.css` only if the `.hp-*` and section 15
classes cannot be reused (list anything new).
**Do not edit:** `shared.js`, `index.html`, `src/core/step-player.js`, `src/core/player-keys.js` (if present), any existing
`src/pages/*`, `main.css` sections 1-15.
**Reference:** `src/structures/bst.js` (real nodes, `{ ok, value?, error?, steps }`, `integrityError()`, `BST_INFO`),
`bst.html` + `src/pages/bst-page.js` (SVG tree, player, live regions that are present at load and empty when unused).
**Do:**
1. `src/structures/trie.js` (pure, DOM-free), class `Trie` with real nodes `{ id, char, children: Map, isEnd }`.
   - Words: trim and lowercase, then a-z only, 1-12 letters; anything else is rejected with a readable error.
   - Limits 1-20 words and 120 nodes (constructor + `assertCapacity`).
   - Operations, each returning `{ ok, value?, error?, steps }`: `insert(word)` (duplicate → `{ ok:false }`),
     `search(word)`, `startsWith(prefix)`, `wordsWithPrefix(prefix)` (alphabetical), `delete(word)`, `clear()`, `size`,
     `nodeCount`, `toArray()` (alphabetical).
   - `delete` prunes now-unused nodes bottom-up and says which nodes were removed and why it stopped (another word passes
     through that node, or another word ends there).
   - Steps: `{ type, nodeIds, pathIds, line, message, prefix, snapshot }`, snapshot
     `{ nodes: [{ id, char, isEnd, children: [ids sorted by char] }], rootId }`. Types such as `visit`, `create-node`,
     `mark-end`, `unmark-end`, `prune`, `found`, `not-found`, `collect`, `done`. No `-1` sentinels. `line` is the 1-based
     line in a `TRIE_INFO` registry (`name`, `summary`, `complexity` O(L) per operation / O(total characters) space,
     `pseudocode`).
   - `integrityError()`: node count matches, every non-root leaf is a word end, word-end count equals `size`, no node
     reachable twice. Returns null when sound.
2. `tests/trie.test.js`: 300 seeded mulberry32 sequences against a `Set<string>` model, words from `a`-`d`, 1-5 letters
   (so shared prefixes and prefix-words like "ab"/"abc" happen). After **every** operation check `toArray()`, `size`,
   `search`, `startsWith`, `wordsWithPrefix` and `integrityError() === null`. Edge cases: delete a word that is a prefix of
   another, delete a longer word sharing a prefix with a shorter one, delete in an empty trie, empty string,
   uppercase/whitespace/digits, both limits full. **Mutation check yourself:** make `delete` prune past a node another word
   uses or ends at, confirm a test fails, and mention it in your report.
3. `src/core/tree-layout.js`: add `layoutGeneralTree(snapshot, { levelGap, minGap })`: keeps the snapshot's child order,
   leaves `minGap` apart, each parent centred over its first and last child, same return shape as `layoutBinaryTree`. Tests:
   empty tree, single node, no overlap on any level, every parent between its outer children, y = depth * levelGap.
4. `trie.html` + `src/pages/trie-page.js`: Word input + **Insert**, **Search**, **Starts with**, **Autocomplete**,
   **Delete**; word-list input + **Build**; **Random words**; **Clear**. SVG tree with the letter on each edge; word-end
   nodes get a ring **plus** a non-colour cue (e.g. "•" and a `<title>` "word end"). Highlight the current path and show the
   prefix building letter by letter; autocomplete results appear as they are collected. Same player, pseudocode panel,
   counters, theme and a11y rules as the BST page; errors inline with `role="alert"`. **Keyboard:** if
   `src/core/player-keys.js` exists on `main` when you start, use `bindPlayerKeys(document, player)` from it and
   `DSA_UI.announce(...)`; otherwise copy the key handling from `src/pages/searching-page.js`. Say which you did.
**Done when:** `npm test` passes with your new tests (if `main` has Claude's C10 page checks, the only allowed failure is
"trie.html is missing from navCategories"; Claude adds the nav entry); the page works at 375px and desktop in both themes
with no console errors and no horizontal page scroll; Play advances; all three delete outcomes (full prune, partial prune,
unmark only) shown on a real trie; `grep -c 'style="' trie.html` is 0 and the page script has no `.style` / `innerHTML`
with values. Report the nav entry and card you want, every CSS class you added, and the mutation result.

---
## G10: Graph representation module + page <a id="g10"></a>
**Status: ready after you report G9** (it does not depend on G9's code; start from fresh `main`). If G9 is not merged yet,
put your CSS in a new section titled "Graph" at the end of `main.css`; Claude resolves the append conflict.
**Why:** BFS, DFS, Dijkstra and topological sort (Claude's C15) all need one tested graph structure, and students should see
that an adjacency list and an adjacency matrix describe the same graph.
**Files you own:** new `src/structures/graph.js`, `tests/graph.test.js`, `src/core/graph-layout.js`,
`tests/graph-layout.test.js`, `graph.html`, `src/pages/graph-page.js`; a new section at the end of `main.css`.
**Do not edit:** the G9 list, plus `src/core/tree-layout.js`.
**Do:**
1. `src/structures/graph.js` (pure, DOM-free), `class Graph({ directed = false, weighted = false })`. Vertex ids are whole
   numbers 0-11, at most 12 vertices; weights 1-99 and only when `weighted`; self-loops and parallel edges are rejected with
   readable errors. Operations: `addVertex(id)`, `removeVertex(id)` (removes every edge touching it), `addEdge(u, v, w?)`,
   `removeEdge(u, v)`, `hasEdge`, `weight`, `neighbors(id)` (**always ascending**; C15 relies on it), `degree` /
   `inDegree` / `outDegree`, `vertices()`, `edges()`, `toAdjacencyList()`, `toAdjacencyMatrix()` (`{ ids, matrix }`,
   `null` = no edge, never 0 or -1), `clear()`, `static from({ directed, weighted, vertices, edges })`. Changes return
   `{ ok, error?, steps }`; a step is `{ type, vertexIds, edge, message, snapshot }` with
   `snapshot = { directed, weighted, vertices: [ids], edges: [{ from, to, weight }] }`. `integrityError()`: list and matrix
   agree, an undirected matrix is symmetric, no edge points at a missing vertex. `GRAPH_INFO` gives each operation's
   complexity for list vs matrix.
2. `tests/graph.test.js`: 300 seeded sequences in all four modes (directed or not × weighted or not) against a model
   `Map<"u,v", weight>`. After every operation check `edges()`, `neighbors`, every degree, the matrix and
   `integrityError() === null`. Edge cases: remove a vertex that has edges, duplicate edge, self-loop, bad weight, missing
   vertex, the 12-vertex limit. **Mutation check yourself:** make undirected `removeEdge` forget the reverse edge; confirm a
   test fails.
3. `src/core/graph-layout.js`: `layoutCircle(ids, { radius, padding })` → `{ nodes: [{ id, x, y }], width, height }`, first
   vertex at the top, the rest clockwise. Tests: 0, 1, 2 and 12 vertices, every node at the radius, no two nodes closer than
   a minimum gap.
4. `graph.html` + `src/pages/graph-page.js`: **Directed** and **Weighted** toggles (changing them rebuilds the graph and
   keeps the edges that are still valid); Vertex input + **Add vertex** / **Remove vertex**; From / To / Weight inputs +
   **Add edge** / **Remove edge**; **Sample graph**, **Random**, **Clear**. Three synchronized views of one snapshot: SVG
   graph (arrowheads when directed, weight labels with a halo like `.hp-node-index`), adjacency list, adjacency matrix. The
   changed vertex or edge is highlighted in all three (with a non-colour cue too). The matrix scrolls inside
   `.scroll-box.scroll-box-clean` at 375px; every matrix cell has an accessible name such as "2 to 5: weight 7". Player,
   keyboard and a11y rules as in G9.
**Done when:** the G9 checks, plus: the on-screen matrix stays symmetric in undirected mode, and removing a vertex visibly
removes its edges from all three views. Report the nav entry and card you want and every CSS class you added.

---
## Queue after these (not ready yet)
BFS / DFS (Claude, C15, after G10), Dijkstra, Red-Black tree.
