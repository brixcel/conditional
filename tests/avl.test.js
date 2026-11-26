/**
 * Tests for src/structures/avl.js (C12). Replaces tests/avl-real.test.js, which
 * tested the legacy avl-tree.js page script; its cases that still apply are kept here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AVLTree, AVLNode, AVL_INFO, INSPECT_KINDS } from "../src/structures/avl.js";

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function build(values, capacity = 31) {
    const t = new AVLTree(capacity);
    for (const v of values) assert.equal(t.insert(v).ok, true, `insert ${v}`);
    assert.equal(t.integrityError(), null);
    return t;
}

/** Compact shape: "20(10,30)", empty child "-", leaf "10". */
function shape(node) {
    if (node === null) return "-";
    if (node.left === null && node.right === null) return String(node.value);
    return `${node.value}(${shape(node.left)},${shape(node.right)})`;
}

function idsByValue(t) {
    const out = new Map();
    const walk = (n) => { if (n) { out.set(n.value, n.id); walk(n.left); walk(n.right); } };
    walk(t.root);
    return out;
}

/**
 * BST order + unique ids inside a step snapshot; returns in-order values.
 * `allowCopy`: the copy-successor frame briefly holds the successor key twice
 * (node and old successor), so order there is non-strict on the right.
 */
function snapInorder(snap, allowCopy = false) {
    const byId = new Map(snap.nodes.map((n) => [n.id, n]));
    assert.equal(byId.size, snap.nodes.length, "snapshot ids are unique");
    const out = [];
    const walk = (id, lo, hi) => {
        if (id === null) return;
        const n = byId.get(id);
        assert.ok(n, `snapshot child id ${id} exists`);
        assert.ok((allowCopy ? n.value >= lo : n.value > lo) && n.value < hi, "snapshot BST order");
        walk(n.left, lo, n.value); out.push(n.value); walk(n.right, n.value, hi);
    };
    walk(snap.rootId, -Infinity, Infinity);
    assert.equal(out.length, snap.nodes.length, "every snapshot node is reachable");
    return out;
}

function checkSteps(res) {
    assert.ok(Array.isArray(res.steps) && res.steps.length > 0, "has steps");
    for (const s of res.steps) {
        const lines = AVL_INFO.pseudocode[s.operation];
        assert.ok(lines, `operation ${s.operation} has pseudocode`);
        assert.ok(Number.isInteger(s.line) && s.line >= 1 && s.line <= lines.length, `line ${s.line} in range`);
        assert.equal(typeof s.message, "string");
        assert.ok(s.message.length > 0);
        assert.ok(Array.isArray(s.nodeIds));
        snapInorder(s.snapshot, s.type === "copy-successor");
        if (s.type === "unbalanced") {
            const pivot = s.snapshot.nodes.find((n) => n.id === s.rotation.pivotId);
            assert.equal(Math.abs(pivot.balance), 2, "pivot is shown with |bf| = 2 before rotating");
            assert.match(s.message, new RegExp(`\\[${s.rotation.case} case\\]`));
        }
    }
}

const rotationSteps = (res) => res.steps.filter((s) => s.rotation);

/* ---------- property test ---------- */

test("300 seeded random insert/delete/search sequences match a sorted-set model", () => {
    let rotations = 0;
    let multiRotationDeletes = 0;
    let stops = 0;
    for (let seq = 0; seq < 300; seq++) {
        const rand = mulberry32(1000 + seq);
        const t = new AVLTree(31);
        const model = new Set();
        for (let op = 0; op < 80; op++) {
            const key = Math.floor(rand() * 101) - 50; // -50..50
            const r = rand();
            let res;
            if (r < 0.55) {
                res = t.insert(key);
                if (model.has(key)) {
                    assert.equal(res.ok, false);
                    assert.match(res.error, /already/);
                } else if (model.size === 31) {
                    assert.equal(res.ok, false);
                    assert.match(res.error, /full/);
                } else {
                    assert.equal(res.ok, true, res.error);
                    model.add(key);
                    assert.ok(res.value.rotations.length <= 1, "insert needs at most one rotation case");
                }
            } else if (r < 0.85) {
                res = t.delete(key);
                assert.equal(res.ok, model.has(key));
                if (res.ok) {
                    model.delete(key);
                    if (res.value.rotations.length > 1) multiRotationDeletes++;
                }
            } else {
                res = t.search(key);
                assert.equal(res.ok, true);
                assert.equal(res.value.found, model.has(key));
                assert.equal(res.value.id === null, !model.has(key));
            }
            checkSteps(res);
            rotations += rotationSteps(res).filter((s) => s.type === "unbalanced").length;
            stops += res.steps.filter((s) => s.type === "stop").length;

            const sorted = [...model].sort((a, b) => a - b);
            assert.deepEqual(t.toArray(), sorted);
            assert.equal(t.size, model.size);
            assert.equal(t.isEmpty(), model.size === 0);
            assert.equal(t.isFull(), model.size === 31);
            const mn = t.min();
            const mx = t.max();
            if (sorted.length === 0) {
                assert.equal(mn.ok, false);
                assert.equal(mx.ok, false);
                assert.equal(t.height(), -1);
            } else {
                assert.equal(mn.value.value, sorted[0]);
                assert.equal(mx.value.value, sorted[sorted.length - 1]);
            }
            assert.equal(t.integrityError(), null, `seq ${seq} op ${op}`);
            assert.ok(t.height() <= 1.44 * Math.log2(t.size + 2), `height ${t.height()} for n=${t.size}`);
            assert.deepEqual(snapInorder(t.snapshot()), sorted);
        }
    }
    assert.ok(rotations > 500, `expected many rotations, got ${rotations}`);
    assert.ok(multiRotationDeletes > 0, "some delete needed more than one rotation");
    assert.ok(stops > 100, `expected early stops, got ${stops}`);
});

/* ---------- the four rotation cases on insert ---------- */

const INSERT_CASES = [
    // [name, build, insert, expected shape, rotate step types]
    ["LL", [30, 20], 10, "20(10,30)", ["rotate-right"]],
    ["RR", [10, 20], 30, "20(10,30)", ["rotate-left"]],
    ["LR", [30, 10], 20, "20(10,30)", ["rotate-left", "rotate-right"]],
    ["RL", [10, 30], 20, "20(10,30)", ["rotate-right", "rotate-left"]],
    ["LL with subtrees", [50, 30, 70, 20, 40], 10, "30(20(10,-),50(40,70))", ["rotate-right"]],
    ["RR with subtrees", [50, 30, 70, 60, 80], 90, "70(50(30,60),80(-,90))", ["rotate-left"]],
    ["LR with subtrees", [50, 20, 70, 10, 30], 25, "30(20(10,25),50(-,70))", ["rotate-left", "rotate-right"]],
    ["RL with subtrees", [50, 30, 80, 70, 90], 75, "70(50(30,-),80(75,90))", ["rotate-right", "rotate-left"]],
];

for (const [name, seq, key, expected, rotateTypes] of INSERT_CASES) {
    test(`insert ${name}: unbalanced state first, then the rotation, gives ${expected}`, () => {
        const t = build(seq);
        const res = t.insert(key);
        assert.equal(res.ok, true);
        checkSteps(res);
        const kase = name.slice(0, 2);
        assert.deepEqual(res.value.rotations.map((r) => r.case), [kase]);
        const rot = rotationSteps(res);
        assert.deepEqual(rot.map((s) => s.type), ["unbalanced", ...rotateTypes]);
        assert.ok(rot.every((s) => s.rotation.case === kase));
        assert.deepEqual(rot.map((s) => s.rotation.stage), rotateTypes.length === 1 ? [0, 1] : [0, 1, 2]);
        // The frame before the first rotation is the plain-BST insert result: key is present, tree unbalanced.
        assert.ok(rot[0].snapshot.nodes.some((n) => n.value === key));
        assert.ok(rot[0].snapshot.nodes.some((n) => Math.abs(n.balance) === 2));
        assert.ok(rot.at(-1).snapshot.nodes.every((n) => Math.abs(n.balance) <= 1));
        assert.equal(shape(t.root), expected);
        assert.equal(t.integrityError(), null);
    });
}

/* ---------- the four rotation cases on delete ---------- */

const DELETE_CASES = [
    // [case, build, delete, expected shape]
    ["LL", [20, 10, 30, 5], 30, "10(5,20)"],
    ["LL", [20, 10, 30, 5, 15], 30, "10(5,20(15,-))"],      // left child even (bf 0): still LL
    ["LR", [20, 10, 30, 15], 30, "15(10,20)"],
    ["RR", [20, 10, 30, 40], 10, "30(20,40)"],
    ["RR", [20, 10, 30, 25, 40], 10, "30(20(-,25),40)"],    // right child even (bf 0): still RR
    ["RL", [20, 10, 30, 25], 10, "25(20,30)"],
];

for (const [kase, seq, key, expected] of DELETE_CASES) {
    test(`delete ${key} from [${seq}]: ${kase} case gives ${expected}`, () => {
        const t = build(seq);
        const res = t.delete(key);
        assert.equal(res.ok, true);
        checkSteps(res);
        assert.deepEqual(res.value.rotations.map((r) => r.case), [kase]);
        const rot = rotationSteps(res);
        assert.equal(rot[0].type, "unbalanced");
        assert.ok(!rot[0].snapshot.nodes.some((n) => n.value === key), "deleted key is gone before the rotation");
        assert.equal(rot.length, kase[0] === kase[1] ? 2 : 3);
        assert.equal(shape(t.root), expected);
        assert.equal(t.integrityError(), null);
    });
}

test("delete can need rotations at two levels (minimal AVL tree of height 3)", () => {
    // Fibonacci tree: deleting the lone leaf on the short side unbalances 8 then 5.
    const t = build([5, 3, 8, 2, 4, 7, 10, 1, 6, 9, 11, 12]);
    assert.equal(shape(t.root), "5(3(2(1,-),4),8(7(6,-),10(9,11(-,12))))");
    const res = t.delete(4);
    assert.equal(res.ok, true);
    checkSteps(res);
    assert.equal(t.integrityError(), null);
    assert.deepEqual(t.toArray(), [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12]);
    // 3 becomes left-heavy (LL at 3), its subtree shrinks, then 5 becomes right-heavy (RR at 5).
    assert.deepEqual(res.value.rotations.map((r) => `${r.case}@${r.pivotValue}`), ["LL@3", "RR@5"]);
    assert.equal(shape(t.root), "8(5(2(1,3),7(6,-)),10(9,11(-,12)))");
});

test("rotation step messages name the case (ported from avl-real)", () => {
    const t = build([20, 10, 30, 40]);
    const res = t.delete(10);
    const unb = res.steps.find((s) => s.type === "unbalanced");
    assert.match(unb.message, /^\[RR case\] 20 has balance factor -2 \(right-heavy\)/);
    const t2 = build([20, 10, 30]);
    assert.equal(rotationSteps(t2.delete(10)).length, 0, "no rotation steps when none is needed");
});

/* ---------- node identity ---------- */

test("node ids are unique and survive rotations", () => {
    const t = build([30, 20]);
    const before = idsByValue(t);
    t.insert(10); // LL: 20 becomes root
    const after = idsByValue(t);
    assert.equal(t.root.value, 20);
    assert.equal(after.get(30), before.get(30));
    assert.equal(after.get(20), before.get(20));
    assert.equal(new Set(after.values()).size, 3);
});

test("unbalanced, rotate and final snapshots share the same node ids", () => {
    const t = build([50, 20, 70, 10, 30]);
    const res = t.insert(25);
    const ids = (s) => s.snapshot.nodes.map((n) => n.id).sort((a, b) => a - b);
    const rot = rotationSteps(res);
    for (const s of rot) assert.deepEqual(ids(s), ids(res.steps.at(-1)));
});

/* ---------- other behaviour ---------- */

test("ascending inserts 1..31 build a perfect tree of height 4", () => {
    const t = build(Array.from({ length: 31 }, (_, i) => i + 1));
    assert.equal(t.height(), 4);
    assert.equal(t.root.value, 16);
    assert.equal(t.isFull(), true);
});

test("duplicate insert is rejected and leaves the tree unchanged", () => {
    const t = build([5, 3]);
    const before = t.snapshot();
    const res = t.insert(5);
    assert.equal(res.ok, false);
    assert.match(res.error, /already/);
    assert.equal(res.steps.at(-1).type, "duplicate");
    assert.deepEqual(t.snapshot(), before);
});

test("delete from an empty tree and delete of a missing key fail without throwing", () => {
    const t = new AVLTree();
    const empty = t.delete(1);
    assert.equal(empty.ok, false);
    assert.match(empty.error, /empty/);
    assert.equal(empty.steps[0].type, "empty");
    const t2 = build([2, 1, 3]);
    const before = t2.snapshot();
    const missing = t2.delete(9);
    assert.equal(missing.ok, false);
    assert.match(missing.error, /not in the AVL tree/);
    assert.equal(missing.steps.at(-1).type, "not-found");
    assert.deepEqual(t2.snapshot(), before);
});

test("deleting a two-child node uses the in-order successor and keeps the node id", () => {
    const t = build([50, 30, 70, 20, 40, 60, 80]);
    const rootId = t.root.id;
    const res = t.delete(50);
    assert.equal(res.ok, true);
    assert.equal(res.value.case, "two-children");
    assert.equal(res.value.successorValue, 60);
    assert.equal(t.root.id, rootId);
    assert.equal(t.root.value, 60);
    assert.deepEqual(t.toArray(), [20, 30, 40, 60, 70, 80]);
    assert.ok(res.steps.some((s) => s.type === "copy-successor"));
    assert.equal(t.integrityError(), null);
});

test("delete leaf / one child cases and deleting everything empties the tree", () => {
    const t = build([2, 1, 3, 4]);
    assert.equal(t.delete(4).value.case, "leaf");
    assert.equal(t.delete(2).value.case, "two-children");
    assert.equal(t.delete(3).value.case, "one-child");
    const last = t.delete(1);
    assert.equal(last.value.case, "leaf");
    assert.equal(t.root, null);
    assert.equal(t.size, 0);
    assert.equal(t.height(), -1);
    assert.match(last.steps.at(-1).message, /now empty/);
});

test("capacity: full tree rejects a new key, duplicate wins over overflow", () => {
    const t = build([1, 2, 3], 3);
    assert.equal(t.isFull(), true);
    const over = t.insert(4);
    assert.equal(over.ok, false);
    assert.match(over.error, /full/);
    assert.equal(over.steps[0].type, "overflow");
    assert.equal(t.size, 3);
    const dup = t.insert(2);
    assert.equal(dup.ok, false);
    assert.match(dup.error, /already/);
    const one = new AVLTree(1);
    assert.equal(one.insert(7).ok, true);
    assert.equal(one.insert(8).ok, false);
    assert.equal(one.delete(7).ok, true);
    assert.equal(one.insert(8).ok, true);
});

test("zero, negative keys and -0", () => {
    const t = build([0, -5, -10, 5]);
    assert.deepEqual(t.toArray(), [-10, -5, 0, 5]);
    assert.equal(t.search(0).value.found, true);
    assert.equal(t.insert(-0).ok, false, "-0 is the same key as 0");
    assert.equal(t.delete(-0).ok, true);
    assert.equal(Object.is(t.search(0).value.value, 0), true);
    assert.equal(t.min().value.value, -10);
    assert.equal(t.integrityError(), null);
});

test("height: empty -1, leaf 0; search on empty is not found with id null", () => {
    const t = new AVLTree();
    assert.equal(t.height(), -1);
    const s = t.search(3);
    assert.deepEqual(s.value, { found: false, id: null, value: 3 });
    t.insert(3);
    assert.equal(t.height(), 0);
    assert.equal(t.min().ok, true);
    assert.equal(new AVLTree().min().ok, false);
    assert.equal(new AVLTree().max().ok, false);
});

test("snapshot is plain data with height and balance per node", () => {
    const t = build([30, 20, 40, 10]);
    const snap = t.snapshot();
    assert.deepEqual(snap.nodes.map((n) => [n.value, n.height, n.balance]), [[10, 0, 0], [20, 1, 1], [30, 2, 1], [40, 0, 0]]);
    assert.equal(snap.rootId, t.root.id);
    snap.nodes[0].value = 999;
    assert.deepEqual(t.toArray(), [10, 20, 30, 40], "snapshot is a copy");
    assert.ok(!(snap.nodes[0] instanceof AVLNode));
});

test("inspect highlights root, leaves and internal nodes", () => {
    const t = build([20, 10, 30, 5]);
    assert.deepEqual(t.inspect("root").value.values, [20]);
    assert.deepEqual(t.inspect("leaves").value.values, [5, 30]);
    assert.deepEqual(t.inspect("internal").value.values, [10, 20]);
    assert.deepEqual(new AVLTree().inspect("leaves").value.values, []);
    assert.deepEqual([...INSPECT_KINDS], ["root", "leaves", "internal"]);
    assert.throws(() => t.inspect("siblings"), RangeError);
});

test("clear empties the tree and reports the count", () => {
    const t = build([1, 2, 3]);
    const res = t.clear();
    assert.equal(res.value, 3);
    assert.equal(t.size, 0);
    assert.equal(t.root, null);
    assert.equal(t.integrityError(), null);
});

test("bad arguments throw (programmer errors)", () => {
    for (const cap of [0, 32, 1.5, "8", NaN, -1]) assert.throws(() => new AVLTree(cap), RangeError, `capacity ${cap}`);
    const t = new AVLTree();
    for (const bad of ["5", 1.5, NaN, Infinity, null, undefined, 2 ** 60]) {
        assert.throws(() => t.insert(bad), TypeError, `insert ${bad}`);
        assert.throws(() => t.delete(bad), TypeError, `delete ${bad}`);
        assert.throws(() => t.search(bad), TypeError, `search ${bad}`);
    }
    assert.equal(t.size, 0);
});

test("integrityError detects corrupted trees", () => {
    const fresh = () => build([20, 10, 30]);
    let t = fresh(); t.root.left.value = 25;
    assert.match(t.integrityError(), /BST order/);
    t = fresh(); t.root.height = 5;
    assert.match(t.integrityError(), /stored height/);
    t = fresh(); t._size = 2;
    assert.match(t.integrityError(), /size/);
    t = fresh(); t.root.right.right = t.root.left;
    assert.ok(t.integrityError() !== null);
    // Unbalanced but with correct heights: a 3-node chain.
    t = new AVLTree();
    const a = new AVLNode(1, 1); const b = new AVLNode(2, 2); const c = new AVLNode(3, 3);
    a.right = b; b.right = c; b.height = 1; a.height = 2;
    t.root = a; t._size = 3;
    assert.match(t.integrityError(), /balance factor -2/);
});

test("AVL_INFO lists operations with complexity", () => {
    for (const op of ["insert", "delete", "search", "min", "max"]) {
        assert.match(AVL_INFO.operations[op].complexity, /O\(log n\)/);
        assert.ok(AVL_INFO.pseudocode[op].length > 0);
    }
});
