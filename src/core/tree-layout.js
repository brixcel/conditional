/**
 * Pure, DOM-free tree layout helpers for SVG tree visualizers.
 *
 * Returns plain geometry ({ nodes, edges, width, height }) so both complete
 * array-backed trees (Binary Heap) and future linked trees (BST, AVL) can
 * share consistent coordinates and unit tests in Node.
 */

export const DEFAULT_TREE_LAYOUT = Object.freeze({
    levelGap: 72,
    minGap: 48,
});

function assertPositiveNumber(val, name) {
    if (typeof val !== "number" || !Number.isFinite(val) || val <= 0) {
        throw new RangeError(`${name} must be a positive finite number (got ${val})`);
    }
}

/**
 * Compute coordinates for a 0-indexed complete binary tree of `n` nodes
 * (parent(i) = floor((i - 1) / 2), left(i) = 2i + 1, right(i) = 2i + 2).
 *
 * Geometry guarantees:
 * - Leaves at the deepest level are `minGap` apart horizontally.
 * - Every node at depth `d` sits at `y = d * levelGap`.
 * - Every parent is centred horizontally over its two child slots
 *   (strictly between left and right child x when both exist, and strictly to
 *   the right of a sole left child).
 * - No two nodes on the same level overlap (horizontal distance >= minGap).
 *
 * @param {number} n non-negative integer node count
 * @param {{ levelGap?: number, minGap?: number }} [options]
 * @returns {{
 *   nodes: Array<{ index: number, depth: number, x: number, y: number }>,
 *   edges: Array<{ from: number, to: number }>,
 *   width: number,
 *   height: number
 * }}
 */
export function layoutCompleteTree(n, { levelGap = DEFAULT_TREE_LAYOUT.levelGap, minGap = DEFAULT_TREE_LAYOUT.minGap } = {}) {
    if (!Number.isInteger(n) || n < 0) {
        throw new RangeError(`Node count n must be a non-negative integer (got ${n})`);
    }
    assertPositiveNumber(levelGap, "levelGap");
    assertPositiveNumber(minGap, "minGap");

    if (n === 0) {
        return { nodes: [], edges: [], width: 0, height: 0 };
    }

    const maxDepth = Math.floor(Math.log2(n));
    const bottomSlots = 2 ** maxDepth;
    const width = bottomSlots * minGap;
    const height = maxDepth * levelGap;

    const nodes = new Array(n);
    const edges = [];

    for (let i = 0; i < n; i++) {
        const depth = Math.floor(Math.log2(i + 1));
        const posInLevel = i - (2 ** depth - 1);
        const span = 2 ** (maxDepth - depth);
        const x = (posInLevel + 0.5) * span * minGap;
        const y = depth * levelGap;
        nodes[i] = { index: i, depth, x, y };

        if (i > 0) {
            edges.push({ from: Math.floor((i - 1) / 2), to: i });
        }
    }

    return { nodes, edges, width, height };
}
