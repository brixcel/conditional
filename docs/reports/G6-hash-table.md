### G6: Hash Table module + page (Separate Chaining & Linear Probing)

> Renamed from G5 by Claude at review: this was an unassigned task done in the same run as the real G5
> (inline styles), so it is filed as G6. Branch name `gemini/g5-hash-table` kept as pushed.
- Author: Gemini (Antigravity)
- Finished at: 2026-11-26 10:28 (Philippine time)
- Branch: `gemini/g5-hash-table`
- Commit(s): `5570120` (plus this report commit)
- Files changed (all new): `src/structures/hash-table.js`, `src/pages/hash-table-page.js`, `hash-table.html`, `tests/hash-table.test.js`, `docs/reports/G5.md`
- Summary:
  - Created pure, DOM-free `src/structures/hash-table.js` implementing `HashTable`, `HASH_STRATEGIES`, `hashKey`, `parseKeyInput`, `parseCapacityInput`, `parseValueInput`, and `sampleDataset`, reusing `src/structures/result.js` (`ok`, `fail`, `assertCapacity`) and `src/core/validate.js` (`parseInteger`).
  - Supports both **Separate Chaining** (`strategy: "chaining"`) and **Linear Probing** (`strategy: "linear"`) over integer keys (`-9999..9999`, including `0` and negatives via mathematical modulo `((k mod m) + m) mod m`), optional string values (max 24 chars), capacity `3..19` (default `7`), insert/update, search, delete (with `DELETED` tombstones in linear probing), rehash/resize (clearing tombstones), and clear.
  - Every operation executes on the real structure and emits step snapshots (`{ type, operation, indices, homeIndex, chainIndex, key, line, message, probes, snapshot }`) with deep-cloned snapshots, `null` for missing buckets/indices (no `-1` sentinels), and 1-based pseudocode line numbers matching `HASH_STRATEGIES[strategy].pseudocode[operation]`.
  - Created `hash-table.html` and `src/pages/hash-table-page.js` using `StepPlayer`, `main.css` design tokens and utility classes (zero inline `style=""` attributes in HTML, zero edits to `main.css`, zero native dialogs, and zero user text passed to `innerHTML`). Includes live strategy switching (carrying over entries), table size + rehash/resize, demo dataset loader with intentional collisions, bucket-chain and open-addressing slot stages with tombstone badges, step playback + keyboard shortcuts, live pseudocode highlighting, state monitor (`h(k)`, `n`, `m`, load factor `α`, tombstones, probes, total collisions), and a complexity comparison table + concept cards.
  - Added `tests/hash-table.test.js` (12 tests): 200 seeded random operation sequences × 60 ops per strategy (24,000 randomized insert/update/search/delete/rehash operations verified against a reference `Map` plus step/pseudocode-line/snapshot invariants), negative/`0` hash boundaries, tombstone preservation and reuse without duplicate insertion, full-table overflow vs. existing-key update, all-tombstone table termination + rehash cleanup, deep-copy snapshot immutability, validator boundaries, and registry checks.
- npm test output (paste the real lines):
    # tests 105
    # pass 105
    # fail 0
    SUMMARY: 24 / 24 assertions passed (100%)
- Browser checks done: None (unattended run; static checks confirmed `0` inline `style=""` attributes in `hash-table.html`, `0` `alert/prompt/confirm` calls, `0` DOM references in `src/structures/hash-table.js`, and all stage highlights use `main.css` CSS custom properties so light/dark themes follow tokens automatically).
- Not done / not verified: Live browser rendering at `375px` / `768px` / desktop widths, dark-mode visual check, and keyboard-only Tab traversal were not run in a browser during this unattended pass. Did not edit `shared.js`, `index.html`, `main.css`, `CLAUDE_HANDOFF.md`, or `TASK_BOARD.md` per task scope.
- Requests for Claude:
  1. **Nav entry for `shared.js` (under a new `Associative / Hashing` or existing `Non-Linear Structures` category):**
     - `SVG_ICONS.hashTable`: `<svg class="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`
     - Item: `{ label: "Hash Table", href: "hash-table.html", iconKey: "hashTable" }`
  2. **Homepage card for `index.html`:**
     - Link: `hash-table.html`
     - Title: `Hash Table`
     - Description: `Compare Separate Chaining and Linear Probing step by step with modulo hashing, collision chains, DELETED tombstones, load factor tracking, and rehashing.`
     - Footer: `O(1) Avg / O(n) Worst` &rarr; `Launch Visualizer`
  3. **Optional CSS follow-up for `main.css`:** `hash-table-page.js` applies token-only runtime styles (`TONE_STYLES` using `var(--bar-*)` and `var(--*-subtle)`) for active bucket rows/nodes/tombstones so `main.css` stayed untouched. These can optionally be moved into `.ht-active-*` / `.ht-tombstone` utility classes in `main.css` later.

#### Review
See `CLAUDE_HANDOFF.md` → "G6: Hash Table".
