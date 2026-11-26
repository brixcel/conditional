import { test } from "node:test";
import assert from "node:assert/strict";
import {
    FenwickTree,
    FENWICK_LIMITS,
    FENWICK_INFO,
    lowbit,
    formatBinary,
} from "../src/structures/fenwick.js";

function seeded(seed) {
    // mulberry32 PRNG, matching the other suites for reproducible runs.
    return () => {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randInt(rand, lo, hi) {
    return lo + Math.floor(rand() * (hi - lo + 1));
}

function plainRangeSum(arr, l, r) {
    let sum = 0;
    for (let k = l; k <= r; k++) sum += arr[k];
    return sum;
}

function assertNotNegZero(value, label) {
    assert.ok(!Object.is(value, -0), `${label}: must not be -0`);
}

const VALID_STEP_TYPES = new Set([
    "visit",
    "add",
    "move-up",
    "move-down",
    "range-right",
    "range-left",
    "done",
]);

function assertValidSteps(result, expectedOp, expectedSize, label = "") {
    assert.ok(Array.isArray(result.steps), `${label}: steps must be an array`);
    assert.ok(result.steps.length >= 1, `${label}: must emit at least one step`);

    const lines = FENWICK_INFO.pseudocode[expectedOp];
    assert.ok(Array.isArray(lines), `${label}: pseudocode must exist for "${expectedOp}"`);

    for (let i = 0; i < result.steps.length; i++) {
        const step = result.steps[i];
        assert.equal(step.operation, expectedOp, `${label} step ${i}: operation`);
        assert.equal(typeof step.type, "string", `${label} step ${i}: type`);
        assert.ok(VALID_STEP_TYPES.has(step.type), `${label} step ${i}: unexpected type "${step.type}"`);
        assert.equal(typeof step.message, "string", `${label} step ${i}: message`);
        assert.ok(step.message.length > 0, `${label} step ${i}: non-empty message`);

        assert.ok(
            Number.isInteger(step.line) && step.line >= 1 && step.line <= lines.length,
            `${label} step ${i}: line ${step.line} must be in 1..${lines.length} for ${expectedOp}`,
        );

        if (step.index !== null) {
            assert.ok(
                Number.isInteger(step.index) && step.index >= 1 && step.index <= expectedSize,
                `${label} step ${i}: index ${step.index} must be 1..${expectedSize} or null`,
            );
            assert.equal(
                step.lowbit,
                lowbit(step.index),
                `${label} step ${i}: lowbit ${step.lowbit} must equal lowbit(${step.index})`,
            );
        } else {
            assert.equal(step.lowbit, null, `${label} step ${i}: lowbit must be null when index is null`);
        }

        assert.ok(Array.isArray(step.indices), `${label} step ${i}: indices array`);
        for (const idx of step.indices) {
            assert.ok(
                Number.isInteger(idx) && idx >= 1 && idx <= expectedSize,
                `${label} step ${i}: indices entry ${idx} must be 1..${expectedSize}`,
            );
        }

        if (step.runningTotal !== null) {
            assert.ok(
                typeof step.runningTotal === "number" && Number.isInteger(step.runningTotal),
                `${label} step ${i}: runningTotal must be integer or null`,
            );
            assertNotNegZero(step.runningTotal, `${label} step ${i} runningTotal`);
        }

        assert.ok(step.snapshot && typeof step.snapshot === "object", `${label} step ${i}: snapshot`);
        assert.ok(Array.isArray(step.snapshot.values), `${label} step ${i}: snapshot.values`);
        assert.ok(Array.isArray(step.snapshot.tree), `${label} step ${i}: snapshot.tree`);
        assert.equal(step.snapshot.values.length, expectedSize, `${label} step ${i}: snapshot.values length`);
        assert.equal(step.snapshot.tree.length, expectedSize + 1, `${label} step ${i}: snapshot.tree length`);
        assert.equal(step.snapshot.tree[0], 0, `${label} step ${i}: snapshot.tree[0] header`);
        for (const v of step.snapshot.values) assertNotNegZero(v, `${label} step ${i} snapshot.values`);
        for (const t of step.snapshot.tree) assertNotNegZero(t, `${label} step ${i} snapshot.tree`);
    }

    const last = result.steps[result.steps.length - 1];
    assert.equal(last.type, "done", `${label}: last step must be done`);
    assert.equal(last.index, null, `${label}: done step index must be null`);
    assert.equal(last.lowbit, null, `${label}: done step lowbit must be null`);
}

test("FENWICK_LIMITS and FENWICK_INFO metadata are frozen and complete", () => {
    assert.ok(Object.isFrozen(FENWICK_LIMITS));
    assert.deepEqual(FENWICK_LIMITS, {
        minSize: 1,
        maxSize: 32,
        minValue: -999,
        maxValue: 999,
    });

    assert.ok(Object.isFrozen(FENWICK_INFO));
    assert.equal(FENWICK_INFO.name, "Fenwick Tree (Binary Indexed Tree)");
    assert.equal(typeof FENWICK_INFO.summary, "string");
    assert.ok(FENWICK_INFO.summary.includes("lowbit"));
    assert.ok(Object.isFrozen(FENWICK_INFO.complexity));
    assert.deepEqual(FENWICK_INFO.complexity, {
        build: "O(n)",
        update: "O(log n)",
        set: "O(log n)",
        prefixSum: "O(log n)",
        rangeSum: "O(log n)",
        space: "O(n)",
    });

    assert.ok(Object.isFrozen(FENWICK_INFO.pseudocode));
    for (const op of ["build", "update", "set", "prefixSum", "rangeSum", "clear"]) {
        const lines = FENWICK_INFO.pseudocode[op];
        assert.ok(Array.isArray(lines) && lines.length >= 1, `pseudocode.${op} non-empty`);
        assert.ok(Object.isFrozen(lines), `pseudocode.${op} frozen`);
    }
});

test("lowbit(j) returns lowest set bit power of two and rejects invalid inputs", () => {
    const expected = new Map([
        [1, 1], [2, 2], [3, 1], [4, 4], [5, 1], [6, 2], [7, 1], [8, 8],
        [9, 1], [10, 2], [11, 1], [12, 4], [14, 2], [16, 16], [24, 8], [32, 32],
    ]);
    for (const [j, lb] of expected) {
        assert.equal(lowbit(j), lb, `lowbit(${j})`);
    }
    for (const bad of [0, -1, -8, 1.5, NaN, Infinity, -Infinity, 0x80000000]) {
        assert.throws(() => lowbit(bad), RangeError);
    }
    for (const bad of ["4", null, undefined, {}, []]) {
        assert.throws(() => lowbit(bad), TypeError);
    }
});

test("formatBinary(value, bits) zero-pads binary representations and validates arguments", () => {
    assert.equal(formatBinary(0), "0000");
    assert.equal(formatBinary(2), "0010");
    assert.equal(formatBinary(6), "0110");
    assert.equal(formatBinary(8), "1000");
    assert.equal(formatBinary(15), "1111");
    assert.equal(formatBinary(16), "10000");
    assert.equal(formatBinary(32, 6), "100000");
    assert.equal(formatBinary(5, 6), "000101");

    for (const bad of [-1, 2.5, NaN, Infinity]) {
        assert.throws(() => formatBinary(bad), RangeError);
    }
    for (const bad of ["6", null, undefined]) {
        assert.throws(() => formatBinary(bad), TypeError);
    }
    for (const badBits of [0, -2, 1.5, NaN]) {
        assert.throws(() => formatBinary(6, badBits), RangeError);
    }
    assert.throws(() => formatBinary(6, "4"), TypeError);
});

test("constructor defaults, bounds, and error types", () => {
    const def = new FenwickTree();
    assert.equal(def.size, 8);
    assert.deepEqual(def.toArray(), [0, 0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(def.treeArray(), [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(def.integrityError(), null);

    assert.equal(new FenwickTree(1).size, 1);
    assert.equal(new FenwickTree(32).size, 32);

    for (const bad of [0, -1, 33, 4.5, NaN, Infinity, -Infinity]) {
        assert.throws(() => new FenwickTree(bad), RangeError, `expected RangeError for ${bad}`);
    }
    for (const bad of ["8", null, true, {}, []]) {
        assert.throws(() => new FenwickTree(bad), TypeError, `expected TypeError for ${String(bad)}`);
    }
});

test("hand-written n=8 index paths: update(2, 5), prefixSum(6), rangeSum(2, 6), and build([1..8])", () => {
    // 1. O(n) build([1..8]) propagations: 1->2, 2->4, 3->4, 4->8, 5->6, 6->8, 7->8
    const fromRes = FenwickTree.from([1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(fromRes.ok, true);
    const bit = fromRes.value;
    assertValidSteps(fromRes, "build", 8, "from([1..8])");
    assert.equal(bit.integrityError(), null);
    assert.deepEqual(bit.toArray(), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(bit.treeArray(), [0, 1, 3, 3, 10, 5, 11, 7, 36]);

    const buildEdges = fromRes.steps
        .filter((s) => s.type === "add")
        .map((s) => s.indices);
    assert.deepEqual(buildEdges, [
        [1, 2],
        [2, 4],
        [3, 4],
        [4, 8],
        [5, 6],
        [6, 8],
        [7, 8],
    ]);
    assert.equal(fromRes.steps[0].type, "visit");
    assert.ok(
        fromRes.steps.some((s) => s.message.includes("j = 2 (0010), lowbit 2 (0010): add tree[2]")),
        "build message should show binary j and lowbit",
    );

    // 2. prefixSum(6) (0-based 6 -> 1-based j = 7) visits [7, 6, 4]
    const preRes = bit.prefixSum(6);
    assert.equal(preRes.ok, true);
    assert.equal(preRes.value, 28); // 1+2+3+4+5+6+7
    assertValidSteps(preRes, "prefixSum", 8, "prefixSum(6)");
    const preIndices = preRes.steps
        .filter((s) => s.type === "visit")
        .map((s) => s.index);
    assert.deepEqual(preIndices, [7, 6, 4]);
    const preTotals = preRes.steps
        .filter((s) => s.type === "visit")
        .map((s) => s.runningTotal);
    assert.deepEqual(preTotals, [7, 18, 28]);
    assert.ok(
        preRes.steps.some(
            (s) =>
                s.type === "move-down" &&
                s.message.includes("j = 6 (0110), lowbit 2 (0010): next j = 6 - 2 = 4 (0100)."),
        ),
        "prefixSum move-down message should show binary transition 6 -> 4",
    );
    assert.equal(preRes.steps[preRes.steps.length - 1].runningTotal, 28);

    // 3. rangeSum(2, 6) visits right [7, 6, 4] and left [2]
    const rangeRes = bit.rangeSum(2, 6);
    assert.equal(rangeRes.ok, true);
    assert.equal(rangeRes.value, 25); // 3+4+5+6+7
    assertValidSteps(rangeRes, "rangeSum", 8, "rangeSum(2, 6)");
    const rightPath = rangeRes.steps
        .filter((s) => s.type === "range-right")
        .map((s) => s.index);
    const leftPath = rangeRes.steps
        .filter((s) => s.type === "range-left")
        .map((s) => s.index);
    assert.deepEqual(rightPath, [7, 6, 4]);
    assert.deepEqual(leftPath, [2]);
    assert.equal(rangeRes.steps[rangeRes.steps.length - 1].runningTotal, 25);

    // 4. update(2, 5) (0-based 2 -> 1-based j = 3) visits [3, 4, 8]
    const updRes = bit.update(2, 5);
    assert.equal(updRes.ok, true);
    assert.equal(updRes.value, 8); // a[2] was 3, +5 -> 8
    assertValidSteps(updRes, "update", 8, "update(2, 5)");
    assert.equal(bit.integrityError(), null);
    const updIndices = updRes.steps
        .filter((s) => s.type === "add")
        .map((s) => s.index);
    assert.deepEqual(updIndices, [3, 4, 8]);
    assert.deepEqual(bit.treeArray(), [0, 1, 3, 8, 15, 5, 11, 7, 41]);
    assert.equal(bit.rangeSum(2, 6).value, 30);

    // 5. Binary move-up message check for j = 6 -> 8 (0-based index 5)
    const upd5 = bit.update(5, 1);
    assert.equal(upd5.ok, true);
    assert.ok(
        upd5.steps.some(
            (s) =>
                s.type === "move-up" &&
                s.message.includes("j = 6 (0110), lowbit 2 (0010): next j = 6 + 2 = 8 (1000)."),
        ),
        "update move-up message should show binary transition 6 -> 8",
    );

    // 6. Multi-step left walk & overlapping prefix walks: rangeSum(5, 6) visits right [7, 6, 4] and left [5, 4]
    const overlapRes = bit.rangeSum(5, 6);
    assert.equal(overlapRes.ok, true);
    assert.equal(overlapRes.value, 7 + 7); // a[5] became 7 (6+1), a[6] is 7
    assertValidSteps(overlapRes, "rangeSum", 8, "rangeSum(5, 6)");
    assert.deepEqual(
        overlapRes.steps.filter((s) => s.type === "range-right").map((s) => s.index),
        [7, 6, 4],
    );
    assert.deepEqual(
        overlapRes.steps.filter((s) => s.type === "range-left").map((s) => s.index),
        [5, 4],
    );
    assert.ok(
        overlapRes.steps.some((s) => s.type === "move-down" && s.line === 8 && s.index === 5),
        "rangeSum(5, 6) should emit move-down on line 8 for left walk 5 -> 4",
    );

    // 7. Negative leftSum is parenthesized in rangeSum messages (never "x - -y")
    const negBit = FenwickTree.from([-5, 1, 10, 4]).value;
    const negRange = negBit.rangeSum(2, 3);
    assert.equal(negRange.ok, true);
    assert.equal(negRange.value, 14);
    assert.ok(
        negRange.steps.every((s) => !s.message.includes("- -")),
        "negative leftSum must be parenthesized instead of emitting '- -'",
    );
    assert.ok(
        negRange.steps[negRange.steps.length - 1].message.includes("10 - (-4) = 14"),
        "done message should format negative leftSum with parentheses",
    );
});

test("edge cases: n=1, n=32, range boundaries, set after overflow updates, and clear", () => {
    // n = 1
    const one = new FenwickTree(1);
    const b1 = one.build([42]);
    assert.equal(b1.ok, true);
    assertValidSteps(b1, "build", 1, "n=1 build");
    assert.equal(b1.steps.filter((s) => s.type === "add").length, 0);
    assert.equal(one.prefixSum(0).value, 42);
    const r1 = one.rangeSum(0, 0);
    assert.equal(r1.ok, true);
    assert.equal(r1.value, 42);
    assert.equal(r1.steps.filter((s) => s.type === "range-left").length, 0);

    // set with delta === 0 produces clean single done step
    const sameSet = one.set(0, 42);
    assert.equal(sameSet.ok, true);
    assert.equal(sameSet.value, 42);
    assertValidSteps(sameSet, "set", 1, "set no-op");
    assert.equal(sameSet.steps.length, 1);
    assert.equal(sameSet.steps[0].type, "done");
    assert.equal(sameSet.steps[0].line, 1);

    // set(i, value) succeeds even when prior updates pushed a[i] beyond -999..999
    assert.equal(one.update(0, 999).ok, true);
    assert.equal(one.update(0, 999).ok, true);
    assert.equal(one.toArray()[0], 2040);
    const resetRes = one.set(0, -999);
    assert.equal(resetRes.ok, true);
    assert.equal(resetRes.value, -999);
    assertValidSteps(resetRes, "set", 1, "set after large updates");
    assert.equal(one.integrityError(), null);
    assert.equal(one.prefixSum(0).value, -999);

    // clear keeps current size
    const clr = one.clear();
    assert.equal(clr.ok, true);
    assert.equal(clr.value, 1);
    assertValidSteps(clr, "clear", 1, "n=1 clear");
    assert.deepEqual(one.toArray(), [0]);
    assert.equal(one.integrityError(), null);

    // n = 32
    const vals32 = Array.from({ length: 32 }, (_, i) => i + 1);
    const res32 = FenwickTree.from(vals32);
    assert.equal(res32.ok, true);
    const bit32 = res32.value;
    assertValidSteps(res32, "build", 32, "n=32 build");
    assert.equal(bit32.integrityError(), null);
    assert.equal(bit32.prefixSum(31).value, (32 * 33) / 2);

    const upd32 = bit32.update(0, 10);
    assert.equal(upd32.ok, true);
    assert.deepEqual(
        upd32.steps.filter((s) => s.type === "add").map((s) => s.index),
        [1, 2, 4, 8, 16, 32],
    );
    assert.ok(
        upd32.steps.some((s) => s.message.includes("100000")),
        "n=32 should format 32 using 6-bit binary",
    );

    const pre30 = bit32.prefixSum(30);
    assert.equal(pre30.ok, true);
    assert.deepEqual(
        pre30.steps.filter((s) => s.type === "visit").map((s) => s.index),
        [31, 30, 28, 24, 16],
    );

    // l = 0 and l = r on multi-element tree
    const rLeftZero = bit32.rangeSum(0, 5);
    assert.equal(rLeftZero.ok, true);
    assert.equal(rLeftZero.value, 11 + 2 + 3 + 4 + 5 + 6);
    assert.equal(rLeftZero.steps.filter((s) => s.type === "range-left").length, 0);

    const rSingle = bit32.rangeSum(17, 17);
    assert.equal(rSingle.ok, true);
    assert.equal(rSingle.value, 18);
});

test("invalid operation inputs return fail with empty steps and leave state untouched", () => {
    const bit = FenwickTree.from([5, -3, 10, 0]).value;
    const beforeSnap = bit.snapshot();

    const failures = [
        bit.update(-1, 5),
        bit.update(4, 5),
        bit.update(1.5, 5),
        bit.update(NaN, 5),
        bit.update("0", 5),
        bit.update(0, 1000),
        bit.update(0, -1000),
        bit.update(0, 2.5),
        bit.update(0, NaN),
        bit.update(0, "5"),

        bit.set(-1, 5),
        bit.set(4, 5),
        bit.set(0.5, 5),
        bit.set("1", 5),
        bit.set(0, 1000),
        bit.set(0, -1000),
        bit.set(0, Infinity),
        bit.set(0, "10"),

        bit.prefixSum(-1),
        bit.prefixSum(4),
        bit.prefixSum(1.2),
        bit.prefixSum(NaN),
        bit.prefixSum("2"),

        bit.rangeSum(3, 1), // l > r
        bit.rangeSum(-1, 2),
        bit.rangeSum(0, 4),
        bit.rangeSum(NaN, 2),
        bit.rangeSum(1, "3"),

        bit.build([]),
        bit.build(new Array(33).fill(1)),
        bit.build([1, 1000]),
        bit.build([1, -1000]),
        bit.build([1, 2.5]),
        bit.build([1, NaN]),
        bit.build([1, "2"]),
        bit.build("not-an-array"),

        FenwickTree.from([]),
        FenwickTree.from(new Array(33).fill(0)),
        FenwickTree.from([999, 1000]),
        FenwickTree.from(null),
    ];

    for (const res of failures) {
        assert.equal(res.ok, false);
        assert.equal(typeof res.error, "string");
        assert.ok(res.error.length > 0);
        assert.deepEqual(res.steps, []);
    }

    assert.deepEqual(bit.snapshot(), beforeSnap);
    assert.equal(bit.integrityError(), null);
});

test("-0 normalization across inputs, results, arrays, and step snapshots", () => {
    const res = FenwickTree.from([-0, 0, -0, 0]);
    assert.equal(res.ok, true);
    const bit = res.value;
    assertValidSteps(res, "build", 4, "from(-0)");
    for (const v of bit.toArray()) assertNotNegZero(v, "toArray");
    for (const t of bit.treeArray()) assertNotNegZero(t, "treeArray");

    const upd = bit.update(-0, -0);
    assert.equal(upd.ok, true);
    assertNotNegZero(upd.value, "update(-0, -0)");
    assertValidSteps(upd, "update", 4, "update(-0, -0)");

    const setRes = bit.set(-0, -0);
    assert.equal(setRes.ok, true);
    assertNotNegZero(setRes.value, "set(-0, -0)");
    assertValidSteps(setRes, "set", 4, "set(-0, -0)");

    const pre = bit.prefixSum(-0);
    assert.equal(pre.ok, true);
    assertNotNegZero(pre.value, "prefixSum(-0)");
    assertValidSteps(pre, "prefixSum", 4, "prefixSum(-0)");

    const rng = bit.rangeSum(-0, -0);
    assert.equal(rng.ok, true);
    assertNotNegZero(rng.value, "rangeSum(-0, -0)");
    assertValidSteps(rng, "rangeSum", 4, "rangeSum(-0, -0)");
});

test("defensive copies: mutating snapshots and inspection arrays cannot corrupt the tree", () => {
    const callerInput = [3, 1, 4, 1, 5];
    const bit = FenwickTree.from(callerInput).value;
    callerInput[0] = -999;
    assert.deepEqual(bit.toArray(), [3, 1, 4, 1, 5]);

    const rebuildInput = [3, 1, 4, 1, 5];
    assert.equal(bit.build(rebuildInput).ok, true);
    rebuildInput[4] = -888;
    assert.deepEqual(bit.toArray(), [3, 1, 4, 1, 5]);

    const arr = bit.toArray();
    arr[0] = 9999;
    const tree = bit.treeArray();
    tree[1] = 9999;
    const snap = bit.snapshot();
    snap.values[2] = -9999;
    snap.tree[4] = -9999;

    const upd = bit.update(1, 2);
    upd.steps[0].snapshot.values[0] = 777;
    upd.steps[0].snapshot.tree[2] = 777;
    upd.steps[0].indices.push(999);

    assert.deepEqual(bit.toArray(), [3, 3, 4, 1, 5]);
    assert.equal(bit.integrityError(), null);
    assert.equal(bit.prefixSum(4).value, 16);
});

test("integrityError() detects internal corruption", () => {
    const bit = FenwickTree.from([2, 4, 6, 8]).value;
    assert.equal(bit.integrityError(), null);

    // Corrupt a Fenwick cell
    bit._tree[4] += 1;
    assert.match(bit.integrityError(), /tree\[4\]/);
    bit._tree[4] -= 1;
    assert.equal(bit.integrityError(), null);

    // Corrupt header slot tree[0]
    bit._tree[0] = 1;
    assert.match(bit.integrityError(), /tree\[0\]/);
    bit._tree[0] = 0;

    // Corrupt values[i] with non-integer
    const orig = bit._values[1];
    bit._values[1] = 1.5;
    assert.match(bit.integrityError(), /values\[1\]/);
    bit._values[1] = orig;

    // Corrupt tree[j] with NaN
    const origTree = bit._tree[2];
    bit._tree[2] = NaN;
    assert.match(bit.integrityError(), /tree\[2\]/);
    bit._tree[2] = origTree;

    // Length mismatch
    bit._tree.push(0);
    assert.match(bit.integrityError(), /tree length mismatch/);
    bit._tree.pop();

    bit._values.pop();
    assert.match(bit.integrityError(), /values length mismatch/);
});

test("300 seeded mulberry32 sequences match plain array model and invariants after every op", () => {
    const rand = seeded(0xF314159);

    for (let seq = 0; seq < 300; seq++) {
        // Ensure boundary sizes 1 and 32 are explicitly hit early in the suite
        const initSize = seq === 0 ? 1 : seq === 1 ? 32 : randInt(rand, 1, 32);
        let model = Array.from({ length: initSize }, () => randInt(rand, -999, 999));

        const fromRes = FenwickTree.from(model);
        assert.equal(fromRes.ok, true, `seq ${seq}: FenwickTree.from ok`);
        const bit = fromRes.value;
        assertValidSteps(fromRes, "build", model.length, `seq ${seq} from`);
        assert.equal(bit.integrityError(), null, `seq ${seq} from integrity`);
        assert.deepEqual(bit.toArray(), model, `seq ${seq} from toArray`);

        const opsCount = 28;
        for (let stepIdx = 0; stepIdx < opsCount; stepIdx++) {
            const roll = rand();
            const label = `seq ${seq} op ${stepIdx}`;

            if (roll < 0.25) {
                const i = randInt(rand, 0, model.length - 1);
                const delta = randInt(rand, -999, 999);
                model[i] += delta;
                const res = bit.update(i, delta);
                assert.equal(res.ok, true, `${label} update ok`);
                assert.equal(res.value, model[i], `${label} update value`);
                assertValidSteps(res, "update", model.length, `${label} update`);
            } else if (roll < 0.45) {
                const i = randInt(rand, 0, model.length - 1);
                const value = randInt(rand, -999, 999);
                model[i] = value;
                const res = bit.set(i, value);
                assert.equal(res.ok, true, `${label} set ok`);
                assert.equal(res.value, value, `${label} set value`);
                assertValidSteps(res, "set", model.length, `${label} set`);
            } else if (roll < 0.70) {
                const i = randInt(rand, 0, model.length - 1);
                const expected = plainRangeSum(model, 0, i);
                const res = bit.prefixSum(i);
                assert.equal(res.ok, true, `${label} prefixSum ok`);
                assert.equal(res.value, expected, `${label} prefixSum(${i})`);
                assertValidSteps(res, "prefixSum", model.length, `${label} prefixSum`);
            } else if (roll < 0.92) {
                let l = randInt(rand, 0, model.length - 1);
                let r = randInt(rand, 0, model.length - 1);
                if (l > r) [l, r] = [r, l];
                const expected = plainRangeSum(model, l, r);
                const res = bit.rangeSum(l, r);
                assert.equal(res.ok, true, `${label} rangeSum ok`);
                assert.equal(res.value, expected, `${label} rangeSum(${l}, ${r})`);
                assertValidSteps(res, "rangeSum", model.length, `${label} rangeSum`);
            } else if (roll < 0.97) {
                const nextSize = randInt(rand, 1, 32);
                model = Array.from({ length: nextSize }, () => randInt(rand, -999, 999));
                const res = bit.build(model);
                assert.equal(res.ok, true, `${label} build ok`);
                assert.deepEqual(res.value, model, `${label} build value`);
                assertValidSteps(res, "build", model.length, `${label} build`);
            } else {
                model = new Array(model.length).fill(0);
                const res = bit.clear();
                assert.equal(res.ok, true, `${label} clear ok`);
                assert.equal(res.value, model.length, `${label} clear value`);
                assertValidSteps(res, "clear", model.length, `${label} clear`);
            }

            assert.deepEqual(bit.toArray(), model, `${label}: toArray matches model`);
            assert.equal(bit.size, model.length, `${label}: size matches model`);
            assert.equal(bit.integrityError(), null, `${label}: integrityError === null`);
        }
    }
});
