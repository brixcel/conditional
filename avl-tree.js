// Side Navbar Elements
const sideNavbar = document.getElementById("sideNavbar");
const openBtn = document.getElementById("openBtn");
const closeBtn = document.getElementById("closeBtn");
const overlay = document.getElementById("overlay");

function openMenu() {
    sideNavbar.classList.add("active");
    overlay.style.display = "block";
}

function closeMenu() {
    sideNavbar.classList.remove("active");
    overlay.style.display = "none";
}

openBtn.addEventListener("click", openMenu);
closeBtn.addEventListener("click", closeMenu);
overlay.addEventListener("click", closeMenu);

// Close menu when clicking outside
document.addEventListener("click", function(event) {
    if (!sideNavbar.contains(event.target) && event.target !== openBtn) {
        closeMenu();
    }
});

// Prevent clicks inside the menu from closing it
sideNavbar.addEventListener("click", function(event) {
    event.stopPropagation();
});

class TreeNode {
    constructor(value) {
        this.value = value;
        this.left = null;
        this.right = null;
        this.parent = null; // Keep track of the parent node
    }
}

class BinarySearchTree {
    constructor() {
        this.root = null;
    }

    insert(node, value) {
        if (!node) return new TreeNode(value);

        if (value < node.value) {
            const leftChild = this.insert(node.left, value);
            node.left = leftChild;
            leftChild.parent = node; // Set parent
        } else if (value > node.value) {
            const rightChild = this.insert(node.right, value);
            node.right = rightChild;
            rightChild.parent = node; // Set parent
        } else {
            return node; // Duplicate values are not allowed
        }

        return node;
    }

    enqueue(value) {
        this.root = this.insert(this.root, value);
        this.visualize(false); // No highlighting
    }

    clear() {
        this.root = null;
        this.visualize(false); // No highlighting
    }

    visualize(highlightRoot = false) {
        const canvas = document.getElementById('bstCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth * 0.8;
        canvas.height = 400;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!this.root) return;

        const positions = new Map();

        const calculatePositions = (node, x, y, depth, minGap) => {
            if (!node) return;

            positions.set (node, { x, y });

            const gap = minGap / Math.pow(2, depth);
            if (node.left) {
                calculatePositions(node.left, x - gap, y + 70, depth + 1, minGap);
            }
            if (node.right) {
                calculatePositions(node.right, x + gap, y + 70, depth + 1, minGap);
            }
        };

        calculatePositions(this.root, canvas.width / 2, 20, 0, canvas.width / 4);

        for (const [node, pos] of positions) {
            ctx.fillStyle = (highlightRoot && node === this.root) ? 'yellow' : '#007BFF'; // Highlight root node if specified
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(node.value, pos.x - 10, pos.y + 5);

            if (node.left) {
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(positions.get(node.left).x, positions.get(node.left).y);
                ctx.stroke();
            }
            if (node.right) {
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(positions.get(node.right).x, positions.get(node.right).y);
                ctx.stroke();
            }
        }
    }

    getTreeHeight(node) {
        if (!node) return 0;
        return Math.max(this.getTreeHeight(node.left), this.getTreeHeight(node.right)) + 1;
    }

    showTreeHeight() {
        const height = this.getTreeHeight(this.root);
        document.getElementById('output').innerText = `Tree Height: ${height}`;
    }

    balanceTree() {
        const nodes = this.getSortedNodes(this.root);
        this.clear();
        this.root = this.buildBalancedTree(nodes);
        this.visualize(false); // No highlighting
        document.getElementById('output').innerText = 'Tree has been rebalanced.';
    }

    getSortedNodes(node) {
        if (!node) return [];
        const leftNodes = this.getSortedNodes(node.left);
        const rightNodes = this.getSortedNodes(node.right);
        return [...leftNodes, node.value, ...rightNodes];
    }

    buildBalancedTree(values) {
        if (values.length === 0) return null;

        const mid = Math.floor(values.length / 2);
        const root = new TreeNode(values[mid]);

        root.left = this.buildBalancedTree(values.slice(0, mid));
        root.right = this.buildBalancedTree(values.slice(mid + 1));

        return root;
    }

    peekRoot() {
        if (this.root) {
            document.getElementById('output').innerText = `Root Node: ${this.root.value}`;
            this.visualize(true); // Highlight the root node
        } else {
            document.getElementById('output').innerText = 'The tree is empty.';
        }
    }

    peekChildren() {
        const childrenInfo = this.collectChildren(this.root);
        document.getElementById('output').innerText = childrenInfo.length > 0 ? `Children: ${childrenInfo.join(', ')}` : 'No children found.';
    }

    collectChildren(node) {
        if (!node) return [];
        const children = [];
        if (node !== this.root) { // Exclude the root node
            const childValues = [];
            if (node.left) childValues.push(node.left.value);
            if (node.right) childValues.push(node.right.value);
            if (childValues.length > 0) {
                children.push(`(${childValues.join(', ')})`);
            }
        }
        return [...children, ...this.collectChildren(node.left), ...this.collectChildren(node.right)];
    }

    collectLeafNodes(node) {
        if (!node) return [];

        const leafNodes = [];

        // Check if the current node is a leaf (no left or right child)
        if (!node.left && !node.right) {
            leafNodes.push(node.value);
        }

        // Recursively check left and right subtrees
        return [
            ...leafNodes,
            ...this.collectLeafNodes(node.left),
            ...this.collectLeafNodes(node.right)
        ];
    }

    peekLeafNodes() {
        const leafNodes = this.collectLeafNodes(this.root);
        document.getElementById('output').innerText = leafNodes.length > 0 ? `Leaf Nodes: ${leafNodes.join(', ')}` : 'No leaf nodes found.';
    }

    collectParentNodes(node) {
        if (!node) return [];

        const parentNodes = [];

        if (node !== this.root && (node.left || node.right)) {
            parentNodes.push(node.value); // Add node to parent nodes if it has at least one child
        }

        // Recursively collect parents from left and right children
        return [
        ...parentNodes,
        ...this.collectParentNodes(node.left),
        ...this.collectParentNodes(node.right)
    ];
}

    peekParentNodes() {
        const parentNodes = this.collectParentNodes(this.root);
        if (parentNodes.length > 0) {
            document.getElementById('output').innerText = `Parent Nodes: (${parentNodes.join(', ')})`;
    } else {
        document.getElementById('output').innerText = 'No parent nodes found.';
    }
}

    collectSubtrees(node, isRoot = true) {
        if (!node) return [];

        const subtrees = [];

        // Skip root node and its immediate children
        if (!isRoot && node.left && node.right) {
            subtrees.push(`(${node.value}, ${node.left.value}, ${node.right.value})`);
        }

        // Recursively collect subtrees from children
        return [
            ...subtrees,
            ...this.collectSubtrees(node.left, false),
            ...this.collectSubtrees(node.right, false)
        ];
    }

    updateNode() {
const input = document.getElementById('numberInput');
const newValue = parseInt(input.value);
if (!newValue || isNaN(newValue)) {
alert('Please enter a valid number.');
return;
}

// Get the node to update based on user input
const targetValue = parseInt(prompt("Enter the value of the node to update:"));
if (!targetValue || isNaN(targetValue)) {
alert('Please enter a valid target value.');
return;
}

const targetNode = this.findNode(this.root, targetValue);

if (!targetNode) {
alert('Node to update not found.');
return;
}

// Check if the new value already exists in the tree
if (this.findNode(this.root, newValue)) {
alert('Cannot update: The new value already exists in the tree.');
return;
}

// Ensure the new value respects the BST rules based on the parent-child relationship
if (targetNode.parent) {
if (targetNode === targetNode.parent.left) { // Left child
    if (newValue >= targetNode.parent.value) {
        alert('Cannot update: New value for left child must be smaller than the parent value.');
        return;
    }
} else if (targetNode === targetNode.parent.right) { // Right child
    if (newValue <= targetNode.parent.value) {
        alert('Cannot update: New value for right child must be larger than the parent value.');
        return;
    }
}
}

// Perform the update (update the value of the node)
targetNode.value = newValue;

// Re-visualize the tree after the update
this.visualize(false); // No highlighting
document.getElementById('output').innerText = `Node with value ${targetValue} updated to ${newValue}.`;
}

// Helper function to find a node by value
findNode(node, value) {
if (!node) return null;
if (node.value === value) return node;
if (value < node.value) return this.findNode(node.left, value);
return this.findNode(node.right, value);
}


collectSiblings(node) {
if (!node || !node.parent) return []; // If node or parent doesn't exist, no siblings

const siblings = [];
const parent = node.parent;

// Check for siblings in the parent's left and right children
if (parent.left && parent.left !== node) {
siblings.push(parent.left.value); // Add left sibling
}
if (parent.right && parent.right !== node) {
siblings.push(parent.right.value); // Add right sibling
}

return siblings;
}

// Function to display the siblings of a selected node
peekSiblings() {
const nodeValue = parseInt(prompt("Enter the value of the node to find siblings for:"));
const node = this.findNode(this.root, nodeValue);

if (!node) {
document.getElementById('output').innerText = 'Node not found.';
return;
}

// Find siblings for the selected node
const siblingsInfo = this.collectSiblings(node);
if (siblingsInfo.length > 0) {
document.getElementById('output').innerText = `Node ${node.value} has siblings: ${siblingsInfo.join(', ')}`;
} else {
document.getElementById('output').innerText = `Node ${node.value} has no siblings.`;
}
}



    showSubtree() {
        const subtreeInfo = this.collectSubtrees(this.root);
        const formattedSubtree = subtreeInfo.length > 0 
            ? `Subtrees: ${subtreeInfo.join(', ')}`
            : 'No subtrees found with both left and right children.';

        document.getElementById('output').innerText = formattedSubtree;
    }
}

const bst = new BinarySearchTree();

function enqueueNumber() {
const input = document.getElementById('numberInput');
const value = parseInt(input.value);

// Check if the value is 0 or negative
if (value <= 0) {
alert('Only positive numbers greater than zero are allowed.');
input.value = '';  // Clear the input field
return;
}

if (!isNaN(value)) {
bst.enqueue(value);
input.value = '';  // Clear the input field
}
}


function clearTree() {
    bst.clear();
    document.getElementById('output').innerText = 'Tree cleared.';
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
    const leafNodes = bst.collectLeafNodes(bst.root);
    document.getElementById('output').innerText = leafNodes.length > 0 ? `Leaf Nodes: ${leafNodes.join(', ')}` : 'No leaf nodes found.';
}

function updateNode() {
    bst.updateNode() ;
}

function peekSiblings(){
    bst.peekSiblings() ;
}

function showSubtree() {
    bst.showSubtree();
}