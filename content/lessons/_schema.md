# Lesson file format (`content/lessons/*.json`)

One lesson per module page. A lesson is a single JSON object in a UTF-8 file
(no BOM), indented with 2 spaces. Files whose name starts with `_` (like this
one) are not lessons and are skipped by the validator.

Rule IDs (`L1`, `T3`, ...) are stable so the validator and reviewers can cite them.

## 1. Top-level fields

Keys must appear in this order. Unknown keys are an error (L1).

| Field | Type | Required | Rules |
|---|---|---|---|
| `id` | string | yes | Kebab-case, `^[a-z0-9]+(-[a-z0-9]+)*$`. Equals the file name without `.json` (L2). |
| `title` | string | yes | 3–60 chars. Usually the page's `<h1>` without the word "Visualization". |
| `page` | string | yes | Root-level page file, `^[a-z0-9-]+\.html$`. The file must exist (L3). |
| `module` | string | yes | Repo-relative path of the logic module, `^src/.+\.js$`. Must exist (L4). |
| `controller` | string | no | Repo-relative path of the page controller, `^src/pages/.+\.js$`. Must exist if given. |
| `summary` | string | yes | 40–200 chars, 1–2 sentences. |
| `prerequisites` | string[] | no | 0–5 kebab-case ids. If a lesson with that id exists the UI links to it; otherwise it is shown as plain text. |
| `objectives` | string[] | yes | 3–6 items. See section 2. |
| `levels` | object | yes | See section 3. |
| `pseudocode` | object[] | yes | 1–12 items. See section 4. |
| `complexity` | object | yes | 1–12 entries. See section 5. |
| `applications` | string[] | yes | 2–5 items, each 20–220 chars. See section 6. |
| `misconceptions` | object[] | yes | 2–4 items. See section 7. |
| `tryIt` | object[] | yes | 1–6 items. See section 8. |
| `references` | string[] | no | 0–5 items, each 20–220 chars. See section 9. |
| `reviewed` | object or null | yes | See section 10. |

## 2. `objectives`

- Each item starts with exactly `Students can ` and ends with `.` (O1).
- 20–150 chars each (O2).
- The verb right after `Students can ` must be observable. Allowed list:
  `trace, predict, state, explain, compare, identify, compute, choose, describe,
  give, name, apply, distinguish, justify, write`. The verb comes immediately
  after `Students can `, with no adverb in between (O3).
- Banned verbs: `understand, know, learn, appreciate, be aware` (O4).

## 3. `levels`

An object with exactly the keys `beginner`, `intermediate`, `advanced`, in that order (V1).

- Each value is an array of 1–6 paragraphs (V2).
- Each paragraph is 40–420 chars, one idea per paragraph (V3). This keeps a
  paragraph to about 8 lines on a 375px screen.
- `beginner`: no O-notation required, everyday example first, define each term on first use.
- `intermediate`: how the page's implementation works and why each operation costs what it costs.
- `advanced`: trade-offs, variants, edge cases, and where this implementation differs from a textbook variant.
- Text must agree with the module and the page. If the page's code differs from
  the common textbook version, say which version the page implements.

## 4. `pseudocode`

Array of objects, in the order the page shows them:

| Key | Type | Required | Rules |
|---|---|---|---|
| `name` | string | yes | 1–40 chars. The operation or algorithm name, e.g. `push(x)` or `Bubble Sort`. |
| `lines` | string[] | yes | 1–12 lines, each 1–80 chars (P1). Indent with 4 spaces per level, no tabs (P2). |
| `registry` | string | no | Dotted path to the registry array in `module`, e.g. `SORTING_ALGORITHMS.bubble.pseudocode`. |

- If `registry` is given, `lines` must equal that array exactly, character for
  character, including double spaces (P3). Steps highlight lines by 1-based
  number, so never reword, merge or reorder a registry line here; change the
  registry (with the logic owner) instead.
- If there is no registry, lines must follow the module's real control flow
  (same checks, same order) (P4).
- Use `←` for assignment, `=` for equality tests, `≠ ≤ ≥ − × ⌊ ⌋` for math.

## 5. `complexity`

Object. Keys are operation or algorithm keys in camelCase, `^[a-z][A-Za-z0-9]*$`
(use the registry's own keys when a registry exists, e.g. `bubble`, `push`).
Each value:

| Key | Type | Required | Rules |
|---|---|---|---|
| `best` | string | yes | O-notation string (C1). |
| `average` | string | yes | O-notation string. |
| `worst` | string | yes | O-notation string. |
| `space` | string | yes | Extra (auxiliary) space beyond the input, O-notation string. |
| `stable` | boolean | sorting only | Required when the registry entry has `stable` (C4). |
| `inPlace` | boolean | sorting only | `true` if the algorithm sorts by moving values inside the input array and never needs a second array of size n or k. A recursion stack is allowed (so Quick Sort is in-place). |
| `note` | string | no | 20–260 chars. Variant used, what n/k/d mean, special inputs. |
| `registry` | string | no | Dotted path in `module`, e.g. `SORTING_ALGORITHMS.bubble.complexity` or `STACK_INFO.operations.push`. |

- C1: an O-notation string starts with `O(`, has balanced parentheses, and may
  end with a short qualifier of at most 20 chars (e.g. `O(log n) avg stack`).
  Use exactly the characters the page shows: `O(n²)` (superscript ²), `O(n log n)`,
  `O(n + k)`, `O(d·(n + 10))` (middle dot).
- C2: if `registry` points to an object with `best/average/worst/space`, those four
  strings (and `stable`) must equal the registry exactly.
- C3: if `registry` points to an object with a single `complexity` string (like
  `STACK_INFO`), `best`, `average` and `worst` must all equal it.
- If a registry value is wrong, do not "fix" it in the lesson. Report it and
  fix the registry first; the lesson must match what the page shows.

## 6. `applications`

- 2–5 real, well-known, defensible uses (A1). No invented statistics, no
  "used by company X" claims unless the use is documented and famous
  (e.g. Python's sort being Timsort).
- Prefer a concrete example: "Undo in a text editor pops the most recent edit."

## 7. `misconceptions`

Array of 2–4 objects:

| Key | Type | Rules |
|---|---|---|
| `mistake` | string | 10–160 chars. Phrase it the way a student would believe it. |
| `correction` | string | 20–320 chars. Say what is true and why. Point at something visible on the page when possible. |

## 8. `tryIt`

Array of 1–6 objects. Each must work on the real page with its real controls (T1).

| Key | Type | Rules |
|---|---|---|
| `label` | string | 3–60 chars. Short title. |
| `action` | string | 20–320 chars. What to do, in order. |
| `input` | string | 0–80 chars. Exactly what the student types (copyable). `""` if nothing is typed. If several values are typed one at a time, list them separated by `, ` in the order typed and say so in `action`. |
| `expect` | string | 20–320 chars. The real outcome: messages, counters, colours. |

- T2: every control named in `action` is wrapped in curly quotes `“…”` and
  matches the control's visible text on `page` exactly: button text, `<option>`
  text, or a `.field-label` text, after decoding HTML entities and collapsing
  whitespace (so `&#x25B6; Play` is `“▶ Play”`). Curly quotes in `action` are
  reserved for control names. The validator extracts them and checks them
  against the HTML.
- T3: messages quoted in `expect` (also in `“…”`) must be copied from the code
  that produces them, with the values the input actually yields. The validator
  does not check these (they are built at run time); the reviewer must run them.
- T4: numbers in `expect` (comparisons, writes, indices) must be what the code
  really produces for that `input`. Work them out from the code, then confirm on the page.
- If the page has an ordering trap (for example a control that reuses the
  last loaded input), the `action` must avoid it.

## 9. `references`

Textbook-style citations, no URLs needed:
`Authors. Title, edition. Publisher, year. Chapter or section.`
Only cite a chapter or section you have checked.

## 10. `reviewed`

- `null` until a human or the learning-content reviewer has checked every
  claim and run every `tryIt` on the page (R1). Drafts (from any agent) must
  be committed with `null`.
- When reviewed: `{ "by": string (2–60 chars), "date": "YYYY-MM-DD" }`.
  Any later edit to the lesson resets it to `null`.

## 11. Text rules (apply to every string)

- X1 plain text only. No HTML: the regex `<[A-Za-z/!]` must not match. No
  Markdown: no `**`, no backticks, no leading `# ` or `- `. A single `<` or `>`
  surrounded by spaces is allowed in pseudocode and math (`A[j] > key`).
- X2 Unicode symbols, not ASCII stand-ins: `−` (U+2212) for minus, `×`, `÷`, `≤`, `≥`,
  `≠`, `←`, `→`, `⌊ ⌋`, `²`, `·`, `…`, `–` (en dash) for ranges like `1–12`.
  Banned in prose: `<=`, `>=`, `!=`, `->`, `<-`, `^2`, ` * ` and ` - ` used as minus.
  Exceptions: text inside `“…”` copied from the page keeps the page's exact
  characters (the page prints negative numbers with ASCII `-`, e.g. `(-2)`),
  and `input` keeps what the student actually types (`-2`).
- X3 No leading or trailing spaces, no double spaces (except inside registry
  pseudocode lines, which are copied exactly), no tabs, no line breaks inside strings.
- X4 English. Philippine English is fine; keep spelling consistent within a
  file (the site uses US spelling: "color", "amortized"). No Filipino idioms
  unless a Filipino version is requested.
- X5 Style: short sentences, active voice, define each term on first use
  (e.g. "stable: equal values keep their original order"). No filler
  ("In today's world", "powerful", "seamless").

## 12. Validator checklist (summary)

1. File parses as JSON; `id` matches file name; key order and no unknown keys (L1, L2).
2. `page`, `module`, `controller` exist (L3, L4).
3. Counts and length limits from sections 1–9.
4. Objectives prefix, final period, verb lists (O1–O4).
5. `levels` keys exact (V1–V3).
6. Registry equality for pseudocode and complexity when `registry` is set (P3, C2, C3, C4).
7. O-notation format (C1).
8. Control names in `tryIt.action` exist on the page (T2).
9. Text rules X1–X3 on every string.
10. `reviewed` is `null` or `{by, date}` with an ISO date.
