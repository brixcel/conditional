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
    vm.runInContext(`${source}\n;globalThis.__AVLTree = AVLTree;`, sandbox);
    return sandbox.__AVLTree;
}

const AVLTree = loadAVL();

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
