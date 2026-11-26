import { ok, fail, assertCapacity, assertValue } from "./result.js";

/**
 * Red-black tree (CLRS) made of real node objects:
 *   { id, value, color: "red" | "black", left, right, parent }
 * Every node has a stable, monotonically increasing integer `id`, and a key keeps the
 * same node (and id) for as long as it is in the tree, so renderers can follow one node
 * through rotations, recolourings and the successor move in a two-child delete.
 *
 * Red-black rules checked by integrityError():
 *   1. every node is red or black;  2. the root is black;
 *   3. a red node never has a red child;
 *   4. every root-to-null path passes the same number of black nodes.
 * Empty children are plain `null` (treated as black NIL leaves). There is no sentinel
 * node, so the CLRS delete fix-up tracks x's parent explicitly when x is null.
 *
 * Rules and edge-case decisions:
 * - Keys are unique safe integers (0 and negatives allowed; -0 is stored as 0).
 *   Non-numbers, NaN, Infinity and fractions throw TypeError (programmer error);
 *   pages parse user text first and only pass valid integers.
 * - Capacity is an integer in 1..31 (default 31); a bad capacity throws RangeError.
 * - height(): edge-count convention like bst.js/avl.js (empty -1, single node 0). O(log n)
 *   because a red-black tree's height is at most 2·log2(n + 1).
 * - blackHeight(): black nodes on any root-to-null path, counting the root and not the
 *   null leaf (empty 0, single black root 1).
 * - Duplicate insert returns { ok: false } (checked before overflow, so inserting a key
 *   that is already present in a full tree reports the duplicate).
 * - Insert into a full tree, delete from an empty tree, delete of a missing key and
 *   min/max of an empty tree return { ok: false, error, steps }. Nothing returns -1:
 *   search() reports { found: false, id: null }.
 * - Delete of a node with two children MOVES the in-order successor node into the
 *   deleted node's place (CLRS RB-DELETE with transplant): the successor keeps its id and
 *   takes the deleted node's colour; the deleted node's id leaves the tree. No key is
 *   copied between nodes, so every surviving key keeps its node id.
 *
 * Every operation returns { ok, value?, error?, steps }. A step is
 *   { type, operation, nodeIds, pathIds, line, message, comparisons, snapshot,
 *     fix?, doubleBlack? }
 * `line` is 1-based into RB_INFO.pseudocode[operation]. `snapshot` is plain data:
 *   { nodes: [{ id, value, left, right, color }], rootId, size, capacity }
 * (child references are ids or null), the shape layoutBinaryTree() reads.
 * `fix` = { case, number, label, side } names the fix-up case the step belongs to.
 * `doubleBlack` = { id, parentId, side } marks the delete fix-up's "x" (id is null when
 * the double black sits on an empty child of parentId).
 * Snapshots are taken from the live tree as the operation runs. Before each insert fix a
 * "violation" step shows the red-red pair; before each delete fix a "double-black" step
 * shows the extra black. Messages are built from the state before the mutation they describe.
 */

export const RED = "red";
export const BLACK = "black";

/** Insert fix-up cases, as students learn them. `side` is the parent's side under the grandparent. */
export const INSERT_CASES = Object.freeze({
    "uncle-red": Object.freeze({ number: 1, label: "uncle red" }),
    triangle: Object.freeze({ number: 2, label: "uncle black, triangle" }),
    line: Object.freeze({ number: 3, label: "uncle black, line" }),
});

/** Delete fix-up cases (CLRS 1-4). `side` is x's side under its parent. */
export const DELETE_CASES = Object.freeze({
    "sibling-red": Object.freeze({ number: 1, label: "sibling red" }),
    "black-nephews": Object.freeze({ number: 2, label: "sibling black, both its children black" }),
    "near-red": Object.freeze({ number: 3, label: "sibling black, far child black, near child red" }),
    "far-red": Object.freeze({ number: 4, label: "sibling black, far child red" }),
});

export const INSPECT_KINDS = Object.freeze(["root", "leaves", "internal", "red", "black"]);

/** Insert pseudocode line numbers. */
const IL = Object.freeze({ overflow: 1, walk: 2, duplicate: 3, attach: 4, loop: 5, "uncle-red": 6, triangle: 7, line: 8, root: 9 });
/** Delete pseudocode line numbers. */
const DL = Object.freeze({
    empty: 1, walk: 2, missing: 3, simple: 4, successor: 5, move: 6, redRemoved: 7, xRed: 8,
    loop: 9, "sibling-red": 10, "black-nephews": 11, "near-red": 12, "far-red": 13, final: 14,
});

/** Registry entry, matching the site's shared metadata pattern. */
export const RB_INFO = Object.freeze({
    name: "Red-Black Tree",
    summary:
        "A binary search tree whose nodes are coloured red or black. The root is black, a red " +
        "node never has a red child, and every path from the root down to an empty child " +
        "passes the same number of black nodes. These rules keep the height at most " +
        "2·log₂(n + 1). Insert adds a red leaf and repairs any red-red violation by recolouring " +
        "or rotating; delete repairs a missing black (a \"double black\") with one of four " +
        "sibling cases. Every operation is O(log n) with at most 2 rotations per insert and 3 per delete.",
    complexity: Object.freeze({
        search: "O(log n)",
        insert: "O(log n), at most 2 rotations",
        delete: "O(log n), at most 3 rotations",
        minMax: "O(log n)",
        rotation: "O(1) per rotation",
        space: "O(n)",
    }),
    operations: Object.freeze({
        insert: Object.freeze({ complexity: "O(log n)", description: "BST insert of a red leaf, then fix red-red violations bottom-up (recolour, or rotate at most twice)." }),
        delete: Object.freeze({ complexity: "O(log n)", description: "CLRS RB-DELETE: transplant (successor moves up for two children), then fix any double black with the four sibling cases." }),
        search: Object.freeze({ complexity: "O(log n)", description: "Follow one root-to-leaf path comparing keys." }),
        min: Object.freeze({ complexity: "O(log n)", description: "Follow left pointers from the root." }),
        max: Object.freeze({ complexity: "O(log n)", description: "Follow right pointers from the root." }),
        height: Object.freeze({ complexity: "O(n)", description: "Longest root-to-leaf edge count (empty −1, leaf 0); at most 2·log₂(n + 1)." }),
        blackHeight: Object.freeze({ complexity: "O(log n)", description: "Black nodes on the leftmost root-to-null path, counting the root." }),
        inspect: Object.freeze({ complexity: "O(n)", description: "Highlight the root, leaves, internal, red or black nodes." }),
        clear: Object.freeze({ complexity: "O(n)", description: "Unlink every node." }),
    }),
    pseudocode: Object.freeze({
        insert: Object.freeze([
            "if tree is full and key is new: return overflow error",
            "walk down from root: key < node → left, key > node → right",
            "    if key == node.value: reject duplicate",
            "attach new RED leaf z where the walk fell off (z is the root if the tree was empty)",
            "while z.parent is red (red-red violation):",
            "    case 1, uncle red: parent, uncle ← black; grandparent ← red; z ← grandparent",
            "    case 2, uncle black, triangle: z ← parent; rotate z away from the inner side (now a line)",
            "    case 3, uncle black, line: rotate grandparent toward the uncle; swap colours of parent and grandparent",
            "root.color ← black",
        ]),
        delete: Object.freeze([
            "if root == null: return empty error",
            "walk down from root: key < node → left, key > node → right",
            "if key not found: return error",
            "if z has at most one child: x ← that child (or null); transplant(z, x); removed ← z.color",
            "else: y ← leftmost node of z.right (in-order successor); removed ← y.color",
            "    x ← y.right; transplant(y, x); y takes z's place and z's colour",
            "if removed is red: done (no path lost a black node)",
            "if x is red: x.color ← black; done",
            "while x is not the root and x is black (x is \"double black\"):",
            "    case 1, sibling w red: w ← black; parent ← red; rotate parent toward x; w ← new sibling",
            "    case 2, w black, both children black: w ← red; x ← parent (double black moves up)",
            "    case 3, w black, far child black, near child red: swap colours of w and near child; rotate w away from x",
            "    case 4, w black, far child red: w ← parent's colour; parent, far child ← black; rotate parent toward x; stop",
            "x.color ← black",
        ]),
        search: Object.freeze([
            "curr ← root",
            "while curr != null",
            "    if key == curr.value: return found",
            "    if key < curr.value: curr ← curr.left",
            "    else: curr ← curr.right",
            "return not found",
        ]),
        min: Object.freeze([
            "if root == null: return empty error",
            "curr ← root",
            "while curr.left != null: curr ← curr.left",
            "return curr",
        ]),
        max: Object.freeze([
            "if root == null: return empty error",
            "curr ← root",
            "while curr.right != null: curr ← curr.right",
            "return curr",
        ]),
        inspect: Object.freeze([
            "root: the one node with no parent",
            "leaf: node.left == null and node.right == null",
            "internal node: has at least one child",
            "red nodes: node.color == red",
            "black nodes: node.color == black",
        ]),
        clear: Object.freeze([
            "unlink all nodes (O(n));  root ← null;  size ← 0",
        ]),
    }),
});

export class RBNode {
    /**
     * @param {number} id stable positive integer identifier
     * @param {number} value integer key
     * @param {"red" | "black"} [color="red"]
     */
    constructor(id, value, color = RED) {
        this.id = id;
        this.value = value;
        this.color = color;
        this.left = null;
        this.right = null;
        this.parent = null;
    }
}

/** Null children count as black NIL leaves. */
const isRed = (node) => node !== null && node.color === RED;
const colorOf = (node) => (node === null ? BLACK : node.color);
const name = (node) => (node === null ? "NIL" : String(node.value));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const opposite = (side) => (side === "left" ? "right" : "left");

export class RedBlackTree {
    static MAX_CAPACITY = 31;

    #nextId = 1;

    /** @param {number} [capacity=31] integer from 1 to 31 */
    constructor(capacity = RedBlackTree.MAX_CAPACITY) {
        assertCapacity(capacity, 1, RedBlackTree.MAX_CAPACITY, "Red-black tree");
        this.capacity = capacity;
        this.root = null;
        this._size = 0;
    }

    /**
     * Builds a tree from a snapshot-shaped description `{ nodes: [{ id, value, left, right,
     * color }], rootId }` (for page presets and tests). Ids are kept; new nodes get ids above
     * the largest one. Throws TypeError/RangeError if the input is malformed, has more nodes
     * than `capacity`, or breaks any red-black rule (presets are code, so this is a programmer error).
     * @param {{ nodes: Array<{ id: number, value: number, left: number | null, right: number | null, color: string }>, rootId: number | null }} snap
     * @param {number} [capacity=31]
     */
    static fromSnapshot(snap, capacity = RedBlackTree.MAX_CAPACITY) {
        const tree = new RedBlackTree(capacity);
        if (snap === null || typeof snap !== "object" || !Array.isArray(snap.nodes)) {
            throw new TypeError("snapshot must be an object with a nodes array");
        }
        if (snap.nodes.length > capacity) {
            throw new RangeError(`snapshot has ${snap.nodes.length} nodes but capacity is ${capacity}`);
        }
        const byId = new Map();
        let maxId = 0;
        for (const n of snap.nodes) {
            if (!Number.isSafeInteger(n.id) || n.id < 1 || byId.has(n.id)) {
                throw new TypeError(`snapshot node ids must be unique positive integers (got ${n.id})`);
            }
            if (n.color !== RED && n.color !== BLACK) throw new TypeError(`node ${n.id} has colour ${n.color}`);
            byId.set(n.id, new RBNode(n.id, assertKey(n.value), n.color));
            maxId = Math.max(maxId, n.id);
        }
        const link = (id) => {
            if (id === null || id === undefined) return null;
            const node = byId.get(id);
            if (!node) throw new TypeError(`snapshot refers to missing node id ${id}`);
            return node;
        };
        for (const n of snap.nodes) {
            const node = byId.get(n.id);
            node.left = link(n.left);
            node.right = link(n.right);
            if (node.left) node.left.parent = node;
            if (node.right) node.right.parent = node;
        }
        tree.root = link(snap.rootId);
        if (tree.root) tree.root.parent = null;
        tree._size = snap.nodes.length;
        tree.#nextId = maxId + 1;
        const error = tree.integrityError();
        if (error !== null) throw new RangeError(`snapshot is not a valid red-black tree: ${error}`);
        return tree;
    }

    /* ---------- queries ---------- */

    get size() {
        return this._size;
    }

    isEmpty() {
        return this._size === 0;
    }

    isFull() {
        return this._size === this.capacity;
    }

    /** Longest root-to-leaf path in edges: empty -1, single node 0. O(n) walk (n ≤ 31). */
    height() {
        const walk = (node) => (node === null ? -1 : 1 + Math.max(walk(node.left), walk(node.right)));
        return walk(this.root);
    }

    /**
     * Black nodes on the leftmost root-to-null path, counting the root and not the null
     * leaf: empty 0, one black root 1. Equal on every path in a valid tree. O(log n).
     */
    blackHeight() {
        let count = 0;
        for (let n = this.root; n !== null; n = n.left) if (n.color === BLACK) count++;
        return count;
    }

    /** Keys in ascending order. O(n). */
    toArray() {
        const out = [];
        const seen = new Set();
        const walk = (node) => {
            if (node === null || seen.has(node)) return;
            seen.add(node);
            walk(node.left);
            out.push(node.value);
            walk(node.right);
        };
        walk(this.root);
        return out;
    }

    /**
     * Plain deep copy for rendering and replay, nodes listed in-order:
     * `{ nodes: [{ id, value, left, right, color }], rootId, size, capacity }`.
     */
    snapshot() {
        const nodes = [];
        const seen = new Set();
        const walk = (node) => {
            if (node === null || seen.has(node)) return;
            seen.add(node);
            walk(node.left);
            nodes.push({
                id: node.id,
                value: node.value,
                left: node.left ? node.left.id : null,
                right: node.right ? node.right.id : null,
                color: node.color,
            });
            walk(node.right);
        };
        walk(this.root);
        return { nodes, rootId: this.root ? this.root.id : null, size: this._size, capacity: this.capacity };
    }

    /**
     * Checks every invariant and returns null when sound, otherwise a description:
     * size in range, root has no parent, parent pointers match, no node or id reachable
     * twice, integer keys, BST order against all ancestor bounds, valid colours, black
     * root, no red node with a red child, equal black height on every root-to-null path,
     * reachable node count equals size.
     * @returns {string | null}
     */
    integrityError() {
        if (!Number.isInteger(this._size) || this._size < 0 || this._size > this.capacity) {
            return `size (${this._size}) is outside 0..${this.capacity}`;
        }
        if (this.root !== null && this.root.parent !== null) return `root ${this.root.value} has a parent pointer`;
        const seenNodes = new Set();
        const seenIds = new Set();
        let error = null;

        // Returns the black height below `node` (null leaf = 0), or null after recording an error.
        const check = (node, parent, lo, hi) => {
            if (node === null) return 0;
            if (seenNodes.has(node)) {
                error = `node #${node.id} (value ${node.value}) is reachable twice`;
                return null;
            }
            if (seenIds.has(node.id)) {
                error = `duplicate node id #${node.id}`;
                return null;
            }
            seenNodes.add(node);
            seenIds.add(node.id);
            if (parent !== null && node.parent !== parent) {
                error = `parent pointer of ${node.value} does not point to ${parent.value}`;
                return null;
            }
            if (!Number.isSafeInteger(node.value)) {
                error = `node #${node.id} has non-integer key ${node.value}`;
                return null;
            }
            if (lo !== null && node.value <= lo) {
                error = `BST order broken at node #${node.id}: ${node.value} must be > ${lo}`;
                return null;
            }
            if (hi !== null && node.value >= hi) {
                error = `BST order broken at node #${node.id}: ${node.value} must be < ${hi}`;
                return null;
            }
            if (node.color !== RED && node.color !== BLACK) {
                error = `node ${node.value} has invalid colour ${node.color}`;
                return null;
            }
            if (node.color === RED && (isRed(node.left) || isRed(node.right))) {
                error = `red node ${node.value} has a red child (red-red violation)`;
                return null;
            }
            const bl = check(node.left, node, lo, node.value);
            if (bl === null) return null;
            const br = check(node.right, node, node.value, hi);
            if (br === null) return null;
            if (bl !== br) {
                error = `black height differs under ${node.value}: left ${bl}, right ${br}`;
                return null;
            }
            return bl + (node.color === BLACK ? 1 : 0);
        };

        if (check(this.root, null, null, null) === null) return error;
        if (this.root !== null && this.root.color !== BLACK) return `root ${this.root.value} is red (the root must be black)`;
        if (seenNodes.size !== this._size) {
            return `reachable node count (${seenNodes.size}) does not equal size (${this._size})`;
        }
        return null;
    }

    /* ---------- insert ---------- */

    /**
     * Inserts a unique integer key as a red leaf, then runs the CLRS insert fix-up.
     * O(log n), at most 2 rotations. Fails (no throw) on duplicate or when full.
     * Value on success: { id, value, fixes: [{ case, number, side, at }] } where `at` is
     * the value of z when the case was applied.
     * @param {number} value
     */
    insert(value) {
        const key = assertKey(value);
        const op = "insert";

        if (this.isFull() && !this.#contains(key)) {
            const error = `Red-black tree is full: all ${plural(this.capacity, "slot")} are used, so ${key} cannot be inserted.`;
            return fail(error, [this.#step("overflow", op, { line: IL.overflow, message: error })]);
        }

        const steps = [];
        const path = [];
        let comparisons = 0;
        let parent = null;
        let goLeft = false;
        let curr = this.root;

        while (curr !== null) {
            path.push(curr.id);
            comparisons++;
            if (key === curr.value) {
                steps.push(this.#step("duplicate", op, {
                    nodeIds: [curr.id],
                    pathIds: path.slice(),
                    line: IL.duplicate,
                    message: `${key} = ${curr.value}: duplicate key, insertion rejected.`,
                    comparisons,
                }));
                return fail(`${key} is already in the red-black tree (keys must be unique).`, steps);
            }
            goLeft = key < curr.value;
            const next = goLeft ? curr.left : curr.right;
            const side = goLeft ? "left" : "right";
            const sign = goLeft ? "<" : ">";
            steps.push(this.#step(next !== null ? (goLeft ? "go-left" : "go-right") : "visit", op, {
                nodeIds: [curr.id],
                pathIds: path.slice(),
                line: IL.walk,
                message: next !== null
                    ? `${key} ${sign} ${curr.value}: go ${side} to ${next.value}.`
                    : `${key} ${sign} ${curr.value}, and ${curr.value} has no ${side} child.`,
                comparisons,
            }));
            parent = curr;
            curr = next;
        }

        const node = new RBNode(this.#nextId++, key, RED);
        node.parent = parent;
        if (parent === null) this.root = node;
        else if (goLeft) parent.left = node;
        else parent.right = node;
        this._size++;
        steps.push(this.#step("insert", op, {
            nodeIds: [node.id],
            pathIds: [...path, node.id],
            line: IL.attach,
            message: parent === null
                ? `The tree was empty, so ${key} becomes the root, coloured red like every new node.`
                : `Attach ${key} as the red ${goLeft ? "left" : "right"} child of ${parent.value}. ` +
                  "New nodes are red so no path gains a black node.",
            comparisons,
        }));

        const fixes = this.#insertFixup(node, steps, comparisons);
        steps.push(this.#step("done", op, {
            nodeIds: [node.id],
            line: IL.root,
            message: `Inserted ${key}. ${describeFixes(fixes, INSERT_CASES, "insert")} ` +
                `The tree has ${plural(this._size, "node")}, height ${this.height()} and black height ${this.blackHeight()}.`,
            comparisons,
        }));
        return ok({ id: node.id, value: key, fixes }, steps);
    }

    #insertFixup(start, steps, comparisons) {
        const op = "insert";
        const fixes = [];
        let z = start;

        for (;;) {
            const p = z.parent;
            if (p === null || p.color === BLACK) {
                steps.push(this.#step("check", op, {
                    nodeIds: p === null ? [z.id] : [z.id, p.id],
                    line: IL.loop,
                    message: p === null
                        ? `${z.value} is the root, so there is no parent to clash with.`
                        : `The parent of ${z.value} is ${p.value}, which is black: no red-red violation.`,
                    comparisons,
                }));
                break;
            }
            // p is red, so p is not the root and the grandparent exists (and is black).
            const g = p.parent;
            const side = g.left === p ? "left" : "right";
            const uncle = side === "left" ? g.right : g.left;
            const redRed = `${z.value} and its parent ${p.value} are both red (red-red violation).`;

            if (isRed(uncle)) {
                const fix = makeFix(INSERT_CASES, "uncle-red", side);
                steps.push(this.#step("violation", op, {
                    nodeIds: [z.id, p.id, uncle.id, g.id],
                    line: IL["uncle-red"],
                    message: `${tag(fix, "Insert")} ${redRed} The uncle ${uncle.value} is red, so recolour instead of rotating.`,
                    comparisons,
                    fix,
                }));
                const message = `${tag(fix, "Insert")} Recolour: parent ${p.value} and uncle ${uncle.value} become black, ` +
                    `grandparent ${g.value} becomes red. Every path keeps its black count. ` +
                    `${g.value} may now clash with its own parent, so check again from ${g.value}.`;
                p.color = BLACK;
                uncle.color = BLACK;
                g.color = RED;
                steps.push(this.#step("recolor", op, { nodeIds: [p.id, uncle.id, g.id], line: IL["uncle-red"], message, comparisons, fix }));
                fixes.push({ ...fix, at: z.value });
                z = g;
                continue;
            }

            const inner = side === "left" ? p.right === z : p.left === z;
            if (inner) {
                const fix = makeFix(INSERT_CASES, "triangle", side);
                steps.push(this.#step("violation", op, {
                    nodeIds: [z.id, p.id, g.id],
                    line: IL.triangle,
                    message: `${tag(fix, "Insert")} ${redRed} The uncle ${name(uncle)} is black and ${z.value} is the ` +
                        `${opposite(side)} child of a ${side} child: a triangle. Rotate the parent to turn it into a line.`,
                    comparisons,
                    fix,
                }));
                const dir = side === "left" ? "left" : "right";
                const message = `${tag(fix, "Insert")} ${this.#rotationMessage(p, dir)} ` +
                    `Now ${p.value} is the red child of red ${z.value} in a straight line.`;
                this.#rotate(p, dir);
                steps.push(this.#step(`rotate-${dir}`, op, { nodeIds: [z.id, p.id], line: IL.triangle, message, comparisons, fix }));
                fixes.push({ ...fix, at: z.value });
                z = p;
            }

            const p2 = z.parent;
            const fix = makeFix(INSERT_CASES, "line", side);
            steps.push(this.#step("violation", op, {
                nodeIds: [z.id, p2.id, g.id],
                line: IL.line,
                message: `${tag(fix, "Insert")} ${z.value} and its parent ${p2.value} are both red (red-red violation). ` +
                    `The uncle ${name(uncle)} is black and ${z.value}, ${p2.value}, ${g.value} form a straight line ` +
                    `(both ${side} children). Rotate the grandparent ${g.value}, then swap colours.`,
                comparisons,
                fix,
            }));
            const dir = opposite(side);
            const rotMessage = `${tag(fix, "Insert")} ${this.#rotationMessage(g, dir)}`;
            this.#rotate(g, dir);
            steps.push(this.#step(`rotate-${dir}`, op, { nodeIds: [p2.id, g.id], line: IL.line, message: rotMessage, comparisons, fix }));
            const colorMessage = `${tag(fix, "Insert")} Swap colours: ${p2.value} becomes black and ${g.value} becomes red. ` +
                `${p2.value} is black, so the red-red violation is gone and the fix-up ends.`;
            p2.color = BLACK;
            g.color = RED;
            steps.push(this.#step("recolor", op, { nodeIds: [p2.id, g.id], line: IL.line, message: colorMessage, comparisons, fix }));
            fixes.push({ ...fix, at: z.value });
            // z's parent p2 is black now, so the next loop check ends the fix-up.
        }

        if (this.root.color === RED) {
            const message = `The root ${this.root.value} is red: colour it black (rule 2). ` +
                "This adds one black to every path, so black heights stay equal.";
            this.root.color = BLACK;
            steps.push(this.#step("root-black", op, { nodeIds: [this.root.id], line: IL.root, message, comparisons }));
        }
        return fixes;
    }

    /* ---------- delete ---------- */

    /**
     * Deletes a key with CLRS RB-DELETE, then runs the delete fix-up when a black node
     * was removed. O(log n), at most 3 rotations. Fails (no throw) on an empty tree or a
     * missing key.
     * Value: { id (node that left the tree), value, case: "leaf" | "one-child" |
     * "two-children", successorValue?, removedColor, fixes: [{ case, number, side }] }.
     * @param {number} value
     */
    delete(value) {
        const key = assertKey(value);
        const op = "delete";

        if (this.root === null) {
            const error = `Cannot delete ${key}: the red-black tree is empty.`;
            return fail(error, [this.#step("empty", op, { line: DL.empty, message: error })]);
        }

        const steps = [];
        const path = [];
        let comparisons = 0;
        let z = this.root;
        while (z !== null) {
            path.push(z.id);
            comparisons++;
            if (key === z.value) {
                steps.push(this.#step("found", op, {
                    nodeIds: [z.id],
                    pathIds: path.slice(),
                    line: DL.walk,
                    message: `Found ${key} (${z.color}), the node to delete.`,
                    comparisons,
                }));
                break;
            }
            const goLeft = key < z.value;
            const next = goLeft ? z.left : z.right;
            const side = goLeft ? "left" : "right";
            steps.push(this.#step(goLeft ? "go-left" : "go-right", op, {
                nodeIds: [z.id],
                pathIds: path.slice(),
                line: DL.walk,
                message: next
                    ? `${key} ${goLeft ? "<" : ">"} ${z.value}: go ${side} to ${next.value}.`
                    : `${key} ${goLeft ? "<" : ">"} ${z.value}: the ${side} child is empty.`,
                comparisons,
            }));
            z = next;
        }
        if (z === null) {
            const error = `${key} is not in the red-black tree, so it cannot be deleted.`;
            steps.push(this.#step("not-found", op, { pathIds: path.slice(), line: DL.missing, message: error, comparisons }));
            return fail(error, steps);
        }

        let x;
        let xParent;
        let removedColor;
        let result;

        if (z.left === null || z.right === null) {
            x = z.left !== null ? z.left : z.right;
            xParent = z.parent;
            removedColor = z.color;
            const isLeaf = x === null;
            let message;
            if (isLeaf) {
                message = z.parent === null
                    ? `${key} is a leaf and the only node: remove it, the tree is now empty.`
                    : `${key} is a ${z.color} leaf: unlink it from its parent ${z.parent.value}.`;
            } else {
                message = z.parent === null
                    ? `${key} is the root with one child (${x.value}): ${x.value} becomes the root.`
                    : `${key} (${z.color}) has one child (${x.value}): link ${z.parent.value} directly to ${x.value}.`;
            }
            this.#transplant(z, x);
            z.left = z.right = z.parent = null;
            this._size--;
            steps.push(this.#step("transplant", op, {
                nodeIds: x ? [x.id] : xParent ? [xParent.id] : [],
                line: DL.simple,
                message,
                comparisons,
            }));
            result = { id: z.id, value: key, case: isLeaf ? "leaf" : "one-child" };
        } else {
            let y = z.right;
            const succPath = [z.id, y.id];
            steps.push(this.#step("find-successor", op, {
                nodeIds: [z.id, y.id],
                pathIds: succPath.slice(),
                line: DL.successor,
                message: y.left !== null
                    ? `${key} has two children: find its in-order successor, the leftmost node of its right subtree. Start at ${y.value}.`
                    : `${key} has two children. Its right child ${y.value} has no left child, so ${y.value} is the in-order successor.`,
                comparisons,
            }));
            while (y.left !== null) {
                y = y.left;
                succPath.push(y.id);
                steps.push(this.#step("find-successor", op, {
                    nodeIds: [z.id, y.id],
                    pathIds: succPath.slice(),
                    line: DL.successor,
                    message: y.left !== null
                        ? `Go left to ${y.value}.`
                        : `${y.value} has no left child: it is the in-order successor of ${key}.`,
                    comparisons,
                }));
            }
            removedColor = y.color;
            x = y.right;
            const message = `Move successor ${y.value} into ${key}'s place: it takes ${key}'s children and colour (${z.color}). ` +
                (x !== null
                    ? `Its right child ${x.value} takes ${y.value}'s old spot. `
                    : `${y.value}'s old spot becomes empty. `) +
                `The colour that disappears from the tree is ${y.value}'s old colour (${y.color}).`;
            if (y.parent === z) {
                xParent = y;
            } else {
                xParent = y.parent;
                this.#transplant(y, x);
                y.right = z.right;
                y.right.parent = y;
            }
            this.#transplant(z, y);
            y.left = z.left;
            y.left.parent = y;
            y.color = z.color;
            z.left = z.right = z.parent = null;
            this._size--;
            steps.push(this.#step("transplant", op, {
                nodeIds: x ? [y.id, x.id] : [y.id],
                line: DL.move,
                message,
                comparisons,
            }));
            result = { id: z.id, value: key, case: "two-children", successorValue: y.value };
        }

        let fixes = [];
        if (removedColor === RED) {
            steps.push(this.#step("check", op, {
                line: DL.redRemoved,
                message: "The removed colour was red, so no path lost a black node: all rules still hold.",
                comparisons,
            }));
        } else if (this._size === 0) {
            steps.push(this.#step("check", op, { line: DL.loop, message: "The tree is now empty: nothing to fix.", comparisons }));
        } else if (isRed(x)) {
            const message = `A black node was removed, but its replacement ${x.value} is red ("red-and-black"): ` +
                `colour ${x.value} black to give the lost black back.`;
            x.color = BLACK;
            steps.push(this.#step("recolor", op, { nodeIds: [x.id], line: DL.xRed, message, comparisons }));
        } else {
            fixes = this.#deleteFixup(x, xParent, steps, comparisons);
        }

        steps.push(this.#step("done", op, {
            line: DL.final,
            message: this._size === 0
                ? `Deleted ${key}. The tree is now empty.`
                : `Deleted ${key}. ${describeFixes(fixes, DELETE_CASES, "delete")} ` +
                  `The tree has ${plural(this._size, "node")}, height ${this.height()} and black height ${this.blackHeight()}.`,
            comparisons,
        }));
        return ok({ ...result, removedColor, fixes }, steps);
    }

    /** CLRS RB-DELETE-FIXUP with a null-safe x (xParent tracked explicitly). */
    #deleteFixup(xStart, xParentStart, steps, comparisons) {
        const op = "delete";
        const fixes = [];
        let x = xStart;
        let xp = xParentStart;
        const marker = () => ({ id: x ? x.id : null, parentId: xp ? xp.id : null, side: xp ? (xp.left === x ? "left" : "right") : null });

        steps.push(this.#step("double-black", op, {
            nodeIds: x ? [x.id] : xp ? [xp.id] : [],
            line: DL.loop,
            message: `A black node was removed, so paths through ${x ? x.value : `the empty ${xp.left === x ? "left" : "right"} child of ${xp.value}`} ` +
                `are one black short. Treat ${x ? x.value : "that spot"} as "double black" (it carries an extra black) and push the extra black away.`,
            comparisons,
            doubleBlack: marker(),
        }));

        while (x !== this.root && !isRed(x)) {
            const side = xp.left === x ? "left" : "right";
            const far = opposite(side);
            let w = side === "left" ? xp.right : xp.left; // never null: the sibling side has black height ≥ 1
            const where = x ? `${x.value}` : `the empty ${side} child of ${xp.value}`;
            const db = `Double black at ${where}; sibling ${w.value}`;

            if (isRed(w)) {
                const fix = makeFix(DELETE_CASES, "sibling-red", side);
                steps.push(this.#step("double-black", op, {
                    nodeIds: [xp.id, w.id],
                    line: DL["sibling-red"],
                    message: `${tag(fix, "Delete")} ${db} is red. Turn it into a black-sibling case first.`,
                    comparisons, fix, doubleBlack: marker(),
                }));
                const colorMessage = `${tag(fix, "Delete")} Recolour: sibling ${w.value} becomes black, parent ${xp.value} becomes red.`;
                w.color = BLACK;
                xp.color = RED;
                steps.push(this.#step("recolor", op, { nodeIds: [w.id, xp.id], line: DL["sibling-red"], message: colorMessage, comparisons, fix, doubleBlack: marker() }));
                const rotMessage = `${tag(fix, "Delete")} ${this.#rotationMessage(xp, side)} ` +
                    `The double black now has a black sibling, so one of cases 2-4 applies next.`;
                this.#rotate(xp, side);
                w = side === "left" ? xp.right : xp.left;
                steps.push(this.#step(`rotate-${side}`, op, { nodeIds: [xp.id, w.id], line: DL["sibling-red"], message: rotMessage, comparisons, fix, doubleBlack: marker() }));
                fixes.push(fix);
            }

            const nearChild = side === "left" ? w.left : w.right;
            const farChild = side === "left" ? w.right : w.left;
            const db2 = `Double black at ${where}; sibling ${w.value}`;

            if (!isRed(nearChild) && !isRed(farChild)) {
                const fix = makeFix(DELETE_CASES, "black-nephews", side);
                steps.push(this.#step("double-black", op, {
                    nodeIds: [xp.id, w.id],
                    line: DL["black-nephews"],
                    message: `${tag(fix, "Delete")} ${db2} is black and both its children (${name(w.left)}, ${name(w.right)}) are black.`,
                    comparisons, fix, doubleBlack: marker(),
                }));
                const parentRed = isRed(xp);
                const message = `${tag(fix, "Delete")} Colour sibling ${w.value} red, taking one black off both sides, ` +
                    `and move the double black up to the parent ${xp.value}` +
                    (parentRed
                        ? ` (red, so it just turns black next).`
                        : xp === this.root ? " (the root, where an extra black can simply be dropped)." : ".");
                w.color = RED;
                x = xp;
                xp = x.parent;
                steps.push(this.#step("recolor", op, { nodeIds: [w.id, x.id], line: DL["black-nephews"], message, comparisons, fix, doubleBlack: marker() }));
                fixes.push(fix);
                continue;
            }

            if (!isRed(farChild)) {
                // near child is red, far child is black
                const fix = makeFix(DELETE_CASES, "near-red", side);
                steps.push(this.#step("double-black", op, {
                    nodeIds: [xp.id, w.id, nearChild.id],
                    line: DL["near-red"],
                    message: `${tag(fix, "Delete")} ${db2} is black, its far child ${name(farChild)} is black and its near child ` +
                        `${nearChild.value} is red. Rotate the red child to the far side first.`,
                    comparisons, fix, doubleBlack: marker(),
                }));
                const colorMessage = `${tag(fix, "Delete")} Swap colours of sibling ${w.value} (now red) and its near child ${nearChild.value} (now black).`;
                nearChild.color = BLACK;
                w.color = RED;
                steps.push(this.#step("recolor", op, { nodeIds: [w.id, nearChild.id], line: DL["near-red"], message: colorMessage, comparisons, fix, doubleBlack: marker() }));
                const rotMessage = `${tag(fix, "Delete")} ${this.#rotationMessage(w, far)} ` +
                    `Now the sibling is ${nearChild.value} and its far child ${w.value} is red: case 4.`;
                const oldW = w;
                this.#rotate(w, far);
                w = side === "left" ? xp.right : xp.left;
                steps.push(this.#step(`rotate-${far}`, op, { nodeIds: [nearChild.id, oldW.id], line: DL["near-red"], message: rotMessage, comparisons, fix, doubleBlack: marker() }));
                fixes.push(fix);
            }

            {
                const fix = makeFix(DELETE_CASES, "far-red", side);
                const fc = side === "left" ? w.right : w.left;
                steps.push(this.#step("double-black", op, {
                    nodeIds: [xp.id, w.id, fc.id],
                    line: DL["far-red"],
                    message: `${tag(fix, "Delete")} Double black at ${where}; sibling ${w.value} is black and its far child ${fc.value} is red. ` +
                        "One rotation and three recolourings remove the extra black.",
                    comparisons, fix, doubleBlack: marker(),
                }));
                const colorMessage = `${tag(fix, "Delete")} Sibling ${w.value} takes the parent's colour (${xp.color}); ` +
                    `parent ${xp.value} and far child ${fc.value} become black.`;
                w.color = xp.color;
                xp.color = BLACK;
                fc.color = BLACK;
                steps.push(this.#step("recolor", op, { nodeIds: [w.id, xp.id, fc.id], line: DL["far-red"], message: colorMessage, comparisons, fix, doubleBlack: marker() }));
                const rotMessage = `${tag(fix, "Delete")} ${this.#rotationMessage(xp, side)} ` +
                    `The new black ${xp.value} on the double black's side replaces the missing black: done.`;
                this.#rotate(xp, side);
                steps.push(this.#step(`rotate-${side}`, op, { nodeIds: [w.id, xp.id], line: DL["far-red"], message: rotMessage, comparisons, fix }));
                fixes.push(fix);
                x = this.root;
                xp = null;
            }
        }

        if (isRed(x)) {
            const message = `${x.value} is red and carries the extra black ("red-and-black"): colour it black. The double black is resolved.`;
            x.color = BLACK;
            steps.push(this.#step("recolor", op, { nodeIds: [x.id], line: DL.final, message, comparisons }));
        } else if (fixes.length > 0 && fixes.at(-1).case === "black-nephews" && x === this.root) {
            steps.push(this.#step("check", op, {
                nodeIds: [x.id],
                line: DL.loop,
                message: `The double black reached the root ${x.value}: an extra black at the root is simply dropped (every path loses one black equally).`,
                comparisons,
            }));
        }
        return fixes;
    }

    /* ---------- search, min, max, inspect, clear ---------- */

    /**
     * Searches for a key. O(log n). Always ok: value is { found, id, value }
     * with id null when the key is absent.
     * @param {number} value
     */
    search(value) {
        const key = assertKey(value);
        const op = "search";
        const steps = [];
        if (this.root === null) {
            steps.push(this.#step("not-found", op, { line: 6, message: `The tree is empty, so ${key} is not found.` }));
            return ok({ found: false, id: null, value: key }, steps);
        }
        const path = [];
        let comparisons = 0;
        let curr = this.root;
        while (curr !== null) {
            path.push(curr.id);
            comparisons++;
            if (key === curr.value) {
                steps.push(this.#step("found", op, {
                    nodeIds: [curr.id],
                    pathIds: path.slice(),
                    line: 3,
                    message: `Found ${key} (${curr.color}) after ${plural(comparisons, "comparison")}.`,
                    comparisons,
                }));
                return ok({ found: true, id: curr.id, value: curr.value }, steps);
            }
            const goLeft = key < curr.value;
            const next = goLeft ? curr.left : curr.right;
            steps.push(this.#step(goLeft ? "go-left" : "go-right", op, {
                nodeIds: [curr.id],
                pathIds: path.slice(),
                line: goLeft ? 4 : 5,
                message: next
                    ? `${key} ${goLeft ? "<" : ">"} ${curr.value}: go ${goLeft ? "left" : "right"} to ${next.value}.`
                    : `${key} ${goLeft ? "<" : ">"} ${curr.value}: the ${goLeft ? "left" : "right"} child is empty.`,
                comparisons,
            }));
            curr = next;
        }
        steps.push(this.#step("not-found", op, {
            pathIds: path.slice(),
            line: 6,
            message: `Reached an empty child after ${plural(comparisons, "comparison")}: ${key} is not in the tree.`,
            comparisons,
        }));
        return ok({ found: false, id: null, value: key }, steps);
    }

    /** Smallest key. O(log n). Fails on an empty tree. Value: { id, value }. */
    min() {
        return this.#extreme("min");
    }

    /** Largest key. O(log n). Fails on an empty tree. Value: { id, value }. */
    max() {
        return this.#extreme("max");
    }

    /**
     * Highlights nodes by role or colour: "root", "leaves", "internal", "red", "black".
     * O(n). Always ok (empty tree gives an empty list). Throws RangeError for an unknown kind.
     * Value: { ids, values } in in-order.
     * @param {"root" | "leaves" | "internal" | "red" | "black"} kind
     */
    inspect(kind) {
        if (!INSPECT_KINDS.includes(kind)) {
            throw new RangeError(`inspect kind must be one of ${INSPECT_KINDS.join(", ")} (got ${kind})`);
        }
        const picked = [];
        const walk = (node) => {
            if (node === null) return;
            walk(node.left);
            const leaf = node.left === null && node.right === null;
            const hit = kind === "root" ? node === this.root
                : kind === "leaves" ? leaf
                    : kind === "internal" ? !leaf
                        : node.color === kind;
            if (hit) picked.push(node);
            walk(node.right);
        };
        walk(this.root);
        const values = picked.map((n) => n.value);
        const labels = { root: "Root", leaves: "Leaves", internal: "Internal nodes", red: "Red nodes", black: "Black nodes" };
        const message = this.root === null
            ? "The tree is empty: there is nothing to highlight."
            : kind === "root"
                ? `The root is ${values[0]} (black, black height ${this.blackHeight()}).`
                : `${labels[kind]} (${picked.length}): ${values.length > 0 ? values.join(", ") : "none"}.`;
        const step = this.#step("highlight", "inspect", {
            nodeIds: picked.map((n) => n.id),
            line: INSPECT_KINDS.indexOf(kind) + 1,
            message,
        });
        return ok({ ids: picked.map((n) => n.id), values }, [step]);
    }

    /** Removes every node. O(n). Value: number of nodes removed. */
    clear() {
        const count = this._size;
        const unlink = (node) => {
            if (node === null) return;
            const { left, right } = node;
            node.left = node.right = node.parent = null;
            unlink(left);
            unlink(right);
        };
        unlink(this.root);
        this.root = null;
        this._size = 0;
        return ok(count, [
            this.#step("done", "clear", { line: 1, message: `Cleared ${plural(count, "node")}. The tree is now empty.` }),
        ]);
    }

    /* ---------- internals ---------- */

    #contains(key) {
        let curr = this.root;
        while (curr !== null) {
            if (key === curr.value) return true;
            curr = key < curr.value ? curr.left : curr.right;
        }
        return false;
    }

    #extreme(op) {
        const isMin = op === "min";
        if (this.root === null) {
            const error = `The red-black tree is empty, so there is no ${isMin ? "minimum" : "maximum"}.`;
            return fail(error, [this.#step("empty", op, { line: 1, message: error })]);
        }
        const steps = [];
        let curr = this.root;
        const path = [curr.id];
        for (;;) {
            const next = isMin ? curr.left : curr.right;
            if (next === null) break;
            steps.push(this.#step(isMin ? "go-left" : "go-right", op, {
                nodeIds: [curr.id],
                pathIds: path.slice(),
                line: 3,
                message: `${curr.value} has a ${isMin ? "left" : "right"} child (${next.value}): go ${isMin ? "left" : "right"}.`,
            }));
            curr = next;
            path.push(curr.id);
        }
        steps.push(this.#step("found", op, {
            nodeIds: [curr.id],
            pathIds: path,
            line: 4,
            message: `${curr.value} has no ${isMin ? "left" : "right"} child, so it is the ${isMin ? "minimum" : "maximum"}.`,
        }));
        return ok({ id: curr.id, value: curr.value }, steps);
    }

    /** CLRS TRANSPLANT: puts subtree `v` (may be null) where `u` was. */
    #transplant(u, v) {
        if (u.parent === null) this.root = v;
        else if (u === u.parent.left) u.parent.left = v;
        else u.parent.right = v;
        if (v !== null) v.parent = u.parent;
    }

    /**
     * Rotates around `x` in `dir`: "left" lifts x.right, "right" lifts x.left.
     * Parent pointers and the root are updated. Colours are untouched. O(1).
     */
    #rotate(x, dir) {
        const y = dir === "left" ? x.right : x.left;
        const inner = dir === "left" ? y.left : y.right;
        if (dir === "left") x.right = inner;
        else x.left = inner;
        if (inner !== null) inner.parent = x;
        y.parent = x.parent;
        if (x.parent === null) this.root = y;
        else if (x === x.parent.left) x.parent.left = y;
        else x.parent.right = y;
        if (dir === "left") y.left = x;
        else y.right = x;
        x.parent = y;
        return y;
    }

    /** Describes a rotation of `node` in `dir`, from the state before it happens. */
    #rotationMessage(node, dir) {
        const up = dir === "right" ? node.left : node.right;
        const inner = dir === "right" ? up.right : up.left;
        const innerSide = dir === "right" ? "left" : "right";
        return `Rotate ${dir} around ${node.value}: ${up.value} moves up and ${node.value} becomes its ${dir} child` +
            (inner !== null ? `; ${inner.value} moves across to become ${node.value}'s ${innerSide} child.` : ".");
    }

    #step(type, operation, { nodeIds = [], pathIds = [], line, message, comparisons = 0, fix, doubleBlack } = {}) {
        const lines = RB_INFO.pseudocode[operation];
        if (!lines || !Number.isInteger(line) || line < 1 || line > lines.length) {
            throw new RangeError(`Invalid pseudocode line ${line} for operation "${operation}"`);
        }
        const step = { type, operation, nodeIds, pathIds, line, message, comparisons, snapshot: this.snapshot() };
        if (fix !== undefined) step.fix = { ...fix };
        if (doubleBlack !== undefined) step.doubleBlack = doubleBlack;
        return step;
    }
}

function makeFix(table, kase, side) {
    return { case: kase, number: table[kase].number, label: table[kase].label, side };
}

/** Message tag, e.g. "[Insert case 1: uncle red (left)]". */
function tag(fix, op) {
    return `[${op} case ${fix.number}: ${fix.label} (${fix.side})]`;
}

function describeFixes(fixes, table, op) {
    if (fixes.length === 0) {
        return op === "insert" ? "No fix-up case was needed." : "No double-black case was needed.";
    }
    const parts = fixes.map((f) => `case ${f.number} (${table[f.case].label}, ${f.side})`);
    return `Fix-up used ${parts.join(", then ")}.`;
}

function assertKey(value) {
    assertValue(value);
    if (!Number.isSafeInteger(value)) {
        throw new TypeError(`Red-black tree key must be a safe integer (got ${value})`);
    }
    return value === 0 ? 0 : value;
}
