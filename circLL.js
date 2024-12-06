const sideNavbar = document.getElementById("sideNavbar");
const openBtn = document.getElementById("openBtn");
const closeBtn = document.getElementById("closeBtn");
const mainContent = document.querySelector(".main-content");

// Open and close the side navbar
openBtn.addEventListener("click", () => {
    sideNavbar.classList.add("active");
    mainContent.classList.add("shifted");
});

closeBtn.addEventListener("click", () => {
    sideNavbar.classList.remove("active");
    mainContent.classList.remove("shifted");
});

class Node {
    constructor(value) {
        this.value = value;
        this.address = null;
        this.next = null;
        this.prev = null;
    }
}

class LinkedList {
    constructor(maxSize) {
        this.head = null;
        this.maxSize = maxSize;
        this.size = 0;
        this.counter = 1;
    }

    append(value) {
        if (this.size >= this.maxSize) {
            alert('List is full!');
            return false;
        }
    
        // Create a new node
        const newNode = new Node(value);
        newNode.address = 'abc_' + String(this.counter).padStart(3, '0'); // Zero-padding for counter
        this.counter++;
    
        if (!this.head) {
            // If the list is empty, the new node points to itself
            this.head = newNode;
            newNode.next = this.head;  // Circular next to itself
            newNode.prev = this.head;  // Circular prev to itself (since it's the only node)
        } else {
            let lastNode = this.head;
    
            // Traverse to the last node (the one whose next points to the head)
            while (lastNode.next !== this.head) {
                lastNode = lastNode.next;
            }
    
            // Update the pointers to insert the new node
            lastNode.next = newNode;    // Last node's next points to the new node
            newNode.prev = lastNode;    // New node's prev points to the last node
            newNode.next = this.head;   // New node's next points to the head
            this.head.prev = newNode;   // Head's prev points to the new node (to complete circular linking)
        }
    
        // Increase the size of the linked list
        this.size++;
        return true;
    }
    
    

    prepend(value) {
        if (this.size >= this.maxSize) {
            alert('List is full!');
            return false;
        }
    
        // Create a new node
        const newNode = new Node(value);
        newNode.address = 'abc_' + String(this.counter).padStart(3, '0'); // Zero-padding for counter
        this.counter++;
    
        if (!this.head) {
            // If the list is empty, the new node points to itself
            this.head = newNode;
            newNode.next = this.head;  // Circular next to itself
            newNode.prev = this.head;  // Circular prev to itself
        } else {
            // If the list is not empty
            let lastNode = this.head;
    
            // Traverse to the last node
            while (lastNode.next !== this.head) {
                lastNode = lastNode.next;
            }
    
            // Link the new node
            newNode.next = this.head;  // New node points to current head
            newNode.prev = lastNode;   // New node's prev points to the last node
    
            // Update the last node's next to point to the new node
            lastNode.next = newNode;
    
            // Update the head's prev pointer to point to the new node
            this.head.prev = newNode;
    
            // Update the head to be the new node
            this.head = newNode;
        }
    
        this.size++;
        return true;
    }
    
    

    insertAt(value, index) {
        console.log(`Inserting value: ${value} at index: ${index}`);
    
        // Check if the index is valid: it should be between 0 and the current size (inclusive)
        if (index < 0 || index > this.size) {
            alert(`Error: Index ${index} is out of bounds. Valid index range is 0 to ${this.size}`);
            return false;
        }
    
        // Check if the list is full
        if (this.size >= this.maxSize) {
            alert('List is full!');
            return false;
        }
    
        // Create a new node with a zero-padded address
        const newNode = new Node(value);
        newNode.address = 'abc_' + String(this.counter).padStart(3, '0'); // Zero-padded address
        this.counter++;
    
        // Case 1: Inserting at the beginning (index 0)
        if (index === 0) {
            return this.prepend(value);
        }
    
        let current = this.head;
        // Traverse to the node just before the desired index
        for (let i = 0; i < index - 1; i++) {
            current = current.next;
        }
    
        // Case 2: Inserting at the end (after the last node)
        if (current.next === this.head) {
            // Handle insertion at the end
            newNode.next = this.head;       // New node's next points to the head (circular)
            newNode.prev = current;         // New node's prev points to the current (last) node
            current.next = newNode;         // Last node's next points to the new node
            this.head.prev = newNode;       // Head's prev points to the new node (circular)
        } else {
            // Case 3: Inserting in the middle
            newNode.next = current.next;    // New node's next points to the current node's next
            current.next.prev = newNode;    // Current node's next's prev points to the new node
            current.next = newNode;         // Current node's next points to the new node
            newNode.prev = current;         // New node's prev points to the current node
        }
    
        // Increment the size after the insertion
        this.size++;
        console.log('List after insertion:', this.head);
        return true;
    }
    
    
    

    deleteHead() {
        if (!this.head) return false;
        
        if (this.size === 1) {
            this.head = null;
        } else {
            let current = this.head;
            while (current.next !== this.head) {
                current = current.next;
            }
            current.next = this.head.next;
            this.head = this.head.next;
        }

        this.size--;
        return true;
    }

    deleteTail() {
        if (!this.head) return false;
        
        if (this.size === 1) {
            this.head = null;
        } else {
            let current = this.head;
            let previous = null;
            while (current.next !== this.head) {
                previous = current;
                current = current.next;
            }
            previous.next = this.head;
        }

        this.size--;
        return true;
    }

    deleteAt(index) {
        if (index < 0 || index >= this.size) {
            alert('Invalid index!');
            return false;
        }

        if (index === 0) {
            return this.deleteHead();
        }

        let current = this.head;
        let previous = null;
        let count = 0;

        while (count < index) {
            previous = current;
            current = current.next;
            count++;
        }

        previous.next = current.next;

        this.size--;
        return true;
    }

    clear() {
        this.head = null;
        this.size = 0;
    }

    toArray() {
        const array = [];
        if (!this.head) return array;
    
        let current = this.head;
        do {
            array.push({
                value: current.value,
                address: current.address,
                prevAddress: current.prev ? current.prev.address : 'N/A',
                nextAddress: current.next ? current.next.address : 'N/A'
            });
            current = current.next;
        } while (current !== this.head);
    
        return array;
    }
    

    find(value) {
        if (!this.head) return -1;

        let current = this.head;
        let index = 0;
        do {
            if (current.value === value) {
                return current.address;
            }
            current = current.next;
            index++;
        } while (current !== this.head);

        return -1;
    }

    reverse() {
        if (this.size <= 1) return; // No need to reverse if the list has 1 or fewer nodes
    
        let prev = null;
        let current = this.head;
        let next;
    
        const oldHead = this.head;
        
        do {
            next = current.next;
            current.next = prev;  // Reverse the next pointer
            current.prev = next;  // Reverse the prev pointer
    
            // Move to the next node in the original list
            prev = current;
            current = next;
        } while (current !== oldHead); // Continue until we reach the original head
    
        // After the loop, prev will be the new head
        this.head = prev;
    
        // Ensure the old head's next pointer points to the new head (circular structure)
        oldHead.next = this.head;
        this.head.prev = oldHead;  // And the new head's prev pointer points to the old head
    }
    

    sort() {
        if (this.size <= 1) return;  // No need to sort if the list has 1 or fewer nodes
        
        let current = this.head;
        const nodes = []; // To hold nodes and preserve their order
        
        // Collect all nodes into an array with their address and value
        do {
            nodes.push(current);  // Add the current node to the array
            current = current.next;
        } while (current !== this.head);
    
        // Sort the nodes by value
        nodes.sort((a, b) => a.value - b.value);
    
        // Reassign the sorted values back to the nodes
        for (let i = 0; i < nodes.length; i++) {
            nodes[i].value = nodes[i].value; // Assign the sorted value (addresses remain unchanged)
        }
    
        // Rebuild the circular links (next and prev pointers) to ensure proper circular structure
        for (let i = 0; i < nodes.length; i++) {
            nodes[i].next = nodes[(i + 1) % nodes.length]; // Next pointer
            nodes[i].prev = nodes[(i - 1 + nodes.length) % nodes.length]; // Prev pointer
        }
    
        // Reassign head to the first node
        this.head = nodes[0];
    }
    
    
    
    

    getSize() {
        return this.size;
    }

    headNode() {
        return this.head ? this.head.value : null;
    }

    tailNode() {
        if (!this.head) return null;
        let current = this.head;
        while (current.next !== this.head) {
            current = current.next;
        }
        return current.value;
    }

    is_empty() {
        return this.size === 0;
    }

    is_full() {
        return this.size >= this.maxSize;
    }

    updateValue(address, newValue) {
        if (!this.head) return false;

        let current = this.head;
        do {
            if (current.address === address) {
                current.value = newValue;
                return true;
            }
            current = current.next;
        } while (current !== this.head);

        return false;
    }
}

let linkedList;

function updateVisualization() {
    const currentList = document.getElementById('currentList');
    if (!currentList) {
        console.error('Current list container not found');
        return;
    }

    currentList.innerHTML = ''; // Clear current visualization

    const nodes = linkedList.toArray(); // Get the nodes from the linked list

    // Create each node element and append to the container
    nodes.forEach((node, index) => {
        const nodeElement = document.createElement('div');
        nodeElement.className = 'node';

        // Create content for each node: Value, Address, Prev, and Next
        nodeElement.innerHTML = `
            <div class="node-value">${node.value}</div>
            <div class="node-address">Address: ${node.address}</div>
            <div class="node-prev">Prev: ${node.prevAddress !== 'N/A' ? node.prevAddress : 'N/A'}</div>
            <div class="node-next">Next: ${node.nextAddress !== 'N/A' ? node.nextAddress : 'N/A'}</div>
        `;

        // Append the node element to the list
        currentList.appendChild(nodeElement);

        // Create arrows between nodes
        if (index < nodes.length - 1) {
            const arrow = document.createElement('div');
            arrow.className = 'arrow';
            arrow.textContent = '↔'; // Bidirectional arrow between nodes
            currentList.appendChild(arrow); 
        }
    });

    // Draw the circular link if the list has more than 1 node
    if (nodes.length > 1) {
        const tailNode = currentList.lastElementChild;
        const headNode = currentList.firstElementChild;

        if (tailNode && headNode) {
            drawStraightLink(tailNode, headNode, currentList);
        }
    }
}


function drawStraightLink(tailNode, headNode, container) {
    // Get the positions of the tail and head nodes relative to the container
    const tailPosition = tailNode.getBoundingClientRect();
    const headPosition = headNode.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Adjust positions to be relative to the container
    const tailX = tailPosition.left - containerRect.left + tailPosition.width / 2;
    const headX = headPosition.left - containerRect.left + headPosition.width / 2;
    
    // Calculate Y positions
    const tailBottom = tailPosition.bottom - containerRect.top;
    const headBottom = headPosition.bottom - containerRect.top;
    const lineY = Math.max(tailBottom, headBottom) + 20;
    
    // Create an SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', container.offsetWidth);
    svg.setAttribute('height', container.offsetHeight);
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.pointerEvents = 'none';
    svg.setAttribute('viewBox', `0 0 ${container.offsetWidth} ${container.offsetHeight}`);
    
    // Create a path for the line
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    
    // Create the path data - moving in a continuous line
    const arrowGap = 8; // Gap for the arrow
    const d = `
        M ${tailX},${tailBottom}
        L ${tailX},${lineY}
        L ${headX},${lineY}
        L ${headX},${headBottom + arrowGap}
    `;
    
    path.setAttribute('d', d);
    path.setAttribute('stroke', 'black');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arrowhead)');

    // Create the arrowhead marker
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '6');  // Smaller width
    marker.setAttribute('markerHeight', '4'); // Smaller height
    marker.setAttribute('refX', '3');
    marker.setAttribute('refY', '4');
    marker.setAttribute('orient', '0'); // Point arrow upward

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 4, 3 0, 6 4'); // Smaller triangle
    polygon.setAttribute('fill', 'black');

    marker.appendChild(polygon);
    defs.appendChild(marker);

    // Add the defs and path to the SVG
    svg.appendChild(defs);
    svg.appendChild(path);

    // Append the SVG to the container
    container.appendChild(svg);
}
function showSuccess(message) {
    const successMessage = document.getElementById('successMessage');
    if (successMessage) {
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        setTimeout(() => {
            successMessage.style.display = 'none';
        }, 2000);
    }
}

function clearInputs() {
    document.getElementById('valueInput').value = '';
    document.getElementById('indexInput').value = '';
}

function addOperationLog(operation) {
    const logContainer = document.getElementById('operationsLog');
    if (logContainer.textContent === 'No operations yet.') {
        logContainer.innerHTML = '';
    }
    const logEntry = document.createElement('div');
    logEntry.classList.add('log-entry');
    logEntry.textContent = operation;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}function addOperationLog(operation) {
    const logContainer = document.getElementById('operationsLog');

    // Check if the log container has text content (initial state message)
    if (logContainer.textContent === 'No operations yet.') {
        logContainer.innerHTML = ''; // Clear the default message
    }

    // Remove the previous log entry if it exists
    const previousLogEntry = logContainer.querySelector('.log-entry');
    if (previousLogEntry) {
        logContainer.removeChild(previousLogEntry); // Remove previous log entry
    }

    // Create a new log entry with the current operation
    const logEntry = document.createElement('div');
    logEntry.classList.add('log-entry');
    logEntry.textContent = operation;

    // Append the new log entry
    logContainer.appendChild(logEntry);

    // Scroll to the bottom to show the latest log entry
    logContainer.scrollTop = logContainer.scrollHeight;
}


function setMaxSize() {
    const maxSizeInput = document.getElementById('maxSizeInput');
    let size = maxSizeInput.value.trim();

    // Check if the input contains '00#' or has leading zeros (except for '0')
    if (size === "00#" || /^0[0-9]+$/.test(size)) {
        alert("Invalid input! Leading zeros are not allowed.");
        return;
    }

    // Now attempt to parse the size to an integer
    size = parseInt(size);

    // Ensure the number is valid and positive
    if (isNaN(size) || size <= 0) {
        alert("Invalid size! Please enter a valid positive number.");
        return;
    }

    linkedList = new LinkedList(size);
    enableOperations();
    maxSizeInput.disabled = true;
    document.getElementById('setMaxSizeButton').disabled = true;
    document.getElementById('sizeReminder').style.display = 'none';
    showSuccess(`Maximum size set to ${size}`);
    addOperationLog(`Set maximum size to ${size}`);
}

function enableOperations() {
    const buttons = document.querySelectorAll('.buttons-grid button');
    buttons.forEach(button => {
        button.disabled = false;
    });
    document.getElementById('valueInput').disabled = false;
    document.getElementById('indexInput').disabled = false;
}

function append() {
    const value = document.getElementById('valueInput').value;
    if (!value) {
        alert('Please enter a value!');
        return;
    }
    if (linkedList.append(parseInt(value))) {
        updateVisualization();
        addOperationLog(`Appended value: ${value}`);
        clearInputs();
    }
}

function prepend() {
    const value = document.getElementById('valueInput').value;
    if (!value) {
        alert('Please enter a value!');
        return;
    }
    if (linkedList.prepend(parseInt(value))) {
        updateVisualization();
        addOperationLog(`Prepended value: ${value}`);
        clearInputs();
    }
}

function insertAtIndex() {
    const value = document.getElementById('valueInput').value;
    const index = document.getElementById('indexInput').value;
    if (!value || !index) {
        alert('Please enter both value and index!');
        return;
    }
    if (linkedList.insertAt(parseInt(value), parseInt(index))) {
        updateVisualization();
        addOperationLog(`Inserted value ${value} at index ${index}`);
        clearInputs();
    }
}

function deleteHead() {
    if (linkedList.deleteHead()) {
        updateVisualization();
        addOperationLog('Deleted head node');
    } else {
        addOperationLog('Failed to delete head (list is empty)');
    }
}

function deleteTail() {
    if (linkedList.deleteTail()) {
        updateVisualization();
        addOperationLog('Deleted tail node');
    } else {
        addOperationLog('Failed to delete tail (list is empty)');
    }
}

function deleteByIndex() {
    const index = document.getElementById('indexInput').value;
    if (!index) {
        alert('Please enter an index!');
        return;
    }
    if (linkedList.deleteAt(parseInt(index))) {
        updateVisualization();
        addOperationLog(`Deleted node at index ${index}`);
        clearInputs();
    }
}

function clearList() {
    // Clear the linked list and update the visualization
    linkedList.clear();
    updateVisualization();
    
    // Reset the max size
    document.getElementById('maxSizeInput').value = ''; // Clear the max size input
    document.getElementById('maxSizeInput').disabled = false; // Re-enable max size input
    document.getElementById('setMaxSizeButton').disabled = false; // Re-enable set max size button
    
    // Reset the buttons to be disabled (as max size is cleared)
    disableAllInputs();
    
    // Log the operation
    addOperationLog('Cleared the list and reset max size');
}

function size() {
    const size = linkedList.getSize();
    addOperationLog(`Current list size: ${size}`);
}

function reverseList() {
    linkedList.reverse();
    updateVisualization();
    addOperationLog('Reversed the list');
}

function find() {
    const value = document.getElementById('valueInput').value;
    if (!value) {
        alert('Please enter a value to find!');
        return;
    }
    const result = linkedList.find(parseInt(value));
    if (result !== -1) {
        addOperationLog(`Found value ${value} at address ${result}`);
    } else {
        addOperationLog(`Value ${value} not found in the list`);
    }
    clearInputs();
}

function showHead() {
    const head = linkedList.headNode();
    if (head !== null) {
        addOperationLog(`Head node value: ${head}`);
    } else {
        addOperationLog('List is empty');
    }
}

function showTail() {
    const tail = linkedList.tailNode();
    if (tail !== null) {
        addOperationLog(`Tail node value: ${tail}`);
    } else {
        addOperationLog('List is empty');
    }
}

function checkIfEmpty() {
    const isEmpty = linkedList.is_empty();
    addOperationLog(`Is the list empty? ${isEmpty}`);
}

function checkIfFull() {
    const isFull = linkedList.is_full();
    addOperationLog(`Is the list full? ${isFull}`);
}

function sortList() {
    linkedList.sort();
    updateVisualization();
    addOperationLog('Sorted the list');
}

function update() {
    const address = prompt("Enter the address of the node you want to update:");
    if (!address) {
        alert("Please enter a valid address!");
        return;
    }
    const newValue = prompt("Enter the new value for the node:");
    if (newValue === null) {
        alert("Please enter a valid value!");
        return;
    }
    if (linkedList.updateValue(address, parseInt(newValue))) {
        updateVisualization();
        addOperationLog(`Updated node at address ${address} to value ${newValue}`);
    } else {
        addOperationLog(`Failed to update node at address ${address}`);
    }
}

function replace() {
    // Check if the list is empty
    if (linkedList.is_empty()) {
        addOperationLog("Attempted to replace a node, but the list is empty.");
        return;
    }

    const address = prompt("Enter the address of the node you want to replace:");
    if (!address) {
        alert("Please enter a valid address!");
        return;
    }

    const newAddress = prompt("Enter the new address:");
    if (!newAddress) {
        alert("Please enter a valid new address!");
        return;
    }

    // Replace the node based on address and new address
    let current = linkedList.head;
    let replaced = false;

    while (current) {
        if (current.address === address) {
            current.address = newAddress;
            replaced = true;
            break;
        }
        current = current.next;
    }

    if (replaced) {
        updateVisualization();
        showSuccess("Node replaced successfully!");
        addOperationLog(`Node at address ${address} replaced with new address ${newAddress}`);
    } else {
        alert("Node with the given address not found!");
        addOperationLog(`Failed to replace node with address ${address}. Node not found.`);
    }
}
function showAddressInput() {
    const value = document.getElementById('valueInput').value;
    
    if (!value) {
        alert("Please enter a value to update.");
        return;
    }

    const addressInputContainer = document.getElementById('addressInputContainer');
    addressInputContainer.style.display = 'block';

    const valueInForm = document.getElementById('newValue');
    valueInForm.value = value;
}

function closeAddressInput() {
    const addressInputContainer = document.getElementById('addressInputContainer');
    addressInputContainer.style.display = 'none';
}

function submitAddressUpdate() {
    const address = document.getElementById('nodeAddress').value;
    const newValue = document.getElementById('valueInput').value;

    if (!address) {
        alert("Please enter a valid address!");
        return;
    }

    if (isNaN(newValue)) {
        alert("Please enter a valid value!");
        return;
    }

    if (linkedList.updateValue(address, parseInt(newValue))) {
        updateVisualization();
        showSuccess("Value updated successfully!");
        closeAddressInput();
    } else {
        alert("Address not found! Please check the address and try again.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    disableAllInputs();
    document.getElementById('setMaxSizeButton').addEventListener('click', setMaxSize);
});

function disableAllInputs() {
    const buttons = document.querySelectorAll('.buttons-grid button');
    buttons.forEach(button => {
        button.disabled = true;
    });

    
    document.getElementById('valueInput').disabled = true;
    document.getElementById('indexInput').disabled = true;
    document.getElementById('sizeReminder').style.display = 'block';
}

// Event listeners for buttons
document.getElementById('appendButton').addEventListener('click', append);
document.getElementById('prependButton').addEventListener('click', prepend);
document.getElementById('insertAtIndexButton').addEventListener('click', insertAtIndex);
document.getElementById('deleteHeadButton').addEventListener('click', deleteHead);
document.getElementById('deleteTailButton').addEventListener('click', deleteTail);
document.getElementById('deleteByIndexButton').addEventListener('click', deleteByIndex);
document.getElementById('clearListButton').addEventListener('click', clearList);
document.getElementById('sizeButton').addEventListener('click', size);
document.getElementById('reverseListButton').addEventListener('click', reverseList);
document.getElementById('findButton').addEventListener('click', find);
document.getElementById('showHeadButton').addEventListener('click', showHead);
document.getElementById('showTailButton').addEventListener('click', showTail);
document.getElementById('checkIfEmptyButton').addEventListener('click', checkIfEmpty);
document.getElementById('checkIfFullButton').addEventListener('click', checkIfFull);
document.getElementById('sortListButton').addEventListener('click', sortList);
document.getElementById('updateButton').addEventListener('click', update);
document.getElementById('replaceButton').addEventListener('click', replace);