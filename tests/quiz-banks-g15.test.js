/**
 * G15 quiz bank verification suite:
 * Validates the six G15 banks (regular-queue, circular-queue, priority-queue,
 * heap, hash-table, searching) and recomputes EVERY `predict` answer plus at
 * least 6 additional answers per bank directly from the real logic modules.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
    validateBank,
    prepareQuiz,
    grade,
    normalizeAnswer,
    QUESTION_TYPES,
    DIFFICULTIES,
} from "../src/quiz/quiz.js";
import { LinearQueue, CircularQueue, PriorityQueue, QUEUE_INFO } from "../src/structures/queue.js";
import {
    BinaryHeap,
    MinHeap,
    MaxHeap,
    HEAP_INFO,
    parentIndex,
    leftIndex,
    rightIndex,
    isValidHeap,
} from "../src/structures/heap.js";
import {
    HashTable,
    HASH_STRATEGIES,
    hashKey,
    capacityError,
    maxEntriesFor,
} from "../src/structures/hash-table.js";
import { traceSearch, SEARCHING_ALGORITHMS } from "../src/algorithms/searching.js";

const QUIZ_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "content", "quizzes");
const G15_IDS = ["regular-queue", "circular-queue", "priority-queue", "heap", "hash-table", "searching"];
const loadBank = (id) => JSON.parse(readFileSync(join(QUIZ_DIR, `${id}.json`), "utf8"));
const byId = (bank, id) => {
    const q = bank.questions.find((x) => x.id === id);
    assert.ok(q, `missing question ${id} in ${bank.id}`);
    return q;
};

function assertPredictEquals(bank, id, actualValue) {
    const q = byId(bank, id);
    assert.equal(q.type, "predict", `${id} must be a predict question`);
    const fmt = q.format ?? "text";
    const expected = Array.isArray(q.answer) ? q.answer[0] : q.answer;
    assert.equal(
        normalizeAnswer(String(actualValue), fmt),
        normalizeAnswer(expected, fmt),
        `${id}: recomputed "${actualValue}" vs stored "${expected}"`,
    );
    const prepared = prepareQuiz(bank, { seed: 13 }).questions.find((x) => x.id === id);
    assert.equal(grade(prepared, String(actualValue)).correct, true, `${id}: grade accepts recomputed answer`);
}

function assertAllPredictsCovered(bank, verifiedIds) {
    const predictIds = bank.questions.filter((q) => q.type === "predict").map((q) => q.id).sort();
    assert.deepEqual(
        [...verifiedIds].sort(),
        predictIds,
        `${bank.id}: every predict question must be recomputed in tests`,
    );
}

/* ------------------------------------------------------------------ */
/* Bank-level checks for all six G15 banks                            */
/* ------------------------------------------------------------------ */

test("G15: all six banks validate cleanly, have 12-16 questions, cover all types/difficulties, and start unreviewed", () => {
    for (const id of G15_IDS) {
        const bank = loadBank(id);
        const res = validateBank(bank);
        assert.deepEqual(res.errors, [], `${id}: validation errors`);
        assert.equal(res.ok, true, `${id}: ok`);
        assert.equal(bank.id, id);
        assert.equal(bank.reviewed, null, `${id}: reviewed must start null`);
        assert.ok(
            bank.questions.length >= 12 && bank.questions.length <= 16,
            `${id}: expected 12-16 questions, got ${bank.questions.length}`,
        );
        for (const t of QUESTION_TYPES) {
            assert.ok(bank.questions.some((q) => q.type === t), `${id}: missing type ${t}`);
        }
        for (const d of DIFFICULTIES) {
            assert.ok(bank.questions.some((q) => q.difficulty === d), `${id}: missing difficulty ${d}`);
        }
    }
});

/* ------------------------------------------------------------------ */
/* 1. Regular Queue (LinearQueue)                                     */
/* ------------------------------------------------------------------ */

test("G15 regular-queue: recompute every predict answer and 6+ other answers from LinearQueue", () => {
    const bank = loadBank("regular-queue");
    const verifiedPredicts = [];

    // regular-queue-003 (predict, list): enqueue 4, 9; dequeue; enqueue 2
    {
        const q = new LinearQueue(5);
        q.enqueue(4);
        q.enqueue(9);
        q.dequeue();
        q.enqueue(2);
        assertPredictEquals(bank, "regular-queue-003", q.toArray().join(", "));
        verifiedPredicts.push("regular-queue-003");
    }

    // regular-queue-006 (predict): cap 4; enqueue 10, 20, 30; dequeue; enqueue 40 -> rear index
    {
        const q = new LinearQueue(4);
        q.enqueue(10);
        q.enqueue(20);
        q.enqueue(30);
        q.dequeue();
        q.enqueue(40);
        assertPredictEquals(bank, "regular-queue-006", q.rear);
        verifiedPredicts.push("regular-queue-006");
    }

    // regular-queue-009 (predict): cap 4; enqueue 5,6,7,8; dequeue x2; enqueue 9 (false overflow) -> wastedSlots
    {
        const q = new LinearQueue(4);
        for (const v of [5, 6, 7, 8]) q.enqueue(v);
        q.dequeue();
        q.dequeue();
        const over = q.enqueue(9);
        assert.equal(over.ok, false);
        assertPredictEquals(bank, "regular-queue-009", q.wastedSlots);
        verifiedPredicts.push("regular-queue-009");
    }

    // regular-queue-011 (predict): cap 3; enqueue 7, 8; dequeue x2 (resets); enqueue 9 -> rear index
    {
        const q = new LinearQueue(3);
        q.enqueue(7);
        q.enqueue(8);
        q.dequeue();
        q.dequeue();
        q.enqueue(9);
        assertPredictEquals(bank, "regular-queue-011", q.rear);
        verifiedPredicts.push("regular-queue-011");
    }

    assertAllPredictsCovered(bank, verifiedPredicts);

    // Other module-verifiable answers (6)
    {
        const q = new LinearQueue(5);
        q.enqueue(10);
        q.enqueue(20);
        q.enqueue(30);
        assert.equal(String(q.dequeue().value), byId(bank, "regular-queue-001").answer);
    }
    {
        const q = new LinearQueue(5);
        assert.equal(q.front === 0 && q.rear === -1, byId(bank, "regular-queue-002").answer);
    }
    assert.equal(QUEUE_INFO.linear.enqueue, byId(bank, "regular-queue-004").answer);
    {
        const q = new LinearQueue(4);
        for (const v of [1, 2, 3, 4]) q.enqueue(v);
        q.dequeue();
        assert.equal(q.isFull(), byId(bank, "regular-queue-007").answer);
        assert.equal(q.rearAtEnd(), true);
    }
    {
        const q10 = byId(bank, "regular-queue-010");
        const rejected = q10.choices.filter((c) => {
            try {
                new LinearQueue(Number(c));
                return false;
            } catch {
                return true;
            }
        });
        assert.deepEqual(rejected, [q10.answer]);
    }
    {
        const q = new LinearQueue(3);
        q.enqueue(1);
        q.enqueue(2);
        q.enqueue(3);
        q.dequeue();
        q.enqueue(4);
        const q14 = byId(bank, "regular-queue-014");
        const truth = [
            q.isFull() === false,
            q.rearAtEnd() === true,
            q.peek() === 2 && q.peekRear() === 3,
            q.slots[0] === 4,
            q.size === 3,
        ];
        const expected = q14.choices.filter((_, idx) => truth[idx]);
        assert.deepEqual(expected.sort(), q14.answer.slice().sort());
    }
});

/* ------------------------------------------------------------------ */
/* 2. Circular Queue (CircularQueue)                                  */
/* ------------------------------------------------------------------ */

test("G15 circular-queue: recompute every predict answer and 6+ other answers from CircularQueue", () => {
    const bank = loadBank("circular-queue");
    const verifiedPredicts = [];

    // circular-queue-003 (predict, list): cap 4; enqueue 10,20,30,40; dequeue; enqueue 50
    {
        const q = new CircularQueue(4);
        for (const v of [10, 20, 30, 40]) q.enqueue(v);
        q.dequeue();
        q.enqueue(50);
        assertPredictEquals(bank, "circular-queue-003", q.toArray().join(", "));
        verifiedPredicts.push("circular-queue-003");
    }

    // circular-queue-006 (predict): cap 5; enqueue 1..5; dequeue x2; enqueue 6, 7 -> rear index
    {
        const q = new CircularQueue(5);
        for (const v of [1, 2, 3, 4, 5]) q.enqueue(v);
        q.dequeue();
        q.dequeue();
        q.enqueue(6);
        q.enqueue(7);
        assertPredictEquals(bank, "circular-queue-006", q.rear);
        verifiedPredicts.push("circular-queue-006");
    }

    // circular-queue-009 (predict): cap 6 reaching front=4, rear=1 -> size
    {
        const q = new CircularQueue(6);
        for (const v of [1, 2, 3, 4, 5, 6]) q.enqueue(v);
        for (let k = 0; k < 4; k++) q.dequeue();
        q.enqueue(7);
        q.enqueue(8);
        assert.equal(q.front, 4);
        assert.equal(q.rear, 1);
        assertPredictEquals(bank, "circular-queue-009", q.size);
        verifiedPredicts.push("circular-queue-009");
    }

    // circular-queue-011 (predict): cap 4; enqueue 1..4; dequeue x2; enqueue 5; dequeue x2 -> front
    {
        const q = new CircularQueue(4);
        for (const v of [1, 2, 3, 4]) q.enqueue(v);
        q.dequeue();
        q.dequeue();
        q.enqueue(5);
        q.dequeue();
        q.dequeue();
        assertPredictEquals(bank, "circular-queue-011", q.front);
        verifiedPredicts.push("circular-queue-011");
    }

    assertAllPredictsCovered(bank, verifiedPredicts);

    // Other module-verifiable answers (6)
    {
        const q = new CircularQueue(5);
        assert.equal(q.front === -1 && q.rear === -1, byId(bank, "circular-queue-002").answer);
    }
    assert.equal(QUEUE_INFO.circular.enqueue, byId(bank, "circular-queue-004").answer);
    assert.equal(QUEUE_INFO.circular.dequeue, byId(bank, "circular-queue-004").answer);
    {
        const q5 = byId(bank, "circular-queue-005");
        const rejected = q5.choices.filter((c) => {
            try {
                new CircularQueue(Number(c));
                return false;
            } catch {
                return true;
            }
        });
        assert.deepEqual(rejected, [q5.answer]);
    }
    {
        const q = new CircularQueue(5);
        for (let v = 1; v <= 5; v++) assert.equal(q.enqueue(v).ok, true);
        assert.equal(q.size, 5);
        assert.equal(q.isFull(), true);
        // "A 5-slot CircularQueue can hold at most 4 values" -> false
        assert.equal(q.size === 4, byId(bank, "circular-queue-007").answer);
    }
    {
        const q = new CircularQueue(4);
        q.enqueue(1);
        q.enqueue(2);
        q.enqueue(77);
        q.dequeue();
        q.dequeue();
        assert.equal(q.front, 2);
        assert.equal(q.rear, 2);
        q.dequeue();
        assert.equal(`front = ${q.front} and rear = ${q.rear}`, byId(bank, "circular-queue-010").answer);
    }
    {
        const q = new CircularQueue(3);
        q.enqueue(10);
        q.enqueue(20);
        q.enqueue(30);
        q.dequeue();
        q.enqueue(40);
        const over = q.enqueue(50);
        const q14 = byId(bank, "circular-queue-014");
        const truth = [
            JSON.stringify(q.slots) === JSON.stringify([40, 20, 30]),
            over.ok === false,
            q.isFull() === true,
            q.peek() === 40,
            q.front === 0 && q.rear === 2,
        ];
        const expected = q14.choices.filter((_, idx) => truth[idx]);
        assert.deepEqual(expected.sort(), q14.answer.slice().sort());
    }
});

/* ------------------------------------------------------------------ */
/* 3. Priority Queue (PriorityQueue)                                  */
/* ------------------------------------------------------------------ */

test("G15 priority-queue: recompute every predict answer and 6+ other answers from PriorityQueue", () => {
    const bank = loadBank("priority-queue");
    const verifiedPredicts = [];

    // priority-queue-003 (predict, list): enqueue (10,0), (25,1), (15,0), (5,1) -> dequeue order
    {
        const q = new PriorityQueue(6);
        q.enqueue(10, 0);
        q.enqueue(25, 1);
        q.enqueue(15, 0);
        q.enqueue(5, 1);
        const order = [];
        while (!q.isEmpty()) order.push(q.dequeue().value.value);
        assertPredictEquals(bank, "priority-queue-003", order.join(", "));
        verifiedPredicts.push("priority-queue-003");
    }

    // priority-queue-006 (predict): 0-indexed parent of index 6 (verified via compare step)
    {
        const q = new PriorityQueue(7);
        for (let v = 1; v <= 6; v++) q.enqueue(v, 0);
        const res = q.enqueue(7, 0);
        const cmp = res.steps.find((s) => s.type === "compare");
        assert.ok(cmp && cmp.indices[0] === 6);
        assertPredictEquals(bank, "priority-queue-006", cmp.indices[1]);
        verifiedPredicts.push("priority-queue-006");
    }

    // priority-queue-009 (predict, list): enqueue (10,0), (20,0), (30,0), (40,1) -> heapArray values
    {
        const q = new PriorityQueue(6);
        q.enqueue(10, 0);
        q.enqueue(20, 0);
        q.enqueue(30, 0);
        q.enqueue(40, 1);
        assertPredictEquals(bank, "priority-queue-009", q.heapArray().map((x) => x.value).join(", "));
        verifiedPredicts.push("priority-queue-009");
    }

    // priority-queue-011 (predict, list): enqueue (10,1),(20,0),(30,1),(40,0),(50,0), dequeue -> heapArray
    {
        const q = new PriorityQueue(6);
        q.enqueue(10, 1);
        q.enqueue(20, 0);
        q.enqueue(30, 1);
        q.enqueue(40, 0);
        q.enqueue(50, 0);
        q.dequeue();
        assertPredictEquals(bank, "priority-queue-011", q.heapArray().map((x) => x.value).join(", "));
        verifiedPredicts.push("priority-queue-011");
    }

    assertAllPredictsCovered(bank, verifiedPredicts);

    // Other module-verifiable answers (6)
    {
        const q = new PriorityQueue(5);
        q.enqueue(10, 0);
        q.enqueue(20, 1);
        q.enqueue(30, 0);
        q.enqueue(40, 1);
        assert.equal(String(q.peek().value), byId(bank, "priority-queue-001").answer);
    }
    assert.equal(QUEUE_INFO.priority.enqueue, byId(bank, "priority-queue-004").answer);
    assert.equal(QUEUE_INFO.priority.dequeue, byId(bank, "priority-queue-004").answer);
    {
        const q = new PriorityQueue(5, { allowDuplicates: false });
        q.enqueue(12, 0);
        const dup = q.enqueue(12, 1);
        const q5 = byId(bank, "priority-queue-005");
        assert.equal(dup.ok, false);
        assert.equal(dup.steps[0].type, "duplicate");
        assert.equal(q.size, 1);
        assert.equal(q5.answer, q5.choices.find((c) => c.includes("rejected")));
    }
    {
        const q = new PriorityQueue(2, { allowDuplicates: false });
        q.enqueue(10, 0);
        q.enqueue(20, 0);
        const res = q.enqueue(10, 1);
        assert.equal(res.ok, false);
        assert.equal(res.steps[0].type, "overflow");
        // "duplicate check runs before overflow check" -> false
        assert.equal(res.steps[0].type === "duplicate", byId(bank, "priority-queue-007").answer);
    }
    {
        const q = new PriorityQueue(6);
        q.enqueue(10, 1);
        q.enqueue(20, 0);
        q.enqueue(30, 1);
        q.enqueue(40, 0);
        q.enqueue(50, 0);
        q.dequeue();
        // Heap is [30, 20, 50, 40]: last element (40) !== lowest-ranked rear (50)
        assert.equal(q.heapArray().at(-1).value === q.peekRear().value, byId(bank, "priority-queue-012").answer);
    }
    {
        const q = new PriorityQueue(5);
        const negOk = q.enqueue(-5, -3).ok;
        const idBefore = q.peek().id;
        q.clear();
        q.enqueue(1, 0);
        const keptNextId = q.peek().id > idBefore;
        const dq = new PriorityQueue(5);
        dq.enqueue(10, 1);
        dq.enqueue(20, 0);
        dq.enqueue(30, 0);
        const deqSteps = dq.dequeue().steps.map((s) => s.type);
        const movesLastAndSifts = deqSteps.includes("dequeue") && deqSteps.includes("move-last");
        const qUnsorted = new PriorityQueue(6);
        qUnsorted.enqueue(10, 2);
        qUnsorted.enqueue(20, 0);
        qUnsorted.enqueue(30, 1);
        const rawPrios = qUnsorted.heapArray().map((x) => x.priority);
        const alwaysSorted = rawPrios.every((p, i) => i === 0 || rawPrios[i - 1] >= p);
        const q14 = byId(bank, "priority-queue-014");
        const truth = [negOk, keptNextId, movesLastAndSifts, new PriorityQueue(5).allowDuplicates === false, alwaysSorted];
        const expected = q14.choices.filter((_, idx) => truth[idx]);
        assert.deepEqual(expected.sort(), q14.answer.slice().sort());
    }
});

/* ------------------------------------------------------------------ */
/* 4. Binary Heap (BinaryHeap / MinHeap / MaxHeap)                    */
/* ------------------------------------------------------------------ */

test("G15 heap: recompute every predict answer and 8+ other answers from BinaryHeap", () => {
    const bank = loadBank("heap");
    const verifiedPredicts = [];

    // heap-004 (predict, list): MinHeap [5, 12, 8, 20, 15], insert(3)
    {
        const h = new MinHeap(31);
        h.build([5, 12, 8, 20, 15]);
        h.insert(3);
        assertPredictEquals(bank, "heap-004", h.toArray().join(", "));
        verifiedPredicts.push("heap-004");
    }

    // heap-007 (predict, list): MaxHeap [50, 30, 40, 10, 20, 15], extract()
    {
        const h = new MaxHeap(31);
        h.build([50, 30, 40, 10, 20, 15]);
        h.extract();
        assertPredictEquals(bank, "heap-007", h.toArray().join(", "));
        verifiedPredicts.push("heap-007");
    }

    // heap-011 (predict, list): MinHeap.build([20, 15, 10, 30, 5, 8])
    {
        const h = new MinHeap(31);
        h.build([20, 15, 10, 30, 5, 8]);
        assertPredictEquals(bank, "heap-011", h.toArray().join(", "));
        verifiedPredicts.push("heap-011");
    }

    // heap-012 (predict): MinHeap [2, 5, 5, 9, 10, 12], extract() -> index of 12 (left-child tie break)
    {
        const h = new MinHeap(31);
        h.build([2, 5, 5, 9, 10, 12]);
        h.extract();
        assertPredictEquals(bank, "heap-012", h.toArray().indexOf(12));
        verifiedPredicts.push("heap-012");
    }

    assertAllPredictsCovered(bank, verifiedPredicts);

    // Other module-verifiable answers (8)
    assert.equal(
        `parent ${parentIndex(4)}, left child ${leftIndex(4)}, right child ${rightIndex(4)}`,
        byId(bank, "heap-001").answer,
    );
    assert.equal(!isValidHeap([1, 10, 2], "min"), byId(bank, "heap-002").answer);
    assert.equal(HEAP_INFO.complexity.peek, byId(bank, "heap-003").answer);
    assert.equal(isValidHeap([40, 25, 30, 10, 20, 15], "max"), byId(bank, "heap-005").answer);
    assert.equal(HEAP_INFO.complexity.build, byId(bank, "heap-006").answer);
    {
        const h = new MinHeap(31);
        const res = h.build([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
        const firstHeapify = res.steps.find((s) => s.type === "heapify");
        assert.equal(String(firstHeapify.indices[0]), byId(bank, "heap-008").answer);
        assert.equal(String(parentIndex(9)), byId(bank, "heap-008").answer);
    }
    {
        const q9 = byId(bank, "heap-009");
        const cxKeys = ["insert", "extract", "peek", "build"];
        const expected = q9.choices.filter((_, idx) => HEAP_INFO.complexity[cxKeys[idx]] === "O(log n)");
        assert.deepEqual(expected.sort(), q9.answer.slice().sort());
    }
    {
        const h = new MinHeap(31);
        h.insert(10);
        const dup = h.insert(10);
        assert.equal(dup.steps.at(-1).swaps > 0, byId(bank, "heap-010").answer);
    }
    {
        const q14 = byId(bank, "heap-014");
        const tieHeap = new MinHeap(31);
        tieHeap.build([2, 5, 5, 9, 10, 12]);
        tieHeap.extract();
        const leftTieWon = tieHeap.toArray().indexOf(12) === 3;
        const maxAtLast = [1, 10, 2].at(-1) === Math.max(1, 10, 2) && isValidHeap([1, 10, 2], "min");
        const truth = [
            BinaryHeap.MAX_CAPACITY === 63,
            new MinHeap(31).extract().ok === false,
            leftTieWon,
            maxAtLast,
        ];
        const expected = q14.choices.filter((_, idx) => truth[idx]);
        assert.deepEqual(expected.sort(), q14.answer.slice().sort());
    }
});

/* ------------------------------------------------------------------ */
/* 5. Hash Table (HashTable)                                          */
/* ------------------------------------------------------------------ */

test("G15 hash-table: recompute every predict answer and 8+ other answers from HashTable", () => {
    const bank = loadBank("hash-table");
    const verifiedPredicts = [];

    // hash-table-001 (predict): hashKey(-4, 7)
    assertPredictEquals(bank, "hash-table-001", hashKey(-4, 7));
    verifiedPredicts.push("hash-table-001");

    // hash-table-005 (predict, list): Linear Probing m=7, insert 5, 12, 6 -> slot indices
    {
        const ht = new HashTable(7, { strategy: "linear" });
        const slots = [5, 12, 6].map((k) => ht.insert(k).value.bucket);
        assertPredictEquals(bank, "hash-table-005", slots.join(", "));
        verifiedPredicts.push("hash-table-005");
    }

    // hash-table-008 (predict, list): Quadratic Probing m=11, insert 3, 14, 25 -> slot indices
    {
        const ht = new HashTable(11, { strategy: "quadratic" });
        const slots = [3, 14, 25].map((k) => ht.insert(k).value.bucket);
        assertPredictEquals(bank, "hash-table-008", slots.join(", "));
        verifiedPredicts.push("hash-table-008");
    }

    // hash-table-011 (predict): Linear Probing m=7, insert 2, 9, 16; delete 9; insert 23 -> bucket
    {
        const ht = new HashTable(7, { strategy: "linear" });
        ht.insert(2);
        ht.insert(9);
        ht.insert(16);
        ht.delete(9);
        const ins23 = ht.insert(23);
        assertPredictEquals(bank, "hash-table-011", ins23.value.bucket);
        verifiedPredicts.push("hash-table-011");
    }

    assertAllPredictsCovered(bank, verifiedPredicts);

    // Other module-verifiable answers (8)
    {
        const q2 = byId(bank, "hash-table-002");
        const unlimited = ["chaining", "linear", "quadratic"].filter((s) => maxEntriesFor(7, s) === null);
        assert.deepEqual(unlimited, ["chaining"]);
        assert.equal(q2.answer, "Separate Chaining");
    }
    assert.equal(HASH_STRATEGIES.chaining.complexity.searchAvg, byId(bank, "hash-table-003").answer);
    {
        const ht = new HashTable(7, { strategy: "linear" });
        ht.insert(1);
        ht.insert(8);
        ht.delete(1);
        // Deleting does NOT set slot back to EMPTY
        assert.equal(ht.snapshot().slots[1].state === "empty", byId(bank, "hash-table-004").answer);
    }
    assert.equal(HASH_STRATEGIES.chaining.complexity.worst, byId(bank, "hash-table-006").answer);
    assert.equal(HASH_STRATEGIES.linear.complexity.worst, byId(bank, "hash-table-006").answer);
    {
        const q9 = byId(bank, "hash-table-009");
        const valid = q9.choices.filter((c) => capacityError(Number(c), "quadratic") === null);
        assert.deepEqual(valid.sort(), q9.answer.slice().sort());
    }
    {
        const ht = new HashTable(7, { strategy: "linear" });
        ht.insert(1);
        ht.insert(8);
        ht.delete(1);
        ht.rehash(7);
        assert.equal(ht.snapshot().tombstones > 0, byId(bank, "hash-table-010").answer);
    }
    {
        const q12 = byId(bank, "hash-table-012");
        const max11 = maxEntriesFor(11, "quadratic");
        const distinctProbes = new Set(Array.from({ length: 11 }, (_, i) => (i * i) % 11)).size;
        assert.equal(max11, 5);
        assert.equal(distinctProbes, 6);
        assert.equal(
            q12.answer,
            q12.choices.find((c) => c.startsWith(`${max11} entries`) && c.includes(`${distinctProbes} distinct slots`)),
        );
    }
    assert.equal(HASH_STRATEGIES.chaining.complexity.space, byId(bank, "hash-table-013").answer);
    {
        const makeBase = () => {
            const ht = new HashTable(7, { strategy: "quadratic" });
            ht.insert(1, "a");
            ht.insert(2, "b");
            ht.insert(3, "c");
            return ht;
        };
        const q14 = byId(bank, "hash-table-014");
        const truth = [
            makeBase().insert(2, "z").ok,
            makeBase().insert(4, "d").ok,
            (() => { const ht = makeBase(); return ht.delete(1).ok && ht.insert(4, "d").ok; })(),
            makeBase().rehash(9).ok,
            makeBase().rehash(11).ok,
        ];
        const expected = q14.choices.filter((_, idx) => truth[idx]);
        assert.deepEqual(expected.sort(), q14.answer.slice().sort());
    }
});

/* ------------------------------------------------------------------ */
/* 6. Searching Algorithms (traceSearch)                              */
/* ------------------------------------------------------------------ */

test("G15 searching: recompute every predict answer and 8+ other answers from traceSearch", () => {
    const bank = loadBank("searching");
    const verifiedPredicts = [];

    // searching-003 (predict): Linear Search [42, 11, 25, 7, 25, 90] for 25 -> comparisons
    {
        const steps = traceSearch("linear", [42, 11, 25, 7, 25, 90], 25);
        assertPredictEquals(bank, "searching-003", steps.at(-1).comparisons);
        verifiedPredicts.push("searching-003");
    }

    // searching-006 (predict, list): Binary Search [4,11,18,25,34,42,56,63,78,91] for 56 -> mid indices
    {
        const steps = traceSearch("binary", [4, 11, 18, 25, 34, 42, 56, 63, 78, 91], 56);
        const mids = steps.filter((s) => s.type === "compare").map((s) => s.mid);
        assertPredictEquals(bank, "searching-006", mids.join(", "));
        verifiedPredicts.push("searching-006");
    }

    // searching-007 (predict): Interpolation Search [10..100] for 70 -> first probed pos
    {
        const steps = traceSearch("interpolation", [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 70);
        const firstCmp = steps.find((s) => s.type === "compare");
        assertPredictEquals(bank, "searching-007", firstCmp.mid);
        verifiedPredicts.push("searching-007");
    }

    // searching-011 (predict): Interpolation Search [10..60] for out-of-bounds 5 -> comparisons
    {
        const steps = traceSearch("interpolation", [10, 20, 30, 40, 50, 60], 5);
        assertPredictEquals(bank, "searching-011", steps.at(-1).comparisons);
        verifiedPredicts.push("searching-011");
    }

    assertAllPredictsCovered(bank, verifiedPredicts);

    // Other module-verifiable answers (8)
    assert.equal(SEARCHING_ALGORITHMS.linear.requiresSorted, byId(bank, "searching-001").answer);
    assert.equal(SEARCHING_ALGORITHMS.binary.complexity.worst, byId(bank, "searching-002").answer);
    {
        const q4 = byId(bank, "searching-004");
        const steps = traceSearch("binary", [30, 10, 50, 20, 40], 20);
        const sortedStr = `[${steps.at(-1).array.join(", ")}]`;
        const idx = steps.at(-1).foundIndex;
        assert.equal(sortedStr, "[10, 20, 30, 40, 50]");
        assert.equal(idx, 1);
        assert.equal(q4.answer, q4.choices.find((c) => c.includes(sortedStr) && c.includes(`index ${idx}`)));
    }
    for (const key of ["linear", "binary", "interpolation"]) {
        assert.equal(SEARCHING_ALGORITHMS[key].complexity.best, byId(bank, "searching-005").answer);
    }
    assert.equal(SEARCHING_ALGORITHMS.interpolation.complexity.average, byId(bank, "searching-009").answer);
    {
        const q12 = byId(bank, "searching-012");
        const steps = traceSearch("interpolation", [7, 7, 7, 7, 7], 7);
        assert.equal(steps.at(-1).foundIndex, 0);
        assert.equal(steps.at(-1).comparisons, 1);
        assert.equal(steps.find((s) => s.type === "compare").line, 3);
        assert.equal(q12.answer, q12.choices.find((c) => c.includes("pos = low")));
    }
    {
        const q13 = byId(bank, "searching-013");
        const skewed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 900];
        const iCmp = traceSearch("interpolation", skewed, 9).at(-1).comparisons;
        const bCmp = traceSearch("binary", skewed, 9).at(-1).comparisons;
        assert.equal(iCmp, 9);
        assert.equal(bCmp, 3);
        assert.equal(
            q13.answer,
            q13.choices.find((c) => c.includes(`Interpolation Search takes ${iCmp}`) && c.includes(`Binary Search takes only ${bCmp}`)),
        );
    }
    {
        const q14 = byId(bank, "searching-014");
        const arr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        const cases = [
            ["linear", 10],
            ["binary", 50],
            ["interpolation", 90],
            ["binary", 60],
            ["interpolation", 5],
        ];
        const expected = q14.choices.filter((_, idx) => {
            const [algo, target] = cases[idx];
            return traceSearch(algo, arr, target).at(-1).comparisons === 1;
        });
        assert.deepEqual(expected.sort(), q14.answer.slice().sort());
    }
});
