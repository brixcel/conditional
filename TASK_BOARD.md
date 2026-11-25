# Task Board

One owner per file at a time. Before you start a task, set it to In progress
with your branch. When you finish, move it to Review and add a report to
`CLAUDE_HANDOFF.md`.

Owners: **Claude** (Claude Code), **Gemini** (Antigravity), or an agent name.

## In progress
| ID | Task | Owner | Branch | Files owned |
|---|---|---|---|---|
| C5 | Counting Sort + Radix Sort on the Sorting page (started 2026-11-25 22:20) | Claude | main | `src/algorithms/sorting.js`, `src/pages/sorting-page.js`, `sorting.html`, `tests/sorting.test.js` |

## Ready (pick up next)
| ID | Task | Owner | Files owned | Spec |
|---|---|---|---|---|
| G3 | Dark theme tokens + remove inline styles | Gemini | `main.css` | GEMINI_HANDOFF.md#g3 |
| G4 | Searching algorithms module + page | Gemini | `src/algorithms/searching.js`, `src/pages/searching-page.js`, `searching.html`, `tests/searching.test.js` | GEMINI_HANDOFF.md#g4 |
| C1b | Theme toggle in `shared.js`, skip link, nav entries for new pages | Claude | `shared.js`, `index.html` | after G3/G4 land (needs G3 tokens + CSS) |

**Found while testing, for G3 (CSS):** on phones the fixed "Modules" button
overlaps the page badge at the top and covers content while scrolling. The Regular
Queue page styles empty/freed slots with runtime styles (`EMPTY_SLOT_STYLE` in
`src/pages/regular-queue-page.js`). After G3 merges, Claude moves that into a
`main.css` class.

**File conflicts to respect:** G3 is the only task that edits `main.css`. G1, G2 and G4 must reuse existing classes
and list any CSS they need in their handoff report.

## Review
| ID | Task | Owner | Branch | Reviewer |
|---|---|---|---|---|
| none | | | | |

## Done
| ID | Task | Owner | Date |
|---|---|---|---|
| F1 | Audit + PROJECT_CONTEXT | Claude | 2026-11-25 |
| F2 | Nine agent definitions | Claude | 2026-11-25 |
| F3 | StepPlayer + sorting module (bubble/selection/insertion) + page | Claude | 2026-11-25 |
| F4 | Real-code tests incl. AVL invariants on the actual `avl-tree.js` | Claude | 2026-11-25 |
| F5 | Repo hygiene (tests/, docs/archive/, .gitignore, package.json) | Claude | 2026-11-25 |
| C4 | Merge, Quick, Heap sort + recursion step context (`range`, `depth`, `key`) | Claude | 2026-11-25 |
| C2 | Pure Stack, LinearQueue, CircularQueue, PriorityQueue modules + model-based tests; Regular Queue page migrated | Claude | 2026-11-25 |
| G2 | Replace all native dialogs on Circular LL + Doubly LL (67 calls → 0), plus fixes | Gemini (reviewed by Claude) | 2026-11-25 22:06 |
| G1 | Replace all native dialogs on AVL, Stack, Singly LL (24 calls → 0) | Gemini (reviewed by Claude) | 2026-11-25 |
| C3 | AVL rotations animated by node id (unbalanced state shown first), delete rotations explained | Claude | 2026-11-25 22:00 |
| C2c | Circular + Priority Queue pages now use `src/structures/queue.js` (inline scripts removed) | Claude | 2026-11-25 21:53 |
| C2b | Stack page now uses `src/structures/stack.js` (old `stack.js` removed) | Claude | 2026-11-25 21:50 |
| C1a | Sidebar a11y: `inert` when closed, `aria-expanded`/`aria-controls`, focus in/out, Tab trap, `aria-current`, main landmark | Claude | 2026-11-25 |
