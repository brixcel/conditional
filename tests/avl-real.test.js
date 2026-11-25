/**
 * Tests the AVL code the page actually loads (avl-tree.js), not a copy.
 * avl-tree.js is a classic browser script, so it runs in a vm sandbox with a
 * minimal DOM stub. Only the pure tree methods (insert / removeNode) are used.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../avl-tree.js", import.meta.url), "utf8");

function loadAVL() {
    const noop = () => {};
    const sandbox = {
        document: { getElementById: () => null, querySelectorAll: () => [] },
        window: { addEventListener: noop },
        alert: noop,
        prompt: () => null,
        console,
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\n;globalThis.__AVL = { AVLTree, TreeView, TreeNode };`, sandbox);
    return sandbox.__AVL;
}

const { AVLTree, TreeView, TreeNode } = loadAVL();

function insertAll(values) {
    const t = new AVLTree();
    for (const v of values) {
        t.root = t.insert(t.root, v, null);
        t.recalculateParents(t.root);
    }
    return t;
}

function remove(t, v) {
    t.root = t.removeNode(t.root, v);
    t.recalculateParents(t.root);
}

function inorder(n, out = []) { if (n) { inorder(n.left, out); out.push(n.value); inorder(n.right, out); } return out; }

/** Asserts BST order, |BF| <= 1, correct stored heights and parent links. Returns height. */
function checkInvariants(n, parent = null) {
    if (!n) return 0;
    assert.equal(n.parent, parent, `parent link of ${n.value}`);
    if (n.left) assert.ok(n.left.value < n.value, `BST order at ${n.value}`);
    if (n.right) assert.ok(n.right.value > n.value, `BST order at ${n.value}`);
    const hl = checkInvariants(n.left, n);
    const hr = checkInvariants(n.right, n);
    assert.ok(Math.abs(hl - hr) <= 1, `balance factor ${hl - hr} at ${n.value}`);
    const h = 1 + Math.max(hl, hr);
    assert.equal(n.height, h, `stored height of ${n.value}`);
    return h;
}

test("LL, RR, LR, RL cases produce the textbook root", () => {
    for (const [seq, root] of [[[30, 20, 10], 20], [[10, 20, 30], 20], [[30, 10, 20], 20], [[10, 30, 20], 20]]) {
        const t = insertAll(seq);
        assert.equal(t.root.value, root, `sequence ${seq}`);
        checkInvariants(t.root);
    }
});

test("ascending inserts 1..31 build a perfectly balanced tree of height 5", () => {
    const t = insertAll(Array.from({ length: 31 }, (_, i) => i + 1));
    assert.equal(checkInvariants(t.root), 5);
});

test("duplicates are ignored", () => {
    const t = insertAll([5, 5, 5, 3]);
    assert.deepEqual(inorder(t.root), [3, 5]);
});

test("random insert/delete sequences keep every AVL invariant", () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let round = 0; round < 150; round++) {
        const t = new AVLTree();
        const present = new Set();
        for (let op = 0; op < 60; op++) {
            const v = 1 + Math.floor(rand() * 50);
            if (rand() < 0.65) {
                t.root = t.insert(t.root, v, null); present.add(v);
            } else {
                t.root = t.removeNode(t.root, v); present.delete(v);
            }
            t.recalculateParents(t.root);
            checkInvariants(t.root);
            assert.deepEqual(inorder(t.root), [...present].sort((a, b) => a - b));
        }
    }
});

test("deleting a node with two children keeps order", () => {
    const t = insertAll([50, 30, 70, 20, 40, 60, 80]);
    remove(t, 50);
    assert.deepEqual(inorder(t.root), [20, 30, 40, 60, 70, 80]);
    checkInvariants(t.root);
});

test("deleting everything empties the tree", () => {
    const t = insertAll([2, 1, 3]);
    [1, 2, 3].forEach(v => remove(t, v));
    assert.equal(t.root, null);
});

/* ---------- C3: node identity, delete rotation messages, pre-rotation snapshots ---------- */

function idsByValue(n, out = new Map()) {
    if (n) { out.set(n.value, n.id); idsByValue(n.left, out); idsByValue(n.right, out); }
    return out;
}

test("node ids are unique and survive rotations", () => {
    const t = new AVLTree();
    t.root = t.insert(t.root, 30, null);
    t.root = t.insert(t.root, 20, null);
    const before = idsByValue(t.root);
    t.root = t.insert(t.root, 10, null); // LL rotation: 20 becomes root
    const after = idsByValue(t.root);
    assert.equal(t.root.value, 20);
    assert.equal(after.get(30), before.get(30));
    assert.equal(after.get(20), before.get(20));
    assert.equal(new Set(after.values()).size, 3);
});

test("deleting can trigger a rotation, and it is explained", () => {
    const t = insertAll([20, 10, 30, 40]);
    t.lastRotationMessage = null;
    remove(t, 10); // 20 becomes right-heavy: RR rotation, 30 moves up
    assert.equal(t.root.value, 30);
    assert.match(t.lastRotationMessage, /\[RR Rotation\] Node 20 became right-heavy/);
});

test("delete messages cover LL, LR, RL and stay null when no rotation happens", () => {
    const cases = [
        [[20, 10, 30, 5], 30, /\[LL Rotation\]/],
        [[20, 10, 30, 15], 30, /\[LR Double Rotation\]/],
        [[20, 10, 30, 25], 10, /\[RL Double Rotation\]/],
    ];
    for (const [seq, del, pattern] of cases) {
        const t = insertAll(seq);
        t.lastRotationMessage = null;
        remove(t, del);
        assert.match(t.lastRotationMessage, pattern, `delete ${del} from ${seq}`);
        checkInvariants(t.root);
    }
    const t = insertAll([20, 10, 30]);
    t.lastRotationMessage = null;
    remove(t, 10);
    assert.equal(t.lastRotationMessage, null);
});

/** Checks BST order inside a snapshot and returns its in-order values. */
function snapInorder(snap) {
    const out = [];
    const walk = (id, lo, hi) => {
        if (id === null) return;
        const n = snap.nodes[id];
        assert.ok(n.value > lo && n.value < hi, "snapshot BST order");
        walk(n.left, lo, n.value); out.push(n.value); walk(n.right, n.value, hi);
    };
    walk(snap.rootId, -Infinity, Infinity);
    return out;
}

test("pre-rotation snapshots are real plain-BST states with the same node ids", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    let rotations = 0;
    for (let round = 0; round < 100; round++) {
        const t = new AVLTree();
        const present = new Set();
        for (let op = 0; op < 40; op++) {
            const v = 1 + Math.floor(rand() * 40);
            const before = TreeView.snapshot(t.root);
            t.lastRotationMessage = null;
            let pre;
            if (!present.has(v)) {
                pre = TreeView.plainInsert(before, v, TreeNode.nextId);
                t.root = t.insert(t.root, v, null);
                present.add(v);
            } else {
                pre = TreeView.plainDelete(before, v);
                t.root = t.removeNode(t.root, v);
                present.delete(v);
            }
            t.recalculateParents(t.root);
            const after = TreeView.snapshot(t.root);
            assert.deepEqual(snapInorder(pre), [...present].sort((a, b) => a - b), "plain BST op gives the same keys");
            assert.deepEqual(Object.keys(pre.nodes).sort(), Object.keys(after.nodes).sort(), "same node ids before and after rebalancing");
            // A node with |BF| > 1 exists in the plain-BST state exactly when AVL rotated.
            assert.equal(TreeView.pivot(pre) !== null, t.lastRotationMessage !== null);
            if (t.lastRotationMessage) rotations++;
        }
    }
    assert.ok(rotations > 50, `expected many rotations to be exercised, got ${rotations}`);
});
