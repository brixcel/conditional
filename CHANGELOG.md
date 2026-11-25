# Changelog

All notable changes to the URSAC DSA Visualizer. The newest changes come first.

## [Unreleased] - 2026-11-25 (Claude Code, while Gemini works on G1–G4)

### Added
- Merge Sort, Quick Sort (Lomuto, last-element pivot) and Heap Sort on the
  Sorting page. Recursive sorts fade bars outside the active subarray and show
  recursion depth, active range and the current pivot.
- Steps can carry `range`, `depth` and `key` context (see `Tracer.ctx`).
- Tests: quick-sort partition correctness, heap property after build,
  merge-sort comparisons ≤ n·⌈log2 n⌉, quick-sort O(n²) on sorted input.

### Fixed
- Accessibility: the closed sidebar's links were still reachable with Tab
  (about 10 invisible stops before page content). The sidebar is now `inert`
  while closed. The toggle has `aria-expanded`/`aria-controls`. Opening moves
  focus into the sidebar, Tab is trapped while open, and Esc or close returns
  focus to the toggle. The current page link has `aria-current="page"` and the
  page container is exposed as the main landmark.

## [Earlier] - 2026-11-25 (foundation pass, Claude Code)

### Added
- **Sorting Algorithms page** (`sorting.html`): Bubble, Selection and Insertion
  Sort with play/pause, step forward/back, reset, speed (0.5x–4x), a scrubber,
  keyboard shortcuts (Space, ←/→, Home), live pseudocode line highlighting,
  plain-language step messages, comparison/write counters, custom or random
  input with inline validation, and a complexity comparison table.
- `src/core/step-player.js`: reusable, DOM-free playback engine for recorded algorithm steps.
- `src/algorithms/sorting.js`: sorts that record real execution snapshots (nothing is scripted).
- Real-code tests with Node's built-in runner (`npm test`):
  - `tests/sorting.test.js`: correctness over 600 seeded random arrays,
    textbook comparison counts, input validation, no early "final" marking.
  - `tests/step-player.test.js`: playback bounds, timing, pause and replay.
  - `tests/avl-real.test.js`: loads the actual `avl-tree.js` and verifies AVL
    invariants (order, |BF| ≤ 1, heights, parent links) over 150 random insert/delete runs.
- Sidebar "Algorithms" category and homepage card for the sorting page.
- `.state-monitor` styling. The class was used on the Stack page but had no CSS.
- Nine Claude Code agents in `.claude/agents/`.
- Project docs: `PROJECT_CONTEXT.md`, `IMPLEMENTATION_ROADMAP.md`,
  `TASK_BOARD.md`, `GEMINI_HANDOFF.md`, `CLAUDE_HANDOFF.md`, this changelog.
- `package.json` (`npm test`, `npm run dev`) with no dependencies.

### Changed
- `test_regression.js` moved to `tests/legacy-regression.cjs`. Its header now
  states that suites 1-8 test copies, and it exits non-zero on failure.
- `plan.md` and the September audit moved to `docs/archive/`.

### Removed
- `.playwright-mcp/` debug screenshots from version control (now in `.gitignore`).
