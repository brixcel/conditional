# Task Board

One owner per file at a time. Before you start a task, set it to In progress
with your branch. When you finish, move it to Review and add a report to
`CLAUDE_HANDOFF.md`.

Owners: **Claude** (Claude Code), **Gemini** (Antigravity), or an agent name.

## In progress
| ID | Task | Owner | Branch | Files owned |
|---|---|---|---|---|
| C4 | Merge, Quick, Heap sort (defines recursion step format: `range`, `depth`, `key`) | Claude (algorithms) | main | `src/algorithms/sorting.js`, `src/pages/sorting-page.js`, `sorting.html`, `tests/sorting.test.js` |
| C1a | Sidebar a11y: hidden sidebar not focusable (`inert`), `aria-expanded`, focus moves in/out | Claude (accessibility) | main | `shared.js` |

## Ready (pick up next)
| ID | Task | Owner | Files owned | Spec |
|---|---|---|---|---|
| G1 | Replace native dialogs on AVL + Stack + Singly LL pages | Gemini | `avl-tree.html`, `avl-tree.js`, `stack.html`, `stack.js`, `singly-linked-list.html`, `singly-linked-list.js` | GEMINI_HANDOFF.md#g1 |
| G2 | Replace native dialogs on Circular LL + Doubly LL pages | Gemini | `circular-linked-list.html`, `circLL.js`, `doubly-linked-list.html` | GEMINI_HANDOFF.md#g2 |
| G3 | Dark theme tokens + remove inline styles | Gemini | `main.css` | GEMINI_HANDOFF.md#g3 |
| G4 | Searching algorithms module + page | Gemini | `src/algorithms/searching.js`, `src/pages/searching-page.js`, `searching.html`, `tests/searching.test.js` | GEMINI_HANDOFF.md#g4 |
| C1b | Theme toggle in `shared.js`, skip link, nav entries for new pages | Claude | `shared.js`, `index.html` | after G3/G4 land (needs G3 tokens + CSS) |
| C2 | Extract Stack/Queue logic into `src/structures/` with real tests | Claude (data-structures) | `src/structures/stack.js`, `src/structures/queue.js`, tests | Phase 4 |
| C3 | AVL: animate rotations by node id, show delete rotations | Claude (visualization) | `avl-tree.js` after G1 merges | Phase 6 |

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
