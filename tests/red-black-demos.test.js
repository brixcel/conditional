// Checks the case-demo presets used by red-black-tree.html (C21): every start tree is a
// valid red-black tree and the operation triggers exactly the fix-up cases its label names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RB_DEMOS, DEFAULT_DEMO, parseShape } from "../src/pages/red-black-demos.js";
import { RedBlackTree, INSERT_CASES, DELETE_CASES } from "../src/structures/red-black.js";

test("default demo exists", () => {
    assert.ok(RB_DEMOS[DEFAULT_DEMO]);
});

test("parseShape builds pre-order ids and rejects bad text", () => {
    assert.deepEqual(parseShape("20B(10R,-)"), {
        rootId: 1,
        nodes: [
            { id: 1, value: 20, color: "black", left: 2, right: null },
            { id: 2, value: 10, color: "red", left: null, right: null },
        ],
    });
    assert.throws(() => parseShape("20X"), SyntaxError);
    assert.throws(() => parseShape("20B(10R"), SyntaxError);
});

for (const [key, demo] of Object.entries(RB_DEMOS)) {
    test(`demo ${key}: valid start tree, ${demo.op} ${demo.key} uses ${demo.fixes.join(", ") || "no fix-up case"}`, () => {
        const tree = RedBlackTree.fromSnapshot(parseShape(demo.shape));
        assert.equal(tree.integrityError(), null);
        const res = demo.op === "insert" ? tree.insert(demo.key) : tree.delete(demo.key);
        assert.equal(res.ok, true, res.error);
        assert.deepEqual(res.value.fixes.map((f) => `${f.case}:${f.side}`), demo.fixes);
        assert.equal(tree.integrityError(), null);
        // The label names every case number it demonstrates.
        const table = demo.op === "insert" ? INSERT_CASES : DELETE_CASES;
        for (const f of res.value.fixes) assert.match(demo.label, new RegExp(`\\b${table[f.case].number}\\b`));
        // The first frame shows the start tree (identical keys and colours).
        const first = res.steps[0].snapshot.nodes.map((n) => `${n.value}${n.color[0]}`);
        const start = parseShape(demo.shape).nodes.slice().sort((a, b) => a.value - b.value).map((n) => `${n.value}${n.color[0]}`);
        assert.deepEqual(first, start);
    });
}

test("demos cover every insert case and every delete case on both sides where it applies", () => {
    const seen = new Set();
    for (const d of Object.values(RB_DEMOS)) for (const f of d.fixes) seen.add(`${d.op}:${f}`);
    for (const c of Object.keys(INSERT_CASES)) for (const s of ["left", "right"]) assert.ok(seen.has(`insert:${c}:${s}`), `insert ${c} ${s}`);
    for (const c of Object.keys(DELETE_CASES)) for (const s of ["left", "right"]) assert.ok(seen.has(`delete:${c}:${s}`), `delete ${c} ${s}`);
});
