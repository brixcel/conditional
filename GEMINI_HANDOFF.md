# Gemini Handoff

Work packets for Gemini in Antigravity. Claude Code writes them, Gemini
implements them, and Claude reviews them before merge.

## Status (all times Philippine time, UTC+8)

| | |
|---|---|
| Last updated by Claude | 2026-11-25 21:53 |
| Claude reviews Gemini branches | automatically at :00 and :30 every hour (may start a few minutes late) while the Claude app is open |
| Merged | G1 at 21:40 |
| **Gemini: do next** | **G2**, then G3, then G4 (one branch each, start each from fresh `main`) |
| Claude is working on | idle since 21:53 (C2c done). Pages now free for anyone: `circular-queue.html`, `priority-queue.html` |

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
## Queue after these (not ready yet)
Merge sort / quick sort (Claude defines the recursion step format first), hash
table page, heap page. They will be specified here when ready.
