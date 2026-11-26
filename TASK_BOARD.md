# Task Board

One owner per file at a time. Before you start a task, set it to In progress
with your branch. When you finish, move it to Review and add a report to
`CLAUDE_HANDOFF.md`.

Owners: **Claude** (Claude Code), **Gemini** (Antigravity), or an agent name.

## In progress
| ID | Task | Owner | Branch | Files owned |
|---|---|---|---|---|

## Ready (pick up next)
| ID | Task | Owner | Files owned | Spec |
|---|---|---|---|---|
| G14 | Lessons: regular/circular/priority queue, heap, hash table, searching | Gemini | `content/lessons/*` (new files) | GEMINI_HANDOFF.md#g14 |
| G15 | Quiz banks for the same six pages | Gemini | `content/quizzes/*` (new), `tests/quiz-banks-g15.test.js` | GEMINI_HANDOFF.md#g15 (after G14) |
| G16 | Lessons + quiz banks: BST, AVL, Trie, Red-Black | Gemini | new content files, `tests/quiz-banks-g16.test.js` | GEMINI_HANDOFF.md#g16 (after G15) |
| G17 | Lessons + quiz banks: singly, doubly, circular linked list | Gemini | new content files, `tests/quiz-banks-g17.test.js` | GEMINI_HANDOFF.md#g17 (after G16) |
| G18 | Lessons + quiz banks: graph, DSU, Fenwick, Segment Tree | Gemini | new content files, `tests/quiz-banks-g18.test.js` | GEMINI_HANDOFF.md#g18 (after G17) |

**File conflicts to respect:** Gemini adds new files and appends one new section at the end of `main.css`; Claude edits shared files (`shared.js`, `index.html`, `src/core/*`) and merges one `main.css` append at a time.

## Review
| ID | Task | Owner | Branch | Reviewer |
|---|---|---|---|---|
| G10 | Graph representation module + `layoutCircle` + 3-view page | Gemini | `gemini/g10-graph` | Claude |

## Done
| ID | Task | Owner | Date |
|---|---|---|---|
| C27 | Kruskal (reuses Gemini's DSU) and Prim (binary heap) module `src/algorithms/mst.js` with traced steps; 300 graphs vs brute force. Page panel follows after C26 | Claude (algorithms agent) | 2026-11-27 02:29 (merged to `main`, module only) |
| C24 | Singly, doubly and circular linked-list pages on the step player (pointer walks, every re-pointed link old → new, head/tail changes, ring wrap); shared `src/core/list-renderer.js`; main.css section 20. Every page now has play/step/keyboard controls | Claude (visualization-engineer agent) | 2026-11-27 02:26 (merged to `main`) |
| G13 | Segment Tree module + page; Claude renumbered its CSS section (26) at merge | Gemini (reviewed by qa-engineer + Claude) | 2026-11-27 02:22 (merged to `main`) |
| G12 | Fenwick Tree (BIT) module + page; Claude renumbered its CSS section (25) at merge | Gemini (reviewed by qa-engineer + Claude) | 2026-11-27 02:22 (merged to `main`) |
| G11 | Disjoint Set Union (Union-Find) module + page; Claude renumbered its CSS section (24) at merge | Gemini (reviewed by qa-engineer + Claude) | 2026-11-27 02:22 (merged to `main`) |
| C23 | BFS, iterative and recursive DFS, all-components traversal (`src/algorithms/graph-traversal.js`, 600 seeded graphs vs reference) + traversal panel on graph.html (queue/stack, call stack, visit order, tree edges in all three views); main.css section 21 | Claude (algorithms agent) | 2026-11-27 02:14 (merged to `main`) |
| C21 | Red-Black Tree module (CLRS insert/delete fix-ups, every case named, 300-seed invariant tests) + page with 20 case demos, double-black and NIL markers; main.css section 19 | Claude (data-structures + visualization-engineer agents) | 2026-11-26 21:25 (merged to `main`) |
| C20 | Stack, regular, circular and priority queue pages on the step player with keyboard shortcuts and pseudocode; Stack Pop now always needs the typed top value (letters no longer slip through); circular ring drawn as SVG (main.css section 18); Stack lesson + quiz updated | Claude (visualization-engineer agent) | 2026-11-26 21:24 (merged to `main`) |
| G10 | Graph representation module + `layoutCircle` + 3-view page; Claude's agents removed a local key handler, fixed button spacing, made `Graph.from(snapshot)` round-trip, strengthened `integrityError`; Claude added a Graphs nav category + card | Gemini (reviewed by qa-engineer + Claude) | 2026-11-26 21:21 (merged to `main`) |
| C22 | Sorting page accuracy: quick sort worst-case space and O(n²) inputs, heap sort best case note, radix pseudocode, Ω(n log n) wording; lesson + quiz kept in sync | Claude (algorithms agent) | 2026-11-26 21:12 (merged to `main`) |
| C18 | Lesson format (`content/lessons/_schema.md`), validator (`src/learn/lesson.js`, checks registry equality and real page controls), Stack + Sorting lessons (reviewed: null) | Claude (learning-content + qa-engineer agents) | 2026-11-26 21:08 (merged to `main`; no page yet) |
| C19 | Quiz engine (`src/quiz/quiz.js`: validate, seeded prepare, grade, score) + progress store (`src/quiz/progress.js`, survives reload/private mode/corrupt data) + Stack and Sorting banks (16 + 18 questions, reviewed: null) | Claude (quiz-challenges agent) | 2026-11-26 21:03 (merged to `main`; no page yet) |
| C17 | All player pages use `bindPlayerKeys` (BST moved over); local scroll-box key workarounds removed; static test guards it | Claude (visualization-engineer agent) | 2026-11-26 20:55 (merged to `main`) |
| C16 | Player keys ignore focusable scroll boxes and the open nav drawer (`src/core/player-keys.js`) | Claude (visualization-engineer agent) | 2026-11-26 19:44 (merged to `main`) |
| C15 | Hash table quadratic probing (prime m, α ≤ 0.5) + page; hash-table page has no `innerHTML` | Claude (data-structures + visualization-engineer agents) | 2026-11-26 19:44 (merged to `main`) |
| C12 | AVL tree as a pure module (`src/structures/avl.js`) + module page; `avl-tree.js` removed; slider fix; button spacing on AVL/BST | Claude (data-structures agent) | 2026-11-26 19:44 (merged to `main`) |
| G9 | Trie module + `layoutGeneralTree` + page; Claude's agents fixed button spacing and recorded prune frames before removal; Claude added nav + card | Gemini (reviewed by qa-engineer + Claude) | 2026-11-26 18:57 (merged to `main` 2026-11-26 19:44) |
| C13 | Priority Queue backed by a binary max-heap; equal priorities stay first-in, first-out (arrival id); heap-array step view | Claude (data-structures agent) | 2026-11-26 17:43 (merged to `main`) |
| C14 | Sorting/searching bar states and legend use patterns and a check mark, not colour alone | Claude (ui-ux-designer agent) | 2026-11-26 17:43 (merged to `main`) |
| C11 | Accessibility: labels, focus ring, `DSA_UI.announce` live regions, quiet autoplay, focus rescue, text alternatives | Claude (accessibility-performance agent) | 2026-11-26 17:43 (merged to `main`) |
| C10 | Legacy copied-class tests removed; page checks cover every page automatically | Claude (qa-engineer agent) | 2026-11-26 17:43 (merged to `main`) |
| C9 | Shared player keyboard shortcuts (`src/core/player-keys.js`); slider no longer snaps back during playback | Claude (visualization-engineer agent) | 2026-11-26 17:43 (merged to `main`) |
| FIX | Play button said "Play" during autoplay; global reduced-motion rule | Claude (visualization-engineer agent) | 2026-11-26 17:43 (merged to `main`) |
| G8 | Binary Search Tree module + page + `layoutBinaryTree`; Claude's agents fixed live regions, final-frame announcement, per-step validity, duplicate-before-overflow; Claude added nav + card | Gemini (reviewed by qa-engineer + Claude) | 2026-11-26 17:19 (merged to `main` 2026-11-26 17:43) |
| C8 | Circular Linked List on real nodes (`src/structures/circular-linked-list.js`) + module page; `circLL.js` removed | Claude | 2026-11-26 11:15 (merged to `main` 2026-11-26 11:17) |
| G7 | Heap page (tree + array views) + pure `tree-layout.js`; Claude added label halo, clear fix, nav + card | Gemini (reviewed by qa-engineer + Claude) | 2026-11-26 11:14 (merged to `main` 2026-11-26 11:17) |
| C7 | Doubly Linked List on real nodes (`src/structures/doubly-linked-list.js`) + module page | Claude | 2026-11-26 11:04 (merged to `main`) |
| G6 | Hash table (chaining + linear probing) module, page, tests; Claude added CSS classes, auto-scroll, nav + card | Gemini (reviewed by Claude) | 2026-11-26 10:53 (merged to `main` 2026-11-26 10:56) |
| FIX | StepPlayer Play threw "Illegal invocation" in browsers (broke Play on Sorting/Searching) | Claude | 2026-11-26 10:53 (merged to `main` 2026-11-26 10:56) |
| G5 | 0 inline styles site-wide, Regular Queue `.car-empty`, `.field-grow` mobile fix | Gemini (reviewed by Claude) | 2026-11-26 10:47 (merged to `main` 2026-11-26 10:56) |
| C6 | Singly Linked List on real nodes (`src/structures/linked-list.js`) + module page; old `singly-linked-list.js` removed | Claude | 2026-11-26 10:44 (merged to `main`) |
| HEAP | Binary min/max heap logic + tests (`src/structures/heap.js`, no page yet) | Claude | 2026-11-26 10:34 |
| C1c | Searching nav entry + homepage card (module count now "8 Structures · 8 Sorts · 3 Searches") | Claude | 2026-11-26 10:28 (merged to `main` 2026-11-26 10:34) |
| G4 | Searching module (linear / binary / interpolation) + page, parser reused from `sorting.js` | Gemini (reviewed by Claude) | 2026-11-26 10:27 (merged to `main` 2026-11-26 10:34) |
| C1b | Theme toggle (remembers choice, follows OS until one is made, `aria-pressed`) + skip link on every page via `shared.js`; legacy AVL/Singly LL no longer disable the toggle | Claude | 2026-11-26 02:31 |
| G3 | Dark theme tokens (OS dark + `data-theme`), 0 hard-coded colours outside tokens, utility classes, phone Modules-button overlap fixed | Gemini (reviewed by Claude) | 2026-11-25 23:31 |
| F1 | Audit + PROJECT_CONTEXT | Claude | 2026-11-25 |
| F2 | Nine agent definitions | Claude | 2026-11-25 |
| F3 | StepPlayer + sorting module (bubble/selection/insertion) + page | Claude | 2026-11-25 |
| F4 | Real-code tests incl. AVL invariants on the actual `avl-tree.js` | Claude | 2026-11-25 |
| F5 | Repo hygiene (tests/, docs/archive/, .gitignore, package.json) | Claude | 2026-11-25 |
| C4 | Merge, Quick, Heap sort + recursion step context (`range`, `depth`, `key`) | Claude | 2026-11-25 |
| C2 | Pure Stack, LinearQueue, CircularQueue, PriorityQueue modules + model-based tests; Regular Queue page migrated | Claude | 2026-11-25 |
| G2 | Replace all native dialogs on Circular LL + Doubly LL (67 calls → 0), plus fixes | Gemini (reviewed by Claude) | 2026-11-25 22:06 |
| G1 | Replace all native dialogs on AVL, Stack, Singly LL (24 calls → 0) | Gemini (reviewed by Claude) | 2026-11-25 |
| C5 | Counting Sort + Radix Sort (stable, 0 comparisons, negatives handled) on the Sorting page | Claude | 2026-11-25 22:22 |
| C3 | AVL rotations animated by node id (unbalanced state shown first), delete rotations explained | Claude | 2026-11-25 22:00 |
| C2c | Circular + Priority Queue pages now use `src/structures/queue.js` (inline scripts removed) | Claude | 2026-11-25 21:53 |
| C2b | Stack page now uses `src/structures/stack.js` (old `stack.js` removed) | Claude | 2026-11-25 21:50 |
| C1a | Sidebar a11y: `inert` when closed, `aria-expanded`/`aria-controls`, focus in/out, Tab trap, `aria-current`, main landmark | Claude | 2026-11-25 |
