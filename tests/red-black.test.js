/**
 * Tests for src/structures/red-black.js (C21).
 * Shapes are written "20B(10R,30R)": key, colour letter, then (left,right) with "-" for empty.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    RedBlackTree, RBNode, RB_INFO, INSERT_CASES, DELETE_CASES, INSPECT_KINDS,
} from "../src/structures/red-black.js";
import { layoutBinaryTree } from "../src/core/tree-layout.js";

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

/* ---------- helpers ---------- */

/** Compact coloured shape of the live tree. */
function shape(node) {
    if (node === null) return "-";
    const self = `${node.value}${node.color === "red" ? "R" : "B"}`;
    if (node.left === null && node.right === null) return self;
    return `${self}(${shape(node.left)},${shape(node.right)})`;
}

/** Parses a shape string into a snapshot { nodes, rootId } (ids in pre-order from 1). */
function parseShape(text) {
    let i = 0;
    let nextId = 1;
    const nodes = [];
    const parse = () => {
        if (text[i] === "-") { i++; return null; }
        const m = /^(-?\d+)([RB])/.exec(text.slice(i));
        assert.ok(m, `bad shape at ${i}: ${text}`);
        i += m[0].length;
        const node = { id: nextId++, value: Number(m[1]), color: m[2] === "R" ? "red" : "black", left: null, right: null };
        nodes.push(node);
        if (text[i] === "(") {
            i++;
            node.left = parse();
            assert.equal(text[i++], ",");
            node.right = parse();
            assert.equal(text[i++], ")");
        }
        return node.id;
    };
    const rootId = text === "" ? null : parse();
    assert.equal(i, text.length, "whole shape parsed");
    return { nodes, rootId };
}

const fromShape = (text, capacity = 31) => {
    const t = RedBlackTree.fromSnapshot(parseShape(text), capacity);
    assert.equal(shape(t.root), text, "hand-built tree round-trips");
    assert.equal(t.integrityError(), null);
    return t;
};

function build(values, capacity = 31) {
    const t = new RedBlackTree(capacity);
    for (const v of values) assert.equal(t.insert(v).ok, true, `insert ${v}`);
    assert.equal(t.integrityError(), null);
    return t;
}

function idsByValue(t) {
    const out = new Map();
    const walk = (n) => { if (n) { out.set(n.value, n.id); walk(n.left); walk(n.right); } };
    walk(t.root);
    return out;
}

/** Validates a snapshot (unique ids, BST order, colours, all nodes reachable); returns in-order keys. */
function snapInorder(snap) {
    const byId = new Map(snap.nodes.map((n) => [n.id, n]));
    assert.equal(byId.size, snap.nodes.length, "snapshot ids are unique");
    const out = [];
    const walk = (id, lo, hi) => {
        if (id === null) return;
        const n = byId.get(id);
        assert.ok(n, `snapshot child id ${id} exists`);
        assert.ok(n.color === "red" || n.color === "black", "snapshot colour");
        assert.ok(n.value > lo && n.value < hi, "snapshot BST order");
        walk(n.left, lo, n.value); out.push(n.value); walk(n.right, n.value, hi);
    };
    walk(snap.rootId, -Infinity, Infinity);
    assert.equal(out.length, snap.nodes.length, "every snapshot node is reachable");
    assert.equal(snap.size, snap.nodes.length, "snapshot size matches nodes");
    const layout = layoutBinaryTree(snap);
    assert.equal(layout.nodes.length, snap.nodes.length, "layoutBinaryTree places every node");
    return out;
}

/** Black height of a snapshot subtree (null leaf 0), assuming the subtree is internally consistent. */
function snapBlackHeight(byId, id) {
    let count = 0;
    for (let n = id === null ? null : byId.get(id); n; n = n.left === null ? null : byId.get(n.left)) {
        if (n.color === "black") count++;
    }
    return count;
}

function checkSteps(res) {
    assert.ok(Array.isArray(res.steps) && res.steps.length > 0, "has steps");
    for (const s of res.steps) {
        const lines = RB_INFO.pseudocode[s.operation];
        assert.ok(lines, `operation ${s.operation} has pseudocode`);
        assert.ok(Number.isInteger(s.line) && s.line >= 1 && s.line <= lines.length, `line ${s.line} in range`);
        assert.equal(typeof s.message, "string");
        assert.ok(s.message.length > 0);
        assert.ok(Array.isArray(s.nodeIds) && Array.isArray(s.pathIds));
        snapInorder(s.snapshot);
        const byId = new Map(s.snapshot.nodes.map((n) => [n.id, n]));
        if (s.fix) {
            const table = s.operation === "insert" ? INSERT_CASES : DELETE_CASES;
            assert.equal(s.fix.number, table[s.fix.case].number);
            assert.match(s.message, new RegExp(`^\\[${s.operation === "insert" ? "Insert" : "Delete"} case ${s.fix.number}: ` +
                `${table[s.fix.case].label} \\(${s.fix.side}\\)\\]`));
        }
        if (s.type === "violation") {
            // Frame before an insert fix: z (nodeIds[0]) and its parent are both red.
            const z = byId.get(s.nodeIds[0]);
            const p = s.snapshot.nodes.find((n) => n.left === z.id || n.right === z.id);
            assert.equal(z.color, "red", "violation frame: z is red");
            assert.equal(p.color, "red", "violation frame: z's parent is red");
            assert.match(s.message, /red-red violation/);
        }
        if (s.type === "double-black" && s.fix) {
            // Frame before a delete fix: x's side is exactly one black short of its sibling's side.
            const { id, parentId, side } = s.doubleBlack;
            const parent = byId.get(parentId);
            assert.equal(parent[side], id, "doubleBlack marker points at x");
            const sib = parent[side === "left" ? "right" : "left"];
            assert.ok(sib !== null, "double black always has a sibling");
            assert.equal(snapBlackHeight(byId, sib), snapBlackHeight(byId, id) + 1, "x's side is one black short");
            assert.ok(id === null || byId.get(id).color === "black", "x is black");
            assert.match(s.message, /[Dd]ouble black/);
        }
    }
}

/* ---------- property test ---------- */

test("300 seeded random insert/delete/search sequences match a sorted-set model", () => {
    const seen = new Map(); // "insert:line:left" → count
    const bump = (k) => seen.set(k, (seen.get(k) ?? 0) + 1);
    let maxInsertRot = 0;
    let maxDeleteRot = 0;
    for (let seq = 0; seq < 300; seq++) {
        const rand = mulberry32(2100 + seq);
        const t = new RedBlackTree(31);
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
                    for (const f of res.value.fixes) bump(`insert:${f.case}:${f.side}`);
                    const rot = res.steps.filter((s) => s.type.startsWith("rotate-")).length;
                    maxInsertRot = Math.max(maxInsertRot, rot);
                    assert.ok(rot <= 2, "insert uses at most 2 rotations");
                }
            } else if (r < 0.85) {
                res = t.delete(key);
                assert.equal(res.ok, model.has(key));
                if (res.ok) {
                    model.delete(key);
                    for (const f of res.value.fixes) bump(`delete:${f.case}:${f.side}`);
                    const rot = res.steps.filter((s) => s.type.startsWith("rotate-")).length;
                    maxDeleteRot = Math.max(maxDeleteRot, rot);
                    assert.ok(rot <= 3, "delete uses at most 3 rotations");
                }
            } else {
                res = t.search(key);
                assert.equal(res.ok, true);
                assert.equal(res.value.found, model.has(key));
                assert.equal(res.value.id === null, !model.has(key));
            }
            checkSteps(res);

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
                assert.equal(t.blackHeight(), 0);
            } else {
                assert.equal(mn.value.value, sorted[0]);
                assert.equal(mx.value.value, sorted[sorted.length - 1]);
            }
            assert.equal(t.integrityError(), null, `seq ${seq} op ${op}`);
            assert.ok(t.height() <= 2 * Math.log2(t.size + 1), `height ${t.height()} for n=${t.size}`);
            assert.deepEqual(snapInorder(t.snapshot()), sorted);
        }
    }
    // Coverage: every fix-up case, both mirrors, happens in the random run.
    for (const kase of Object.keys(INSERT_CASES)) {
        for (const side of ["left", "right"]) assert.ok(seen.get(`insert:${kase}:${side}`) > 0, `insert ${kase} ${side} occurs`);
    }
    for (const kase of Object.keys(DELETE_CASES)) {
        for (const side of ["left", "right"]) assert.ok(seen.get(`delete:${kase}:${side}`) > 0, `delete ${kase} ${side} occurs`);
    }
    assert.equal(maxInsertRot, 2, "some insert needed a double rotation");
    assert.ok(maxDeleteRot >= 2, "some delete needed more than one rotation");
});

/* ---------- insert cases (both mirrors) ---------- */

const INSERT_TESTS = [
    // [title, start shape, key, expected shape, fixes "case:side", step types from the first violation]
    ["case 1 uncle red (left)", "20B(10R,30R)", 5, "20B(10B(5R,-),30B)",
        ["uncle-red:left"], ["violation", "recolor", "check", "root-black"]],
    ["case 1 uncle red (right)", "20B(10R,30R)", 35, "20B(10B,30B(-,35R))",
        ["uncle-red:right"], ["violation", "recolor", "check", "root-black"]],
    ["case 2 triangle then case 3 line (left)", "20B(10R,-)", 15, "15B(10R,20R)",
        ["triangle:left", "line:left"], ["violation", "rotate-left", "violation", "rotate-right", "recolor", "check"]],
    ["case 2 triangle then case 3 line (right)", "20B(-,30R)", 25, "25B(20R,30R)",
        ["triangle:right", "line:right"], ["violation", "rotate-right", "violation", "rotate-left", "recolor", "check"]],
    ["case 3 line (left)", "20B(10R,-)", 5, "10B(5R,20R)",
        ["line:left"], ["violation", "rotate-right", "recolor", "check"]],
    ["case 3 line (right)", "20B(-,30R)", 35, "30B(20R,35R)",
        ["line:right"], ["violation", "rotate-left", "recolor", "check"]],
    ["case 1 moves up, then case 3 at the grandparent (left)", "30B(20R(10B(5R,15R),25B),40B)", 3,
        "20B(10R(5B(3R,-),15B),30R(25B,40B))",
        ["uncle-red:left", "line:left"], ["violation", "recolor", "violation", "rotate-right", "recolor", "check"]],
    ["case 1 moves up, then case 3 at the grandparent (right)", "10B(5B,20R(15B,30B(25R,35R)))", 40,
        "20B(10R(5B,15B),30R(25B,35B(-,40R)))",
        ["uncle-red:right", "line:right"], ["violation", "recolor", "violation", "rotate-left", "recolor", "check"]],
    ["case 1 (right) moves up, then case 2 + 3 (left) at the grandparent", "30B(10R(5B,20B(15R,25R)),40B)", 27,
        "20B(10R(5B,15B),30R(25B(-,27R),40B))",
        ["uncle-red:right", "triangle:left", "line:left"],
        ["violation", "recolor", "violation", "rotate-left", "violation", "rotate-right", "recolor", "check"]],
];

for (const [title, start, key, expected, fixes, types] of INSERT_TESTS) {
    test(`insert ${key} into ${start}: ${title} gives ${expected}`, () => {
        const t = fromShape(start);
        const ids = idsByValue(t);
        const res = t.insert(key);
        assert.equal(res.ok, true, res.error);
        checkSteps(res);
        assert.deepEqual(res.value.fixes.map((f) => `${f.case}:${f.side}`), fixes);
        const first = res.steps.findIndex((s) => s.type === "violation");
        assert.deepEqual(res.steps.slice(first, -1).map((s) => s.type), types);
        // The first violation frame is the plain BST insert: the new red leaf is present.
        const v = res.steps[first];
        assert.ok(v.snapshot.nodes.some((n) => n.value === key && n.color === "red"));
        assert.equal(shape(t.root), expected);
        assert.equal(t.integrityError(), null);
        for (const [value, id] of ids) assert.equal(idsByValue(t).get(value), id, `${value} keeps its node id`);
    });
}

test("insert into an empty tree: red root, then forced black", () => {
    const t = new RedBlackTree();
    const res = t.insert(7);
    checkSteps(res);
    assert.deepEqual(res.steps.map((s) => s.type), ["insert", "check", "root-black", "done"]);
    assert.equal(res.steps[0].snapshot.nodes[0].color, "red", "the new node starts red");
    assert.equal(res.steps[2].snapshot.nodes[0].color, "black");
    assert.equal(shape(t.root), "7B");
    assert.equal(t.blackHeight(), 1);
    assert.equal(t.height(), 0);
});

test("insert under a black parent needs no fix-up", () => {
    const t = fromShape("20B(10B,30B)");
    const res = t.insert(25);
    checkSteps(res);
    assert.deepEqual(res.value.fixes, []);
    assert.equal(res.steps.at(-2).type, "check");
    assert.match(res.steps.at(-2).message, /black: no red-red violation/);
    assert.equal(shape(t.root), "20B(10B,30B(25R,-))");
});

/* ---------- delete cases (both mirrors) ---------- */

const DELETE_TESTS = [
    // [title, start shape, key, expected shape, fixes "case:side"]
    ["case 1 sibling red, then case 2 with a red parent (left)", "10B(5B,20R(15B,25B))", 5, "20B(10B(-,15R),25B)",
        ["sibling-red:left", "black-nephews:left"]],
    ["case 1 sibling red, then case 2 with a red parent (right)", "20B(10R(5B,15B),25B)", 25, "10B(5B,20B(15R,-))",
        ["sibling-red:right", "black-nephews:right"]],
    ["case 2 black nephews, double black reaches the root (left)", "10B(5B,15B)", 5, "10B(-,15R)", ["black-nephews:left"]],
    ["case 2 black nephews, double black reaches the root (right)", "10B(5B,15B)", 15, "10B(5R,-)", ["black-nephews:right"]],
    ["case 2 black nephews, red parent absorbs it (left)", "20B(10R(5B,15B),30B)", 5, "20B(10B(-,15R),30B)", ["black-nephews:left"]],
    ["case 2 black nephews, red parent absorbs it (right)", "20B(10B,30R(25B,35B))", 35, "20B(10B,30B(25R,-))", ["black-nephews:right"]],
    ["case 3 near child red, then case 4 (left)", "10B(5B,20B(15R,-))", 5, "15B(10B,20B)", ["near-red:left", "far-red:left"]],
    ["case 3 near child red, then case 4 (right)", "10B(5B(-,7R),20B)", 20, "7B(5B,10B)", ["near-red:right", "far-red:right"]],
    ["case 4 far child red (left)", "10B(5B,20B(-,25R))", 5, "20B(10B,25B)", ["far-red:left"]],
    ["case 4 far child red (right)", "10B(5B(3R,-),20B)", 20, "5B(3B,10B)", ["far-red:right"]],
    // Both nephews red: case 4 applies directly (case 3 is only for a black far child).
    ["case 4 with both nephews red, one rotation (left)", "10B(5B,20B(15R,25R))", 5, "20B(10B(-,15R),25B)", ["far-red:left"]],
    ["case 4 with both nephews red, one rotation (right)", "10B(5B(3R,7R),20B)", 20, "5B(3B,10B(7R,-))", ["far-red:right"]],
    ["case 4: sibling takes the red parent's colour (left)", "20B(10R(5B,15B(-,17R)),30B)", 5,
        "20B(15R(10B,17B),30B)", ["far-red:left"]],
    ["case 4: sibling takes the red parent's colour (right)", "20B(10B,30R(25B(23R,-),35B))", 35,
        "20B(10B,25R(23B,30B))", ["far-red:right"]],
];

for (const [title, start, key, expected, fixes] of DELETE_TESTS) {
    test(`delete ${key} from ${start}: ${title} gives ${expected}`, () => {
        const t = fromShape(start);
        const ids = idsByValue(t);
        const res = t.delete(key);
        assert.equal(res.ok, true, res.error);
        checkSteps(res);
        assert.equal(res.value.removedColor, "black");
        assert.deepEqual(res.value.fixes.map((f) => `${f.case}:${f.side}`), fixes);
        // Every fix is introduced by a double-black frame naming it, before its recolour/rotation.
        const fixFrames = res.steps.filter((s) => s.type === "double-black" && s.fix);
        assert.deepEqual(fixFrames.map((s) => `${s.fix.case}:${s.fix.side}`), fixes);
        for (const f of fixFrames) {
            const idx = res.steps.indexOf(f);
            assert.equal(res.steps[idx + 1].fix.case, f.fix.case, "the fix follows its double-black frame");
            assert.ok(!f.snapshot.nodes.some((n) => n.value === key), "deleted key is gone before the fix");
        }
        assert.ok(res.steps.some((s) => /"double black"/.test(s.message)), "the double black concept is named");
        assert.equal(shape(t.root), expected);
        assert.equal(t.integrityError(), null);
        for (const [value, id] of ids) if (value !== key) assert.equal(idsByValue(t).get(value), id, `${value} keeps its id`);
    });
}

test("delete a red leaf: no fix-up", () => {
    const t = fromShape("10B(5R,15R)");
    const res = t.delete(15);
    checkSteps(res);
    assert.equal(res.value.case, "leaf");
    assert.equal(res.value.removedColor, "red");
    assert.deepEqual(res.value.fixes, []);
    assert.equal(res.steps.at(-2).type, "check");
    assert.match(res.steps.at(-2).message, /removed colour was red/);
    assert.equal(shape(t.root), "10B(5R,-)");
});

test("delete a black node with one red child: the child turns black", () => {
    const t = fromShape("10B(5B(3R,-),15B)");
    const res = t.delete(5);
    checkSteps(res);
    assert.equal(res.value.case, "one-child");
    assert.deepEqual(res.value.fixes, []);
    const rec = res.steps.find((s) => s.type === "recolor");
    assert.match(rec.message, /red-and-black/);
    assert.equal(shape(t.root), "10B(3B,15B)");
});

test("two-child delete moves the in-order successor node (ids stay with their keys)", () => {
    const t = fromShape("20B(10B(5R,15R),30B(25R,35R))");
    const ids = idsByValue(t);
    const res = t.delete(20);
    checkSteps(res);
    assert.equal(res.value.case, "two-children");
    assert.equal(res.value.successorValue, 25);
    assert.equal(res.value.id, ids.get(20), "the deleted key's node leaves");
    assert.equal(res.value.removedColor, "red", "the successor's old colour is the one removed");
    assert.equal(t.root.id, ids.get(25), "successor node moved up with its id");
    assert.equal(shape(t.root), "25B(10B(5R,15R),30B(-,35R))", "successor took the root's black");
    assert.ok(res.steps.some((s) => s.type === "find-successor"));
    // Successor deeper than z's right child (red successor, so no fix-up).
    const t2 = fromShape("20B(10B,40R(30B(25R,-),50B))");
    const r2 = t2.delete(20);
    checkSteps(r2);
    assert.equal(r2.value.successorValue, 25);
    assert.equal(shape(t2.root), "25B(10B,40R(30B,50B))");
    // Successor is z's right child itself.
    const t3 = fromShape("10B(5B,15B)");
    const r3 = t3.delete(10);
    checkSteps(r3);
    assert.equal(r3.value.successorValue, 15);
    assert.deepEqual(r3.value.fixes.map((f) => f.case), ["black-nephews"]);
    assert.equal(shape(t3.root), "15B(5R,-)");
    assert.equal(t3.integrityError(), null);
});

test("deleting the last node empties the tree", () => {
    const t = build([4]);
    const res = t.delete(4);
    assert.equal(res.ok, true);
    checkSteps(res);
    assert.equal(t.root, null);
    assert.equal(t.size, 0);
    assert.equal(t.height(), -1);
    assert.equal(t.blackHeight(), 0);
    assert.match(res.steps.at(-1).message, /now empty/);
});

/* ---------- node identity ---------- */

test("node ids are unique and survive rotations and recolourings", () => {
    const t = build([10, 20]);
    const before = idsByValue(t);
    const res = t.insert(30); // line case: rotate left at 10
    const after = idsByValue(t);
    assert.equal(t.root.value, 20);
    assert.equal(after.get(10), before.get(10));
    assert.equal(after.get(20), before.get(20));
    assert.equal(new Set(after.values()).size, 3);
    const idSet = (s) => s.snapshot.nodes.map((n) => n.id).sort((a, b) => a - b);
    for (const s of res.steps.filter((x) => x.fix)) assert.deepEqual(idSet(s), idSet(res.steps.at(-1)));
});

test("fromSnapshot keeps ids and new nodes get fresh ids", () => {
    const t = fromShape("20B(10R,30R)");
    const res = t.insert(40);
    assert.equal(res.value.id, 4);
    assert.throws(() => RedBlackTree.fromSnapshot(parseShape("20R(10B,30B)")), /root .* red/);
    assert.throws(() => RedBlackTree.fromSnapshot(parseShape("20B(10R(5R,-),30B)")), /red-red/);
    assert.throws(() => RedBlackTree.fromSnapshot(parseShape("20B(10B,-)")), /black height/);
    assert.throws(() => RedBlackTree.fromSnapshot(parseShape("20B(10R,30R)"), 2), RangeError);
    assert.throws(() => RedBlackTree.fromSnapshot(null), TypeError);
    assert.equal(RedBlackTree.fromSnapshot({ nodes: [], rootId: null }).size, 0);
});

/* ---------- other behaviour ---------- */

test("ascending inserts 1..31 stay within the 2·log2(n+1) height bound", () => {
    const t = new RedBlackTree();
    for (let i = 1; i <= 31; i++) {
        assert.equal(t.insert(i).ok, true);
        assert.equal(t.integrityError(), null);
        assert.ok(t.height() <= 2 * Math.log2(t.size + 1), `height ${t.height()} at n=${t.size}`);
    }
    assert.equal(t.isFull(), true);
    assert.equal(t.height(), 7);
    assert.equal(t.blackHeight(), 4);
    for (let i = 31; i >= 1; i--) {
        assert.equal(t.delete(i).ok, true);
        assert.equal(t.integrityError(), null, `after deleting ${i}`);
    }
    assert.equal(t.isEmpty(), true);
});

test("duplicate insert is rejected and leaves the tree unchanged", () => {
    const t = build([5, 3]);
    const before = t.snapshot();
    const res = t.insert(5);
    assert.equal(res.ok, false);
    assert.match(res.error, /5 is already in the red-black tree/);
    assert.equal(res.steps.at(-1).type, "duplicate");
    assert.deepEqual(t.snapshot(), before);
});

test("delete from an empty tree and delete of a missing key fail without throwing", () => {
    const t = new RedBlackTree();
    const empty = t.delete(1);
    assert.equal(empty.ok, false);
    assert.match(empty.error, /empty/);
    assert.equal(empty.steps[0].type, "empty");
    const t2 = build([2, 1, 3]);
    const before = t2.snapshot();
    const missing = t2.delete(9);
    assert.equal(missing.ok, false);
    assert.match(missing.error, /not in the red-black tree/);
    assert.equal(missing.steps.at(-1).type, "not-found");
    assert.deepEqual(t2.snapshot(), before);
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
    const one = new RedBlackTree(1);
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
    assert.equal(t.search(0).value.found, false);
    const z = build([-0]);
    assert.equal(Object.is(z.root.value, 0), true, "-0 is stored as 0");
    assert.equal(t.min().value.value, -10);
    assert.equal(t.integrityError(), null);
});

test("height and blackHeight conventions; search/min/max on empty", () => {
    const t = new RedBlackTree();
    assert.equal(t.height(), -1);
    assert.equal(t.blackHeight(), 0);
    assert.deepEqual(t.search(3).value, { found: false, id: null, value: 3 });
    assert.equal(t.min().ok, false);
    assert.match(t.max().error, /empty/);
    const u = fromShape("20B(10B(5R,-),30B)");
    assert.equal(u.height(), 2);
    assert.equal(u.blackHeight(), 2);
    assert.deepEqual([u.min().value.value, u.max().value.value], [5, 30]);
    checkSteps(u.min());
    checkSteps(u.search(5));
    checkSteps(u.search(6));
});

test("snapshot is plain data with a colour per node", () => {
    const t = fromShape("20B(10R,30R)");
    const snap = t.snapshot();
    assert.deepEqual(snap.nodes.map((n) => [n.value, n.color]), [[10, "red"], [20, "black"], [30, "red"]]);
    assert.deepEqual(Object.keys(snap.nodes[0]).sort(), ["color", "id", "left", "right", "value"]);
    assert.equal(snap.rootId, t.root.id);
    snap.nodes[0].value = 999;
    assert.deepEqual(t.toArray(), [10, 20, 30], "snapshot is a copy");
    assert.ok(!(snap.nodes[0] instanceof RBNode));
});

test("inspect highlights root, leaves, internal, red and black nodes", () => {
    const t = fromShape("20B(10B(5R,-),30B)");
    assert.deepEqual(t.inspect("root").value.values, [20]);
    assert.deepEqual(t.inspect("leaves").value.values, [5, 30]);
    assert.deepEqual(t.inspect("internal").value.values, [10, 20]);
    assert.deepEqual(t.inspect("red").value.values, [5]);
    assert.deepEqual(t.inspect("black").value.values, [10, 20, 30]);
    assert.deepEqual(new RedBlackTree().inspect("leaves").value.values, []);
    assert.deepEqual([...INSPECT_KINDS], ["root", "leaves", "internal", "red", "black"]);
    assert.throws(() => t.inspect("siblings"), RangeError);
    for (const k of INSPECT_KINDS) checkSteps(t.inspect(k));
});

test("clear empties the tree and reports the count", () => {
    const t = build([1, 2, 3]);
    const res = t.clear();
    assert.equal(res.value, 3);
    assert.equal(t.size, 0);
    assert.equal(t.root, null);
    assert.equal(t.integrityError(), null);
    checkSteps(res);
});

test("bad arguments throw (programmer errors)", () => {
    for (const cap of [0, 32, 1.5, "8", NaN, -1]) assert.throws(() => new RedBlackTree(cap), RangeError, `capacity ${cap}`);
    const t = new RedBlackTree();
    for (const bad of ["5", 1.5, NaN, Infinity, null, undefined, 2 ** 60]) {
        assert.throws(() => t.insert(bad), TypeError, `insert ${bad}`);
        assert.throws(() => t.delete(bad), TypeError, `delete ${bad}`);
        assert.throws(() => t.search(bad), TypeError, `search ${bad}`);
    }
    assert.equal(t.size, 0);
});

test("integrityError detects every broken rule", () => {
    const fresh = () => fromShape("20B(10B(5R,-),30B)");
    let t = fresh(); t.root.left.value = 25;
    assert.match(t.integrityError(), /BST order/);
    t = fresh(); t.root.left.left.value = 15; // deeper node violates an ancestor bound only
    assert.match(t.integrityError(), /BST order/);
    t = fresh(); t.root.color = "red";
    assert.match(t.integrityError(), /root .* red/);
    t = fresh(); t.root.left.color = "red";
    assert.match(t.integrityError(), /red-red/);
    t = fresh(); t.root.left.left.color = "black";
    assert.match(t.integrityError(), /black height/);
    t = fresh(); t.root.right.color = "green";
    assert.match(t.integrityError(), /invalid colour/);
    t = fresh(); t._size = 3;
    assert.match(t.integrityError(), /size/);
    t = fresh(); t.root.right.left = t.root.left.left;
    assert.match(t.integrityError(), /reachable twice|parent pointer/);
    t = fresh(); t.root.left.left.parent = t.root;
    assert.match(t.integrityError(), /parent pointer/);
    t = fresh(); t.root.parent = t.root.left;
    assert.match(t.integrityError(), /root .* parent/);
    t = fresh(); t.root.right.id = t.root.id;
    assert.match(t.integrityError(), /duplicate node id/);
});

test("RB_INFO lists operations with complexity and every step line is valid", () => {
    for (const op of ["insert", "delete", "search", "min", "max"]) {
        assert.match(RB_INFO.operations[op].complexity, /O\(log n\)/);
        assert.ok(RB_INFO.pseudocode[op].length > 0);
    }
    assert.deepEqual(Object.values(INSERT_CASES).map((c) => c.number), [1, 2, 3]);
    assert.deepEqual(Object.values(DELETE_CASES).map((c) => c.number), [1, 2, 3, 4]);
});
