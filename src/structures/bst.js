import { ok, fail, assertCapacity, assertValue } from "./result.js";

/**
 * Binary Search Tree made of real node objects:
 *   { id, value, left, right }
 * Every node has a stable, monotonically increasing integer `id` so visualizers
 * can follow individual nodes across steps and animations.
 *
 * Key rules:
 * - Keys are unique integers (including 0 and negative integers).
 * - Capacity is an integer in 1..31 (default 31).
 * - Empty tree height is -1; a single-node tree has height 0 (edge-count convention).
 * - No -1 sentinels for "not found": search() returns ok({ found: false, id: null, value }, steps),
 *   and min()/max()/delete() on an empty tree return fail(error, steps).
 *
 * DOM-free. Every operation that mutates or traverses returns { ok, value?, error?, steps }.
 * Each step has the shape:
 *   { type, operation, nodeIds, pathIds, line, message, comparisons, visited?, snapshot }
 * where `line` is a 1-based line number in BST_INFO.pseudocode[operation],
 * `pathIds` is the trail of node ids visited along the active path, and `snapshot`
 * is a plain deep copy { nodes: [{ id, value, left, right }], rootId, size, capacity }.
 * Messages describing a mutation are built from pre-mutation state before mutating pointers/values.
 */

export const TRAVERSAL_ORDERS = Object.freeze(["inorder", "preorder", "postorder", "levelorder"]);

const TRAVERSAL_LABELS = Object.freeze({
    inorder: "In-Order",
    preorder: "Pre-Order",
    postorder: "Post-Order",
    levelorder: "Level-Order",
});

/** Registry entry, matching the site's shared metadata pattern. */
export const BST_INFO = Object.freeze({
    name: "Binary Search Tree",
    summary:
        "A linked binary tree where every node's left subtree holds strictly smaller keys " +
        "and its right subtree holds strictly larger keys (unique keys only). Search, insert, " +
        "delete, and min/max follow one root-to-leaf path, taking O(h) time for tree height h " +
        "(empty = −1, single node = 0).",
    complexity: Object.freeze({
        search: "O(h) — O(log n) balanced, O(n) skewed",
        insert: "O(h) — O(log n) balanced, O(n) skewed",
        delete: "O(h) — O(log n) balanced, O(n) skewed",
        minMax: "O(h) — O(log n) balanced, O(n) skewed",
        traverse: "O(n)",
        space: "O(n)",
    }),
    pseudocode: Object.freeze({
        insert: Object.freeze([
            "if size == capacity: return overflow error",
            "if root == null: root ← new Node(value); return",
            "curr ← root",
            "loop: compare value with curr.value",
            "    if value == curr.value: reject duplicate",
            "    if value < curr.value: go left (or attach new node)",
            "    if value > curr.value: go right (or attach new node)",
        ]),
        search: Object.freeze([
            "curr ← root",
            "while curr != null",
            "    if target == curr.value: return found",
            "    if target < curr.value: curr ← curr.left",
            "    else: curr ← curr.right",
            "return not found",
        ]),
        delete: Object.freeze([
            "search for target node (tracking parent)",
            "if target not found: return error",
            "if target is a leaf: unlink target from parent",
            "else if target has 1 child: replace target with its child",
            "else (2 children): find in-order successor (min of right)",
            "    copy successor.value into target",
            "    replace successor with successor.right",
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
        inorder: Object.freeze([
            "inorder(node): if node == null: return",
            "    inorder(node.left)",
            "    visit(node)  // Left → Root → Right",
            "    inorder(node.right)",
        ]),
        preorder: Object.freeze([
            "preorder(node): if node == null: return",
            "    visit(node)  // Root → Left → Right",
            "    preorder(node.left)",
            "    preorder(node.right)",
        ]),
        postorder: Object.freeze([
            "postorder(node): if node == null: return",
            "    postorder(node.left)",
            "    postorder(node.right)",
            "    visit(node)  // Left → Right → Root",
        ]),
        levelorder: Object.freeze([
            "enqueue root (if not null)",
            "while queue is not empty",
            "    node ← dequeue();  visit(node)",
            "    enqueue node.left and node.right (if not null)",
        ]),
        clear: Object.freeze([
            "unlink all nodes (O(n));  root ← null;  size ← 0",
        ]),
    }),
});

export class BSTNode {
    /**
     * @param {number} id stable positive integer identifier
     * @param {number} value integer key
     * @param {BSTNode | null} [left]
     * @param {BSTNode | null} [right]
     */
    constructor(id, value, left = null, right = null) {
        this.id = id;
        this.value = value;
        this.left = left;
        this.right = right;
    }
}

export class BinarySearchTree {
    static MAX_CAPACITY = 31;

    #nextId = 1;

    /**
     * @param {number} [capacity=31] integer from 1 to MAX_CAPACITY (31)
     */
    constructor(capacity = BinarySearchTree.MAX_CAPACITY) {
        assertCapacity(capacity, 1, BinarySearchTree.MAX_CAPACITY, "BST");
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

    /**
     * Returns the height of the tree using the edge-count convention:
     * - Empty tree: -1
     * - Single-node tree: 0
     * - Non-empty tree: 1 + max(height(left), height(right))
     * O(n) time, O(h) stack space.
     *
     * @returns {number}
     */
    height() {
        return subtreeHeight(this.root);
    }

    /**
     * Returns all keys in ascending (in-order) sequence. O(n) time.
     *
     * @returns {number[]}
     */
    toArray() {
        const out = [];
        const walk = (node) => {
            if (node === null) return;
            walk(node.left);
            out.push(node.value);
            walk(node.right);
        };
        walk(this.root);
        return out;
    }

    /**
     * Returns a plain deep copy of the tree suitable for rendering and step replay:
     * `{ nodes: [{ id, value, left, right }], rootId, size, capacity }`.
     * Child references are node ids or `null`. Guards against cycles if pointers
     * were corrupted externally.
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
     * Verifies all structural and BST invariants:
     * 1. In-order walk is strictly increasing.
     * 2. Every node's value satisfies strict (min, max) ancestor bounds (not only immediate parent).
     * 3. Reachable node count equals `size` (and `0 <= size <= capacity`).
     * 4. No node is reachable twice (no cycle or shared child) and no duplicate ids exist.
     *
     * @returns {string | null} `null` when sound, otherwise a descriptive error string.
     */
    integrityError() {
        if (!Number.isInteger(this._size) || this._size < 0 || this._size > this.capacity) {
            return `size (${this._size}) is outside 0..${this.capacity}`;
        }
        if (this.root === null) {
            return this._size === 0 ? null : `empty tree has size ${this._size} instead of 0`;
        }

        const seenNodes = new Set();
        const seenIds = new Set();
        let prevInorder = null;

        const check = (node, min, max) => {
            if (node === null) return null;
            if (seenNodes.has(node)) {
                return `cycle or shared child detected at node #${node.id} (value ${node.value})`;
            }
            if (seenIds.has(node.id)) {
                return `duplicate node id #${node.id}`;
            }
            seenNodes.add(node);
            seenIds.add(node.id);

            if (!Number.isInteger(node.value)) {
                return `non-integer key detected at node #${node.id}: ${node.value}`;
            }
            if (min !== null && node.value <= min) {
                return `BST ancestor bound violated at node #${node.id}: value ${node.value} must be > ${min}`;
            }
            if (max !== null && node.value >= max) {
                return `BST ancestor bound violated at node #${node.id}: value ${node.value} must be < ${max}`;
            }

            const leftErr = check(node.left, min, node.value);
            if (leftErr !== null) return leftErr;

            if (prevInorder !== null && node.value <= prevInorder) {
                return `in-order sequence is not strictly increasing: ${node.value} follows ${prevInorder}`;
            }
            prevInorder = node.value;

            return check(node.right, node.value, max);
        };

        const err = check(this.root, null, null);
        if (err !== null) return err;

        if (seenNodes.size !== this._size) {
            return `reachable node count (${seenNodes.size}) does not equal size (${this._size})`;
        }
        return null;
    }

    /* ---------- mutating & traced operations ---------- */

    /** Untraced O(h) membership check used to order insert's error checks. */
    #containsKey(key) {
        let curr = this.root;
        while (curr !== null) {
            if (key === curr.value) return true;
            curr = key < curr.value ? curr.left : curr.right;
        }
        return false;
    }

    /**
     * Inserts a unique integer key into the BST. O(h) time.
     * Rejects duplicates (checked first, along the search path) and overflow
     * (when `isFull()` and the key is new) with `{ ok: false, error, steps }`.
     *
     * @param {number} value integer key (0 and negatives allowed)
     */
    insert(value) {
        const key = assertKey(value);

        // Duplicate wins over overflow: when the tree is full but already holds `key`,
        // fall through to the normal search path, which ends on the "duplicate" step
        // without attaching anything.
        if (this.isFull() && !this.#containsKey(key)) {
            const error =
                `BST overflow: ${this.capacity === 1 ? "the only slot is" : `all ${this.capacity} slots are`} ` +
                `used, so ${key} cannot be inserted.`;
            return fail(error, [
                this.#step("overflow", "insert", {
                    line: 1,
                    message: error,
                    comparisons: 0,
                }),
            ]);
        }

        if (this.root === null) {
            const node = new BSTNode(this.#nextId++, key);
            const message = `The tree was empty, so ${key} becomes the root.`;
            this.root = node;
            this._size = 1;
            return ok({ id: node.id, value: key }, [
                this.#step("insert", "insert", {
                    nodeIds: [node.id],
                    pathIds: [node.id],
                    line: 2,
                    message,
                    comparisons: 0,
                }),
            ]);
        }

        const steps = [];
        const pathIds = [];
        let comparisons = 0;
        let curr = this.root;

        for (;;) {
            pathIds.push(curr.id);
            comparisons++;

            if (key === curr.value) {
                const error = `Value ${key} is already in the BST (keys must be unique).`;
                steps.push(
                    this.#step("duplicate", "insert", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 5,
                        message: `Compare ${key} with ${curr.value}: duplicate key found at node #${curr.id}. Insertion rejected.`,
                        comparisons,
                    }),
                );
                return fail(error, steps);
            }

            if (key < curr.value) {
                if (curr.left === null) {
                    steps.push(
                        this.#step("visit", "insert", {
                            nodeIds: [curr.id],
                            pathIds: pathIds.slice(),
                            line: 4,
                            message: `${key} < ${curr.value}, and ${curr.value} has no left child.`,
                            comparisons,
                        }),
                    );
                    const node = new BSTNode(this.#nextId++, key);
                    const message = `Attach ${key} as the left child of ${curr.value}.`;
                    curr.left = node;
                    this._size++;
                    pathIds.push(node.id);
                    steps.push(
                        this.#step("insert", "insert", {
                            nodeIds: [node.id],
                            pathIds: pathIds.slice(),
                            line: 6,
                            message,
                            comparisons,
                        }),
                    );
                    return ok({ id: node.id, value: key }, steps);
                }

                steps.push(
                    this.#step("go-left", "insert", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 6,
                        message: `${key} < ${curr.value}: move to left child (${curr.left.value}).`,
                        comparisons,
                    }),
                );
                curr = curr.left;
            } else {
                if (curr.right === null) {
                    steps.push(
                        this.#step("visit", "insert", {
                            nodeIds: [curr.id],
                            pathIds: pathIds.slice(),
                            line: 4,
                            message: `${key} > ${curr.value}, and ${curr.value} has no right child.`,
                            comparisons,
                        }),
                    );
                    const node = new BSTNode(this.#nextId++, key);
                    const message = `Attach ${key} as the right child of ${curr.value}.`;
                    curr.right = node;
                    this._size++;
                    pathIds.push(node.id);
                    steps.push(
                        this.#step("insert", "insert", {
                            nodeIds: [node.id],
                            pathIds: pathIds.slice(),
                            line: 7,
                            message,
                            comparisons,
                        }),
                    );
                    return ok({ id: node.id, value: key }, steps);
                }

                steps.push(
                    this.#step("go-right", "insert", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 7,
                        message: `${key} > ${curr.value}: move to right child (${curr.right.value}).`,
                        comparisons,
                    }),
                );
                curr = curr.right;
            }
        }
    }

    /**
     * Searches for `value` from the root. O(h) time.
     * Returns `ok({ found: true, id, value }, steps)` when present, or
     * `ok({ found: false, id: null, value }, steps)` when absent (no -1 sentinels).
     *
     * @param {number} value integer key
     */
    search(value) {
        const key = assertKey(value);
        const steps = [];
        const pathIds = [];
        let comparisons = 0;

        if (this.root === null) {
            steps.push(
                this.#step("not-found", "search", {
                    line: 6,
                    message: `The BST is empty, so ${key} is not found.`,
                    comparisons: 0,
                }),
            );
            return ok({ found: false, id: null, value: key }, steps);
        }

        let curr = this.root;
        while (curr !== null) {
            pathIds.push(curr.id);
            comparisons++;

            if (key === curr.value) {
                steps.push(
                    this.#step("found", "search", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 3,
                        message: `Found ${key} at node #${curr.id} after ${comparisons} comparison${comparisons === 1 ? "" : "s"}.`,
                        comparisons,
                    }),
                );
                return ok({ found: true, id: curr.id, value: curr.value }, steps);
            }

            if (key < curr.value) {
                steps.push(
                    this.#step("go-left", "search", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 4,
                        message: curr.left
                            ? `${key} < ${curr.value}: search left subtree (move to ${curr.left.value}).`
                            : `${key} < ${curr.value}: left child is NULL.`,
                        comparisons,
                    }),
                );
                curr = curr.left;
            } else {
                steps.push(
                    this.#step("go-right", "search", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 5,
                        message: curr.right
                            ? `${key} > ${curr.value}: search right subtree (move to ${curr.right.value}).`
                            : `${key} > ${curr.value}: right child is NULL.`,
                        comparisons,
                    }),
                );
                curr = curr.right;
            }
        }

        steps.push(
            this.#step("not-found", "search", {
                pathIds: pathIds.slice(),
                line: 6,
                message: `Reached NULL after ${comparisons} comparison${comparisons === 1 ? "" : "s"}: ${key} is not in the BST.`,
                comparisons,
            }),
        );
        return ok({ found: false, id: null, value: key }, steps);
    }

    /**
     * Deletes `value` from the BST. O(h) time.
     * Covers all three structural cases:
     * 1. Leaf (`delete-leaf`)
     * 2. One child (`delete-one-child`)
     * 3. Two children using the in-order successor (minimum of right subtree):
     *    records `find-successor` while descending left, `copy-successor`, and
     *    relinks the successor's right child.
     *
     * @param {number} value integer key
     */
    delete(value) {
        const key = assertKey(value);

        if (this.root === null) {
            const error = `Cannot delete ${key}: the BST is empty.`;
            return fail(error, [
                this.#step("empty", "delete", {
                    line: 2,
                    message: error,
                    comparisons: 0,
                }),
            ]);
        }

        const steps = [];
        const pathIds = [];
        let comparisons = 0;
        let parent = null;
        let curr = this.root;

        while (curr !== null) {
            pathIds.push(curr.id);
            comparisons++;

            if (key === curr.value) {
                steps.push(
                    this.#step("found", "delete", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 1,
                        message: `Found ${key} at node #${curr.id} to delete.`,
                        comparisons,
                    }),
                );
                break;
            }

            if (key < curr.value) {
                steps.push(
                    this.#step("go-left", "delete", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 1,
                        message: curr.left
                            ? `${key} < ${curr.value}: move left to ${curr.left.value}.`
                            : `${key} < ${curr.value}: left child is NULL.`,
                        comparisons,
                    }),
                );
                parent = curr;
                curr = curr.left;
            } else {
                steps.push(
                    this.#step("go-right", "delete", {
                        nodeIds: [curr.id],
                        pathIds: pathIds.slice(),
                        line: 1,
                        message: curr.right
                            ? `${key} > ${curr.value}: move right to ${curr.right.value}.`
                            : `${key} > ${curr.value}: right child is NULL.`,
                        comparisons,
                    }),
                );
                parent = curr;
                curr = curr.right;
            }
        }

        if (curr === null) {
            const error = `Value ${key} is not in the BST, so it cannot be deleted.`;
            steps.push(
                this.#step("not-found", "delete", {
                    pathIds: pathIds.slice(),
                    line: 2,
                    message: error,
                    comparisons,
                }),
            );
            return fail(error, steps);
        }

        // Case 1: Leaf node (no children).
        if (curr.left === null && curr.right === null) {
            const deletedId = curr.id;
            const deletedVal = curr.value;
            const message = parent === null
                ? `Case 1 (leaf): ${deletedVal} is the only node (root). Remove it; the BST is now empty.`
                : `Case 1 (leaf): ${deletedVal} has no children. Unlink it from parent ${parent.value}.`;

            if (parent === null) {
                this.root = null;
            } else if (parent.left === curr) {
                parent.left = null;
            } else {
                parent.right = null;
            }
            this._size--;

            steps.push(
                this.#step("delete-leaf", "delete", {
                    nodeIds: parent ? [parent.id] : [],
                    pathIds: pathIds.slice(0, -1),
                    line: 3,
                    message,
                    comparisons,
                }),
            );
            steps.push(
                this.#step("done", "delete", {
                    nodeIds: [],
                    pathIds: [],
                    line: 3,
                    message: this._size === 0
                        ? `Deleted ${deletedVal}. The BST is now empty.`
                        : `Deleted ${deletedVal}. The BST now has ${this._size} node${this._size === 1 ? "" : "s"}.`,
                    comparisons,
                }),
            );
            return ok({ id: deletedId, value: deletedVal, case: "leaf" }, steps);
        }

        // Case 2: Exactly one child.
        if (curr.left === null || curr.right === null) {
            const deletedId = curr.id;
            const deletedVal = curr.value;
            const child = curr.left !== null ? curr.left : curr.right;
            const side = curr.left !== null ? "left" : "right";
            const message = parent === null
                ? `Case 2 (one child): root ${deletedVal} has one ${side} child (${child.value}). Promote ${child.value} to root.`
                : `Case 2 (one child): ${deletedVal} has one ${side} child (${child.value}). Link parent ${parent.value} directly to ${child.value}.`;

            if (parent === null) {
                this.root = child;
            } else if (parent.left === curr) {
                parent.left = child;
            } else {
                parent.right = child;
            }
            curr.left = null;
            curr.right = null;
            this._size--;

            steps.push(
                this.#step("delete-one-child", "delete", {
                    nodeIds: [child.id],
                    pathIds: [...pathIds.slice(0, -1), child.id],
                    line: 4,
                    message,
                    comparisons,
                }),
            );
            steps.push(
                this.#step("done", "delete", {
                    nodeIds: [child.id],
                    pathIds: [],
                    line: 4,
                    message: `Deleted ${deletedVal}; ${child.value} took its place. The BST now has ${this._size} node${this._size === 1 ? "" : "s"}.`,
                    comparisons,
                }),
            );
            return ok({ id: deletedId, value: deletedVal, case: "one-child" }, steps);
        }

        // Case 3: Two children — replace with the in-order successor (minimum of right subtree).
        const deletedId = curr.id;
        const deletedVal = curr.value;
        let succParent = curr;
        let succ = curr.right;
        const succPath = [...pathIds, succ.id];

        steps.push(
            this.#step("find-successor", "delete", {
                nodeIds: [curr.id, succ.id],
                pathIds: succPath.slice(),
                line: 5,
                message: succ.left !== null
                    ? `Case 3 (two children): step into right subtree at ${succ.value} to find the in-order successor.`
                    : `Case 3 (two children): right child ${succ.value} has no left child, so it is the in-order successor of ${deletedVal}.`,
                comparisons,
            }),
        );

        while (succ.left !== null) {
            succParent = succ;
            succ = succ.left;
            succPath.push(succ.id);
            steps.push(
                this.#step("find-successor", "delete", {
                    nodeIds: [curr.id, succ.id],
                    pathIds: succPath.slice(),
                    line: 5,
                    message: succ.left !== null
                        ? `Move left to ${succ.value} while searching for the in-order successor.`
                        : `Reached ${succ.value} (no left child): this is the in-order successor of ${deletedVal}.`,
                    comparisons,
                }),
            );
        }

        const succVal = succ.value;
        const succRight = succ.right;

        // Build copy message before mutating curr.value.
        const copyMessage =
            `Copy the in-order successor's value (${succVal}) into node #${curr.id} (replacing ${deletedVal}).`;
        curr.value = succVal;
        steps.push(
            this.#step("copy-successor", "delete", {
                nodeIds: [curr.id, succ.id],
                pathIds: succPath.slice(),
                line: 6,
                message: copyMessage,
                comparisons,
            }),
        );

        // Build relink message before mutating successor's parent pointer.
        const relinkMessage = succRight !== null
            ? `Unlink the old in-order successor node (#${succ.id}) by attaching its right child (${succRight.value}) to node #${succParent.id} (${succParent.value}).`
            : `Unlink the old in-order successor node (#${succ.id}, a leaf) from node #${succParent.id} (${succParent.value}).`;

        if (succParent === curr) {
            succParent.right = succRight;
        } else {
            succParent.left = succRight;
        }
        succ.left = null;
        succ.right = null;
        this._size--;

        steps.push(
            this.#step("done", "delete", {
                nodeIds: succRight ? [curr.id, succRight.id] : [curr.id],
                pathIds: pathIds.slice(),
                line: 7,
                message: relinkMessage,
                comparisons,
            }),
        );

        return ok(
            { id: deletedId, value: deletedVal, successorValue: succVal, case: "two-children" },
            steps,
        );
    }

    /**
     * Finds the minimum key by following left pointers from root. O(h) time.
     * Returns `ok({ id, value }, steps)` or `fail(error, steps)` when empty.
     */
    min() {
        if (this.root === null) {
            const error = "The BST is empty, so there is no minimum value.";
            return fail(error, [
                this.#step("empty", "min", {
                    line: 1,
                    message: error,
                    comparisons: 0,
                }),
            ]);
        }

        const steps = [];
        let curr = this.root;
        const pathIds = [curr.id];

        while (curr.left !== null) {
            steps.push(
                this.#step("go-left", "min", {
                    nodeIds: [curr.id],
                    pathIds: pathIds.slice(),
                    line: 3,
                    message: `${curr.value} has a left child (${curr.left.value}): follow left pointer for a smaller key.`,
                    comparisons: 0,
                }),
            );
            curr = curr.left;
            pathIds.push(curr.id);
        }

        steps.push(
            this.#step("found", "min", {
                nodeIds: [curr.id],
                pathIds: pathIds.slice(),
                line: 4,
                message: `${curr.value} has no left child, so ${curr.value} is the minimum key.`,
                comparisons: 0,
            }),
        );
        return ok({ id: curr.id, value: curr.value }, steps);
    }

    /**
     * Finds the maximum key by following right pointers from root. O(h) time.
     * Returns `ok({ id, value }, steps)` or `fail(error, steps)` when empty.
     */
    max() {
        if (this.root === null) {
            const error = "The BST is empty, so there is no maximum value.";
            return fail(error, [
                this.#step("empty", "max", {
                    line: 1,
                    message: error,
                    comparisons: 0,
                }),
            ]);
        }

        const steps = [];
        let curr = this.root;
        const pathIds = [curr.id];

        while (curr.right !== null) {
            steps.push(
                this.#step("go-right", "max", {
                    nodeIds: [curr.id],
                    pathIds: pathIds.slice(),
                    line: 3,
                    message: `${curr.value} has a right child (${curr.right.value}): follow right pointer for a larger key.`,
                    comparisons: 0,
                }),
            );
            curr = curr.right;
            pathIds.push(curr.id);
        }

        steps.push(
            this.#step("found", "max", {
                nodeIds: [curr.id],
                pathIds: pathIds.slice(),
                line: 4,
                message: `${curr.value} has no right child, so ${curr.value} is the maximum key.`,
                comparisons: 0,
            }),
        );
        return ok({ id: curr.id, value: curr.value }, steps);
    }

    /**
     * Traverses the BST in the requested order. O(n) time.
     * Each `visit` step carries `visited`, a copy of the growing array of visited values.
     *
     * @param {"inorder"|"preorder"|"postorder"|"levelorder"} order
     */
    traverse(order) {
        if (!TRAVERSAL_ORDERS.includes(order)) {
            throw new RangeError(
                `Traversal order must be one of ${TRAVERSAL_ORDERS.join(", ")} (got ${order})`,
            );
        }

        const orderLabel = TRAVERSAL_LABELS[order] ?? order;

        if (this.root === null) {
            return ok([], [
                this.#step("empty", order, {
                    line: 1,
                    message: `The BST is empty, so ${orderLabel} traversal visits 0 nodes.`,
                    comparisons: 0,
                    visited: [],
                }),
            ]);
        }

        const visitLine =
            order === "inorder" ? 3
            : order === "preorder" ? 2
            : order === "postorder" ? 4
            : 3;

        const result = [];
        const visitedIds = [];
        const steps = [];

        const recordVisit = (node) => {
            result.push(node.value);
            visitedIds.push(node.id);
            steps.push(
                this.#step("visit", order, {
                    nodeIds: [node.id],
                    pathIds: visitedIds.slice(),
                    line: visitLine,
                    message: `Visit ${node.value} (${orderLabel} #${result.length}: [${result.join(", ")}]).`,
                    comparisons: 0,
                    visited: result.slice(),
                }),
            );
        };

        if (order === "inorder") {
            const walk = (node) => {
                if (node === null) return;
                walk(node.left);
                recordVisit(node);
                walk(node.right);
            };
            walk(this.root);
        } else if (order === "preorder") {
            const walk = (node) => {
                if (node === null) return;
                recordVisit(node);
                walk(node.left);
                walk(node.right);
            };
            walk(this.root);
        } else if (order === "postorder") {
            const walk = (node) => {
                if (node === null) return;
                walk(node.left);
                walk(node.right);
                recordVisit(node);
            };
            walk(this.root);
        } else {
            // Level-order (BFS) using an index-head queue so traversal is strictly O(n).
            const queue = [this.root];
            for (let head = 0; head < queue.length; head++) {
                const node = queue[head];
                recordVisit(node);
                if (node.left !== null) queue.push(node.left);
                if (node.right !== null) queue.push(node.right);
            }
        }

        steps.push(
            this.#step("done", order, {
                nodeIds: [],
                pathIds: visitedIds.slice(),
                line: visitLine,
                message: `${orderLabel} traversal complete: [${result.join(", ")}].`,
                comparisons: 0,
                visited: result.slice(),
            }),
        );

        return ok(result, steps);
    }

    /**
     * Removes all nodes from the BST. O(n) time to unlink every node cleanly.
     */
    clear() {
        const count = this._size;
        const unlink = (node) => {
            if (node === null) return;
            const left = node.left;
            const right = node.right;
            node.left = null;
            node.right = null;
            unlink(left);
            unlink(right);
        };
        unlink(this.root);
        this.root = null;
        this._size = 0;
        const message = `Cleared ${count} node${count === 1 ? "" : "s"}. The BST is now empty.`;
        return ok(count, [
            this.#step("done", "clear", {
                line: 1,
                message,
                comparisons: 0,
            }),
        ]);
    }

    /* ---------- internals ---------- */

    #step(type, operation, { nodeIds = [], pathIds = [], line, message, comparisons = 0, visited } = {}) {
        const lines = BST_INFO.pseudocode[operation];
        if (!lines || !Number.isInteger(line) || line < 1 || line > lines.length) {
            throw new RangeError(`Invalid pseudocode line ${line} for operation "${operation}"`);
        }
        const step = {
            type,
            operation,
            nodeIds,
            pathIds,
            line,
            message,
            comparisons,
            snapshot: this.snapshot(),
        };
        if (visited !== undefined) {
            step.visited = visited;
        }
        return step;
    }
}

function subtreeHeight(node) {
    if (node === null) return -1;
    return 1 + Math.max(subtreeHeight(node.left), subtreeHeight(node.right));
}

function assertKey(value) {
    assertValue(value);
    if (!Number.isInteger(value)) {
        throw new TypeError(`BST key must be an integer (got ${value})`);
    }
    // Normalize -0 to 0 so keys never surprise strict equality checks.
    return value === 0 ? 0 : value;
}
