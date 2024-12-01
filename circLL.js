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
    
        const newNode = new Node(value);
        newNode.address = 'adr_' + this.counter;
        this.counter++;
    
        if (!this.head) {
            this.head = newNode;
            newNode.next = this.head;  // Point to itself for circular structure
        } else {
            let current = this.head;
            while (current.next !== this.head) {
                current = current.next;
            }
            current.next = newNode;
            newNode.next = this.head;  // Point back to head for circular structure
        }
        this.size++;
        return true;
    }

    prepend(value) {
        if (this.size >= this.maxSize) {
            alert('List is full!');
            return false;
        }
    
        const newNode = new Node(value);
        newNode.address = 'adr_' + this.counter;
        this.counter++;
    
        if (!this.head) {
            this.head = newNode;
            newNode.next = this.head;  // Point to itself for circular structure
        } else {
            newNode.next = this.head;
            let current = this.head;
            while (current.next !== this.head) {
                current = current.next;
            }
            current.next = newNode;
            this.head = newNode;
        }
        this.size++;
        return true;
    }

    insertAt(value, index) {
        console.log(`Inserting value: ${value} at index: ${index}`);

        if (index < 0 || index > this.size) {
            console.log('Index out of bounds');
            return false;
        }

        if (this.size >= this.maxSize) {
            alert('List is full!');
            return false;
        }

        const newNode = new Node(value);
        newNode.address = `adr_${this.counter}`;
        this.counter++;

        if (index === 0) {
            return this.prepend(value);
        }

        let current = this.head;
        for (let i = 0; i < index - 1; i++) {
            current = current.next;
        }

        newNode.next = current.next;
        current.next = newNode;

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
                address: current.address
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
        if (this.size <= 1) return;

        let prev = null;
        let current = this.head;
        let next;
        const oldHead = this.head;

        do {
            next = current.next;
            current.next = prev;
            prev = current;
            current = next;
        } while (current !== this.head);

        this.head = prev;
        oldHead.next = this.head;
    }

    sort() {
        if (this.size <= 1) return;

        const array = this.toArray();
        array.sort((a, b) => a.value - b.value);

        this.clear();
        array.forEach(node => this.append(node.value));
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
        nodeElement.innerHTML = `
            ${node.value}
            <div class="node-address">${node.address}</div>
        `;
        currentList.appendChild(nodeElement);

        // Create arrows between nodes
        if (index < nodes.length - 1) {
            const arrow = document.createElement('div');
            arrow.className = 'arrow';
            arrow.textContent = '→'; // You can use an arrow symbol here
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
    const buttons = document.querySelectorAll('.cLL-buttons-grid button');
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
    linkedList.clear();
    updateVisualization();
    addOperationLog('Cleared the list');
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
    const index = document.getElementById('indexInput').value;
    const value = document.getElementById('valueInput').value;
    if (!index || !value) {
        alert('Please enter both index and value!');
        return;
    }
    if (linkedList.deleteAt(parseInt(index)) && linkedList.insertAt(parseInt(value), parseInt(index))) {
        updateVisualization();
        addOperationLog(`Replaced node at index ${index} with value ${value}`);
        clearInputs();
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
    const buttons = document.querySelectorAll('.cLL-buttons-grid button');
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