# Binary Heap (min + max): logic module report

- Author: Claude Code
- Branch: `claude/binary-heap` (from `origin/main` at `109579b`)
- Scope: logic and tests only. No page, nav entry, homepage card or CSS.
- Files added (new files only, no existing file changed):
  - `src/structures/heap.js`
  - `tests/heap.test.js`
  - `docs/reports/heap.md` (this file)

## What the module provides
`src/structures/heap.js` is DOM-free and follows the conventions in `PROJECT_CONTEXT.md`
and `src/structures/result.js`.

| Export | Purpose |
|---|---|
| `BinaryHeap(kind, capacity)` | Array-backed heap; `kind` is `"min"` or `"max"`, capacity 1–63 |
| `MinHeap(capacity)`, `MaxHeap(capacity)` | Shorthand subclasses |
| `BinaryHeap.from(kind, values, capacity?)` | Bottom-up O(n) build; returns `{ ok, value: heap, steps }` |
| `insert(v)`, `extract()`, `build(values)` | Return `{ ok, value?, error?, steps }`; errors are values |
| `peek()`, `size`, `isEmpty()`, `isFull()`, `toArray()`, `snapshot()`, `isValid()`, `clear()` | Read helpers; `peek()` is `null` when empty (no `-1`) |
| `isValidHeap(items, kind)`, `parentIndex`, `leftIndex`, `rightIndex` | Pure helpers for tests and a future page |
| `HEAP_INFO` | Registry entry: `name`, `summary`, `complexity`, `pseudocode` (insert / extract / siftDown / build) |

**Step shape:** `{ type, indices, message, snapshot: { items, kind, size, capacity }, comparisons, swaps }`.
Types: `insert`, `extract`, `move-last`, `compare`, `swap`, `settled`, `heapify`, `build-start`, `done`,
`overflow`, `underflow`. The counters are running totals for the current operation. Swap messages are
built **before** the swap (the bubble-sort message bug noted in `CLAUDE_HANDOFF.md`).

**Rules chosen**
- 0-indexed: `parent(i) = ⌊(i−1)/2⌋`, `left = 2i+1`, `right = 2i+2`.
- Comparisons are strict, so equal values never swap. In sift-down the left child wins ties.
- Capacity max 63 = a full tree of 6 levels, which should still fit on a 375px screen.
  This is a guess for the future page; change `BinaryHeap.MAX_CAPACITY` if the renderer needs less.
- Bad input to the constructor / `insert` / `build` (non-finite numbers, wrong kind, bad capacity)
  throws, the same as `Stack` and the queues. Full / empty heaps return `{ ok: false, error }`.

## Tests (`tests/heap.test.js`, 19 tests)
- **Model-based, per kind:** 300 seeded random sequences of 80 insert/extract ops (values −20..20,
  so duplicates, 0 and negatives are common) against a sorted-array model. After every op: heap
  property, same multiset, `size`, `peek`, `isEmpty`, `isFull`; overflow/underflow errors; step shape.
- **Work bounds:** insert ≤ ⌊log₂ n⌋ comparisons; extract ≤ 2·⌊log₂ n⌋; build swaps ≤ n − 1 and
  comparisons ≤ 2n (checked on 300 random arrays per kind, n = 0..63).
- **Heap-sort order:** inserting n values then extracting all gives ascending (min) / descending (max).
- **Edge cases:** empty peek/extract, 0 and negatives, capacity 1, all-equal values (0 swaps),
  bad kind/capacity/values, `build()` over capacity keeps old contents, `build()` of 0 or 1 values,
  input array not mutated, step snapshots are copies.
- **Exact steps:** a worked min-heap sift-up and a worked max-heap extract check step types,
  indices, message text and snapshots.

**Mutation check:** I broke the module three ways on purpose and the suite caught each:
always taking the left child in sift-down (7 failures), swapping equal values in a min-heap
(4 failures), building top-down instead of bottom-up (2 failures). The original file was restored.

## npm test (real output, run on this branch)
Final run on this branch:
```
# tests 112
# pass 112
# fail 0
SUMMARY: 24 / 24 assertions passed (100%)
```

## Not done / for later
- No page, renderer or StepPlayer wiring. A heap page would need a tree + array view
  (both are the same data; `snapshot.items` drives both).
- Not added to `TASK_BOARD.md`, `PROJECT_CONTEXT.md`, `shared.js` or `index.html`, because this task
  allowed new files only. When the branch is merged, add a line to the directory map in
  `PROJECT_CONTEXT.md` and a Done row on the task board.
- `PriorityQueue` in `src/structures/queue.js` is a sorted-array queue that is FIFO among equal
  priorities. A heap is **not** FIFO among ties, so swapping it in would change behaviour. They are
  left separate on purpose.
