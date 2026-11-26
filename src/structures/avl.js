import { ok, fail, assertCapacity, assertValue } from "./result.js";

/**
 * AVL tree (self-balancing binary search tree) made of real node objects:
 *   { id, value, left, right, height }
 * Every node has a stable, monotonically increasing integer `id`, so renderers can
 * follow the same node while rotations move it.
 *
 * Rules and edge-case decisions:
 * - Keys are unique safe integers (0 and negatives allowed; -0 is stored as 0).
 *   Non-numbers, NaN, Infinity and fractions throw TypeError (programmer error);
 *   pages parse user text first and only pass valid integers.
 * - Capacity is an integer in 1..31 (default 31); a bad capacity throws RangeError.
 * - Heights use the edge-count convention (same as bst.js): empty tree -1, leaf 0.
 *   Balance factor bf = height(left) - height(right).
 * - Duplicate insert returns { ok: false } (checked before overflow, so inserting a
 *   key that is already present in a full tree reports the duplicate).
 * - Insert into a full tree, delete from an empty tree, delete of a missing key,
 *   min/max of an empty tree return { ok: false, error, steps }. Nothing is thrown
 *   for these and nothing returns -1: search() reports { found: false, id: null }.
 * - Delete of a node with two children copies the in-order successor's key into the
 *   node (the node keeps its id) and unlinks the successor node.
 *
 * Every operation returns { ok, value?, error?, steps }. A step is
 *   { type, operation, nodeIds, pathIds, line, message, comparisons, snapshot, rotation? }
 * `line` is 1-based into AVL_INFO.pseudocode[operation]. `snapshot` is plain data:
 *   { nodes: [{ id, value, left, right, height, balance }], rootId, size, capacity }
 * (child references are ids or null), the same shape layoutBinaryTree() reads.
 * Snapshots are taken from the live tree as the operation runs. Before every rotation
 * an "unbalanced" step shows the tree in its unbalanced state and names the case
 * (LL, RR, LR, RL); each rotation then gets its own rotate-left / rotate-right step.
 * Messages are built from the state before the mutation they describe.
 */

/** Line numbers shared by the rebalancing loop, relative to the loop's first line. */
const RETRACE = Object.freeze({ loop: 0, update: 1, LL: 2, LR: 3, RR: 4, RL: 5, stop: 6 });
const INSERT_LOOP = 6;
const DELETE_LOOP = 8;

const REBALANCE_LINES = Object.freeze([
    "for each node on the path, bottom-up:",
    "    height ← 1 + max(h(left), h(right));  bf ← h(left) − h(right)",
    "    if bf = +2 and bf(left) ≥ 0: LL case → rotateRight(node)",
    "    if bf = +2 and bf(left) < 0: LR case → rotateLeft(left), then rotateRight(node)",
    "    if bf = −2 and bf(right) ≤ 0: RR case → rotateLeft(node)",
    "    if bf = −2 and bf(right) > 0: RL case → rotateRight(right), then rotateLeft(node)",
    "    if the subtree height did not change: stop (ancestors are unaffected)",
]);

export const INSPECT_KINDS = Object.freeze(["root", "leaves", "internal"]);

/** Registry entry, matching the site's shared metadata pattern. */
export const AVL_INFO = Object.freeze({
    name: "AVL Tree",
    summary:
        "A binary search tree that keeps itself balanced: at every node the heights of the " +
        "left and right subtrees differ by at most 1 (balance factor −1, 0 or +1). After an " +
        "insert or delete it walks back up the path, updates heights, and repairs any node " +
        "with balance factor ±2 using one of four rotation cases (LL, RR, LR, RL), so height " +
        "stays below 1.44·log₂(n + 2) and every operation is O(log n).",
    complexity: Object.freeze({
        search: "O(log n)",
        insert: "O(log n), at most 1 single or double rotation",
        delete: "O(log n), up to O(log n) rotations",
        minMax: "O(log n)",
        rotation: "O(1) per rotation",
        space: "O(n)",
    }),
    operations: Object.freeze({
        insert: Object.freeze({ complexity: "O(log n)", description: "BST insert, then retrace and rotate at the lowest unbalanced node." }),
        delete: Object.freeze({ complexity: "O(log n)", description: "BST delete (in-order successor for two children), then retrace and rotate as needed." }),
        search: Object.freeze({ complexity: "O(log n)", description: "Follow one root-to-leaf path comparing keys." }),
        min: Object.freeze({ complexity: "O(log n)", description: "Follow left pointers from the root." }),
        max: Object.freeze({ complexity: "O(log n)", description: "Follow right pointers from the root." }),
        height: Object.freeze({ complexity: "O(1)", description: "Stored height of the root (empty −1, leaf 0)." }),
        inspect: Object.freeze({ complexity: "O(n)", description: "Highlight the root, the leaves or the internal nodes." }),
        clear: Object.freeze({ complexity: "O(n)", description: "Unlink every node." }),
    }),
    pseudocode: Object.freeze({
        insert: Object.freeze([
            "if tree is full and key is new: return overflow error",
            "if root == null: root ← new leaf(key) with height 0; return",
            "walk down from root: key < node → left, key > node → right",
            "    if key == node.value: reject duplicate",
            "attach new leaf(key) with height 0 where the walk fell off",
            ...REBALANCE_LINES,
        ]),
        delete: Object.freeze([
            "if root == null: return empty error",
            "walk down from root: key < node → left, key > node → right",
            "if key not found: return error",
            "if node has no children: unlink it from its parent",
            "if node has one child: link its parent directly to that child",
            "else: successor ← leftmost node of node.right (in-order successor)",
            "    copy successor.value into node; replace successor by its right child",
            ...REBALANCE_LINES,
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
        ]),
        clear: Object.freeze([
            "unlink all nodes (O(n));  root ← null;  size ← 0",
        ]),
    }),
});

export class AVLNode {
    /**
     * @param {number} id stable positive integer identifier
     * @param {number} value integer key
     */
    constructor(id, value) {
        this.id = id;
        this.value = value;
        this.left = null;
        this.right = null;
        this.height = 0;
    }
}

/** Stored height of a subtree; empty is -1. */
const h = (node) => (node === null ? -1 : node.height);
/** Balance factor from stored child heights. */
const bf = (node) => h(node.left) - h(node.right);
const fmtBf = (b) => (b > 0 ? `+${b}` : String(b));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export class AVLTree {
    static MAX_CAPACITY = 31;

    #nextId = 1;

    /** @param {number} [capacity=31] integer from 1 to 31 */
    constructor(capacity = AVLTree.MAX_CAPACITY) {
        assertCapacity(capacity, 1, AVLTree.MAX_CAPACITY, "AVL tree");
        this.capacity = capacity;
        this.root = null;
        this._size = 0;
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

    /** Height of the tree from the root's stored height: empty -1, single node 0. O(1). */
    height() {
        return h(this.root);
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
     * `{ nodes: [{ id, value, left, right, height, balance }], rootId, size, capacity }`.
     * `height` is the stored height; `balance` is computed from the children's stored
     * heights, so mid-operation frames show the imbalance that triggers a rotation.
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
                height: node.height,
                balance: bf(node),
            });
            walk(node.right);
        };
        walk(this.root);
        return {
            nodes,
            rootId: this.root ? this.root.id : null,
            size: this._size,
            capacity: this.capacity,
        };
    }

    /**
     * Checks every invariant and returns null when sound, otherwise a description:
     * BST order against all ancestor bounds, stored heights equal real heights,
     * |balance| ≤ 1 everywhere, reachable node count equals size, no node or id
     * reachable twice, integer keys.
     * @returns {string | null}
     */
    integrityError() {
        if (!Number.isInteger(this._size) || this._size < 0 || this._size > this.capacity) {
            return `size (${this._size}) is outside 0..${this.capacity}`;
        }
        const seenNodes = new Set();
        const seenIds = new Set();
        let error = null;

        // Returns the real height of the subtree, or null after recording an error.
        const check = (node, lo, hi) => {
            if (node === null) return -1;
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
            if (!Number.isInteger(node.value)) {
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
            const hl = check(node.left, lo, node.value);
            if (hl === null) return null;
            const hr = check(node.right, node.value, hi);
            if (hr === null) return null;
            const real = 1 + Math.max(hl, hr);
            if (node.height !== real) {
                error = `stored height of ${node.value} is ${node.height}, real height is ${real}`;
                return null;
            }
            if (Math.abs(hl - hr) > 1) {
                error = `node ${node.value} has balance factor ${fmtBf(hl - hr)}`;
                return null;
            }
            return real;
        };

        if (check(this.root, null, null) === null) return error;
        if (seenNodes.size !== this._size) {
            return `reachable node count (${seenNodes.size}) does not equal size (${this._size})`;
        }
        return null;
    }

    /* ---------- operations ---------- */

    /**
     * Inserts a unique integer key, then rebalances. O(log n) tree work.
     * Fails (no throw) on duplicate or when the tree is full and the key is new.
     * Value on success: { id, value, rotations: [{ case, pivotValue }] }.
     * @param {number} value
     */
    insert(value) {
        const key = assertKey(value);
        const op = "insert";

        if (this.isFull() && !this.#contains(key)) {
            const error = `AVL tree is full: all ${plural(this.capacity, "slot")} are used, so ${key} cannot be inserted.`;
            return fail(error, [this.#step("overflow", op, { line: 1, message: error })]);
        }

        if (this.root === null) {
            const node = new AVLNode(this.#nextId++, key);
            this.root = node;
            this._size = 1;
            const steps = [
                this.#step("insert", op, {
                    nodeIds: [node.id],
                    pathIds: [node.id],
                    line: 2,
                    message: `The tree was empty, so ${key} becomes the root with height 0 and balance factor 0.`,
                }),
            ];
            steps.push(this.#step("done", op, {
                nodeIds: [node.id],
                line: 2,
                message: `Inserted ${key}. The tree has 1 node and height 0.`,
            }));
            return ok({ id: node.id, value: key, rotations: [] }, steps);
        }

        const steps = [];
        const path = [];
        let comparisons = 0;
        let curr = this.root;
        let node = null;

        while (node === null) {
            path.push(curr);
            comparisons++;
            const pathIds = path.map((n) => n.id);
            if (key === curr.value) {
                const error = `${key} is already in the AVL tree (keys must be unique).`;
                steps.push(this.#step("duplicate", op, {
                    nodeIds: [curr.id],
                    pathIds,
                    line: 4,
                    message: `${key} = ${curr.value}: duplicate key, insertion rejected.`,
                    comparisons,
                }));
                return fail(error, steps);
            }
            const goLeft = key < curr.value;
            const next = goLeft ? curr.left : curr.right;
            const side = goLeft ? "left" : "right";
            const sign = goLeft ? "<" : ">";
            if (next !== null) {
                steps.push(this.#step(goLeft ? "go-left" : "go-right", op, {
                    nodeIds: [curr.id],
                    pathIds,
                    line: 3,
                    message: `${key} ${sign} ${curr.value}: go ${side} to ${next.value}.`,
                    comparisons,
                }));
                curr = next;
                continue;
            }
            steps.push(this.#step("visit", op, {
                nodeIds: [curr.id],
                pathIds,
                line: 3,
                message: `${key} ${sign} ${curr.value}, and ${curr.value} has no ${side} child.`,
                comparisons,
            }));
            node = new AVLNode(this.#nextId++, key);
            const message = `Attach ${key} as the ${side} child of ${curr.value} (new leaf: height 0, balance factor 0).`;
            if (goLeft) curr.left = node;
            else curr.right = node;
            this._size++;
            steps.push(this.#step("insert", op, {
                nodeIds: [node.id],
                pathIds: [...pathIds, node.id],
                line: 5,
                message,
                comparisons,
            }));
        }

        const rotations = this.#retrace(path, op, INSERT_LOOP, steps, comparisons);
        steps.push(this.#step("done", op, {
            nodeIds: [node.id],
            line: INSERT_LOOP,
            message: `Inserted ${key}. ${describeRotations(rotations)} ` +
                `The tree has ${plural(this._size, "node")} and height ${this.height()}.`,
            comparisons,
        }));
        return ok({ id: node.id, value: key, rotations }, steps);
    }

    /**
     * Deletes a key, then rebalances. O(log n) tree work.
     * Fails (no throw) on an empty tree or a missing key.
     * Value: { id (node removed from the tree), value, case: "leaf" | "one-child" |
     * "two-children", successorValue?, rotations }.
     * @param {number} value
     */
    delete(value) {
        const key = assertKey(value);
        const op = "delete";

        if (this.root === null) {
            const error = `Cannot delete ${key}: the AVL tree is empty.`;
            return fail(error, [this.#step("empty", op, { line: 1, message: error })]);
        }

        const steps = [];
        const path = [];
        let comparisons = 0;
        let curr = this.root;

        while (curr !== null) {
            path.push(curr);
            comparisons++;
            const pathIds = path.map((n) => n.id);
            if (key === curr.value) {
                steps.push(this.#step("found", op, {
                    nodeIds: [curr.id],
                    pathIds,
                    line: 2,
                    message: `Found ${key}, the node to delete.`,
                    comparisons,
                }));
                break;
            }
            const goLeft = key < curr.value;
            const next = goLeft ? curr.left : curr.right;
            const side = goLeft ? "left" : "right";
            steps.push(this.#step(goLeft ? "go-left" : "go-right", op, {
                nodeIds: [curr.id],
                pathIds,
                line: 2,
                message: next
                    ? `${key} ${goLeft ? "<" : ">"} ${curr.value}: go ${side} to ${next.value}.`
                    : `${key} ${goLeft ? "<" : ">"} ${curr.value}: the ${side} child is empty.`,
                comparisons,
            }));
            curr = next;
        }

        if (curr === null) {
            const error = `${key} is not in the AVL tree, so it cannot be deleted.`;
            steps.push(this.#step("not-found", op, {
                pathIds: path.map((n) => n.id),
                line: 3,
                message: error,
                comparisons,
            }));
            return fail(error, steps);
        }

        const target = curr;
        path.pop(); // `path` now ends at target's parent
        const parent = path.length > 0 ? path[path.length - 1] : null;
        let result;

        if (target.left === null || target.right === null) {
            const child = target.left !== null ? target.left : target.right;
            const isLeaf = child === null;
            let message;
            if (isLeaf) {
                message = parent === null
                    ? `${key} is a leaf and the only node: remove it, the tree is now empty.`
                    : `${key} is a leaf: unlink it from its parent ${parent.value}.`;
            } else {
                const side = target.left !== null ? "left" : "right";
                message = parent === null
                    ? `${key} is the root with one ${side} child (${child.value}): ${child.value} becomes the root.`
                    : `${key} has one ${side} child (${child.value}): link ${parent.value} directly to ${child.value}.`;
            }
            this.#replaceChild(parent, target, child);
            target.left = null;
            target.right = null;
            this._size--;
            steps.push(this.#step(isLeaf ? "delete-leaf" : "delete-one-child", op, {
                nodeIds: child ? [child.id] : parent ? [parent.id] : [],
                pathIds: path.map((n) => n.id),
                line: isLeaf ? 4 : 5,
                message,
                comparisons,
            }));
            result = { id: target.id, value: key, case: isLeaf ? "leaf" : "one-child" };
        } else {
            path.push(target);
            let succParent = target;
            let succ = target.right;
            path.push(succ);
            steps.push(this.#step("find-successor", op, {
                nodeIds: [target.id, succ.id],
                pathIds: path.map((n) => n.id),
                line: 6,
                message: succ.left !== null
                    ? `${key} has two children: look for its in-order successor, the leftmost node of its right subtree. Start at ${succ.value}.`
                    : `${key} has two children. Its right child ${succ.value} has no left child, so ${succ.value} is the in-order successor.`,
                comparisons,
            }));
            while (succ.left !== null) {
                succParent = succ;
                succ = succ.left;
                path.push(succ);
                steps.push(this.#step("find-successor", op, {
                    nodeIds: [target.id, succ.id],
                    pathIds: path.map((n) => n.id),
                    line: 6,
                    message: succ.left !== null
                        ? `Go left to ${succ.value}.`
                        : `${succ.value} has no left child: it is the in-order successor of ${key}.`,
                    comparisons,
                }));
            }
            path.pop(); // path ends at succParent again
            const succVal = succ.value;
            const copyMessage = `Copy ${succVal} into the node that held ${key}.`;
            target.value = succVal;
            steps.push(this.#step("copy-successor", op, {
                nodeIds: [target.id, succ.id],
                pathIds: path.map((n) => n.id),
                line: 7,
                message: copyMessage,
                comparisons,
            }));
            const succRight = succ.right;
            const unlinkMessage = succRight !== null
                ? `Remove the old successor node: link ${succParent.value} to its right child ${succRight.value}.`
                : `Remove the old successor node (a leaf) from ${succParent.value}.`;
            this.#replaceChild(succParent, succ, succRight);
            succ.left = null;
            succ.right = null;
            this._size--;
            steps.push(this.#step("delete-successor", op, {
                nodeIds: succRight ? [succParent.id, succRight.id] : [succParent.id],
                pathIds: path.map((n) => n.id),
                line: 7,
                message: unlinkMessage,
                comparisons,
            }));
            result = { id: succ.id, value: key, case: "two-children", successorValue: succVal };
        }

        const rotations = this.#retrace(path, op, DELETE_LOOP, steps, comparisons);
        steps.push(this.#step("done", op, {
            line: DELETE_LOOP,
            message: this._size === 0
                ? `Deleted ${key}. The tree is now empty.`
                : `Deleted ${key}. ${describeRotations(rotations)} ` +
                  `The tree has ${plural(this._size, "node")} and height ${this.height()}.`,
            comparisons,
        }));
        return ok({ ...result, rotations }, steps);
    }

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
                    message: `Found ${key} after ${plural(comparisons, "comparison")}.`,
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
     * Highlights node roles in the current tree: "root", "leaves" or "internal".
     * O(n). Always ok (empty tree gives an empty list). Throws RangeError for an unknown kind.
     * Value: { ids, values } in in-order.
     * @param {"root" | "leaves" | "internal"} kind
     */
    inspect(kind) {
        if (!INSPECT_KINDS.includes(kind)) {
            throw new RangeError(`inspect kind must be one of ${INSPECT_KINDS.join(", ")} (got ${kind})`);
        }
        const picked = [];
        const walk = (node, isRoot) => {
            if (node === null) return;
            walk(node.left, false);
            const leaf = node.left === null && node.right === null;
            if ((kind === "root" && isRoot) || (kind === "leaves" && leaf) || (kind === "internal" && !leaf)) {
                picked.push(node);
            }
            walk(node.right, false);
        };
        walk(this.root, true);
        const values = picked.map((n) => n.value);
        const label = kind === "root" ? "Root" : kind === "leaves" ? "Leaves" : "Internal nodes";
        const message = this.root === null
            ? "The tree is empty: there is nothing to highlight."
            : kind === "root"
                ? `The root is ${values[0]} (height ${this.root.height}, balance factor ${fmtBf(bf(this.root))}).`
                : `${label} (${picked.length}): ${values.length > 0 ? values.join(", ") : "none"}.`;
        const step = this.#step("highlight", "inspect", {
            nodeIds: picked.map((n) => n.id),
            line: kind === "root" ? 1 : kind === "leaves" ? 2 : 3,
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
            node.left = null;
            node.right = null;
            unlink(left);
            unlink(right);
        };
        unlink(this.root);
        this.root = null;
        this._size = 0;
        return ok(count, [
            this.#step("done", "clear", {
                line: 1,
                message: `Cleared ${plural(count, "node")}. The tree is now empty.`,
            }),
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
            const error = `The AVL tree is empty, so there is no ${isMin ? "minimum" : "maximum"}.`;
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

    /** Points `parent`'s link to `oldChild` at `newChild` (or the root when parent is null). */
    #replaceChild(parent, oldChild, newChild) {
        if (parent === null) this.root = newChild;
        else if (parent.left === oldChild) parent.left = newChild;
        else parent.right = newChild;
    }

    /**
     * Walks `path` bottom-up, updating heights and rotating where |bf| = 2.
     * Stops early once a subtree's height is unchanged. Returns the rotations done.
     */
    #retrace(path, op, loop, steps, comparisons) {
        const rotations = [];
        const line = (k) => loop + RETRACE[k];

        for (let i = path.length - 1; i >= 0; i--) {
            const node = path[i];
            const parent = i > 0 ? path[i - 1] : null;
            const oldHeight = node.height;
            const newHeight = 1 + Math.max(h(node.left), h(node.right));
            const balance = bf(node);
            const heightText = oldHeight === newHeight
                ? `height stays ${newHeight}`
                : `height ${oldHeight} → ${newHeight}`;
            const verdict = Math.abs(balance) <= 1
                ? "balanced"
                : `UNBALANCED (${balance > 0 ? "left" : "right"}-heavy)`;
            const message = `Back at ${node.value}: ${heightText}, balance factor ${fmtBf(balance)} ` +
                `(left height ${h(node.left)}, right height ${h(node.right)}): ${verdict}.`;
            node.height = newHeight;
            steps.push(this.#step("update-height", op, {
                nodeIds: [node.id],
                pathIds: path.slice(0, i + 1).map((n) => n.id),
                line: line("update"),
                message,
                comparisons,
            }));

            let subtreeRoot = node;
            if (Math.abs(balance) > 1) {
                subtreeRoot = this.#rebalance(node, parent, balance, op, line, steps, comparisons, rotations);
            }

            if (i > 0 && subtreeRoot.height === oldHeight) {
                steps.push(this.#step("stop", op, {
                    nodeIds: [subtreeRoot.id],
                    line: line("stop"),
                    message: `The subtree rooted at ${subtreeRoot.value} still has height ${oldHeight}, ` +
                        "so no ancestor's height or balance factor changes. Rebalancing stops here.",
                    comparisons,
                }));
                break;
            }
        }
        return rotations;
    }

    /** Applies the LL / LR / RR / RL fix at `node`. Returns the new subtree root. */
    #rebalance(node, parent, balance, op, line, steps, comparisons, rotations) {
        const leftHeavy = balance > 1;
        const child = leftHeavy ? node.left : node.right;
        const childBf = bf(child);
        const single = leftHeavy ? childBf >= 0 : childBf <= 0;
        const kase = leftHeavy ? (single ? "LL" : "LR") : (single ? "RR" : "RL");
        const stages = single ? 1 : 2;
        const grand = single ? null : (leftHeavy ? child.right : child.left);
        const heavy = leftHeavy ? "left" : "right";
        const other = leftHeavy ? "right" : "left";

        let explanation;
        if (single) {
            explanation = `its ${heavy} child ${child.value} has balance factor ${fmtBf(childBf)} ` +
                `(${childBf === 0 ? "even" : `also ${heavy}-heavy`}). ${kase} case: one ${other} rotation around ${node.value}.`;
        } else {
            explanation = `but its ${heavy} child ${child.value} leans the other way (balance factor ${fmtBf(childBf)}). ` +
                `${kase} case: first rotate ${child.value} ${heavy}, then rotate ${node.value} ${other}.`;
        }
        steps.push(this.#step("unbalanced", op, {
            nodeIds: grand ? [node.id, child.id, grand.id] : [node.id, child.id],
            line: line(kase),
            message: `[${kase} case] ${node.value} has balance factor ${fmtBf(balance)} (${heavy}-heavy), ${explanation}`,
            comparisons,
            rotation: { case: kase, pivotId: node.id, pivotValue: node.value, stage: 0, stages },
        }));

        if (!single) {
            // Stage 1: rotate the child the opposite way, turning LR into LL (or RL into RR).
            const msg1 = this.#rotationMessage(child, heavy, `[${kase} case, rotation 1 of 2]`);
            const newChild = leftHeavy ? this.#rotateLeft(child) : this.#rotateRight(child);
            if (leftHeavy) node.left = newChild;
            else node.right = newChild;
            steps.push(this.#step(leftHeavy ? "rotate-left" : "rotate-right", op, {
                nodeIds: [newChild.id, child.id],
                line: line(kase),
                message: msg1,
                comparisons,
                rotation: { case: kase, pivotId: node.id, pivotValue: node.value, stage: 1, stages },
            }));
        }

        const label = single ? `[${kase} case]` : `[${kase} case, rotation 2 of 2]`;
        const msg = this.#rotationMessage(node, other, label);
        const newRoot = leftHeavy ? this.#rotateRight(node) : this.#rotateLeft(node);
        this.#replaceChild(parent, node, newRoot);
        steps.push(this.#step(leftHeavy ? "rotate-right" : "rotate-left", op, {
            nodeIds: [newRoot.id, node.id],
            line: line(kase),
            message: `${msg} ${newRoot.value} now has height ${newRoot.height} and balance factor ${fmtBf(bf(newRoot))}.`,
            comparisons,
            rotation: { case: kase, pivotId: node.id, pivotValue: node.value, stage: stages, stages },
        }));
        rotations.push({ case: kase, pivotValue: node.value, newRootValue: newRoot.value });
        return newRoot;
    }

    /** Describes a rotation of `node` in `direction`, from the state before it happens. */
    #rotationMessage(node, direction, label) {
        const up = direction === "right" ? node.left : node.right;
        const inner = direction === "right" ? up.right : up.left;
        const toward = direction === "right" ? "right" : "left";
        const innerSide = direction === "right" ? "left" : "right";
        return `${label} Rotate ${direction} around ${node.value}: ${up.value} moves up, ` +
            `${node.value} becomes its ${toward} child` +
            (inner !== null
                ? `, and ${inner.value} moves across to become ${node.value}'s ${innerSide} child.`
                : ".");
    }

    /** Right rotation. Heights of the demoted node, then the promoted node, are recomputed. */
    #rotateRight(z) {
        const y = z.left;
        z.left = y.right;
        y.right = z;
        z.height = 1 + Math.max(h(z.left), h(z.right));
        y.height = 1 + Math.max(h(y.left), h(y.right));
        return y;
    }

    /** Left rotation. Heights of the demoted node, then the promoted node, are recomputed. */
    #rotateLeft(z) {
        const y = z.right;
        z.right = y.left;
        y.left = z;
        z.height = 1 + Math.max(h(z.left), h(z.right));
        y.height = 1 + Math.max(h(y.left), h(y.right));
        return y;
    }

    #step(type, operation, { nodeIds = [], pathIds = [], line, message, comparisons = 0, rotation } = {}) {
        const lines = AVL_INFO.pseudocode[operation];
        if (!lines || !Number.isInteger(line) || line < 1 || line > lines.length) {
            throw new RangeError(`Invalid pseudocode line ${line} for operation "${operation}"`);
        }
        const step = { type, operation, nodeIds, pathIds, line, message, comparisons, snapshot: this.snapshot() };
        if (rotation !== undefined) step.rotation = rotation;
        return step;
    }
}

function describeRotations(rotations) {
    if (rotations.length === 0) return "No rotation was needed: every balance factor is −1, 0 or +1.";
    const parts = rotations.map((r) => `${r.case} at ${r.pivotValue} (${r.newRootValue} moved up)`);
    return `Rebalanced with ${plural(rotations.length, "rotation case")}: ${parts.join("; ")}.`;
}

function assertKey(value) {
    assertValue(value);
    if (!Number.isSafeInteger(value)) {
        throw new TypeError(`AVL key must be a safe integer (got ${value})`);
    }
    return value === 0 ? 0 : value;
}
