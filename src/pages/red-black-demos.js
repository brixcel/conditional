/**
 * Red-black tree case demos for red-black-tree.html (C21).
 * Pure data + a tiny shape parser, no DOM, so tests/red-black-demos.test.js can check that
 * every preset is a valid red-black tree and really triggers the fix-up cases it names.
 * Start trees are taken from tests/red-black.test.js (INSERT_TESTS / DELETE_TESTS).
 *
 * Shape syntax (same as the structure tests): "20B(10R,30R)" = key, colour letter,
 * then (left,right) with "-" for an empty child. Ids are assigned in pre-order from 1.
 */

/**
 * Parses a shape string into a snapshot-shaped object `{ nodes, rootId }` for
 * RedBlackTree.fromSnapshot(). Throws SyntaxError on malformed text (presets are code).
 * @param {string} text
 * @returns {{ nodes: Array<{ id: number, value: number, color: string, left: number | null, right: number | null }>, rootId: number | null }}
 */
export function parseShape(text) {
    let i = 0;
    let nextId = 1;
    const nodes = [];
    const expect = (ch) => {
        if (text[i] !== ch) throw new SyntaxError(`expected "${ch}" at ${i} in ${text}`);
        i++;
    };
    const parse = () => {
        if (text[i] === "-") {
            i++;
            return null;
        }
        const m = /^(-?\d+)([RB])/.exec(text.slice(i));
        if (!m) throw new SyntaxError(`bad node at ${i} in ${text}`);
        i += m[0].length;
        const node = { id: nextId++, value: Number(m[1]), color: m[2] === "R" ? "red" : "black", left: null, right: null };
        nodes.push(node);
        if (text[i] === "(") {
            i++;
            node.left = parse();
            expect(",");
            node.right = parse();
            expect(")");
        }
        return node.id;
    };
    const rootId = text === "" ? null : parse();
    if (i !== text.length) throw new SyntaxError(`trailing text at ${i} in ${text}`);
    return { nodes, rootId };
}

/**
 * Demo presets. `fixes` lists the expected "case:side" sequence (checked by tests).
 * Keys are the <option> values in red-black-tree.html.
 */
export const RB_DEMOS = Object.freeze({
    "insert-1-left": { group: "insert", shape: "20B(10R,30R)", op: "insert", key: 5, fixes: ["uncle-red:left"],
        label: "Insert case 1, uncle red (left): 20B(10R,30R), insert 5" },
    "insert-1-right": { group: "insert", shape: "20B(10R,30R)", op: "insert", key: 35, fixes: ["uncle-red:right"],
        label: "Insert case 1, uncle red (right): 20B(10R,30R), insert 35" },
    "insert-23-left": { group: "insert", shape: "20B(10R,-)", op: "insert", key: 15, fixes: ["triangle:left", "line:left"],
        label: "Insert case 2 triangle → case 3 (left): 20B(10R,-), insert 15" },
    "insert-23-right": { group: "insert", shape: "20B(-,30R)", op: "insert", key: 25, fixes: ["triangle:right", "line:right"],
        label: "Insert case 2 triangle → case 3 (right): 20B(-,30R), insert 25" },
    "insert-3-left": { group: "insert", shape: "20B(10R,-)", op: "insert", key: 5, fixes: ["line:left"],
        label: "Insert case 3, line (left): 20B(10R,-), insert 5" },
    "insert-3-right": { group: "insert", shape: "20B(-,30R)", op: "insert", key: 35, fixes: ["line:right"],
        label: "Insert case 3, line (right): 20B(-,30R), insert 35" },
    "insert-1-then-3": { group: "insert", shape: "30B(20R(10B(5R,15R),25B),40B)", op: "insert", key: 3,
        fixes: ["uncle-red:left", "line:left"],
        label: "Insert case 1 moves up, then case 3: insert 3" },
    "insert-1-then-23": { group: "insert", shape: "30B(10R(5B,20B(15R,25R)),40B)", op: "insert", key: 27,
        fixes: ["uncle-red:right", "triangle:left", "line:left"],
        label: "Insert case 1 moves up, then cases 2 + 3: insert 27" },

    "delete-1-left": { group: "delete", shape: "10B(5B,20R(15B,25B))", op: "delete", key: 5,
        fixes: ["sibling-red:left", "black-nephews:left"],
        label: "Delete case 1, sibling red → case 2 (left): delete 5" },
    "delete-1-right": { group: "delete", shape: "20B(10R(5B,15B),25B)", op: "delete", key: 25,
        fixes: ["sibling-red:right", "black-nephews:right"],
        label: "Delete case 1, sibling red → case 2 (right): delete 25" },
    "delete-2-root": { group: "delete", shape: "10B(5B,15B)", op: "delete", key: 5, fixes: ["black-nephews:left"],
        label: "Delete case 2, double black reaches the root: 10B(5B,15B), delete 5" },
    "delete-2-red-parent-left": { group: "delete", shape: "20B(10R(5B,15B),30B)", op: "delete", key: 5,
        fixes: ["black-nephews:left"],
        label: "Delete case 2, red parent absorbs it (left): delete 5" },
    "delete-2-red-parent-right": { group: "delete", shape: "20B(10B,30R(25B,35B))", op: "delete", key: 35,
        fixes: ["black-nephews:right"],
        label: "Delete case 2, red parent absorbs it (right): delete 35" },
    "delete-34-left": { group: "delete", shape: "10B(5B,20B(15R,-))", op: "delete", key: 5,
        fixes: ["near-red:left", "far-red:left"],
        label: "Delete case 3 near child red → case 4 (left): delete 5" },
    "delete-34-right": { group: "delete", shape: "10B(5B(-,7R),20B)", op: "delete", key: 20,
        fixes: ["near-red:right", "far-red:right"],
        label: "Delete case 3 near child red → case 4 (right): delete 20" },
    "delete-4-left": { group: "delete", shape: "10B(5B,20B(-,25R))", op: "delete", key: 5, fixes: ["far-red:left"],
        label: "Delete case 4, far child red (left): delete 5" },
    "delete-4-right": { group: "delete", shape: "10B(5B(3R,-),20B)", op: "delete", key: 20, fixes: ["far-red:right"],
        label: "Delete case 4, far child red (right): delete 20" },
    "delete-4-red-parent": { group: "delete", shape: "20B(10R(5B,15B(-,17R)),30B)", op: "delete", key: 5,
        fixes: ["far-red:left"],
        label: "Delete case 4, sibling takes the red parent's colour: delete 5" },
    "delete-successor": { group: "delete", shape: "10B(5B,15B)", op: "delete", key: 10, fixes: ["black-nephews:right"],
        label: "Delete with two children: successor 15 moves up, then case 2: delete 10" },
    "delete-red-child": { group: "delete", shape: "10B(5B(3R,-),15B)", op: "delete", key: 5, fixes: [],
        label: "Delete a black node with a red child (recolour only): delete 5" },
});

export const DEFAULT_DEMO = "insert-1-left";
