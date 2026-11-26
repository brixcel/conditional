import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GRAPH_LAYOUT, layoutCircle } from "../src/core/graph-layout.js";

const EPS = 1e-9;

/**
 * Clockwise angle from 12 o'clock (top) in [0, 2*PI).
 */
function clockwiseAngleFromTop(x, y, cx, cy) {
    let angle = Math.atan2(y - cy, x - cx) + Math.PI / 2;
    if (angle < -EPS) angle += 2 * Math.PI;
    if (Math.abs(angle) < EPS || Math.abs(angle - 2 * Math.PI) < EPS) return 0;
    return angle;
}

test("layoutCircle: n = 0 returns empty geometry", () => {
    assert.deepEqual(layoutCircle([]), { nodes: [], width: 0, height: 0 });
    assert.deepEqual(layoutCircle([], { radius: 100, padding: 20 }), { nodes: [], width: 0, height: 0 });
});

test("layoutCircle: invariants hold for 0, 1, 2, 3, 4, 7, and 12 vertices", () => {
    const counts = [0, 1, 2, 3, 4, 7, 12];
    const radius = DEFAULT_GRAPH_LAYOUT.radius;
    const padding = DEFAULT_GRAPH_LAYOUT.padding;
    const cx = padding + radius;
    const cy = padding + radius;
    const expectedSize = 2 * (padding + radius);

    for (const n of counts) {
        const ids = Array.from({ length: n }, (_, i) => i);
        const layout = layoutCircle(ids);
        assert.equal(layout.nodes.length, n, `n=${n}: node count`);

        if (n === 0) {
            assert.equal(layout.width, 0);
            assert.equal(layout.height, 0);
            continue;
        }

        assert.equal(layout.width, expectedSize, `n=${n}: width`);
        assert.equal(layout.height, expectedSize, `n=${n}: height`);

        // Vertex 0 sits exactly at the top: (cx, cy - radius).
        assert.equal(layout.nodes[0].id, 0, `n=${n}: first id`);
        assert.equal(layout.nodes[0].x, cx, `n=${n}: vertex 0 x === cx`);
        assert.equal(layout.nodes[0].y, cy - radius, `n=${n}: vertex 0 y === cy - radius`);

        // Every node preserves id, sits at distance `radius` from (cx, cy), and stays inside bounds.
        let prevAngle = -1;
        for (let i = 0; i < n; i++) {
            const node = layout.nodes[i];
            assert.equal(node.id, ids[i], `n=${n}: node[${i}] id`);
            const dist = Math.hypot(node.x - cx, node.y - cy);
            assert.ok(
                Math.abs(dist - radius) <= EPS,
                `n=${n} i=${i}: distance ${dist} differs from radius ${radius}`,
            );
            assert.ok(
                node.x >= padding - EPS && node.x <= layout.width - padding + EPS,
                `n=${n} i=${i}: x=${node.x} out of bounds`,
            );
            assert.ok(
                node.y >= padding - EPS && node.y <= layout.height - padding + EPS,
                `n=${n} i=${i}: y=${node.y} out of bounds`,
            );

            // Strictly increasing clockwise angular progression starting from 0 at top.
            const cwAngle = clockwiseAngleFromTop(node.x, node.y, cx, cy);
            const expectedAngle = (2 * Math.PI * i) / n;
            assert.ok(
                Math.abs(cwAngle - expectedAngle) <= EPS,
                `n=${n} i=${i}: clockwise angle ${cwAngle} != expected ${expectedAngle}`,
            );
            assert.ok(cwAngle > prevAngle, `n=${n} i=${i}: not clockwise (${cwAngle} <= ${prevAngle})`);
            prevAngle = cwAngle;
        }

        // For n >= 2, no two nodes are closer than the adjacent chord minimum gap.
        if (n >= 2) {
            const minChord = 2 * radius * Math.sin(Math.PI / n);
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const d = Math.hypot(
                        layout.nodes[i].x - layout.nodes[j].x,
                        layout.nodes[i].y - layout.nodes[j].y,
                    );
                    assert.ok(
                        d + EPS >= minChord,
                        `n=${n}: distance between ${i} and ${j} (${d}) < minChord (${minChord})`,
                    );
                }
            }
        }
    }
});

test("layoutCircle: exact cardinal positions for n = 2 and n = 12 with custom options", () => {
    const layout2 = layoutCircle([10, 20], { radius: 100, padding: 25 });
    assert.equal(layout2.width, 250);
    assert.equal(layout2.height, 250);
    assert.deepEqual(layout2.nodes, [
        { id: 10, x: 125, y: 25 },
        { id: 20, x: 125, y: 225 },
    ]);

    const ids12 = Array.from({ length: 12 }, (_, i) => i);
    const layout12 = layoutCircle(ids12, { radius: 120, padding: 0 });
    assert.equal(layout12.width, 240);
    assert.equal(layout12.height, 240);
    assert.deepEqual(layout12.nodes[0], { id: 0, x: 120, y: 0 }); // 12 o'clock
    assert.deepEqual(layout12.nodes[3], { id: 3, x: 240, y: 120 }); // 3 o'clock
    assert.deepEqual(layout12.nodes[6], { id: 6, x: 120, y: 240 }); // 6 o'clock
    assert.deepEqual(layout12.nodes[9], { id: 9, x: 0, y: 120 }); // 9 o'clock
});

test("layoutCircle: rejects invalid ids and options", () => {
    for (const badIds of [null, undefined, 5, "012", { length: 2 }]) {
        assert.throws(() => layoutCircle(badIds), TypeError);
    }
    for (const badRadius of [0, -1, -100, NaN, Infinity, -Infinity, "100", null]) {
        assert.throws(() => layoutCircle([0, 1], { radius: badRadius }), RangeError);
    }
    for (const badPadding of [-1, -0.01, NaN, Infinity, -Infinity, "20", null]) {
        assert.throws(() => layoutCircle([0, 1], { padding: badPadding }), RangeError);
    }
});
