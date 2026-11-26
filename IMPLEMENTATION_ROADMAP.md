# Implementation Roadmap

Phases run in order. Each phase ends with a working, deployable `main`.
"Exit criteria" must be verified, not assumed.

## Phase 1: Audit ✅ (2026-11-25)
Findings are in `PROJECT_CONTEXT.md` → "Audit summary".

## Phase 2: Agent setup ✅ (2026-11-25)
Nine agents are in `.claude/agents/`, each under 200 lines. Run
`wc -l .claude/agents/*.md` to re-check.

## Phase 3: Foundation and design (in progress)
Done:
- [x] ES-module pattern: `src/core/step-player.js`, `src/algorithms/sorting.js`, `src/pages/sorting-page.js`
- [x] Real-code tests (`node --test`), including real AVL invariants
- [x] Shared algorithm-player CSS (main.css section 12)
- [x] Repo hygiene: tests moved to `tests/`, old docs archived, debug files untracked

Remaining:
- [x] Replace all `alert`/`prompt`/`confirm` with inline inputs and messages (G1, G2)
- [x] Dark theme via tokens (G3) and a theme toggle in `shared.js` (C1b)
- [ ] Remove inline `style=""` from legacy markup (G3 did colours; 24 left → G5, Singly LL → C6)
- [x] Sidebar a11y: focus trap, `aria-expanded` (C1a), skip link (C1b)

Exit: no native dialogs, light and dark themes pass contrast checks, `npm test` green, every page clean at 375px.

## Phase 4: Data structures
Order: migrate legacy logic into `src/structures/` (Stack, Queue, Circular Queue,
Priority Queue, Singly/Doubly/Circular LL, AVL) with real-code tests → Binary
Tree + BST → Min/Max Heap → Hash table (chaining, linear and quadratic probing) →
Trie → Graph representation (adjacency list and matrix) → DSU → Red-Black Tree →
Segment Tree → Fenwick Tree.
- Singly Linked List gets real node objects with `next` pointers.
- Priority Queue gets a heap-backed version once the heap exists.
Exit: every structure has a pure module, invariant tests, and a page using the player.

## Phase 5: Algorithms
Searching (linear, binary, interpolation) → Merge, Quick, Heap sort → Counting,
Radix → BFS, DFS → Dijkstra, Prim, Kruskal, Topological sort → Bellman-Ford,
Floyd-Warshall → Recursion, Divide and Conquer, Greedy, DP, Backtracking demos.
Exit: each algorithm is checked against a reference implementation over seeded random inputs.

## Phase 6: Visualization
Shared renderers in `src/core/`: bars (done), list/pointer, tree (SVG, animated
by node id), graph (SVG), hash buckets, memory cells. Migrate legacy pages onto
the StepPlayer one at a time.
Exit: every page supports play/pause/step/back/reset/speed with keyboard shortcuts.

## Phase 7: Learning
Lessons in `content/lessons/*.json` (objectives, levels, pseudocode, complexity,
applications, a "try it" input). Quiz engine in `src/quiz/`, banks in
`content/quizzes/*.json`, progress in `localStorage`. **No backend** unless the
user approves a written proposal.
Exit: each module has a lesson and at least 10 reviewed questions, and progress survives reload.

## Phase 8: Integration
Merge Gemini and Claude branches one at a time. Run `npm test` and the browser
checklist after each merge.

## Phase 9: QA
Full regression on every page, a11y audit, performance pass, final docs.

## Decisions needing the user
- Bundler/framework adoption (currently: none, native ES modules).
- Any backend or accounts for cross-device progress.
- Whether to keep the legacy pages' "re-type the value to confirm dequeue/pop" UX.
