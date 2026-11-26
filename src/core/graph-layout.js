/**
 * Pure, DOM-free graph layout helpers for SVG graph visualizers.
 *
 * Returns plain geometry ({ nodes, width, height }) so graph pages and unit
 * tests can share deterministic vertex coordinates in Node without any DOM.
 */

export const DEFAULT_GRAPH_LAYOUT = Object.freeze({
    radius: 145,
    padding: 48,
});

function assertPositiveNumber(val, name) {
    if (typeof val !== "number" || !Number.isFinite(val) || val <= 0) {
        throw new RangeError(`${name} must be a positive finite number (got ${val})`);
    }
}

function assertNonNegativeNumber(val, name) {
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0) {
        throw new RangeError(`${name} must be a non-negative finite number (got ${val})`);
    }
}

function snapZero(val) {
    return Math.abs(val) < 1e-12 ? 0 : val;
}

/**
 * Places `ids` evenly around a circle of `radius` centred at
 * `(cx, cy) = (padding + radius, padding + radius)`.
 *
 * Geometry guarantees:
 * - For `ids.length === 0`, returns `{ nodes: [], width: 0, height: 0 }`.
 * - For `n >= 1`, `width = height = 2 * (padding + radius)`.
 * - `ids[0]` sits at the top `(cx, cy - radius)` (angle `-Math.PI / 2`),
 *   and subsequent vertices proceed clockwise at angle
 *   `-Math.PI / 2 + (2 * Math.PI * i) / n`.
 * - Every node lies at Euclidean distance `radius` from `(cx, cy)`.
 * - For `n >= 2`, the minimum distance between any two nodes is the adjacent
 *   chord length `2 * radius * Math.sin(Math.PI / n)`.
 *
 * @param {Array<number | string>} ids ordered vertex identifiers to place
 * @param {{ radius?: number, padding?: number }} [options]
 * @returns {{
 *   nodes: Array<{ id: number | string, x: number, y: number }>,
 *   width: number,
 *   height: number
 * }}
 */
export function layoutCircle(
    ids,
    { radius = DEFAULT_GRAPH_LAYOUT.radius, padding = DEFAULT_GRAPH_LAYOUT.padding } = {},
) {
    if (!Array.isArray(ids)) {
        throw new TypeError(`ids must be an array (got ${typeof ids})`);
    }
    assertPositiveNumber(radius, "radius");
    assertNonNegativeNumber(padding, "padding");

    const n = ids.length;
    if (n === 0) {
        return { nodes: [], width: 0, height: 0 };
    }

    const cx = padding + radius;
    const cy = padding + radius;
    const size = 2 * (padding + radius);
    const nodes = new Array(n);

    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const x = cx + radius * snapZero(Math.cos(angle));
        const y = cy + radius * snapZero(Math.sin(angle));
        nodes[i] = { id: ids[i], x, y };
    }

    return { nodes, width: size, height: size };
}
