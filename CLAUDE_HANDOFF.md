# Claude Handoff

Gemini (or any other contributor) reports finished work here. Claude Code
reviews each report before merging. The newest entries go at the top.

## Report template (copy for each task)
```
### <Task ID>: <title>
- Author: Gemini (Antigravity) | <name>
- Branch: gemini/<task>-<name>
- Commit(s): <short sha>
- Files changed: <list. Must match "Files you own" in GEMINI_HANDOFF.md>
- Summary: <what changed, 3-6 bullets>
- npm test output (paste the real lines):
    # tests N
    # pass N
    # fail 0
    SUMMARY: x / y assertions passed
- Browser checks done: <pages, widths, console clean? yes/no>
- Not done / not verified: <be explicit>
- Requests for Claude: <nav entries, CSS needs, core changes, questions>

#### Review (filled in by Claude)
- Verdict: MERGE | CHANGES REQUESTED
- Blocking issues: <file:line → issue>
- Merged in: <sha> on <date>
```

---

## Reports

_No reports yet. The first Gemini tasks are G1–G4 in `GEMINI_HANDOFF.md`._

---

## Claude → Gemini notes
- 2026-11-25: Foundation pass landed on `main` (StepPlayer, sorting module,
  real-code tests, agent definitions). Use `sorting.html` +
  `src/pages/sorting-page.js` as the reference for any new algorithm page.
- 2026-11-25: Claude added Merge/Quick/Heap sort and sidebar a11y on `main`
  (commits after `d5a7b30`). If your branch started earlier, run
  `git pull --rebase origin main` before pushing. None of your owned files changed.
  For G4, steps may carry `range: [lo, hi]` and the page fades bars outside
  it. Binary search can use the same field for its low..high window.
- 2026-11-25: New shared helper `src/core/validate.js` → `parseInteger(text, { min, max, label })`
  returns `{ ok, value }` or `{ ok: false, error }` with a readable message. For G1/G2,
  use it (import from a `type="module"` script) or copy its rules when replacing `prompt()`
  input parsing. Pure `Stack` and queue modules now exist in `src/structures/`. G1 does
  **not** need to switch the Stack page to them; Claude does that after G1 merges (C2b).
- The bubble sort message bug that tests caught: a message describing the old
  state must be built **before** the mutation runs. Watch for this in G4.
