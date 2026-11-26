import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutCompleteTree } from "../src/core/tree-layout.js";

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
                if (depth === maxDepth) {
                    assert.equal(dx, minGap, `n=${n}: deepest leaves ${k - 1}..${k} should be exactly minGap apart`);
                }
            }
        }

        // Every edge is strictly parent -> child (to === 2*from + 1 or 2*from + 2) and targets 1..n-1 uniquely.
        const seenTargets = new Set();
        for (const edge of layout.edges) {
            assert.ok(
                edge.to === 2 * edge.from + 1 || edge.to === 2 * edge.from + 2,
                `n=${n}: bad edge ${edge.from} -> ${edge.to}`,
            );
            assert.equal(seenTargets.has(edge.to), false, `n=${n}: duplicate edge target ${edge.to}`);
            seenTargets.add(edge.to);
        }
        assert.equal(seenTargets.size, Math.max(0, n - 1), `n=${n}: edges must cover 1..n-1`);

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
