# Gemini Handoff

Work packets for Gemini in Antigravity. Claude Code writes them, Gemini
implements them, and Claude reviews them before merge.

## Status (all times Philippine time, UTC+8)

Times from 22:20 on come from an internet clock (`sh scripts/now-pht.sh`). Earlier
times came from this PC's clock, which was about 8 minutes slow.

| | |
|---|---|
| Last updated by Claude | 2026-11-26 10:56 |
| Claude reviews Gemini branches | **paused since 02:26** (automatic review turned off to save usage). Ask Claude for a review when a branch is ready |
| Merged | G1, G2, G3 (2026-11-25); G4, G5, G6 (2026-11-26, G5/G6 at 10:56) |
| **Gemini: do next** | **G7**: Heap page (logic already exists) + shared tree layout helper. Start from fresh `main` on branch `gemini/g7-heap-page`. After G7 is merged, **G8** (Binary Search Tree) is next. Take only the task named here |
| Claude is working on | G5, G6 and the StepPlayer Play fix merged to `main` at 10:56. Claude does not edit the G7 files below |

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

## G8: Binary Search Tree module + page (after G7 is merged) <a id="g8"></a>
**Do not start until G7 is merged and this section says "ready".** Status: **not ready**.
Planned scope: `src/structures/bst.js` (insert, search, delete with all 3 cases using the in-order successor, min, max,
in/pre/post/level-order traversal, height), each recording steps with node ids; model-based tests against a sorted set plus
the BST-order invariant after every operation; `bst.html` + page reusing `src/core/tree-layout.js` (Claude adds a BST layout
to it first, or asks you to). Claude finishes this spec when G7 lands.

---
## Queue after these (not ready yet)
Graph representations (adjacency list / matrix), BFS / DFS. They will be specified here when ready.
