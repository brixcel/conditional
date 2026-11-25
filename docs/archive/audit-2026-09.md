# ursdsa.netlify.app — Front-End / UX / Functionality / Correctness Audit

## Context

The user asked for a full, honest audit of the live site https://ursdsa.netlify.app/ (a University of Rizal System DSA teaching tool with 9 pages: Home, Stack, Regular Queue, Circular Queue, Priority Queue, Singly/Doubly/Circular Linked List, AVL Tree) plus its source in this repo (`c:\Users\brexc\conditional`), before any code is touched. The repo is plain static HTML/CSS/JS — no build tool, no framework, no `package.json`. Findings below come from (a) reading every source file, (b) live-testing the deployed site with a real browser across desktop and mobile viewports, and (c) a background code-review pass over the remaining JS files not read directly. Everything marked **Confirmed** was directly observed (code read or reproduced live); items marked **Unverified** are flagged as such and were not fabricated.

This document *is* the deliverable — no code changes have been made.

---

## 1. UI/UX Audit

**Visual hierarchy / layout / spacing — Bad.** Every page uses a different content width, container style, and vertical rhythm (Stack page: buttons float left with a huge unused whitespace gap next to the stack visual; Doubly Linked List page: a large blue hero banner followed by ~200px of dead blank space above the info boxes; Priority Queue: centered Tailwind card). There is no shared layout grid or spacing scale — values like `20px`, `15px`, `30px`, `100px 200px 100px 100px` (an actual margin value in `main.css` for `.stack-box`) appear ad hoc per page.

**Typography — Bad, and actively broken on mobile.** `.stack-heading` is set to `font-size: 5.0rem` with no responsive override anywhere in the (very long) media-query list. On a 375px-wide phone this renders "Stack Data Structure" as three lines of text roughly 900px tall — the user has to scroll past a wall of oversized blue text before reaching any functionality. **Confirmed** via live screenshot at 375×812.

**Color usage — Acceptable but monotonous and non-semantic.** Nearly every interactive element uses the same Facebook-blue (`#1877F2`) regardless of whether the action is primary, secondary, or destructive. "Reset" (a destructive, state-clearing action) is styled identically to "Push"/"Enqueue" on most pages — except on Priority Queue, where it's suddenly red, because that page uses a different (Tailwind) styling system. There's no consistent way to tell a safe action from a destructive one.

**Component consistency — Bad, this is the site's biggest structural weakness.** The "side navbar + hamburger button" pattern is re-implemented from scratch on nearly every page, and each copy has drifted:
- **Confirmed**: on the Priority Queue and Doubly Linked List pages, the fixed-position `☰ Menu` hamburger button visually overlaps the page's `<h1>` heading on mobile (screenshotted — the "P" of "Priority" and the "D" of "Doubly" are partly hidden behind the button).
- **Confirmed**: `circular-linked-list.html`'s copy of the navbar is missing the "Home" link that every other page has.
- **Confirmed**: `singly-linked-list.html` builds its open-menu button dynamically via `document.createElement` in JS instead of static markup like every other page.
- Three genuinely different visual systems exist across 9 pages: (1) the shared `main.css` Facebook-blue look used by Home/Stack/Regular Queue/AVL, (2) a fully self-contained inline-`<style>` look with no `main.css` link at all on Singly and Doubly Linked List, and (3) Tailwind CSS loaded from a CDN (with a "should not be used in production" console warning) plus `main.css` plus a third inline `<style>` block, all three stacked simultaneously, on Priority Queue.

**Navigation — Partially working, with a confirmed JS error.** Clicking the hamburger menu on the Priority Queue page throws `TypeError: Cannot read properties of null (reading 'classList')` every time (its menu handler references `.main-content`, an element that doesn't exist on that page — copy-pasted from another page without adapting). The sidebar still visually opens because the crash happens on the *second* line of the handler, but the error is real and reproducible. **Confirmed live.**

**Forms and inputs — Mixed.** Most pages use real `<input>` fields with inline validation messages (good pattern). The Stack page instead uses native browser `prompt()`/`alert()` dialogs to set capacity — these can't be styled, block the whole page, look jarring next to the rest of the custom UI, and are a poor mobile experience. **Confirmed live.**

**Buttons/interactive elements — Acceptable visually, inconsistent behaviorally.** Disabled-state styling is present and used reasonably (grayed out, `cursor: not-allowed`). But the *rules* for when things are disabled vary per page with no evident reason (e.g., Stack requires re-typing the exact top value to confirm a pop; Regular Queue requires re-typing the exact front value to dequeue; Priority Queue does not require re-typing anything to dequeue, just the value match check happens differently).

**Tables/cards/sections — Acceptable**, though the AVL page's wall of 11 near-identical "Check Descriptions" cards at the bottom is a wall of text with no visual grouping, and could be condensed or made collapsible.

**Mobile responsiveness — Bad, confirmed broken in at least two concrete ways** (oversized heading engulfing the Stack page; hamburger button overlapping the `<h1>` on two other pages). `main.css` has the *same* `@media (max-width: 768px)` breakpoint block repeated five separate times with different, sometimes conflicting rules inside each — a direct symptom of the file being concatenated from multiple pages' stylesheets without dedup.

**Desktop responsiveness — Acceptable** on the pages using `main.css`, weaker on the pages with bespoke inline styles (Doubly/Singly Linked List), which don't consistently constrain max content width.

**Accessibility — Below baseline for a teaching site.** No `alt` text checked (no meaningful images), but: native `prompt()`/`alert()` for core interactions is a screen-reader-hostile pattern; disabled buttons don't announce *why* they're disabled; color is the only differentiator for some states; heading levels are inconsistent (some pages jump straight to visually-huge text without semantic heading structure, e.g., AVL page has two consecutive `<h2>` block patterns without a clear hierarchy). No skip-to-content link for the fixed sidebar/header pattern used everywhere.

**Visual feedback / states — Acceptable to good** on most pages: contextual messages with icons (✅/❌/⚠️) after actions, disabled-button feedback, tooltips on Stack buttons. This is one of the stronger aspects of the current UI.

**Empty/loading/error states — Mixed.** "Queue is empty" / "No actions performed yet" empty states exist on several pages (good). There are no loading states anywhere, which is fine since nothing is async — not a gap. Error states are generally handled with inline messages, except the Stack page which uses `alert()`.

**Overall usability — feels like several different student projects stitched together, not one product.** Each page was clearly built independently (different validation philosophies, different visual languages, different navbar copies) and never unified. **It does not read as modern, polished, or intentional** — it reads as a working prototype with real functionality underneath, undermined by an actual git-conflict artifact left in production and by header/button collisions on mobile.

---

## 2. Front-End Architecture

**What's actually here:** 9 standalone HTML files, one shared `main.css` that is a hand-concatenated merge of what were clearly once separate per-page stylesheets (visible from leftover comments still in the file: `/* stack-style.css */`, `/* avl styles.css */`, `/* circLL */`, `/* Main CSS - Do Not Remove */`), and a mix of external `.js` files and inline `<script>` blocks. Critically, **several of the external `.js` files are dead code**: `circQ.js` and `dLL.js` are not loaded by any HTML page — `circular-queue.html` and `doubly-linked-list.html` instead contain their *own* independently-written, functionally-diverged inline reimplementations of the same data structure. This means there are two competing, drifting implementations of Circular Queue and of Doubly Linked List in the repo, only one of which is actually live, and they disagree on validation rules (e.g., the orphaned `circQ.js` enforces values 1–99 and rejects duplicates; the live inline version allows 1–1000 and does not reject duplicates).

This is not a technology-choice problem — it's a **process/discipline problem**: no shared modules, no single source of truth per data structure, no build step to catch a dead `<script src>` reference or a duplicate function definition. Plain HTML/CSS/JS is a perfectly reasonable stack for a static teaching site; it did not *cause* these bugs. Copy-pasting a whole page (navbar, validation, styling, and all) to create the next page, with no shared component, caused these bugs.

**Should this migrate to React?**

| Dimension | Current (plain HTML/CSS/JS, 9 hand-copied pages) | React-based rebuild |
|---|---|---|
| UI dev speed | Slow for *new* pages (copy a whole page, then find/fix the drift) | Faster once shared components exist |
| Component reusability | None — navbar, buttons, validation, and result-panel are re-typed per page | High — one `<Sidebar>`, one `<Visualizer>`, etc. |
| Maintainability | Poor — proven by dead files, duplicate function defs, inconsistent validation | Better — but only if disciplined; React doesn't prevent copy-paste on its own |
| State management | Ad hoc globals per page (`queue`, `bst`, `linkedList` as bare `let`/`const`) — fine at this scale | `useState`/`useReducer` — genuinely nicer once state gets more interdependent (e.g. AVL rebalancing, undo) |
| Interactive UI | Achieved today with vanilla DOM calls; works, just verbose | Marginally less boilerplate, not a capability current site lacks |
| Animations | Minimal today (one `@keyframes fadeIn`); canvas-drawn tree with no transition | Framer Motion etc. would help *if* richer animation becomes a goal |
| Responsive design | Broken today, but that's a CSS-discipline bug, not a lack of React | React doesn't fix responsive CSS by itself |
| Form handling | Manual but functional; validation logic is duplicated per page | Could centralize via one `<NumberInput>` component |
| Scalability | Poor if more pages are added the same way (copy-paste) | Good, if built with real shared components from the start |
| Developer experience | No hot reload, no linting, manual file management (evidenced by two dead files sitting unnoticed in the repo) | Vite/React dev server + linter would have caught the dead-file and duplicate-function issues immediately |

**Verdict: a full React migration is not strictly necessary to fix what's wrong today — nearly every confirmed bug in this audit is a copy-paste/discipline problem, not a plain-JS capability limit.** However, the *pattern* of bugs (orphaned files, forked/diverged logic, duplicate function definitions silently overriding each other, no way to know a `<script src>` points at a live file) is exactly the class of problem a component framework + bundler (even without React specifically — Vite + vanilla JS modules would do) is designed to prevent, because it forces one canonical implementation per data structure and fails the build on obvious mistakes. Given this is a small (~9 page) educational site likely maintained by students, I'd recommend the lighter step first: **extract the repeated navbar/validation/output-panel into shared JS modules and a single deduplicated CSS file, add a minimal build step (even just Vite serving plain JS, no React needed) so dead references get caught.** Consider React specifically only if the team plans to keep growing this into a larger, more interactive app (e.g., real AVL rotations with animated rebalancing, shared undo/redo, cross-page state) — at that point React's component/state model starts paying for itself. Recommending React "because it's popular" here would add a build step and learning curve without addressing the actual root cause (no shared code, no verification step).

---

## 3. Functionality Audit

| Feature | Status | Notes |
|---|---|---|
| Home page nav (open/close sidebar) | ⚠️ Partially working | Opens/closes correctly, but a `TypeError` is thrown in `regularqueue.js` (loaded unnecessarily on the homepage) once script execution reaches queue-button wiring that doesn't exist on this page. Earlier-registered nav listeners still work because they run before the crash. **Confirmed.** |
| Home page content | ❌ Broken | The literal text `<<<<<<< HEAD ======= >>>>>>> origin/brex` renders at the top of the page, above the sidebar — an unresolved git merge conflict shipped to production. **Confirmed live.** |
| Stack: set capacity / push / pop / peek / is-empty / is-full / size | ✅ Working | Verified live: set capacity via prompt, push a value, visual stack updates correctly, disabled states update correctly. Uses native `prompt()`/`alert()` (UX issue, not a functional bug). |
| Regular Queue: init size / enqueue / dequeue / peek / rear / is-empty / is-full / clear | ✅ Working (code-reviewed) | Validation regex and button-state logic are internally consistent; requires re-entering the front value to dequeue (unusual but functions as designed). |
| Circular Queue | ⚠️ Partially working / has issues | The page's *live* code (inline in `circular-queue.html`) is not the same code as the standalone `circQ.js` file sitting in the repo (which is never loaded). The two disagree on valid input range (1–1000 live vs. 1–99 in the dead file) and duplicate-value handling (live version allows duplicates, dead file rejects them). The live version's wrap-around (circularity) logic itself is correct. **Confirmed via code review**, not manually replayed live for every operation. |
| Priority Queue: set max size / enqueue (+priority) / dequeue / peek / rear / is-empty / is-full / size / display | ✅ Working, but ❌ nav is broken on this page | Priority ordering logic (new priority items inserted after the last existing priority item, others pushed to rear) is correct. Opening the hamburger menu throws a `TypeError` every click (see above). **Confirmed live.** |
| Singly Linked List: append/prepend/insert/delete/etc. | ⚠️ Partially working / mislabeled | Functions correctly *as an array-backed list* for all its operations, but it is not actually a linked list — `linkedList` is a plain JS array; the "next pointer" shown in the UI is a cosmetic string, never a real traversal. `getSize()` returns `length * 2` rather than the actual count — **a confirmed wrong-value bug** any user would notice by comparing the displayed size to the visible node count. |
| Doubly Linked List: append/prepend/insert/delete/update/replace/reverse/sort/find/etc. | ⚠️ Partially working | Live code is a second, independent reimplementation (the standalone `dLL.js` is dead/unloaded and would `ReferenceError` on `openBtn` if it ever were loaded). `getSize()` in the live page also returns a multiplied wrong value (`size * 3`) instead of the true count — **confirmed wrong-value bug**, same bug pattern present in the dead file too (so it predates the fork). |
| Circular Linked List: append/prepend/insert/delete/reverse/sort/find/etc. | ⚠️ Partially working | This is the one linked-list page where the loaded file (`circLL.js`) *is* the live code and *is* a genuine doubly-linked circular structure with correct pointer maintenance (hand-traced `reverse()` and it's correct). Two real bugs: an `addOperationLog()` function is defined twice, so the second definition silently wins and the "Operation Log" only ever shows the single most recent action instead of a history, despite the UI implying a log; and `find(address)` uses `-1` as its "not found" sentinel, which is indistinguishable from a legitimately-stored value of `-1`. |
| AVL Tree: enqueue/dequeue/clear/height/balance/peek root/parents/children/leaves/siblings/update/subtree | ⚠️ Partially working, and mislabeled | All operations execute without crashing (traced through the code), but this is a plain unbalanced Binary Search Tree — there is no rotation logic, no balance-factor tracking anywhere in `avl-tree.js`, despite the page's own text defining the AVL invariant. "Balance Tree" doesn't auto-balance on insert/delete; it's a manual button that rebuilds a balanced tree from sorted values on demand — so between clicks the tree is a plain BST that can become arbitrarily skewed. `avl-tree.html` also references a stylesheet `avl.css` that does not exist anywhere in the repo (404 on load; harmless only because the page also has a large inline `<style>` block covering everything). |
| Search/filtering | ❓ N/A | No search/filter feature exists on the site to test. |
| Authentication | ❓ N/A | None present. |
| API requests | ❓ N/A | Fully static/client-side; no backend calls observed in any network trace. |

---

## 4. Correctness Audit

**Confirmed bugs (logic/behavior, beyond the functionality table above):**
1. **AVL page implements a plain BST, not an AVL tree** — the single biggest correctness issue on the site, because it's presented as a teaching tool for the AVL invariant it doesn't actually enforce. A student could insert a skewed sequence and be shown an unbalanced tree under a page titled "AVL Tree Visualization."
2. **`getSize()` returns the wrong value** on both the Singly Linked List (`length * 2`) and Doubly Linked List (`size * 3`) pages — a simple, high-visibility, directly-observable bug.
3. **Duplicate method/function definitions silently overriding the intended one**: `avl-tree.js` defines `peekSiblings()` twice (second wins, first is dead); `circLL.js` defines `addOperationLog()` twice (second wins, breaking the intended log-history behavior).
4. **Falsy-zero validation bugs**: `dequeueNode()` on the AVL page uses `if (!value || isNaN(value))`, which incorrectly rejects a legitimate dequeue request for the value `0`. `find(address)` on the Circular Linked List page returns `-1` as a "not found" sentinel that collides with a real stored value of `-1`.
5. **Two data structures (Circular Queue, Doubly Linked List) exist as diverged forks** — a dead standalone file and a different live inline implementation — meaning the "source of truth" for their validation rules is ambiguous and the two disagree with each other.
6. **`index.html` ships an unresolved merge conflict** between `HEAD` and `origin/brex` directly in the HTML body — this is a source-control hygiene failure that leaked into production, not just a display bug.
7. **`insertAt(value, 0)` in `circLL.js` allocates and discards a node/address-counter increment before falling through to `prepend()`**, which creates a second node — wasteful but not user-visible (the address counter will visibly skip a number, which could confuse a student tracking addresses).

**Needs further verification (flagged, not asserted as bugs):**
- Whether every arithmetic edge case in the AVL/BST deletion (`removeNode`, two-children case using in-order successor) is correct for all tree shapes — the two-children case was read and looks textbook-correct, but was not exhaustively tested with many insert/delete sequences live.
- Whether the Circular Queue's live inline wrap-around logic holds at the exact full/empty boundary in all cases (spot-checked the code, not exhaustively replayed live).
- Whether Netlify's clean URLs (`/stack` instead of `/stack.html`, observed live) come from a `_redirects`/`netlify.toml` config file not present in this repo snapshot, or from a dashboard-level Netlify setting — could not verify from the repo alone.

**Security:** No user input reaches a backend (site is fully static), so no injection/auth surface exists. The only relevant note is that `main.css`/scripts are all same-origin except the Priority Queue page's Tailwind CDN `<script>` tag, which is an unnecessary external runtime dependency on a page that has no other network calls.

---

## 5. UI Improvement Plan

### P0 — Critical
1. **Remove the unresolved git merge-conflict markers from `index.html`.** *Why:* actively broken, visible-to-every-visitor content on the homepage. *Affects:* `index.html`. *Code change:* yes, trivial (delete 3 lines / resolve the conflict properly). *React needed:* no.
2. **Fix the AVL Tree page: either implement real AVL rotation/balance-factor logic, or rename the page/feature to "Binary Search Tree" and adjust its description text.** *Why:* current page actively misinforms about what it demonstrates. *Affects:* `avl-tree.html`, `avl-tree.js`. *Code change:* yes — meaningful (add rotation logic) or trivial (rename + rewrite copy), user's call which. *React needed:* no.
3. **Fix `getSize()` on Singly and Doubly Linked List pages** to return the true element count. *Why:* directly wrong, user-visible output. *Affects:* singly/doubly linked list inline scripts. *Code change:* yes, trivial. *React needed:* no.
4. **Fix the Priority Queue page's broken hamburger menu** (`mainContent` is null; remove that line or add the missing `.main-content` wrapper). *Why:* throws a JS error on every menu open. *Affects:* `priority-queue.html`. *Code change:* yes, trivial. *React needed:* no.
5. **Fix the mobile heading overflow on the Stack page** (`.stack-heading { font-size: 5rem }` needs a mobile override) and the **hamburger-button/heading overlap** on Priority Queue and Doubly Linked List pages (give the fixed button its own reserved space or push heading padding on small screens). *Why:* both are confirmed, screenshotted, broken mobile experiences. *Affects:* `main.css`, `doubly-linked-list.html`'s inline styles. *Code change:* yes, CSS-only. *React needed:* no.
6. **Delete or reconcile the dead/orphaned files** (`circQ.js`, `dLL.js`, `brex.html`, the `conditional code v2.zip` sitting in the repo root) so there is exactly one implementation per data structure. *Why:* these are actively misleading — someone editing `circQ.js` today would be editing dead code and wonder why nothing changes on the live site. *Affects:* repo root. *Code change:* yes (delete + verify nothing references them). *React needed:* no.

### P1 — High Priority
1. **Extract one shared sidebar/navbar component** (markup + JS + CSS) used identically by all 9 pages, instead of 9 hand-copied forks. *Why:* root cause of the missing-Home-link, dynamic-vs-static button, and `mainContent`-null bugs. *Affects:* all pages. *Code change:* yes, structural. *React optional:* a plain JS include/template function is sufficient; React would make this marginally cleaner but isn't required.
2. **Pick one styling system and remove the other two.** Standardize on the shared `main.css` approach (or a cleaned-up equivalent); drop the Tailwind CDN from Priority Queue and give Singly/Doubly Linked List a real `main.css` link instead of fully bespoke inline styles. *Why:* three different design languages on one 9-page site reads as unfinished/unintentional. *Affects:* `priority-queue.html`, `singly-linked-list.html`, `doubly-linked-list.html`, `main.css`. *Code change:* yes, moderate. *React needed:* no.
3. **Deduplicate `main.css`.** It currently contains the same `@media (max-width: 768px)` block five times and two near-duplicate `.side-navbar` rule sets. *Why:* current file is unmaintainable and self-contradicting; explains several of the mobile bugs above. *Affects:* `main.css`. *Code change:* yes, moderate (audit and merge overlapping rules). *React needed:* no.
4. **Replace `prompt()`/`alert()` on the Stack page with the same inline-input/inline-message pattern already used on every other page.** *Why:* consistency, accessibility, and mobile usability. *Affects:* `stack.html`, `stack.js`. *Code change:* yes, moderate. *React needed:* no.
5. **Establish one validation/confirmation convention** for destructive ops (re-type value to confirm vs. not) across Stack/Queue/List pages instead of each page inventing its own rule. *Why:* current inconsistency likely confuses users who compare pages. *Affects:* all interactive pages. *Code change:* yes, moderate — this is a design decision + implementation.

### P2 — Medium Priority
1. **Introduce a real (if minimal) build/dev setup** — even just Vite serving plain JS/CSS with no framework — to get dead-code/broken-reference detection, and a single source of shared JS across pages. *Why:* would have caught the orphaned-file and duplicate-function-definition bugs immediately. *Affects:* whole repo. *Architecture change:* yes. *React needed:* no (optional future step, not required now).
2. **Fix minor correctness issues**: the `!value` falsy-zero bug in `dequeueNode()`; the `-1` sentinel collision in `find()`; the wasted node allocation in `insertAt(value, 0)`. *Why:* small but real edge-case bugs. *Affects:* `avl-tree.js`, `circLL.js`. *Code change:* yes, small. *React needed:* no.
3. **Accessibility pass**: add semantic heading structure, ensure disabled buttons communicate why (e.g. `aria-describedby` pointing at the helper text that already exists on several pages), add a skip-link past the fixed header/sidebar. *Why:* currently below baseline for a public educational resource. *Affects:* all pages. *Code change:* yes, moderate. *React needed:* no.
4. **Introduce a consistent color system**: one primary action color, one distinct destructive/warning color (currently only Priority Queue's Reset button is red), used the same way everywhere. *Why:* current all-blue palette gives no visual warning before destructive actions. *Affects:* `main.css` + all inline styles. *Code change:* yes, moderate. *React needed:* no.
5. **Remove the unused `conditional code v2.zip`** and any other stray non-source files from the deployed repo. *Why:* housekeeping; no functional impact but signals lack of repo hygiene. *Affects:* repo root. *Code change:* trivial.

### P3 — Nice to Have
1. Replace the AVL/BST canvas drawing with animated transitions between tree states (nodes sliding to new positions rather than an instant redraw) — genuinely valuable for a *teaching* visualization. *Affects:* `avl-tree.js`. *React needed:* no, but a small animation library would help either way.
2. Condense the AVL page's 11 "Check Descriptions" cards into a single collapsible reference panel instead of a long scroll of near-identical boxes. *Affects:* `avl-tree.html`.
3. General micro-interaction polish: consistent hover/focus states, consistent button sizing (`w-24` fixed-width buttons on Priority Queue vs. auto-width elsewhere), consistent corner radius and shadow depth across the "cards" each page uses.

---

## 6. Final Recommendation

1. **Current UI implementation strength: weak-to-moderate.** The underlying interactivity mostly works, and a few pages (Circular Linked List, Regular Queue) are genuinely solid. But the site as a whole reads as nine separately-built prototypes stapled together, not one coherent product — visible in three competing design systems, forked/diverged data-structure implementations, and dead files nobody noticed.
2. **Biggest UI/UX problems:** the git-conflict text rendering live on the homepage; the AVL page not actually being AVL; the Stack page's mobile heading overflow and native-dialog UX; the hamburger-button/heading collisions on two pages; and the total absence of a shared navbar/styling component causing every page to drift independently.
3. **Is React migration justified?** Not on technical necessity — every bug found here is a copy-paste/process failure, not something plain HTML/CSS/JS is incapable of doing correctly. The recommended path is: fix the P0 bugs, extract shared components (plain JS/CSS is enough), and add a minimal build step for safety. Revisit React only if the project's ambitions grow (richer state, animated rebalancing, more cross-page shared state).
4. **Is functionality actually correct?** Mostly yes for *what each page's live code does*, but with confirmed wrong output in two places (`getSize()` ×2), one page fundamentally mislabeled (AVL vs. BST), one broken interaction (Priority Queue menu), and two data structures whose "true" implementation is ambiguous due to dead-file forks.
5. **Most important issues found:** (1) live merge-conflict artifact on the homepage, (2) AVL page is not AVL, (3) two `getSize()` bugs, (4) Priority Queue menu crash, (5) Stack page mobile heading overflow, (6) orphaned/diverged `circQ.js` and `dLL.js`.
7. **Recommended implementation order:** work the P0 list top-to-bottom first (all are small, isolated, low-risk fixes) — this alone would materially change how the site is perceived. Then do the P1 component-extraction and styling-unification pass, since it prevents the P0-class bugs from recurring. P2/P3 are genuine polish and can follow once the foundation is consistent.
