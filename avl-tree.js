// Side Navbar Elements
const sideNavbar = document.getElementById("sideNavbar");
const openBtn = document.getElementById("openBtn");
const closeBtn = document.getElementById("closeBtn");
const overlay = document.getElementById("overlay");

// Function to Open Menu
function openMenu() {
    sideNavbar.classList.add("active");
    overlay.classList.add("active");
    sideNavbar.setAttribute('aria-hidden', 'false');
}

// Function to Close Menu
function closeMenu() {
    sideNavbar.classList.remove("active");
    overlay.classList.remove("active");
    sideNavbar.setAttribute('aria-hidden', 'true');
}

// Event Listeners
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

// Close sidebar on pressing 'Esc' key
document.addEventListener("keydown", function(event) {
    if (event.key === "Escape" && sideNavbar.classList.contains("active")) {
        closeMenu();
    }
});

class TreeNode {
    constructor(value) {
        this.value = value;
        this.left = null;
        this.right = null;
        this.parent = null; // Keep track of the parent node
    }
}


function toggleButtons() {
    const buttons = document.querySelectorAll("button");
    const isTreeEmpty = !bst.root; // Check if the tree is empty

    buttons.forEach(button => {
    // Disable all buttons if the tree is empty, except for the "Enqueue" button
        if (isTreeEmpty && button.textContent !== "Enqueue") {
            button.disabled = true;
        } else {
            button.disabled = false;
        }
    });
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

    dequeue(value) {
const targetNode = this.findNode(this.root, value);

if (!targetNode) {
alert('Node to dequeue not found.');
return;
}

this.root = this.removeNode(this.root, value);

// Re-visualize the tree after the update
this.visualize(false);
document.getElementById('output').innerText = `Node with value ${value} removed.`;
}

removeNode(node, value) {
// Base case: if the tree is empty
if (!node) return node;

// Recursive case: traverse the tree to find the node to delete
if (value < node.value) {
node.left = this.removeNode(node.left, value);
} else if (value > node.value) {
node.right = this.removeNode(node.right, value);
} else {
// Case 1: Node with only one child or no child
if (!node.left) {
    return node.right;
} else if (!node.right) {
    return node.left;
}

// Case 2: Node with two children
// Get the inorder successor (smallest in the right subtree)
node.value = this.minValueNode(node.right).value;

// Delete the inorder successor
node.right = this.removeNode(node.right, node.value);
}

return node;
}

minValueNode(node) {
let current = node;
// Loop down to find the leftmost leaf
while (current.left) {
current = current.left;
}
return current;
}


    clear() {
        this.root = null;
        this.visualize(false); // No highlighting
    }
    visualize(highlightRoot = false) {
const canvas = document.getElementById('bstCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth * 0.8;
canvas.height = window.innerHeight * 0.8; // Increase canvas height for better spacing

ctx.clearRect(0, 0, canvas.width, canvas.height);

if (!this.root) return;

const positions = new Map();

// Function to calculate positions of the nodes
const calculatePositions = (node, x, y, depth, minGap) => {
if (!node) return;

positions.set(node, { x, y });

const gap = minGap / Math.pow(2, depth);
if (node.left) {
    calculatePositions(node.left, x - gap, y + 100, depth + 1, minGap); // Increase vertical gap for better spacing
}
if (node.right) {
    calculatePositions(node.right, x + gap, y + 100, depth + 1, minGap);
}
};

calculatePositions(this.root, canvas.width / 2, 100, 0, canvas.width / 4); // Start y at 100 to leave space at the top

// Draw lines between nodes
for (const [node, pos] of positions) {
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

// Draw nodes
for (const [node, pos] of positions) {
ctx.fillStyle = (highlightRoot && node === this.root) ? 'yellow' : '#007BFF'; // Highlight root node if specified
ctx.beginPath();
ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
ctx.fill();
ctx.fillStyle = '#FFFFFF';
ctx.fillText(node.value, pos.x - 10, pos.y + 5);
}
}


// Helper function to get the maximum depth of the tree
getMaxDepth(node) {
if (!node) return 0;
return Math.max(this.getMaxDepth(node.left), this.getMaxDepth(node.right)) + 1;
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
        this.visualize(true);
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
            this.visualize(true);
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

// Check if the new value is a valid number
if (isNaN(newValue)) {
alert('Please enter a valid number.');
return;
}

const targetValue = parseInt(prompt("Enter the value of the node to update:"));

// Check if the target value is a valid number
if (isNaN(targetValue)) {
alert('Please enter a valid target value.');
return;
}

// Find the target node to update
const targetNode = this.findNode(this.root, targetValue);

// If the node is not found, alert the user and exit
if (!targetNode) {
alert('Node to update not found.');
return;
}

// Ensure the new value is not already in the tree
if (this.findNode(this.root, newValue)) {
alert('Cannot update: The new value already exists in the tree.');
return;
}

// Validate the left and right child relationships
if (targetNode.parent) {
// If the node is the left child, it must be smaller than the parent
if (targetNode === targetNode.parent.left && newValue >= targetNode.parent.value) {
    alert('Cannot update: New value for left child must be smaller than the parent value.');
    return;
}

// If the node is the right child, it must be greater than the parent
if (targetNode === targetNode.parent.right && newValue <= targetNode.parent.value) {
    alert('Cannot update: New value for right child must be greater than the parent value.');
    return;
}
}

// Validate that the left node value is smaller than the right node (if applicable)
if (targetNode.left && targetNode.right) {
if (newValue >= targetNode.right.value) {
    alert('Cannot update: New left node value must be smaller than its right node.');
    return;
}
}

// Perform the update (update the value of the node)
targetNode.value = newValue;

// Re-visualize the tree after the update
this.visualize(false);

// Display the success message
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

// Include the node's value in the output
const outputValue = siblingsInfo.length > 0 ? `[${node.value}, ${siblingsInfo.join(', ')}]` : `[${node.value}]`;

if (siblingsInfo.length > 0) {
document.getElementById('output').innerText = `Node ${node.value} has siblings: ${outputValue}`;
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

function dequeueNode() {
    const value = parseInt(prompt("Enter the value of the node to dequeue:"));

    if (!value || isNaN(value)) {
        alert('Please enter a valid number.');
        return;
    }

    bst.dequeue(value);
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