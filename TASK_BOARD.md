# Task Board

One owner per file at a time. Before you start a task, set it to In progress
with your branch. When you finish, move it to Review and add a report to
`CLAUDE_HANDOFF.md`.

Owners: **Claude** (Claude Code), **Gemini** (Antigravity), or an agent name.

## In progress
| ID | Task | Owner | Branch | Files owned |
|---|---|---|---|---|
| G1 | Replace native dialogs on AVL + Stack + Singly LL pages | Gemini | `gemini/g1-replace-dialogs` | `avl-tree.html`, `avl-tree.js`, `stack.html`, `stack.js`, `singly-linked-list.html`, `singly-linked-list.js` |

## Ready (pick up next)
| ID | Task | Owner | Files owned | Spec |
|---|---|---|---|---|
| G2 | Replace native dialogs on Circular LL + Doubly LL pages | Gemini | `circular-linked-list.html`, `circLL.js`, `doubly-linked-list.html` | GEMINI_HANDOFF.md#g2 |
| G3 | Dark theme tokens + remove inline styles | Gemini | `main.css` | GEMINI_HANDOFF.md#g3 |
| G4 | Searching algorithms module + page | Gemini | `src/algorithms/searching.js`, `src/pages/searching-page.js`, `searching.html`, `tests/searching.test.js` | GEMINI_HANDOFF.md#g4 |
| C1b | Theme toggle in `shared.js`, skip link, nav entries for new pages | Claude | `shared.js`, `index.html` | after G3/G4 land (needs G3 tokens + CSS) |
| C2b | Wire Stack page to `src/structures/stack.js` | Claude | `stack.html`, `stack.js` | after G1 merges (G1 owns those files) |
| C2c | Wire Circular + Priority Queue pages to `src/structures/queue.js` | Claude | `circular-queue.html`, `priority-queue.html` | Phase 4 |
| C3 | AVL: animate rotations by node id, show delete rotations | Claude (visualization) | `avl-tree.js` after G1 merges | Phase 6 |

**Found while testing, for G3 (CSS):** on phones the fixed "Modules" button
overlaps the page badge at the top and covers content while scrolling. The Regular
Queue page styles empty/freed slots with runtime styles (`EMPTY_SLOT_STYLE` in
`src/pages/regular-queue-page.js`). After G3 merges, Claude moves that into a
`main.css` class.

**File conflicts to respect:** G1 and C3 both touch `avl-tree.js`, so C3 waits for G1.
G3 is the only task that edits `main.css`. G1, G2 and G4 must reuse existing classes
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
| C1a | Sidebar a11y: `inert` when closed, `aria-expanded`/`aria-controls`, focus in/out, Tab trap, `aria-current`, main landmark | Claude | 2026-11-25 |
