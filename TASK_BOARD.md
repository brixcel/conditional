# Task Board

One owner per file at a time. Before you start a task, set it to In progress
with your branch. When you finish, move it to Review and add a report to
`CLAUDE_HANDOFF.md`.

Owners: **Claude** (Claude Code), **Gemini** (Antigravity), or an agent name.

## In progress
| ID | Task | Owner | Branch | Files owned |
|---|---|---|---|---|
| none | | | | |

## Ready (pick up next)
| ID | Task | Owner | Files owned | Spec |
|---|---|---|---|---|
| G8 | Binary Search Tree module + page (after G7) | Gemini | `src/structures/bst.js`, `tests/bst.test.js`, `bst.html`, `src/pages/bst-page.js` | GEMINI_HANDOFF.md#g8 (ready once G7 is on `main`) |

**Found while testing, for G3 (CSS), fixed by G3 at 23:31:** on phones the fixed "Modules" button
overlaps the page badge at the top and covers content while scrolling. The Regular
Queue page styles empty/freed slots with runtime styles (`EMPTY_SLOT_STYLE` in
`src/pages/regular-queue-page.js`). After G3 merges, Claude moves that into a
`main.css` class.

**File conflicts to respect:** G3 is the only task that edits `main.css`. G1, G2 and G4 must reuse existing classes
and list any CSS they need in their handoff report.

## Review
| ID | Task | Owner | Branch | Reviewer |
|---|---|---|---|---|

## Done
| ID | Task | Owner | Date |
|---|---|---|---|
| G7 | Heap page (tree + array views) + pure `tree-layout.js`; Claude added label halo, clear fix, nav + card | Gemini (reviewed by qa-engineer + Claude) | 2026-11-26 11:14 (approved; on `claude/g7-heap-merge`) |
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
