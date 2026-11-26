# URSAC DSA Visualizer: Project Context

Shared source of truth for Claude Code, Gemini (Antigravity) and the agents in
`.claude/agents/`. Read this before planning or editing. If this file disagrees
with the code, the code wins, so fix this file.

Last updated: 2026-11-25 (Claude Code, foundation pass)

## What it is
An interactive Data Structures & Algorithms learning site for University of
Rizal System – Antipolo Campus students.
- Live: https://ursacdsa.vercel.app/ (Vercel, deploys from `main`)
- Repo: https://github.com/brixcel/conditional

## Architecture (as of this commit)
- **Static multi-page site.** Plain HTML + CSS + JavaScript. No framework,
  no bundler and no runtime dependencies. Each page is its own `.html` file.
- **Styling:** one stylesheet, `main.css`, with design tokens in section 1
  and shared components after that. Section 12 holds the algorithm player styles.
- **Navigation:** `shared.js` injects the sidebar, overlay, toggle button and a
  toast helper into every page. It is the only place nav markup lives.
- **Two generations of page code:**
  1. *Legacy pages* (Stack, Regular/Circular/Priority Queue, Singly/Doubly/
     Circular Linked List) use classic `<script>` files or inline
     scripts with global state, and logic mixed with DOM updates.
  2. *Module pages* (currently `sorting.html`, `searching.html`, `singly-linked-list.html`, `doubly-linked-list.html`, `circular-linked-list.html`, `hash-table.html`, `heap.html`, `regular-queue.html`, `stack.html`,
     `circular-queue.html`, `priority-queue.html`, `bst.html`, `avl-tree.html`) use ES modules:
     `src/algorithms|structures/*.js` (pure logic, no DOM), `src/core/` (shared
     engine), and `src/pages/*-page.js` (DOM controller). New work uses this pattern.
- **Tests:** `npm test` runs Node's built-in test runner on `tests/*.test.js`,
  then `tests/legacy-regression.cjs`. No test dependencies.
- **Why no React or Vite yet:** the September 2026 audit (`docs/archive/`)
  found that the bugs came from copy-paste and having no single source of
  truth, not from plain JS. Native ES modules give shared code and real
  testability without a build step. Revisit a bundler only if module count
  or cross-page state makes it worth it. That decision belongs to the user.

## Directory map
```
index.html, stack.html, ...      pages (legacy + module pages)
sorting.html                     first module page (reference implementation)
main.css                         all styles (tokens → components → pages → breakpoints)
shared.js                        nav + toast (classic script, loaded by every page)
src/structures/                  pure data structures: avl.js (AVL tree, real nodes, traced rotations), bst.js, stack.js, queue.js (linear/circular/priority), heap.js (min/max), linked-list.js (singly) + doubly-linked-list.js + circular-linked-list.js (real nodes), hash-table.js (chaining + linear probing), result.js
src/core/validate.js             parseInteger() shared input parsing
src/core/step-player.js          playback engine (play/pause/step/back/speed)
src/core/tree-layout.js          layoutCompleteTree(): node x/y for array-stored trees (G7)
src/algorithms/sorting.js        bubble/selection/insertion/merge/quick/heap with traced steps
src/pages/sorting-page.js        DOM controller for sorting.html
src/algorithms/searching.js      linear/binary/interpolation search with traced steps (G4)
src/pages/searching-page.js      DOM controller for searching.html
src/algorithms/graph-traversal.js BFS / iterative + recursive DFS with traced steps (C23)
src/algorithms/shortest-paths.js Dijkstra (binary heap), Bellman-Ford (+ negative-cycle check), topological sort (Kahn / DFS) (C26); graph.html "Graph Algorithms" card
tests/*.test.js                  real-code tests (node:test)
tests/legacy-regression.cjs      site-wide page checks (every page: no style="", no dialogs, main.css + shared.js, listed in nav)
.claude/agents/*.md              nine specialist agent definitions
docs/archive/                    previous audit + plan (Sept 2026), historical only
```

## Conventions (all new code)
1. **Logic is pure.** No `document`, `window`, `alert` or `prompt` in `src/algorithms`,
   `src/structures` or `src/core`. Everything there must be importable by Node tests.
2. **Visualize real execution.** Algorithms run on real data and record a
   snapshot per event. The UI only replays snapshots. Never script frames by hand.
3. **Step shape**
   ```js
   { type, indices | nodeIds, line /* 1-based pseudocode */, message,
     /* snapshot */ array | nodes | edges, /* counters */ comparisons, writes, ...,
     /* optional context */ range: [lo, hi], depth, key }
   ```
   Recursive algorithms set `range` (active subarray), `depth` (recursion depth)
   and `key` (pivot or held-aside value). Renderers fade what is outside `range`.
4. **Registries** carry `name`, `run`, `pseudocode[]`, `complexity`, `summary`.
5. **Errors are values**, e.g. `{ ok: false, error }`, shown inline
   (`.alert-banner.alert-live` with `role="alert"`), never `alert()`.
6. **Validation:** check empty, non-numeric, out of range, too many items,
   `0` and negatives. Never use falsy checks on numbers. No `-1` sentinels.
7. **UI:** use `main.css` tokens and classes. No inline `style=""` and no CDN
   CSS/JS. Inputs get visible labels. Works at 375px with no horizontal page scroll.
8. **Nav:** new pages are added to `navCategories` in `shared.js` and get a card
   in `index.html`. Only the integrator (Claude) edits these two files during
   parallel work, to avoid conflicts.
9. **Tests ship with logic.** Seeded random property tests plus edge cases.

## Audit summary (2026-11-25)
Verified by reading the code, running tests, and loading the live site at desktop and 375px widths.

**Working and correct**
- The September P0 issues are fixed: no merge markers, shared nav on every page,
  Tailwind removed, Stack heading and hamburger overlap fixed on mobile, and dead
  `circQ.js`/`dLL.js` removed. The live site has no console errors on the pages checked.
- AVL tree is a real AVL tree in `src/structures/avl.js` (C12). `tests/avl.test.js`
  checks BST order, |BF| ≤ 1, stored heights and size after every op of 300 seeded
  random insert/delete/search sequences, plus all four rotation cases on insert and delete.

**Problems still present**
| # | Issue | Where | Severity |
|---|---|---|---|
| 1 | ~~91 native `alert`/`prompt`/`confirm` calls~~ Fixed in G1/G2; the page checks now fail on any dialog | all pages | Fixed |
| 2 | ~~Legacy tests checked copies of classes~~ Fixed in C10: copy suites removed, their cases live in the real-module tests | tests/legacy-regression.cjs | Fixed |
| 3 | ~~Singly Linked List is a JS array with cosmetic "next" pointers~~ Fixed in C6: real nodes in `src/structures/linked-list.js` | singly-linked-list.html | Fixed |
| 4 | ~~Logic and DOM mixed in legacy pages~~ Fixed: every page is a module page (AVL last, in C12) | all pages | Fixed |
| 5 | ~~Logic in inline `<script>` blocks~~ Fixed: moved to `src/pages/*-page.js` | those .html files | Fixed |
| 6 | ~~Inline `style=""` attributes~~ Fixed in G5; the page checks fail on any `style="` | all pages | Fixed |
| 7 | Dark theme + toggle done (G3, C1b). Still no step-by-step playback on legacy pages, no lessons/quizzes/progress | site-wide | Feature gap |
| 8 | Only 8 structures and (now) 6 sorting algorithms are covered | site-wide | Feature gap |
| 9 | ~~AVL delete never explained its rotations~~ Fixed in C3; C12 moved AVL to a module page with traced unbalanced/rotation steps | avl-tree.html | Fixed |
| 10 | Debug screenshots (`.playwright-mcp/`) were committed | repo root | Fixed: untracked and ignored |

## Testing
```powershell
npm test          # all real-code tests + legacy suite
npm run dev       # python static server at http://localhost:5501
```
Browser checklist per page: loads with no console errors, every button
works, invalid and boundary inputs are handled, 375 / 768 / desktop widths have
no overflow or overlap, and the page works keyboard-only.

## Collaboration model
**Separate folders, always.** Gemini (Antigravity) works in `C:\Users\brexc\conditional`.
Claude Code works in its own git worktree `C:\Users\brexc\conditional-claude`
(on `main` or `claude/*` branches). Two agents in one folder means one agent's
`git add -A` commits the other's unfinished files. That happened once on
2026-11-25, was caught before pushing, and was undone with no work lost.

See `GEMINI_HANDOFF.md` (work for Gemini), `CLAUDE_HANDOFF.md` (Gemini → Claude
reports and reviews), `TASK_BOARD.md` (ownership) and `IMPLEMENTATION_ROADMAP.md` (phases).
