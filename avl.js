class AVLNode {
    constructor(value) {
        this.value = value;
        this.left = null;
        this.right = null;
        this.height = 1;
    }
}

class AVLTree {
    constructor() {
        this.root = null;
    }

    getHeight(node) {
        return node ? node.height : 0;
    }

    getTreeHeight() {
        const getHeightRecursive = (node) => {
            if (!node) return 0; // No node means no height
            return Math.max(getHeightRecursive(node.left), getHeightRecursive(node.right)) + 1;
        };

    return getHeightRecursive(this.root);
    }

    getBalanceFactor(node) {
        return node ? this.getHeight(node.left) - this.getHeight(node.right) : 0;
    }

    rotateRight(y) {
        const x = y.left;
        const T2 = x.right;

        x.right = y;
        y.left = T2;

        y.height = Math.max(this.getHeight(y.left), this.getHeight(y.right)) + 1;
        x.height = Math.max(this.getHeight(x.left), this.getHeight(x.right)) + 1;

        return x;
    }

    rotateLeft(x) {
        const y = x.right;
        const T2 = y.left;

        y.left = x;
        x.right = T2;

        x.height = Math.max(this.getHeight(x.left), this.getHeight(x.right)) + 1;
        y.height = Math.max(this.getHeight(y.left), this.getHeight(y.right)) + 1;

        return y;
    }

    insert(node, value) {
        if (value < 0) {
            document.getElementById('output').innerText = 'The value to be inserted must be a positive number.';
            return node;
        }
        if (!node) return new AVLNode(value);

        if (value < node.value) {
            node.left = this.insert(node.left, value);
        } else if (value > node.value) {
            node.right = this.insert(node.right, value);
        } else {
            document.getElementById('output').innerText = `The value ${value} already exists in the tree.`;
            return node;
        }

        node.height = Math.max(this.getHeight(node.left), this.getHeight(node.right)) + 1;

        const balance = this.getBalanceFactor(node);

        if (balance > 1 && value < node.left.value) return this.rotateRight(node);
        if (balance < -1 && value > node.right.value) return this.rotateLeft(node);
        if (balance > 1 && value > node.left.value) {
            node.left = this.rotateLeft(node.left);
            return this.rotateRight(node);
        }
        if (balance < -1 && value < node.right.value) {
            node.right = this.rotateRight(node.right);
            return this.rotateLeft(node);
        }

        return node;
    }

    add(value) {
        this.root = this.insert(this.root, value);
        this.visualize();
    }

    rotateRootLeft() {
        if (this.root) {
            this.root = this.rotateLeft(this.root);
            this.visualize();
        }
    }

    rotateRootRight() {
        if (this.root) {
            this.root = this.rotateRight(this.root);
            this.visualize();
        }
    }

    clear() {
        this.root = null;
        this.visualize();
    }

    visualize() {
        const canvas = document.getElementById('avlTreeCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth * 0.8;
        canvas.height = 400;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!this.root) return;

        const positions = new Map();

        const calculatePositions = (node, x, y, depth, minGap) => {
            if (!node) return;

            // Assign position for the current node
            positions.set(node, { x, y });

            // Calculate positions for child nodes
            const gap = minGap / Math.pow(2, depth); // Reduce gap as depth increases
            if (node.left) {
                calculatePositions(node.left, x - gap, y + 70, depth + 1, minGap);
            }
            if (node.right) {
                calculatePositions(node.right, x + gap, y + 70, depth + 1, minGap);
            }
        };

        // Calculate positions starting from the root node
        calculatePositions(this.root, canvas.width / 2, 50, 0, canvas.width / 4);

        const drawNode = (node) => {
            if (!node) return;

            const { x, y } = positions.get(node);
            const radius = 20;

            // Draw edges to children
            if (node.left) {
                const leftPos = positions.get(node.left);
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(leftPos.x, leftPos.y);
                ctx.stroke();
            }
            if (node.right) {
                const rightPos = positions.get(node.right);
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(rightPos.x, rightPos.y);
                ctx.stroke();
            }

            // Draw node
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = "#1877f2";
            ctx.fill();
            ctx.stroke();

            // Draw value
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(node.value, x, y);

            // Recursively draw children
            drawNode(node.left);
            drawNode(node.right);
        };

        // Start drawing from the root node
        drawNode(this.root);
    }

    peekRoot() {
        return this.root ? `Root Node: ${this.root.value}` : 'Tree is empty.';
    }

    peekParent(value, node = this.root, parent = null) {
        if (!node) return `Node with value ${value} not found.`;
        if (node.value === value) return parent ? `Parent Node: ${parent.value}` : 'This node is the root and has no parent.';
        return value < node.value
            ? this.peekParent(value, node.left, node)
            : this.peekParent(value, node.right, node);
    }

    peekChildren(value, node = this.root) {
        if (!node) return `Node with value ${value} not found.`;
        if (node.value === value) {
            const leftChild = node.left ? node.left.value : 'None';
            const rightChild = node.right ? node.right.value : 'None';
            return `Children of Node ${value}: Left = ${leftChild}, Right = ${rightChild}`;
        }
        return value < node.value
            ? this.peekChildren(value, node.left)
            : this.peekChildren(value, node.right);
    }
}

// Initialize AVL Tree
const avlTree = new AVLTree();

function addNumber() {
const numberInput = document.getElementById('numberInput');
const value = parseInt(numberInput.value, 10);

// Validate if the input is a positive number
if (isNaN(value) || value <= 0) {
    alert('Please enter a valid positive number.');
    return;
}

// Add the number to the AVL tree
avlTree.add(value);
numberInput.value = '';  // Clear the input field after adding
}


// Rotate tree left at root
function rotateTreeLeft() {
    avlTree.rotateRootLeft();
}

// Rotate tree right at root
function rotateTreeRight() {
    avlTree.rotateRootRight();
}

// Clear the tree
function clearTree() {
    avlTree.clear();
}

// Peek functions
function peekRoot() {
    const output = avlTree.peekRoot();
    document.getElementById('output').innerText = output;
}

function peekParent() {
    const value = parseInt(prompt('Enter the node value to find its parent:'), 10);
    if (!isNaN(value)) {
        const output = avlTree.peekParent(value);
        document.getElementById('output').innerText = output;
    } else {
        alert('Please enter a valid number.');
    }
}

function peekChildren() {
    const value = parseInt(prompt('Enter the node value to find its children:'), 10);
    if (!isNaN(value)) {
        const output = avlTree.peekChildren(value);
        document.getElementById('output').innerText = output;
    } else {
        alert('Please enter a valid number.');
    }
}

// Function to display subtrees (all nodes under each node in the tree)
function showSubtrees() {
    const subtrees = getSubtrees(avlTree.root);
    const output = subtrees.length ? `Subtrees: ${subtrees.map(subtree => `(${subtree.join(', ')})`).join(', ')}` : 'No subtrees found.';
    document.getElementById('output').innerText = output;
}

// Helper function to get subtrees starting from a given node
function getSubtrees(node) {
if (!node) return [];
let subtrees = [];

const collectSubtree = (n) => {
    if (!n) return [];
    let nodes = [n.value];
    nodes = nodes.concat(collectSubtree(n.left));
    nodes = nodes.concat(collectSubtree(n.right));
    return nodes;
};

if (node) {
    subtrees.push(collectSubtree(node));
    subtrees = subtrees.concat(getSubtrees(node.left));
    subtrees = subtrees.concat(getSubtrees(node.right));
}

return subtrees;
}



// Function to display leaf nodes (nodes without children)
function showLeafNodes() {
const leafNodes = getLeafNodes(avlTree.root);
const output = leafNodes.length ? `Leaf Nodes: ${leafNodes.join(', ')}` : 'No leaf nodes found.';
document.getElementById('output').innerText = output;
}

// Helper function to get leaf nodes (nodes with no children)
function getLeafNodes(node) {
let leaves = [];
if (!node) return leaves;

if (!node.left && !node.right) {
    leaves.push(node.value);
} else {
    leaves = leaves.concat(getLeafNodes(node.left));
    leaves = leaves.concat(getLeafNodes(node.right));
}
return leaves;
}

function showSiblings() {
const siblingPairs = getAllSiblingPairs(avlTree.root);
const output = siblingPairs.length
? `Sibling Pairs: ${siblingPairs.map(pair => `(${pair.join(', ')})`).join(', ')}`
: 'No sibling pairs found.';
document.getElementById('output').innerText = output;
}

// Function to gather all sibling pairs
function getAllSiblingPairs(node, parent = null) {
if (!node) return [];

let siblingPairs = [];

// If there's a parent, check if this node has siblings
if (parent) {
// Check if the parent has left and right children
if (parent.left && parent.right) {
    // Form a pair and add to sibling pairs
    siblingPairs.push([parent.left.value, parent.right.value]);
}
}

// Recursively check left and right children
siblingPairs = siblingPairs.concat(getAllSiblingPairs(node.left, node));
siblingPairs = siblingPairs.concat(getAllSiblingPairs(node.right, node));

return siblingPairs;
}


function updateNode() {
const oldValue = parseInt(prompt('Enter the current value of the node to update:'), 10);
const newValue = parseInt(prompt('Enter the new value for the node:'), 10);

if (!isNaN(oldValue) && !isNaN(newValue)) {
const nodeToUpdate = findNode(avlTree.root, oldValue);

if (nodeToUpdate) {
    // Remove the old value by deleting the node and adding the new value
    avlTree.root = removeNode(avlTree.root, oldValue);
    avlTree.add(newValue);

    // Output the updated tree
    document.getElementById('output').innerText = `Node updated from ${oldValue} to ${newValue}.`;
} else {
    alert(`Node with value ${oldValue} not found.`);
}
} else {
alert('Please enter valid numbers.');
}
}

// Helper function to find a node by value
function findNode(node, value) {
if (!node) return null;
if (node.value === value) return node;
if (value < node.value) return findNode(node.left, value);
return findNode(node.right, value);
}

// Helper function to remove a node by value
function removeNode(node, value) {
if (!node) return node;

// Perform standard BST deletion
if (value < node.value) {
node.left = removeNode(node.left, value);
} else if (value > node.value) {
node.right = removeNode(node.right, value);
} else {
// Node to be deleted found
if (!node.left) {
    return node.right;
} else if (!node.right) {
    return node.left;
}

// Node with two children, get the inorder successor
node.value = minValue(node.right);
node.right = removeNode(node.right, node.value);
}

node.height = Math.max(avlTree.getHeight(node.left), avlTree.getHeight(node.right)) + 1;

// Rebalance the tree if necessary
const balance = avlTree.getBalanceFactor(node);
if (balance > 1 && avlTree.getBalanceFactor(node.left) >= 0) {
return avlTree.rotateRight(node);
}
if (balance < -1 && avlTree.getBalanceFactor(node.right) <= 0) {
return avlTree.rotateLeft(node);
}
if (balance > 1 && avlTree.getBalanceFactor(node.left) < 0) {
node.left = avlTree.rotateLeft(node.left);
return avlTree.rotateRight(node);
}
if (balance < -1 && avlTree.getBalanceFactor(node.right) > 0) {
node.right = avlTree.rotateRight(node.right);
return avlTree.rotateLeft(node);
}

return node;
}

// Helper function to find the minimum value node
function minValue(node) {
let current = node;
while (current.left) {
current = current.left;
}
return current.value;
}

// Function to delete a specific node
function deleteNode() {
const valueToDelete = parseInt(prompt('Enter the value of the node to delete:'), 10);

if (!isNaN(valueToDelete)) {
const nodeToDelete = findNode(avlTree.root, valueToDelete);

if (nodeToDelete) {
    // Remove the node
    avlTree.root = removeNode(avlTree.root, valueToDelete);

    // Output the updated tree
    document.getElementById('output').innerText = `Node with value ${valueToDelete} deleted.`;
} else {
    alert(`Node with value ${valueToDelete} not found.`);
}
} else {
alert('Please enter a valid number.');
}
}

// Helper function to find a node by value
function findNode(node, value) {
if (!node) return null;
if (node.value === value) return node;
if (value < node.value) return findNode(node.left, value);
return findNode(node.right, value);
}

// Helper function to remove a node from the tree
function removeNode(node, value) {
if (!node) return node;

// Step 1: Perform standard BST deletion
if (value < node.value) {
node.left = removeNode(node.left, value);
} else if (value > node.value) {
node.right = removeNode(node.right, value);
} else {
// Node with the value found
// Case 1: Node has no child (leaf node)
if (!node.left && !node.right) {
    return null;
}
// Case 2: Node has one child
if (!node.left) {
    return node.right;
} else if (!node.right) {
    return node.left;
}

// Case 3: Node has two children
// Get the inorder successor (smallest in the right subtree)
node.value = minValue(node.right);
// Delete the inorder successor
node.right = removeNode(node.right, node.value);
}

// Step 2: Update height and rebalance if needed
node.height = Math.max(avlTree.getHeight(node.left), avlTree.getHeight(node.right)) + 1;

// Rebalance the tree if necessary
const balance = avlTree.getBalanceFactor(node);

if (balance > 1 && avlTree.getBalanceFactor(node.left) >= 0) {
return avlTree.rotateRight(node);
}
if (balance < -1 && avlTree.getBalanceFactor(node.right) <= 0) {
return avlTree.rotateLeft(node);
}
if (balance > 1 && avlTree.getBalanceFactor(node.left) < 0) {
node.left = avlTree.rotateLeft(node.left);
return avlTree.rotateRight(node);
}
if (balance < -1 && avlTree.getBalanceFactor(node.right) > 0) {
node.right = avlTree.rotateRight(node.right);
return avlTree.rotateLeft(node);
}

return node;
}

// Function to delete a specific node
function deleteNode() {
const valueToDelete = parseInt(prompt('Enter the value of the node to delete:'), 10);

if (!isNaN(valueToDelete)) {
const nodeToDelete = findNode(avlTree.root, valueToDelete);

if (nodeToDelete) {
    // Remove the node
    avlTree.root = removeNode(avlTree.root, valueToDelete);

    // Output the updated tree
    document.getElementById('output').innerText = `Node with value ${valueToDelete} deleted.`;

    // Re-render the tree visualization
    avlTree.visualize();
} else {
    alert(`Node with value ${valueToDelete} not found.`);
}
} else {
alert('Please enter a valid number.');
}
}


// Helper function to find the minimum value node
function minValue(node) {
let current = node;
while (current.left) {
current = current.left;
}
return current.value;
}

function showTreeHeight() {
const height = avlTree.getTreeHeight();
document.getElementById('output').innerText = `Tree Height (Number of Levels): ${height}`;
}

function balanceTree() {
// First, get all the nodes in the tree in sorted order
const nodes = getSortedNodes(avlTree.root);

// Clear the tree
avlTree.clear();

// Rebuild the tree from the sorted node list to ensure it's balanced
avlTree.root = buildBalancedTree(nodes); // Assign the new root to the AVL tree

// Re-render the tree visualization
avlTree.visualize();

document.getElementById('output').innerText = 'Tree has been rebalanced.';
}

// Helper function to traverse the tree in-order and return all nodes
function getSortedNodes(node) {
if (!node) return [];
const leftNodes = getSortedNodes(node.left);
const rightNodes = getSortedNodes(node.right);
return [...leftNodes, node.value, ...rightNodes];
}

// Helper function to build a balanced tree from a sorted array of values
function buildBalancedTree(values) {
if (values.length === 0) return null;

// Find the middle value (root of the subtree)
const mid = Math.floor(values.length / 2);
const root = new AVLNode(values[mid]);

// Recursively build the left and right subtrees
root.left = buildBalancedTree(values.slice(0, mid));  // Left half
root.right = buildBalancedTree(values.slice(mid + 1)); // Right half

// Recalculate height and balance factor for the root node
root.height = Math.max(avlTree.getHeight(root.left), avlTree.getHeight(root.right)) + 1;

return root;
}


// Helper function to build a balanced tree from a sorted array of values
function buildBalancedTree(values) {
if (values.length === 0) return null;

// Find the middle value (root of the subtree)
const mid = Math.floor(values.length / 2);
const root = new AVLNode(values[mid]);

// Recursively build the left and right subtrees
root.left = buildBalancedTree(values.slice(0, mid));  // Left half
root.right = buildBalancedTree(values.slice(mid + 1)); // Right half

// Recalculate height and balance factor for the root node
root.height = Math.max(avlTree.getHeight(root.left), avlTree.getHeight(root.right)) + 1;

return root;
}

