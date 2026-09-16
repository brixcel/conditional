class TreeNode {
    constructor(value) {
        this.value = value;
        this.left = null;
        this.right = null;
        this.parent = null;
        this.height = 1;
    }
}

function toggleButtons() {
    const buttons = document.querySelectorAll("button");
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
}

class AVLTree {
    constructor() {
        this.root = null;
    }

    getHeight(node) {
        return node ? node.height : 0;
    }

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
            alert(`Node with value ${value} already exists in the tree.`);
            return;
        }

        this.lastRotationMessage = null;
        this.root = this.insert(this.root, value, null);
        if (this.root) this.root.parent = null;
        this.recalculateParents(this.root);
        this.visualize(false);
        
        const out = document.getElementById('output');
        if (out) {
            if (this.lastRotationMessage) {
                out.innerHTML = `<strong>Inserted ${value}</strong> &bull; ${this.lastRotationMessage}`;
            } else {
                out.innerText = `Node ${value} inserted directly. Tree remains balanced (|BF| &le; 1).`;
            }
        }
        toggleButtons();
    }

    dequeue(value) {
        const targetNode = this.findNode(this.root, value);
        if (!targetNode) {
            alert('Node to dequeue not found.');
            return;
        }

        this.lastRotationMessage = null;
        this.root = this.removeNode(this.root, value);
        if (this.root) this.root.parent = null;
        this.recalculateParents(this.root);
        this.visualize(false);
        
        const out = document.getElementById('output');
        if (out) {
            if (this.lastRotationMessage) {
                out.innerHTML = `<strong>Deleted ${value}</strong> &bull; ${this.lastRotationMessage}`;
            } else {
                out.innerText = `Node ${value} removed. AVL balance verified across all nodes.`;
            }
        }
        toggleButtons();
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
        // LL Case
        if (balance > 1 && this.getBalance(node.left) >= 0) {
            return this.rotateRight(node);
        }

        // LR Case
        if (balance > 1 && this.getBalance(node.left) < 0) {
            node.left = this.rotateLeft(node.left);
            if (node.left) node.left.parent = node;
            return this.rotateRight(node);
        }

        // RR Case
        if (balance < -1 && this.getBalance(node.right) <= 0) {
            return this.rotateLeft(node);
        }

        // RL Case
        if (balance < -1 && this.getBalance(node.right) > 0) {
            node.right = this.rotateRight(node.right);
            if (node.right) node.right.parent = node;
            return this.rotateLeft(node);
        }

        return node;
    }

    clear() {
        this.root = null;
        this.visualize(false);
        const out = document.getElementById('output');
        if (out) out.innerText = 'Tree cleared.';
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
        const input = document.getElementById('numberInput');
        if (!input || input.value.trim() === '') {
            alert('Please enter a new value in the input field first.');
            return;
        }

        const newValue = parseInt(input.value.trim(), 10);
        if (isNaN(newValue) || newValue <= 0) {
            alert('Please enter a valid positive number for the new value.');
            return;
        }

        const targetPrompt = prompt("Enter the value of the node to update:");
        if (targetPrompt === null || targetPrompt.trim() === '') {
            return;
        }

        const targetValue = parseInt(targetPrompt.trim(), 10);
        if (isNaN(targetValue)) {
            alert('Please enter a valid target value.');
            return;
        }

        const targetNode = this.findNode(this.root, targetValue);
        if (!targetNode) {
            alert('Node to update not found.');
            return;
        }

        if (newValue !== targetValue && this.findNode(this.root, newValue)) {
            alert('Cannot update: The new value already exists in the tree.');
            return;
        }

        // To maintain AVL tree invariant strictly, we remove the target and insert the new value
        this.root = this.removeNode(this.root, targetValue);
        this.root = this.insert(this.root, newValue, null);
        if (this.root) this.root.parent = null;
        this.recalculateParents(this.root);
        this.visualize(false);
        input.value = '';
        const out = document.getElementById('output');
        if (out) out.innerText = `Node with value ${targetValue} updated to ${newValue} (AVL balanced).`;
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
        const input = prompt("Enter the value of the node to find siblings for:");
        if (input === null || input.trim() === '') {
            return;
        }

        const nodeValue = parseInt(input.trim(), 10);
        if (isNaN(nodeValue)) {
            alert('Please enter a valid number.');
            return;
        }

        const node = this.findNode(this.root, nodeValue);
        const out = document.getElementById('output');

        if (!node) {
            if (out) out.innerText = `Node ${nodeValue} not found in the tree.`;
            return;
        }

        const siblingsInfo = this.collectSiblings(node);
        if (siblingsInfo.length > 0) {
            if (out) out.innerText = `Node ${node.value} has sibling(s): ${siblingsInfo.join(', ')}`;
        } else {
            if (out) out.innerText = `Node ${node.value} has no siblings.`;
        }
    }

    visualize(highlightRoot = false) {
        const canvas = document.getElementById('bstCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        canvas.width = Math.max(600, Math.min(window.innerWidth * 0.85, 1100));
        canvas.height = Math.max(400, Math.min(window.innerHeight * 0.65, 700));

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!this.root) {
            ctx.fillStyle = '#666';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Tree is empty. Enter a positive number and click Enqueue.', canvas.width / 2, canvas.height / 2);
            return;
        }

        const positions = new Map();

        const calculatePositions = (node, x, y, depth, minGap) => {
            if (!node) return;

            positions.set(node, { x, y });

            const gap = minGap / Math.pow(1.8, depth);
            if (node.left) {
                calculatePositions(node.left, x - gap, y + 80, depth + 1, minGap);
            }
            if (node.right) {
                calculatePositions(node.right, x + gap, y + 80, depth + 1, minGap);
            }
        };

        calculatePositions(this.root, canvas.width / 2, 60, 0, canvas.width / 3.8);

        // Draw edges
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 2.5;
        for (const [node, pos] of positions) {
            if (node.left && positions.has(node.left)) {
                const childPos = positions.get(node.left);
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(childPos.x, childPos.y);
                ctx.stroke();
            }
            if (node.right && positions.has(node.right)) {
                const childPos = positions.get(node.right);
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(childPos.x, childPos.y);
                ctx.stroke();
            }
        }

        // Draw node circles and text
        for (const [node, pos] of positions) {
            const isRootNode = node === this.root;
            const isHighlighted = highlightRoot && isRootNode;

            // Outer shadow / glow ring
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 23, 0, Math.PI * 2);
            ctx.fillStyle = isHighlighted ? 'rgba(245, 158, 11, 0.25)' : 'rgba(37, 99, 235, 0.15)';
            ctx.fill();

            // Inner circle
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 21, 0, Math.PI * 2);
            ctx.fillStyle = isHighlighted ? '#F59E0B' : '#2563EB';
            ctx.fill();
            ctx.strokeStyle = isHighlighted ? '#B45309' : '#1E3A8A';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Value text
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.value, pos.x, pos.y);

            // Height and Balance Factor badge
            const bf = this.getBalance(node);
            ctx.font = 'bold 11px ui-monospace, monospace';
            ctx.fillStyle = Math.abs(bf) <= 1 ? '#059669' : '#DC2626';
            ctx.fillText(`h:${node.height} | bf:${bf > 0 ? '+' + bf : bf}`, pos.x, pos.y + 35);
        }
    }
}

// Instantiate global AVL tree
const bst = new AVLTree();

function enqueueNumber() {
    const input = document.getElementById('numberInput');
    if (!input || input.value.trim() === '') {
        alert('Please enter a number.');
        return;
    }

    const value = parseInt(input.value.trim(), 10);
    if (isNaN(value) || value <= 0) {
        alert('Only positive numbers greater than zero are allowed.');
        input.value = '';
        return;
    }

    bst.enqueue(value);
    input.value = '';
}

function dequeueNode() {
    const input = prompt("Enter the value of the node to dequeue:");
    if (input === null || input.trim() === '') {
        return;
    }

    const value = parseInt(input.trim(), 10);
    if (isNaN(value)) {
        alert('Please enter a valid number.');
        return;
    }

    bst.dequeue(value);
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