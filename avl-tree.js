class TreeNode {
    constructor(value) {
        // Stable identity so the visualizer can follow the same node as rotations move it.
        this.id = TreeNode.nextId++;
        this.value = value;
        this.left = null;
        this.right = null;
        this.parent = null;
        this.height = 1;
    }
}
TreeNode.nextId = 1;

/**
 * TreeView: draws AVL snapshots on the canvas and animates between them by node id.
 *
 * Snapshots are plain data: { rootId, nodes: { [id]: { id, value, left, right, height, bf } } }.
 * plainInsert / plainDelete replay a normal BST insert/delete on a snapshot (no rebalancing),
 * which is exactly the tree the AVL algorithm sees just before it rotates. The animation shows
 * that real intermediate state, then slides every node to where the rotation put it.
 * No DOM access happens until something is drawn, so avl-tree.js still loads in Node tests.
 */
class TreeView {
    constructor(canvasId) {
        this.canvasId = canvasId;
        this.token = 0;   // bumps on every new draw/transition to cancel older animations
        this.current = null;
    }

    /* ---------- snapshots (pure) ---------- */

    static snapshot(root) {
        const nodes = {};
        const walk = (n) => {
            if (!n) return 0;
            const hl = walk(n.left);
            const hr = walk(n.right);
            nodes[n.id] = { id: n.id, value: n.value, left: n.left ? n.left.id : null, right: n.right ? n.right.id : null,
                            height: 1 + Math.max(hl, hr), bf: hl - hr };
            return 1 + Math.max(hl, hr);
        };
        walk(root);
        return { rootId: root ? root.id : null, nodes };
    }

    static clone(snap) {
        const nodes = {};
        for (const id in snap.nodes) nodes[id] = { ...snap.nodes[id] };
        return { rootId: snap.rootId, nodes };
    }

    static recompute(snap) {
        const h = (id) => {
            if (id === null) return 0;
            const n = snap.nodes[id];
            const hl = h(n.left);
            const hr = h(n.right);
            n.height = 1 + Math.max(hl, hr);
            n.bf = hl - hr;
            return n.height;
        };
        h(snap.rootId);
        return snap;
    }

    /** Plain BST insert (no rotations). newId must be the id the real TreeNode will get. */
    static plainInsert(snap, value, newId) {
        const s = TreeView.clone(snap);
        const node = { id: newId, value, left: null, right: null, height: 1, bf: 0 };
        if (s.rootId === null) { s.nodes[newId] = node; s.rootId = newId; return s; }
        let cur = s.nodes[s.rootId];
        for (;;) {
            if (value === cur.value) return TreeView.recompute(s); // duplicate: unchanged
            const side = value < cur.value ? 'left' : 'right';
            if (cur[side] === null) { cur[side] = newId; s.nodes[newId] = node; break; }
            cur = s.nodes[cur[side]];
        }
        return TreeView.recompute(s);
    }

    /** Plain BST delete (no rotations), mirroring AVLTree.removeNode's node identity rules. */
    static plainDelete(snap, value) {
        const s = TreeView.clone(snap);
        const removeFrom = (id, v) => {          // returns new subtree root id
            if (id === null) return null;
            const n = s.nodes[id];
            if (v < n.value) { n.left = removeFrom(n.left, v); return id; }
            if (v > n.value) { n.right = removeFrom(n.right, v); return id; }
            if (n.left === null || n.right === null) {
                const child = n.left !== null ? n.left : n.right;
                delete s.nodes[id];
                return child;
            }
            let succ = s.nodes[n.right];
            while (succ.left !== null) succ = s.nodes[succ.left];
            n.value = succ.value;                // node keeps its id, takes successor's value
            n.right = removeFrom(n.right, succ.value);
            return id;
        };
        s.rootId = removeFrom(s.rootId, value);
        return TreeView.recompute(s);
    }

    /** Deepest node with |BF| > 1: the node AVL rebalances first. */
    static pivot(snap) {
        let best = null;
        for (const id in snap.nodes) {
            const n = snap.nodes[id];
            if (Math.abs(n.bf) > 1 && (!best || n.height < best.height)) best = n;
        }
        return best;
    }

    static layout(snap, width) {
        const pos = new Map();
        const place = (id, x, y, depth) => {
            if (id === null) return;
            pos.set(Number(id), { x, y });
            const gap = (width / 3.8) / Math.pow(1.8, depth);
            const n = snap.nodes[id];
            place(n.left, x - gap, y + 80, depth + 1);
            place(n.right, x + gap, y + 80, depth + 1);
        };
        place(snap.rootId, width / 2, 60, 0);
        return pos;
    }

    /* ---------- drawing ---------- */

    canvas() { return typeof document !== 'undefined' ? document.getElementById(this.canvasId) : null; }

    sizeCanvas(canvas) {
        canvas.width = Math.max(600, Math.min(window.innerWidth * 0.85, 1100));
        canvas.height = Math.max(400, Math.min(window.innerHeight * 0.65, 700));
    }

    /** frame: { snap (for edges/labels), items: [{ id, x, y, alpha, node }] } */
    drawFrame(canvas, frame, { highlightId = null, alertId = null } = {}) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (frame.items.length === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Tree is empty. Enter a positive number and click Insert.', canvas.width / 2, canvas.height / 2);
            return;
        }
        const at = new Map(frame.items.map(it => [it.id, it]));

        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 2.5;
        for (const it of frame.items) {
            const n = frame.snap.nodes[it.id];
            if (!n) continue;
            for (const c of [n.left, n.right]) {
                const child = c !== null ? at.get(c) : null;
                if (!child) continue;
                ctx.globalAlpha = Math.min(it.alpha, child.alpha);
                ctx.beginPath();
                ctx.moveTo(it.x, it.y);
                ctx.lineTo(child.x, child.y);
                ctx.stroke();
            }
        }

        for (const it of frame.items) {
            const n = it.node;
            const hi = it.id === highlightId;
            const alert = it.id === alertId;
            ctx.globalAlpha = it.alpha;
            if (alert) {
                ctx.beginPath();
                ctx.arc(it.x, it.y, 29, 0, Math.PI * 2);
                ctx.strokeStyle = '#DC2626';
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.beginPath();
            ctx.arc(it.x, it.y, 23, 0, Math.PI * 2);
            ctx.fillStyle = hi ? 'rgba(245, 158, 11, 0.25)' : 'rgba(37, 99, 235, 0.15)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(it.x, it.y, 21, 0, Math.PI * 2);
            ctx.fillStyle = alert ? '#DC2626' : hi ? '#F59E0B' : '#2563EB';
            ctx.fill();
            ctx.strokeStyle = alert ? '#991B1B' : hi ? '#B45309' : '#1E3A8A';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(n.value, it.x, it.y);

            ctx.font = 'bold 11px ui-monospace, monospace';
            ctx.fillStyle = Math.abs(n.bf) <= 1 ? '#059669' : '#DC2626';
            ctx.fillText(`h:${n.height} | bf:${n.bf > 0 ? '+' + n.bf : n.bf}`, it.x, it.y + 35);
        }
        ctx.globalAlpha = 1;
    }

    staticFrame(snap, width) {
        const pos = TreeView.layout(snap, width);
        return { snap, items: [...pos].map(([id, p]) => ({ id, x: p.x, y: p.y, alpha: 1, node: snap.nodes[id] })) };
    }

    showStatic(snap, opts = {}) {
        this.token++;
        this.current = snap;
        const canvas = this.canvas();
        if (!canvas) return;
        this.sizeCanvas(canvas);
        this.drawFrame(canvas, this.staticFrame(snap, canvas.width), opts);
    }

    /* ---------- animation ---------- */

    /**
     * requestAnimationFrame backed by a timer: browsers pause rAF in hidden tabs/panes,
     * which would freeze the tree mid-rotation. Progress is time-based, so whichever
     * callback fires first keeps the animation on schedule.
     */
    static nextFrame(fn) {
        let done = false;
        const run = () => { if (!done) { done = true; fn(performance.now()); } };
        requestAnimationFrame(run);
        setTimeout(run, 50);
    }

    static ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    /** Tween node positions by id from snapshot a to b. Resolves false if cancelled. */
    tween(canvas, a, b, ms, opts, token) {
        const pa = TreeView.layout(a, canvas.width);
        const pb = TreeView.layout(b, canvas.width);
        const ids = new Set([...pa.keys(), ...pb.keys()]);
        return new Promise((resolve) => {
            const t0 = performance.now();
            const step = (now) => {
                if (token !== this.token) { resolve(false); return; }
                const t = Math.min(1, (now - t0) / ms);
                const e = TreeView.ease(t);
                const items = [];
                for (const id of ids) {
                    const from = pa.get(id);
                    const to = pb.get(id);
                    const s = from || to;
                    const d = to || from;
                    items.push({
                        id, x: s.x + (d.x - s.x) * e, y: s.y + (d.y - s.y) * e,
                        alpha: from && to ? 1 : from ? 1 - e : e,
                        node: (to ? b.nodes[id] : a.nodes[id]),
                    });
                }
                this.drawFrame(canvas, { snap: b, items }, opts);
                if (t < 1) TreeView.nextFrame(step); else resolve(true);
            };
            TreeView.nextFrame(step);
        });
    }

    wait(ms, token) {
        return new Promise((resolve) => setTimeout(() => resolve(token === this.token), ms));
    }

    setOutput(text) {
        const out = typeof document !== 'undefined' ? document.getElementById('output') : null;
        if (out) out.textContent = text;
    }

    /**
     * before → (unbalanced, held so students can see the BF ±2 node) → after.
     * Without a rotation: before → after. Reduced motion: jump straight to after.
     */
    async transition({ before, unbalanced, after, rotated, pauseText, doneText, highlightId = null }) {
        const token = ++this.token;
        this.current = after;
        const canvas = this.canvas();
        const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Browsers pause animation frames in background tabs; jump to the result instead of freezing.
        const hidden = typeof document !== 'undefined' && document.hidden;
        if (!canvas || reduce || hidden || typeof requestAnimationFrame === 'undefined') {
            this.setOutput(doneText);
            this.showStatic(after, { highlightId });
            return;
        }
        this.sizeCanvas(canvas);
        if (rotated) {
            const pivot = TreeView.pivot(unbalanced);
            const alertId = pivot ? pivot.id : null;
            if (!(await this.tween(canvas, before, unbalanced, 350, { highlightId }, token))) return;
            this.drawFrame(canvas, this.staticFrame(unbalanced, canvas.width), { highlightId, alertId });
            if (pivot) this.setOutput(pauseText(pivot));
            if (!(await this.wait(1100, token))) return;
            if (!(await this.tween(canvas, unbalanced, after, 750, { highlightId, alertId }, token))) return;
        } else {
            if (!(await this.tween(canvas, before, after, 400, { highlightId }, token))) return;
        }
        this.setOutput(doneText);
        this.drawFrame(canvas, this.staticFrame(after, canvas.width), { highlightId });
    }
}

function showAvlMessage(message, type = 'error') {
    const banner = document.getElementById('avlAlert');
    if (banner) {
        if (!message) {
            banner.textContent = '';
            banner.hidden = true;
            return;
        }
        const isError = type === 'error';
        banner.className = `alert-banner alert-live alert-${type}`;
        banner.setAttribute('role', isError ? 'alert' : 'status');
        banner.setAttribute('aria-live', isError ? 'assertive' : 'polite');
        banner.textContent = message;
        banner.hidden = false;
    }
    const out = document.getElementById('output');
    if (out && message && type === 'error') {
        out.textContent = message;
    }
}

function clearAvlNotice() {
    showAvlMessage('');
}

function parsePositiveInteger(raw) {
    const trimmed = raw === null || raw === undefined ? '' : String(raw).trim();
    if (trimmed === '') {
        return { ok: false, reason: 'empty' };
    }
    if (!/^[+-]?\d+$/.test(trimmed)) {
        return { ok: false, reason: 'invalid' };
    }
    const value = Number(trimmed);
    if (!Number.isSafeInteger(value) || value <= 0) {
        return { ok: false, reason: 'non-positive' };
    }
    return { ok: true, value };
}

function toggleButtons() {
    const buttons = document.querySelectorAll("button:not(#themeToggle)");
    const isTreeEmpty = !bst || !bst.root;

    buttons.forEach(button => {
        // Keep menu buttons and Enqueue enabled even when empty
        if (button.id === "openBtn" || button.id === "closeBtn" || button.textContent.trim() === "Enqueue" || button.getAttribute("onclick") === "enqueueNumber()") {
            button.disabled = false;
        } else if (isTreeEmpty) {
            button.disabled = true;
        } else {
            button.disabled = false;
        }
    });

    const updateTargetInput = document.getElementById('updateTargetInput');
    const updateNewInput = document.getElementById('updateNewInput');
    if (updateTargetInput) updateTargetInput.disabled = isTreeEmpty;
    if (updateNewInput) updateNewInput.disabled = isTreeEmpty;
}

class AVLTree {
    constructor() {
        this.root = null;
        this.view = new TreeView('bstCanvas');
    }

    getHeight(node) {
        return node ? node.height : 0;
    }

    fmtBf(bf) { return bf > 0 ? `+${bf}` : `${bf}`; }

    getBalance(node) {
        return node ? this.getHeight(node.left) - this.getHeight(node.right) : 0;
    }

    updateHeight(node) {
        if (node) {
            node.height = Math.max(this.getHeight(node.left), this.getHeight(node.right)) + 1;
        }
    }

    rotateRight(y) {
        const x = y.left;
        if (!x) return y;
        const T2 = x.right;

        // Perform rotation
        x.right = y;
        x.parent = y.parent;
        y.parent = x;

        y.left = T2;
        if (T2) T2.parent = y;

        // Update heights
        this.updateHeight(y);
        this.updateHeight(x);

        return x;
    }

    rotateLeft(x) {
        const y = x.right;
        if (!y) return x;
        const T2 = y.left;

        // Perform rotation
        y.left = x;
        y.parent = x.parent;
        x.parent = y;

        x.right = T2;
        if (T2) T2.parent = x;

        // Update heights
        this.updateHeight(x);
        this.updateHeight(y);

        return y;
    }

    insert(node, value, parent = null) {
        if (!node) {
            const newNode = new TreeNode(value);
            newNode.parent = parent;
            return newNode;
        }

        if (value < node.value) {
            node.left = this.insert(node.left, value, node);
        } else if (value > node.value) {
            node.right = this.insert(node.right, value, node);
        } else {
            return node; // Duplicate values not allowed
        }

        this.updateHeight(node);
        const balance = this.getBalance(node);

        // LL Case (Left Left)
        if (balance > 1 && value < node.left.value) {
            this.lastRotationMessage = `[LL Rotation] Unbalance detected at Node ${node.value} (BF = +2). Executed Right Rotation around Node ${node.value}. Node ${node.left.value} is now parent.`;
            return this.rotateRight(node);
        }

        // RR Case (Right Right)
        if (balance < -1 && value > node.right.value) {
            this.lastRotationMessage = `[RR Rotation] Unbalance detected at Node ${node.value} (BF = -2). Executed Left Rotation around Node ${node.value}. Node ${node.right.value} is now parent.`;
            return this.rotateLeft(node);
        }

        // LR Case (Left Right)
        if (balance > 1 && value > node.left.value) {
            this.lastRotationMessage = `[LR Double Rotation] Unbalance at Node ${node.value} (BF = +2, Child BF = -1). Step 1: Left Rotate Child (${node.left.value}). Step 2: Right Rotate Parent (${node.value}).`;
            node.left = this.rotateLeft(node.left);
            if (node.left) node.left.parent = node;
            return this.rotateRight(node);
        }

        // RL Case (Right Left)
        if (balance < -1 && value < node.right.value) {
            this.lastRotationMessage = `[RL Double Rotation] Unbalance at Node ${node.value} (BF = -2, Child BF = +1). Step 1: Right Rotate Child (${node.right.value}). Step 2: Left Rotate Parent (${node.value}).`;
            node.right = this.rotateRight(node.right);
            if (node.right) node.right.parent = node;
            return this.rotateLeft(node);
        }

        return node;
    }

    recalculateParents(node, parent = null) {
        if (!node) return;
        node.parent = parent;
        this.updateHeight(node);
        this.recalculateParents(node.left, node);
        this.recalculateParents(node.right, node);
    }

    enqueue(value) {
        if (this.findNode(this.root, value)) {
            showAvlMessage(`Node with value ${value} already exists in the tree.`, 'error');
            return false;
        }

        clearAvlNotice();
        const before = TreeView.snapshot(this.root);
        // What a plain BST insert would produce: the real state just before AVL rebalancing.
        const unbalanced = TreeView.plainInsert(before, value, TreeNode.nextId);
        this.lastRotationMessage = null;
        this.root = this.insert(this.root, value, null);
        if (this.root) this.root.parent = null;
        this.recalculateParents(this.root);

        const doneText = this.lastRotationMessage
            ? `Inserted ${value} • ${this.lastRotationMessage}`
            : `Node ${value} inserted directly. Tree remains balanced (|BF| ≤ 1).`;
        this.view.transition({
            before, unbalanced, after: TreeView.snapshot(this.root), rotated: Boolean(this.lastRotationMessage),
            pauseText: (pivot) => `Step 1 of 2: ${value} is placed as in a plain BST. Node ${pivot.value} now has BF ${this.fmtBf(pivot.bf)}, so the tree is unbalanced.`,
            doneText: this.lastRotationMessage ? `Step 2 of 2: ${doneText}` : doneText,
            highlightId: TreeNode.nextId - 1,
        });
        toggleButtons();
        return true;
    }

    dequeue(value) {
        const targetNode = this.findNode(this.root, value);
        if (!targetNode) {
            showAvlMessage(`Node ${value} not found in the tree.`, 'error');
            return false;
        }

        clearAvlNotice();
        const before = TreeView.snapshot(this.root);
        const unbalanced = TreeView.plainDelete(before, value);
        this.lastRotationMessage = null;
        this.root = this.removeNode(this.root, value);
        if (this.root) this.root.parent = null;
        this.recalculateParents(this.root);

        const doneText = this.lastRotationMessage
            ? `Deleted ${value} • ${this.lastRotationMessage}`
            : `Node ${value} removed. AVL balance verified across all nodes.`;
        this.view.transition({
            before, unbalanced, after: TreeView.snapshot(this.root), rotated: Boolean(this.lastRotationMessage),
            pauseText: (pivot) => `Step 1 of 2: ${value} is removed as in a plain BST. Node ${pivot.value} now has BF ${this.fmtBf(pivot.bf)}, so the tree is unbalanced.`,
            doneText: this.lastRotationMessage ? `Step 2 of 2: ${doneText}` : doneText,
        });
        toggleButtons();
        return true;
    }

    minValueNode(node) {
        let current = node;
        while (current && current.left) {
            current = current.left;
        }
        return current;
    }

    removeNode(node, value) {
        if (!node) return null;

        if (value < node.value) {
            node.left = this.removeNode(node.left, value);
            if (node.left) node.left.parent = node;
        } else if (value > node.value) {
            node.right = this.removeNode(node.right, value);
            if (node.right) node.right.parent = node;
        } else {
            // Node found: handle 0, 1, or 2 children
            if (!node.left || !node.right) {
                const temp = node.left ? node.left : node.right;
                if (!temp) {
                    node = null;
                } else {
                    node = temp;
                }
            } else {
                // Two children: get in-order successor
                const temp = this.minValueNode(node.right);
                node.value = temp.value;
                node.right = this.removeNode(node.right, temp.value);
                if (node.right) node.right.parent = node;
            }
        }

        if (!node) return null;

        this.updateHeight(node);
        const balance = this.getBalance(node);

        // AVL Rebalancing
        const note = (msg) => {
            this.lastRotationMessage = this.lastRotationMessage ? `${this.lastRotationMessage} Then: ${msg}` : msg;
        };
        // LL Case
        if (balance > 1 && this.getBalance(node.left) >= 0) {
            note(`[LL Rotation] Node ${node.value} became left-heavy (BF = +2, left child ${node.left.value} has BF ${this.fmtBf(this.getBalance(node.left))}). Right Rotation around ${node.value}; ${node.left.value} moves up.`);
            return this.rotateRight(node);
        }

        // LR Case
        if (balance > 1 && this.getBalance(node.left) < 0) {
            note(`[LR Double Rotation] Node ${node.value} became left-heavy (BF = +2) but its left child ${node.left.value} leans right (BF = -1). Step 1: Left Rotate ${node.left.value}. Step 2: Right Rotate ${node.value}.`);
            node.left = this.rotateLeft(node.left);
            if (node.left) node.left.parent = node;
            return this.rotateRight(node);
        }

        // RR Case
        if (balance < -1 && this.getBalance(node.right) <= 0) {
            note(`[RR Rotation] Node ${node.value} became right-heavy (BF = -2, right child ${node.right.value} has BF ${this.fmtBf(this.getBalance(node.right))}). Left Rotation around ${node.value}; ${node.right.value} moves up.`);
            return this.rotateLeft(node);
        }

        // RL Case
        if (balance < -1 && this.getBalance(node.right) > 0) {
            note(`[RL Double Rotation] Node ${node.value} became right-heavy (BF = -2) but its right child ${node.right.value} leans left (BF = +1). Step 1: Right Rotate ${node.right.value}. Step 2: Left Rotate ${node.value}.`);
            node.right = this.rotateRight(node.right);
            if (node.right) node.right.parent = node;
            return this.rotateLeft(node);
        }

        return node;
    }

    clear() {
        clearAvlNotice();
        this.root = null;
        this.visualize(false);
        const out = document.getElementById('output');
        if (out) out.textContent = 'Tree cleared.';
        toggleButtons();
    }

    getTreeHeight(node) {
        return this.getHeight(node);
    }

    showTreeHeight() {
        const height = this.getTreeHeight(this.root);
        const out = document.getElementById('output');
        if (out) out.innerText = `Tree Height: ${height}`;
    }

    balanceTree() {
        // AVL tree self-balances on every insert/delete.
        // We re-verify heights and balance factors.
        this.recalculateParents(this.root);
        this.visualize(false);
        const out = document.getElementById('output');
        if (out) out.innerText = 'Tree is already self-balancing (AVL invariant maintained).';
    }

    peekRoot() {
        const out = document.getElementById('output');
        if (this.root) {
            if (out) out.innerText = `Root Node: ${this.root.value} (Height: ${this.root.height}, Balance Factor: ${this.getBalance(this.root)})`;
            this.visualize(true);
        } else {
            if (out) out.innerText = 'The tree is empty.';
        }
    }

    peekChildren() {
        const childrenInfo = this.collectChildren(this.root);
        const out = document.getElementById('output');
        if (out) out.innerText = childrenInfo.length > 0 ? `Children: ${childrenInfo.join(', ')}` : 'No children found.';
    }

    collectChildren(node) {
        if (!node) return [];
        const children = [];
        const childValues = [];
        if (node.left) childValues.push(`L:${node.left.value}`);
        if (node.right) childValues.push(`R:${node.right.value}`);
        if (childValues.length > 0) {
            children.push(`${node.value} -> (${childValues.join(', ')})`);
        }
        return [...children, ...this.collectChildren(node.left), ...this.collectChildren(node.right)];
    }

    collectLeafNodes(node) {
        if (!node) return [];
        if (!node.left && !node.right) {
            return [node.value];
        }
        return [
            ...this.collectLeafNodes(node.left),
            ...this.collectLeafNodes(node.right)
        ];
    }

    peekLeafNodes() {
        const leafNodes = this.collectLeafNodes(this.root);
        const out = document.getElementById('output');
        if (out) out.innerText = leafNodes.length > 0 ? `Leaf Nodes: ${leafNodes.join(', ')}` : 'No leaf nodes found.';
        this.visualize(true);
    }

    collectParentNodes(node) {
        if (!node) return [];
        const parentNodes = [];
        if (node.left || node.right) {
            parentNodes.push(node.value);
        }
        return [
            ...parentNodes,
            ...this.collectParentNodes(node.left),
            ...this.collectParentNodes(node.right)
        ];
    }

    peekParentNodes() {
        const parentNodes = this.collectParentNodes(this.root);
        const out = document.getElementById('output');
        if (parentNodes.length > 0) {
            if (out) out.innerText = `Parent Nodes: (${parentNodes.join(', ')})`;
            this.visualize(true);
        } else {
            if (out) out.innerText = 'No parent nodes found.';
        }
    }

    collectSubtrees(node, isRoot = true) {
        if (!node) return [];
        const subtrees = [];
        if (!isRoot && (node.left || node.right)) {
            const leftVal = node.left ? node.left.value : 'null';
            const rightVal = node.right ? node.right.value : 'null';
            subtrees.push(`(${node.value}: L=${leftVal}, R=${rightVal})`);
        }
        return [
            ...subtrees,
            ...this.collectSubtrees(node.left, false),
            ...this.collectSubtrees(node.right, false)
        ];
    }

    showSubtree() {
        const subtreeInfo = this.collectSubtrees(this.root);
        const formattedSubtree = subtreeInfo.length > 0
            ? `Subtrees: ${subtreeInfo.join(', ')}`
            : 'No non-root subtrees found.';
        const out = document.getElementById('output');
        if (out) out.innerText = formattedSubtree;
    }

    updateNode() {
        const targetInput = document.getElementById('updateTargetInput');
        const newInput = document.getElementById('updateNewInput');

        const parsedTarget = parsePositiveInteger(targetInput ? targetInput.value : '');
        if (!parsedTarget.ok) {
            if (parsedTarget.reason === 'empty') {
                showAvlMessage('Please enter the target node key to update.', 'error');
            } else {
                showAvlMessage('Target key must be a valid positive integer greater than zero.', 'error');
            }
            if (targetInput) targetInput.focus();
            return;
        }

        const parsedNew = parsePositiveInteger(newInput ? newInput.value : '');
        if (!parsedNew.ok) {
            if (parsedNew.reason === 'empty') {
                showAvlMessage('Please enter a new positive integer key.', 'error');
            } else {
                showAvlMessage('New key must be a valid positive integer greater than zero.', 'error');
            }
            if (newInput) newInput.focus();
            return;
        }

        const targetValue = parsedTarget.value;
        const newValue = parsedNew.value;

        const targetNode = this.findNode(this.root, targetValue);
        if (!targetNode) {
            showAvlMessage(`Node ${targetValue} not found in the tree.`, 'error');
            if (targetInput) targetInput.focus();
            return;
        }

        if (newValue !== targetValue && this.findNode(this.root, newValue)) {
            showAvlMessage(`Cannot update: Node ${newValue} already exists in the tree.`, 'error');
            if (newInput) newInput.focus();
            return;
        }

        clearAvlNotice();
        // To maintain AVL tree invariant strictly, we remove the target and insert the new value
        this.root = this.removeNode(this.root, targetValue);
        this.root = this.insert(this.root, newValue, null);
        if (this.root) this.root.parent = null;
        this.recalculateParents(this.root);
        this.visualize(false);
        if (targetInput) targetInput.value = '';
        if (newInput) newInput.value = '';
        const out = document.getElementById('output');
        if (out) out.textContent = `Node with value ${targetValue} updated to ${newValue} (AVL balanced).`;
        toggleButtons();
    }

    findNode(node, value) {
        if (!node) return null;
        if (node.value === value) return node;
        if (value < node.value) return this.findNode(node.left, value);
        return this.findNode(node.right, value);
    }

    collectSiblings(node) {
        if (!node || !node.parent) return [];
        const siblings = [];
        const parent = node.parent;

        if (parent.left && parent.left !== node) {
            siblings.push(parent.left.value);
        }
        if (parent.right && parent.right !== node) {
            siblings.push(parent.right.value);
        }

        return siblings;
    }

    peekSiblings() {
        const input = document.getElementById('numberInput');
        const parsed = parsePositiveInteger(input ? input.value : '');
        if (!parsed.ok) {
            if (parsed.reason === 'empty') {
                showAvlMessage('Enter a node key in the Node Key field to find its siblings.', 'error');
            } else {
                showAvlMessage('Please enter a valid positive integer greater than zero.', 'error');
            }
            if (input) input.focus();
            return;
        }

        const nodeValue = parsed.value;
        const node = this.findNode(this.root, nodeValue);
        const out = document.getElementById('output');

        if (!node) {
            showAvlMessage(`Node ${nodeValue} not found in the tree.`, 'error');
            return;
        }

        clearAvlNotice();
        const siblingsInfo = this.collectSiblings(node);
        if (siblingsInfo.length > 0) {
            if (out) out.textContent = `Node ${node.value} has sibling(s): ${siblingsInfo.join(', ')}`;
        } else {
            if (out) out.textContent = `Node ${node.value} has no siblings.`;
        }
    }

    visualize(highlightRoot = false) {
        this.view.showStatic(TreeView.snapshot(this.root), { highlightId: highlightRoot && this.root ? this.root.id : null });
    }
}

// Instantiate global AVL tree
const bst = new AVLTree();

function enqueueNumber() {
    const input = document.getElementById('numberInput');
    const parsed = parsePositiveInteger(input ? input.value : '');
    if (!parsed.ok) {
        if (parsed.reason === 'empty') {
            showAvlMessage('Please enter a positive integer key to insert.', 'error');
        } else {
            showAvlMessage('Only positive whole numbers greater than zero are allowed.', 'error');
            if (input) input.value = '';
        }
        if (input) input.focus();
        return;
    }

    if (bst.enqueue(parsed.value) && input) {
        input.value = '';
    }
}

function dequeueNode() {
    const input = document.getElementById('numberInput');
    const parsed = parsePositiveInteger(input ? input.value : '');
    if (!parsed.ok) {
        if (parsed.reason === 'empty') {
            showAvlMessage('Enter a node key in the Node Key field to delete.', 'error');
        } else {
            showAvlMessage('Only positive whole numbers greater than zero are allowed.', 'error');
        }
        if (input) input.focus();
        return;
    }

    if (bst.dequeue(parsed.value) && input) {
        input.value = '';
    }
}

function clearTree() {
    bst.clear();
}

function showTreeHeight() {
    bst.showTreeHeight();
}

function balanceTree() {
    bst.balanceTree();
}

function peekRoot() {
    bst.peekRoot();
}

function peekChildren() {
    bst.peekChildren();
}

function peekParentNodes() {
    bst.peekParentNodes();
}

function peekLeafNodes() {
    bst.peekLeafNodes();
}

function updateNode() {
    bst.updateNode();
}

function peekSiblings() {
    bst.peekSiblings();
}

function showSubtree() {
    bst.showSubtree();
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
    toggleButtons();
    bst.visualize(false);
});

window.addEventListener('resize', () => {
    if (bst) bst.visualize(false);
});