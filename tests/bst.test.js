import { test } from "node:test";
import assert from "node:assert/strict";
import { BinarySearchTree, BSTNode, BST_INFO, TRAVERSAL_ORDERS } from "../src/structures/bst.js";

function seeded(seed) {
    // mulberry32 PRNG, matching the other suites for reproducible failures.
    return () => {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ---------------- Independent reference BST (for exact height() check) ---------------- */

function refInsert(root, value) {
    if (root === null) return { value, left: null, right: null };
    if (value < root.value) root.left = refInsert(root.left, value);
    else if (value > root.value) root.right = refInsert(root.right, value);
    return root;
}

function refDelete(root, value) {
    if (root === null) return null;
    if (value < root.value) {
        root.left = refDelete(root.left, value);
        return root;
    }
    if (value > root.value) {
        root.right = refDelete(root.right, value);
        return root;
    }
    if (root.left === null) return root.right;
    if (root.right === null) return root.left;
    // In-order successor (minimum of right subtree)
    let succ = root.right;
    while (succ.left !== null) succ = succ.left;
    root.value = succ.value;
    root.right = refDelete(root.right, succ.value);
    return root;
}

function refHeight(root) {
    if (root === null) return -1;
    return 1 + Math.max(refHeight(root.left), refHeight(root.right));
}

function assertValidSteps(result, label = "") {
    assert.ok(Array.isArray(result.steps), `${label}: steps is array`);
    assert.ok(result.steps.length >= 1, `${label}: at least one step`);
    for (let i = 0; i < result.steps.length; i++) {
        const s = result.steps[i];
        const lines = BST_INFO.pseudocode[s.operation];
        assert.ok(Array.isArray(lines), `${label} step ${i}: unknown operation "${s.operation}"`);
        assert.ok(
            Number.isInteger(s.line) && s.line >= 1 && s.line <= lines.length,
            `${label} step ${i}: line ${s.line} out of 1..${lines.length} for ${s.operation}`,
        );
        assert.equal(typeof s.type, "string", `${label} step ${i}: type`);
        assert.equal(typeof s.message, "string", `${label} step ${i}: message`);
        assert.ok(s.message.length > 0, `${label} step ${i}: non-empty message`);
        assert.ok(Array.isArray(s.nodeIds), `${label} step ${i}: nodeIds array`);
        assert.ok(Array.isArray(s.pathIds), `${label} step ${i}: pathIds array`);
        assert.ok(Number.isInteger(s.comparisons) && s.comparisons >= 0, `${label} step ${i}: comparisons`);
        if (i > 0) {
            assert.ok(s.comparisons >= result.steps[i - 1].comparisons, `${label} step ${i}: comparisons decreased`);
        }
        assert.ok(s.snapshot && Array.isArray(s.snapshot.nodes), `${label} step ${i}: snapshot`);
    }
}

function assertMatchesModel(bst, sortedModel, refRoot, label) {
    assert.equal(bst.integrityError(), null, `${label}: integrityError`);
    assert.deepEqual(bst.toArray(), sortedModel, `${label}: toArray`);
    assert.equal(bst.size, sortedModel.length, `${label}: size`);
    assert.equal(bst.isEmpty(), sortedModel.length === 0, `${label}: isEmpty`);
    assert.equal(bst.isFull(), sortedModel.length === bst.capacity, `${label}: isFull`);
    assert.equal(bst.height(), refHeight(refRoot), `${label}: exact height`);

    const minRes = bst.min();
    const maxRes = bst.max();
    assertValidSteps(minRes, `${label} min`);
    assertValidSteps(maxRes, `${label} max`);

    if (sortedModel.length === 0) {
        assert.equal(minRes.ok, false, `${label}: min empty fails`);
        assert.equal(maxRes.ok, false, `${label}: max empty fails`);
    } else {
        assert.equal(minRes.ok, true, `${label}: min ok`);
        assert.equal(minRes.value.value, sortedModel[0], `${label}: min value`);
        assert.equal(maxRes.ok, true, `${label}: max ok`);
        assert.equal(maxRes.value.value, sortedModel[sortedModel.length - 1], `${label}: max value`);
    }
}

/* ---------------- 300 seeded random sequences property test ---------------- */

test("BST: matches sorted-array model and reference BST over 300 seeded random sequences", () => {
    const rand = seeded(202608);

    for (let round = 0; round < 300; round++) {
        const cap = 1 + Math.floor(rand() * BinarySearchTree.MAX_CAPACITY);
        const bst = new BinarySearchTree(cap);
        let sorted = [];
        let refRoot = null;

        for (let op = 0; op < 65; op++) {
            const label = `round=${round} op=${op}`;
            const r = rand();
            // Values in -50..50 (101 integers) so duplicates and all 3 delete cases happen often.
            const randomKey = Math.floor(rand() * 101) - 50;

            // Capture a prior snapshot to verify deep-copy immutability after this operation.
            const beforeSnap = bst.snapshot();
            const beforeClone = structuredClone(beforeSnap);

            let res;
            if (r < 0.48) {
                // Insert (sometimes deliberately pick an existing key to exercise duplicates)
                const key = sorted.length > 0 && rand() < 0.18
                    ? sorted[Math.floor(rand() * sorted.length)]
                    : randomKey;
                const alreadyPresent = sorted.includes(key);
                const wasFull = sorted.length >= cap;
                res = bst.insert(key);
                assertValidSteps(res, `${label} insert(${key})`);

                if (alreadyPresent) {
                    // Duplicate is reported even when the tree is also full.
                    assert.equal(res.ok, false, `${label}: duplicate insert should fail`);
                    assert.match(res.error, /already/i);
                    assert.equal(res.steps.at(-1).type, "duplicate");
                } else if (wasFull) {
                    assert.equal(res.ok, false, `${label}: full insert should fail`);
                    assert.match(res.error, /overflow/i);
                } else {
                    assert.equal(res.ok, true, `${label}: insert(${key}) failed: ${res.error}`);
                    assert.equal(res.value.value, key);
                    assert.ok(Number.isInteger(res.value.id) && res.value.id >= 1);
                    sorted.push(key);
                    sorted.sort((a, b) => a - b);
                    refRoot = refInsert(refRoot, key);
                }
            } else if (r < 0.80) {
                // Delete (pick existing key ~70% of the time when non-empty to hit all 3 delete cases)
                const key = sorted.length > 0 && rand() < 0.72
                    ? sorted[Math.floor(rand() * sorted.length)]
                    : randomKey;
                const idx = sorted.indexOf(key);
                res = bst.delete(key);
                assertValidSteps(res, `${label} delete(${key})`);

                if (sorted.length === 0) {
                    assert.equal(res.ok, false, `${label}: delete empty should fail`);
                    assert.match(res.error, /empty/i);
                } else if (idx === -1) {
                    assert.equal(res.ok, false, `${label}: delete missing should fail`);
                    assert.match(res.error, /not in the BST/i);
                } else {
                    assert.equal(res.ok, true, `${label}: delete(${key}) failed: ${res.error}`);
                    assert.equal(res.value.value, key);
                    sorted.splice(idx, 1);
                    refRoot = refDelete(refRoot, key);
                }
            } else if (r < 0.97) {
                // Search
                const key = sorted.length > 0 && rand() < 0.65
                    ? sorted[Math.floor(rand() * sorted.length)]
                    : randomKey;
                const present = sorted.includes(key);
                res = bst.search(key);
                assertValidSteps(res, `${label} search(${key})`);
                assert.equal(res.ok, true);
                assert.equal(res.value.found, present, `${label}: search found mismatch`);
                assert.equal(res.value.value, key);
                if (present) {
                    assert.ok(Number.isInteger(res.value.id) && res.value.id >= 1);
                    assert.equal(res.steps.at(-1).type, "found");
                } else {
                    assert.equal(res.value.id, null, `${label}: not-found id must be null (no -1 sentinel)`);
                    assert.equal(res.steps.at(-1).type, "not-found");
                }
            } else {
                // Occasional clear
                res = bst.clear();
                assertValidSteps(res, `${label} clear`);
                assert.equal(res.ok, true);
                assert.equal(res.value, sorted.length);
                sorted = [];
                refRoot = null;
            }

            // Snapshot taken BEFORE this operation must remain completely untouched.
            assert.deepEqual(beforeSnap, beforeClone, `${label}: prior snapshot mutated`);

            // Mutating a returned step's snapshot must not affect the live tree.
            const lastSnap = res.steps.at(-1).snapshot;
            if (lastSnap.nodes.length > 0) {
                lastSnap.nodes[0].value = 999999;
                lastSnap.nodes[0].left = -999;
            }
            assertMatchesModel(bst, sorted, refRoot, label);
        }
    }
});

/* ---------------- Real node objects & stable ids ---------------- */

test("BST: uses real BSTNode objects with stable monotonically increasing ids", () => {
    const bst = new BinarySearchTree();
    assert.equal(bst.capacity, BinarySearchTree.MAX_CAPACITY);

    const r1 = bst.insert(20);
    const r2 = bst.insert(10);
    const r3 = bst.insert(30);
    assert.ok(bst.root instanceof BSTNode);
    assert.ok(bst.root.left instanceof BSTNode);
    assert.ok(bst.root.right instanceof BSTNode);
    assert.equal(Object.prototype.hasOwnProperty.call(bst, "items"), false);

    assert.equal(r1.value.id, 1);
    assert.equal(r2.value.id, 2);
    assert.equal(r3.value.id, 3);
    assert.equal(bst.root.id, 1);
    assert.equal(bst.root.left.id, 2);
    assert.equal(bst.root.right.id, 3);

    // Deleting a node and inserting a new one continues monotonic ids (never reuses deleted id).
    bst.delete(10);
    const r4 = bst.insert(15);
    assert.equal(r4.value.id, 4);
    assert.equal(bst.root.id, 1);
    assert.equal(bst.root.right.id, 3);
});

/* ---------------- Delete cases (especially root 0, 1, 2 children) ---------------- */

test("BST delete: root with 0 children (leaf) empties tree", () => {
    const bst = new BinarySearchTree(10);
    bst.insert(42);
    const res = bst.delete(42);
    assertValidSteps(res, "delete root leaf");
    assert.equal(res.ok, true);
    assert.equal(res.value.case, "leaf");
    assert.equal(res.steps.at(-2).type, "delete-leaf");
    assert.equal(res.steps.at(-1).type, "done");
    assert.equal(res.steps.at(-1).snapshot.size, 0);
    assert.equal(bst.root, null);
    assert.equal(bst.size, 0);
    assert.equal(bst.height(), -1);
    assert.equal(bst.integrityError(), null);
});

test("BST delete: root with 1 child (left only, and right only)", () => {
    // Left child only
    const leftTree = new BinarySearchTree(10);
    leftTree.insert(50);
    leftTree.insert(25);
    leftTree.insert(10);
    const leftRes = leftTree.delete(50);
    assertValidSteps(leftRes, "delete root 1 left child");
    assert.equal(leftRes.ok, true);
    assert.equal(leftRes.value.case, "one-child");
    assert.equal(leftRes.steps.at(-2).type, "delete-one-child");
    assert.equal(leftRes.steps.at(-1).type, "done");
    assert.equal(leftTree.root.value, 25);
    assert.deepEqual(leftTree.toArray(), [10, 25]);
    assert.equal(leftTree.integrityError(), null);

    // Right child only
    const rightTree = new BinarySearchTree(10);
    rightTree.insert(50);
    rightTree.insert(75);
    rightTree.insert(90);
    const rightRes = rightTree.delete(50);
    assertValidSteps(rightRes, "delete root 1 right child");
    assert.equal(rightRes.ok, true);
    assert.equal(rightRes.value.case, "one-child");
    assert.equal(rightRes.steps.at(-2).type, "delete-one-child");
    assert.equal(rightRes.steps.at(-1).type, "done");
    assert.equal(rightTree.root.value, 75);
    assert.deepEqual(rightTree.toArray(), [75, 90]);
    assert.equal(rightTree.integrityError(), null);
});

test("BST delete: root with 2 children — successor is direct right child (with its own right child)", () => {
    //       50
    //      /  \
    //    20    70
    //            \
    //            85
    //           /  \
    //         80    90
    const bst = new BinarySearchTree(15);
    for (const v of [50, 20, 70, 85, 80, 90]) bst.insert(v);
    const rootId = bst.root.id;

    const res = bst.delete(50);
    assertValidSteps(res, "delete root 2-child direct successor");
    assert.equal(res.ok, true);
    assert.equal(res.value.case, "two-children");
    assert.equal(res.value.successorValue, 70);

    const types = res.steps.map((s) => s.type);
    assert.ok(types.includes("find-successor"), "must include find-successor step");
    assert.ok(types.includes("copy-successor"), "must include copy-successor step");
    assert.equal(types.at(-1), "done");

    const findStep = res.steps.find((s) => s.type === "find-successor");
    const copyStep = res.steps.find((s) => s.type === "copy-successor");
    assert.match(findStep.message, /in-order successor/i);
    assert.match(copyStep.message, /in-order successor/i);

    assert.equal(bst.root.id, rootId, "root node keeps its stable id");
    assert.equal(bst.root.value, 70);
    assert.equal(bst.root.right.value, 85, "successor's right child must be relinked to root.right");
    assert.deepEqual(bst.toArray(), [20, 70, 80, 85, 90]);
    assert.equal(bst.size, 5);
    assert.equal(bst.integrityError(), null);
});

test("BST delete: root with 2 children — successor is deep left descendant with its own right subtree", () => {
    //         50
    //        /  \
    //      20    80
    //           /  \
    //         65    90
    //        /  \
    //      55    70
    //        \
    //        60
    //       /  \
    //     58    62
    const bst = new BinarySearchTree(20);
    for (const v of [50, 20, 80, 65, 90, 55, 70, 60, 58, 62]) bst.insert(v);

    const res = bst.delete(50);
    assertValidSteps(res, "delete root 2-child deep successor");
    assert.equal(res.ok, true);
    assert.equal(res.value.case, "two-children");
    assert.equal(res.value.successorValue, 55);

    const findSteps = res.steps.filter((s) => s.type === "find-successor");
    assert.equal(findSteps.length, 3, "should record find-successor at 80, 65, and 55");
    for (const s of findSteps) assert.match(s.message, /in-order successor/i);
    assert.ok(res.steps.some((s) => s.type === "copy-successor"));

    // 55 replaced 50; 55's right subtree (rooted at 60) must now be 65's left child!
    assert.equal(bst.root.value, 55);
    assert.equal(bst.root.right.value, 80);
    assert.equal(bst.root.right.left.value, 65);
    assert.equal(bst.root.right.left.left.value, 60);
    assert.deepEqual(bst.toArray(), [20, 55, 58, 60, 62, 65, 70, 80, 90]);
    assert.equal(bst.size, 9);
    assert.equal(bst.integrityError(), null);
});

test("BST delete: empty tree and missing value fail with readable errors", () => {
    const bst = new BinarySearchTree(5);
    const emptyRes = bst.delete(10);
    assertValidSteps(emptyRes, "delete empty");
    assert.equal(emptyRes.ok, false);
    assert.match(emptyRes.error, /empty/i);
    assert.equal(emptyRes.steps[0].type, "empty");

    bst.insert(10);
    bst.insert(5);
    const missRes = bst.delete(7);
    assertValidSteps(missRes, "delete missing");
    assert.equal(missRes.ok, false);
    assert.match(missRes.error, /not in the BST/i);
    assert.equal(missRes.steps.at(-1).type, "not-found");
    assert.equal(bst.size, 2);
});

/* ---------------- Duplicate insert, 0 and negatives, capacity overflow ---------------- */

test("BST insert: duplicate fails with search path to existing node", () => {
    const bst = new BinarySearchTree(10);
    const r50 = bst.insert(50);
    const r30 = bst.insert(30);
    const r40 = bst.insert(40);

    const dup = bst.insert(40);
    assertValidSteps(dup, "duplicate insert");
    assert.equal(dup.ok, false);
    assert.match(dup.error, /already/i);
    assert.deepEqual(dup.steps.map((s) => s.type), ["go-left", "go-right", "duplicate"]);
    assert.deepEqual(dup.steps.at(-1).pathIds, [r50.value.id, r30.value.id, r40.value.id]);
    assert.deepEqual(dup.steps.at(-1).nodeIds, [r40.value.id]);
    assert.equal(bst.size, 3);
});

test("BST: 0 and negative integers are first-class keys everywhere", () => {
    const bst = new BinarySearchTree(10);
    for (const v of [0, -10, 10, -25, -1, 1, 25]) {
        const res = bst.insert(v);
        assert.equal(res.ok, true, `insert ${v}`);
    }
    assert.deepEqual(bst.toArray(), [-25, -10, -1, 0, 1, 10, 25]);
    assert.equal(bst.search(0).value.found, true);
    assert.equal(bst.search(-25).value.found, true);
    assert.equal(bst.search(-99).value.found, false);
    assert.equal(bst.search(-99).value.id, null);
    assert.equal(bst.min().value.value, -25);
    assert.equal(bst.max().value.value, 25);

    // Deleting 0 (root with 2 children) works cleanly without falsy bugs.
    const delZero = bst.delete(0);
    assert.equal(delZero.ok, true);
    assert.equal(bst.root.value, 1);
    assert.deepEqual(bst.toArray(), [-25, -10, -1, 1, 10, 25]);
    assert.equal(bst.integrityError(), null);
});

test("BST: capacity full overflow (capacity 1 and capacity 31)", () => {
    const tiny = new BinarySearchTree(1);
    assert.equal(tiny.insert(7).ok, true);
    assert.equal(tiny.isFull(), true);
    const overTiny = tiny.insert(8);
    assertValidSteps(overTiny, "overflow cap 1");
    assert.equal(overTiny.ok, false);
    assert.match(overTiny.error, /overflow/i);
    assert.equal(overTiny.steps[0].type, "overflow");
    assert.equal(tiny.size, 1);

    const full = new BinarySearchTree(31);
    for (let i = 1; i <= 31; i++) {
        assert.equal(full.insert(i).ok, true);
    }
    assert.equal(full.isFull(), true);
    assert.equal(full.height(), 30);
    const overFull = full.insert(32);
    assertValidSteps(overFull, "overflow cap 31");
    assert.equal(overFull.ok, false);
    assert.match(overFull.error, /overflow/i);
    assert.equal(full.size, 31);
});

test("BST insert: duplicate into a full tree reports duplicate, not overflow", () => {
    const bst = new BinarySearchTree(3);
    for (const v of [50, 30, 70]) assert.equal(bst.insert(v).ok, true);
    assert.equal(bst.isFull(), true);
    const before = bst.toArray();

    const dup = bst.insert(70);
    assertValidSteps(dup, "duplicate into full");
    assert.equal(dup.ok, false);
    assert.match(dup.error, /already/i);
    assert.doesNotMatch(dup.error, /overflow/i);
    assert.deepEqual(dup.steps.map((s) => s.type), ["go-right", "duplicate"]);
    assert.equal(dup.steps.at(-1).line, 5);
    assert.deepEqual(bst.toArray(), before);
    assert.equal(bst.size, 3);

    // A new key into the same full tree is still an overflow.
    const over = bst.insert(10);
    assertValidSteps(over, "new key into full");
    assert.equal(over.ok, false);
    assert.match(over.error, /overflow/i);
    assert.deepEqual(over.steps.map((s) => s.type), ["overflow"]);
});

test("BST delete: every successful case ends with a done step on the final tree", () => {
    const build = () => {
        const t = new BinarySearchTree(15);
        for (const v of [50, 30, 70, 20, 60, 80, 65]) t.insert(v);
        return t;
    };
    for (const [key, expectedCase] of [[20, "leaf"], [60, "one-child"], [50, "two-children"]]) {
        const t = build();
        const res = t.delete(key);
        assertValidSteps(res, `delete ${key}`);
        assert.equal(res.ok, true);
        assert.equal(res.value.case, expectedCase);
        const last = res.steps.at(-1);
        assert.equal(last.type, "done", `delete ${key} ends with done`);
        assert.equal(last.snapshot.size, 6);
        assert.ok(!last.snapshot.nodes.some((n) => n.value === key), `snapshot no longer holds ${key}`);
    }
});

/* ---------------- All 4 traversals + growing visited array ---------------- */

test("BST traverse: inorder, preorder, postorder, levelorder match hand-written arrays with growing visited", () => {
    //          50
    //        /    \
    //      30      70
    //     /  \    /  \
    //   20   40  60  80
    //       /      \
    //     35        65
    const bst = new BinarySearchTree(15);
    for (const v of [50, 30, 70, 20, 40, 60, 80, 35, 65]) bst.insert(v);

    const expected = {
        inorder: [20, 30, 35, 40, 50, 60, 65, 70, 80],
        preorder: [50, 30, 20, 40, 35, 70, 60, 65, 80],
        postorder: [20, 35, 40, 30, 65, 60, 80, 70, 50],
        levelorder: [50, 30, 70, 20, 40, 60, 80, 35, 65],
    };

    for (const order of TRAVERSAL_ORDERS) {
        const res = bst.traverse(order);
        assertValidSteps(res, `traverse ${order}`);
        assert.equal(res.ok, true);
        assert.deepEqual(res.value, expected[order], `${order} result`);

        const visitSteps = res.steps.filter((s) => s.type === "visit");
        assert.equal(visitSteps.length, expected[order].length, `${order} visit step count`);

        // Verify `visited` grows by 1 element per visit step and is a fresh copy.
        visitSteps.forEach((step, idx) => {
            assert.deepEqual(
                step.visited,
                expected[order].slice(0, idx + 1),
                `${order} step ${idx} growing visited`,
            );
        });
        assert.equal(res.steps.at(-1).type, "done");
        assert.deepEqual(res.steps.at(-1).visited, expected[order]);
    }

    // Empty tree traversals return ok([], [empty step]).
    const empty = new BinarySearchTree(5);
    for (const order of TRAVERSAL_ORDERS) {
        const res = empty.traverse(order);
        assertValidSteps(res, `empty traverse ${order}`);
        assert.equal(res.ok, true);
        assert.deepEqual(res.value, []);
        assert.equal(res.steps[0].type, "empty");
        assert.deepEqual(res.steps[0].visited, []);
    }
});

/* ---------------- height(), min()/max() spine traces, clear() ---------------- */

test("BST: height() edge-count convention, min/max spines, and clear()", () => {
    const bst = new BinarySearchTree(15);
    assert.equal(bst.height(), -1, "empty tree height is -1");

    bst.insert(50);
    assert.equal(bst.height(), 0, "single-node tree height is 0");

    bst.insert(30);
    bst.insert(10);
    bst.insert(70);
    bst.insert(90);
    assert.equal(bst.height(), 2);

    const minRes = bst.min();
    assertValidSteps(minRes, "min");
    assert.equal(minRes.value.value, 10);
    assert.deepEqual(minRes.steps.map((s) => s.type), ["go-left", "go-left", "found"]);

    const maxRes = bst.max();
    assertValidSteps(maxRes, "max");
    assert.equal(maxRes.value.value, 90);
    assert.deepEqual(maxRes.steps.map((s) => s.type), ["go-right", "go-right", "found"]);

    const cleared = bst.clear();
    assertValidSteps(cleared, "clear");
    assert.equal(cleared.ok, true);
    assert.equal(cleared.value, 5);
    assert.equal(bst.size, 0);
    assert.equal(bst.root, null);
    assert.equal(bst.height(), -1);
    assert.equal(bst.integrityError(), null);
});

/* ---------------- integrityError() catches all 4 corruption classes ---------------- */

test("BST integrityError: catches ancestor bound violation, size mismatch, and cycle/shared child", () => {
    // 1. Ancestor bound violation where immediate parent relation looks valid:
    //    root = 50, left = 30, left.right = 60 (60 > 30, so local parent check passes,
    //    but 60 > 50 violates root ancestor bound!).
    const ancestorBroken = new BinarySearchTree(10);
    ancestorBroken.insert(50);
    ancestorBroken.insert(30);
    ancestorBroken.insert(40);
    ancestorBroken.root.left.right.value = 60;
    assert.match(ancestorBroken.integrityError(), /ancestor bound/i);

    // 2. Duplicate value / non-strictly-increasing in-order
    const dupBroken = new BinarySearchTree(10);
    dupBroken.insert(50);
    dupBroken.insert(30);
    dupBroken.root.left.value = 50;
    assert.notEqual(dupBroken.integrityError(), null);

    // 3. Size mismatch
    const sizeBroken = new BinarySearchTree(10);
    sizeBroken.insert(10);
    sizeBroken.insert(20);
    sizeBroken._size = 5;
    assert.match(sizeBroken.integrityError(), /size/i);

    // 4. Cycle / shared child
    const cycleBroken = new BinarySearchTree(10);
    cycleBroken.insert(10);
    cycleBroken.insert(5);
    cycleBroken.root.left.left = cycleBroken.root;
    assert.match(cycleBroken.integrityError(), /cycle|shared/i);

    const sharedBroken = new BinarySearchTree(10);
    sharedBroken.insert(20);
    sharedBroken.insert(10);
    sharedBroken.insert(30);
    sharedBroken.insert(15);
    sharedBroken.root.right.left = sharedBroken.root.left.right;
    assert.match(sharedBroken.integrityError(), /cycle|shared/i);
});

/* ---------------- Bad constructor and argument throws ---------------- */

test("BST: bad constructor capacities and invalid arguments throw", () => {
    for (const badCap of [0, -1, 32, 2.5, NaN, Infinity, "10", null]) {
        assert.throws(() => new BinarySearchTree(badCap), RangeError, `capacity ${badCap}`);
    }

    const bst = new BinarySearchTree(10);
    for (const badKey of [NaN, Infinity, -Infinity, 1.5, -0.1, "5", null, undefined, {}]) {
        assert.throws(() => bst.insert(badKey), TypeError, `insert(${String(badKey)})`);
        assert.throws(() => bst.search(badKey), TypeError, `search(${String(badKey)})`);
        assert.throws(() => bst.delete(badKey), TypeError, `delete(${String(badKey)})`);
    }

    for (const badOrder of ["bfs", "dfs", "INORDER", "", null, undefined, 123]) {
        assert.throws(() => bst.traverse(badOrder), RangeError, `traverse(${String(badOrder)})`);
    }
    assert.equal(bst.size, 0);
});
