import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutCompleteTree, layoutBinaryTree } from "../src/core/tree-layout.js";
import { BinarySearchTree } from "../src/structures/bst.js";

const SIZES = [0, 1, 2, 3, 7, 31, 63];

test("layoutCompleteTree: n = 0 returns empty geometry", () => {
    assert.deepEqual(layoutCompleteTree(0), { nodes: [], edges: [], width: 0, height: 0 });
});

test("layoutCompleteTree: invariants hold for n = 0, 1, 2, 3, 7, 31, 63", () => {
    const levelGap = 70;
    const minGap = 46;

    for (const n of SIZES) {
        const layout = layoutCompleteTree(n, { levelGap, minGap });
        assert.equal(layout.nodes.length, n, `n=${n}: node count`);
        assert.equal(layout.edges.length, Math.max(0, n - 1), `n=${n}: edge count`);

        if (n === 0) continue;

        // Every node has matching index, depth, y = depth * levelGap, and x within [0, width].
        const byLevel = new Map();
        for (let i = 0; i < n; i++) {
            const node = layout.nodes[i];
            assert.equal(node.index, i, `n=${n}: index`);
            assert.equal(node.depth, Math.floor(Math.log2(i + 1)), `n=${n}: depth of ${i}`);
            assert.equal(node.y, node.depth * levelGap, `n=${n}: y of ${i}`);
            assert.ok(node.x > 0 && node.x < layout.width, `n=${n}: x=${node.x} inside (0, ${layout.width})`);
            if (!byLevel.has(node.depth)) byLevel.set(node.depth, []);
            byLevel.get(node.depth).push(node);
        }

        // Height matches maxDepth * levelGap.
        const maxDepth = Math.floor(Math.log2(n));
        assert.equal(layout.height, maxDepth * levelGap, `n=${n}: height`);

        // No two nodes on the same level overlap (x differs by >= minGap), ordered left to right.
        for (const [depth, row] of byLevel.entries()) {
            for (let k = 1; k < row.length; k++) {
                const dx = row[k].x - row[k - 1].x;
                assert.ok(dx >= minGap, `n=${n} depth=${depth}: gap ${dx} < minGap ${minGap}`);
            }
            if (depth === maxDepth && row.length >= 2) {
                assert.equal(row[1].x - row[0].x, minGap, `n=${n}: deepest leaves should be exactly minGap apart`);
            }
        }

        // Every edge is strictly parent -> child (to === 2*from + 1 or 2*from + 2).
        for (const edge of layout.edges) {
            assert.ok(
                edge.to === 2 * edge.from + 1 || edge.to === 2 * edge.from + 2,
                `n=${n}: bad edge ${edge.from} -> ${edge.to}`,
            );
        }

        // Each parent's x is centred between its children (and right of a sole left child).
        for (let i = 0; i < n; i++) {
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            const p = layout.nodes[i];
            if (left < n && right < n) {
                const lNode = layout.nodes[left];
                const rNode = layout.nodes[right];
                assert.ok(lNode.x < p.x && p.x < rNode.x, `n=${n}: parent ${i} not between children`);
                assert.equal(p.x, (lNode.x + rNode.x) / 2, `n=${n}: parent ${i} not centred over children`);
            } else if (left < n) {
                const lNode = layout.nodes[left];
                assert.ok(lNode.x < p.x, `n=${n}: sole left child ${left} should be left of parent ${i}`);
            }
        }
    }
});

test("layoutCompleteTree: rejects invalid arguments", () => {
    for (const badN of [-1, 1.5, NaN, "7", null]) {
        assert.throws(() => layoutCompleteTree(badN), RangeError);
    }
    assert.throws(() => layoutCompleteTree(5, { levelGap: 0 }), RangeError);
    assert.throws(() => layoutCompleteTree(5, { minGap: -10 }), RangeError);
    assert.throws(() => layoutCompleteTree(5, { levelGap: NaN }), RangeError);
});

/* ---------------- layoutBinaryTree ---------------- */

function assertBinaryLayoutInvariants(snapshot, { levelGap = 72, minGap = 48 } = {}, label = "") {
    const layout = layoutBinaryTree(snapshot, { levelGap, minGap });
    const bySnapId = new Map(snapshot.nodes.map((n) => [n.id, n]));
    const byLayoutId = new Map(layout.nodes.map((n) => [n.id, n]));

    assert.equal(layout.nodes.length, snapshot.nodes.length, `${label}: node count`);
    assert.equal(layout.width, layout.nodes.length * minGap, `${label}: exact width`);

    if (layout.nodes.length === 0) {
        assert.deepEqual(layout, { nodes: [], edges: [], width: 0, height: 0 });
        return layout;
    }

    // Check y === depth * levelGap and exact height = maxDepth * levelGap.
    let maxDepth = 0;
    for (const node of layout.nodes) {
        assert.equal(node.y, node.depth * levelGap, `${label}: y of node ${node.id}`);
        assert.ok(node.x > 0 && node.x < layout.width, `${label}: x inside (0, width)`);
        if (node.depth > maxDepth) maxDepth = node.depth;
    }
    assert.equal(layout.height, maxDepth * levelGap, `${label}: exact height`);

    // No two nodes share an x; every pair differs by >= minGap.
    const sortedX = layout.nodes.map((n) => n.x).sort((a, b) => a - b);
    for (let i = 1; i < sortedX.length; i++) {
        assert.ok(
            sortedX[i] - sortedX[i - 1] >= minGap,
            `${label}: x gap ${sortedX[i] - sortedX[i - 1]} < minGap ${minGap}`,
        );
    }

    // Every left child has x < parent.x and every right child has x > parent.x.
    const expectedEdges = [];
    for (const snapNode of snapshot.nodes) {
        const parent = byLayoutId.get(snapNode.id);
        assert.ok(parent, `${label}: missing layout node ${snapNode.id}`);
        if (snapNode.left !== null) {
            const left = byLayoutId.get(snapNode.left);
            assert.ok(left, `${label}: missing left child ${snapNode.left}`);
            assert.ok(left.x < parent.x, `${label}: left child ${left.id} not left of ${parent.id}`);
            assert.equal(left.depth, parent.depth + 1, `${label}: left child depth`);
            expectedEdges.push({ from: snapNode.id, to: snapNode.left });
        }
        if (snapNode.right !== null) {
            const right = byLayoutId.get(snapNode.right);
            assert.ok(right, `${label}: missing right child ${snapNode.right}`);
            assert.ok(right.x > parent.x, `${label}: right child ${right.id} not right of ${parent.id}`);
            assert.equal(right.depth, parent.depth + 1, `${label}: right child depth`);
            expectedEdges.push({ from: snapNode.id, to: snapNode.right });
        }
    }

    // Edges match parent->child ids exactly.
    assert.equal(layout.edges.length, expectedEdges.length, `${label}: edge count`);
    const edgeKey = (e) => `${e.from}->${e.to}`;
    assert.deepEqual(
        layout.edges.map(edgeKey).sort(),
        expectedEdges.map(edgeKey).sort(),
        `${label}: edges match parent->child ids`,
    );

    // Root sits at depth 0, y = 0.
    const rootLayout = byLayoutId.get(snapshot.rootId);
    assert.ok(bySnapId.has(snapshot.rootId));
    assert.equal(rootLayout.depth, 0, `${label}: root depth`);
    assert.equal(rootLayout.y, 0, `${label}: root y`);

    return layout;
}

test("layoutBinaryTree: empty and null snapshots return empty geometry", () => {
    const empty = { nodes: [], edges: [], width: 0, height: 0 };
    assert.deepEqual(layoutBinaryTree({ nodes: [], rootId: null }), empty);
    assert.deepEqual(layoutBinaryTree(null), empty);
    assert.deepEqual(layoutBinaryTree(undefined), empty);
    assert.deepEqual(layoutBinaryTree({ nodes: [{ id: 1, value: 10, left: null, right: null }], rootId: null }), empty);
    assert.deepEqual(layoutBinaryTree({ nodes: [{ id: 1, value: 10, left: null, right: null }], rootId: 999 }), empty);
});

test("layoutBinaryTree: single node geometry", () => {
    const snap = { nodes: [{ id: 1, value: 42, left: null, right: null }], rootId: 1 };
    const layout = assertBinaryLayoutInvariants(snap, { levelGap: 80, minGap: 50 }, "single");
    assert.deepEqual(layout, {
        nodes: [{ id: 1, depth: 0, x: 25, y: 0 }],
        edges: [],
        width: 50,
        height: 0,
    });
});

test("layoutBinaryTree: left-skewed, right-skewed, balanced, and arbitrary BST snapshots", () => {
    const cases = [
        { name: "left-skewed", keys: [50, 40, 30, 20, 10] },
        { name: "right-skewed", keys: [10, 20, 30, 40, 50] },
        { name: "balanced-7", keys: [40, 20, 60, 10, 30, 50, 70] },
        { name: "zigzag", keys: [50, 10, 40, 20, 30, 90, 60, 80, 70] },
        { name: "negatives-and-zero", keys: [0, -25, 25, -40, -10, 10, 40, -5, 5] },
    ];

    for (const c of cases) {
        const bst = new BinarySearchTree(31);
        for (const k of c.keys) bst.insert(k);
        assertBinaryLayoutInvariants(bst.snapshot(), { levelGap: 72, minGap: 48 }, c.name);
    }

    // Also test after several deletions (including root two-child delete).
    const bst = new BinarySearchTree(31);
    for (const k of [50, 25, 75, 12, 37, 62, 87, 55, 68, 65, 70]) bst.insert(k);
    bst.delete(50);
    bst.delete(25);
    assertBinaryLayoutInvariants(bst.snapshot(), { levelGap: 64, minGap: 40 }, "after-deletes");
});

test("layoutBinaryTree: guards against malformed cycles cleanly", () => {
    const cyclic = {
        rootId: 1,
        nodes: [
            { id: 1, value: 10, left: 2, right: null },
            { id: 2, value: 5, left: 1, right: 2 },
        ],
    };
    const layout = layoutBinaryTree(cyclic, { levelGap: 70, minGap: 50 });
    assert.equal(layout.nodes.length, 2);
    assert.equal(layout.edges.length, 1);
    assert.deepEqual(layout.edges, [{ from: 1, to: 2 }]);
    assert.equal(layout.width, 100);
    assert.equal(layout.height, 70);
});

test("layoutBinaryTree: rejects invalid options and malformed snapshot types", () => {
    const snap = { nodes: [{ id: 1, value: 1, left: null, right: null }], rootId: 1 };
    assert.throws(() => layoutBinaryTree(snap, { levelGap: 0 }), RangeError);
    assert.throws(() => layoutBinaryTree(snap, { minGap: -5 }), RangeError);
    assert.throws(() => layoutBinaryTree(snap, { levelGap: NaN }), RangeError);
    assert.throws(() => layoutBinaryTree(snap, { minGap: Infinity }), RangeError);
    assert.throws(() => layoutBinaryTree("not-an-object"), TypeError);
    assert.throws(() => layoutBinaryTree({ rootId: 1 }), TypeError);
});
