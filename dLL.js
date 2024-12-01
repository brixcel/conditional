let limit = 0;
let size = 0;
let head = null;
let tail = null;
let addressCounter = 1;
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
        this.address = `DLL${addressCounter.toString().padStart(2, "0")}`;
        this.next = null;
        this.prev = null;
        addressCounter++;
    }
}

function setLimit() {
    const limitInput = document.getElementById("list-limit").value;
    if (limitInput > 0) {
        limit = parseInt(limitInput);
        alert(`List limit set to ${limit}`);
        enableControls();
        document.getElementById("list-limit").disabled = true;  // Disable limit input
        document.querySelector('button[onclick="setLimit()"]').disabled = true;  // Disable set limit button
    } else {
        alert("Please enter a valid limit.");
    }
}

function enableControls() {
    const controls = document.querySelectorAll(".controls input, .controls button");
    controls.forEach(control => {
        control.classList.remove('disabled');
    });
}

function update() {
    const address = document.getElementById("address").value;
    const newValue = document.getElementById("value").value;
    if (!address || !newValue) {
        alert("Please provide both address and new value.");
        return;
    }
    let current = head;
    while (current) {
        if (current.address === address) {
            current.value = newValue;
            updateDisplay();
            resetInputs();
            return;
        }
        current = current.next;
    }
    alert("Address not found.");
}

function replace() {
    const address = document.getElementById("address").value;
    const newValue = document.getElementById("value").value;
    const newAddress = document.getElementById("new-address").value;
    if (!address || !newValue || !newAddress) {
        alert("Please provide valid data.");
        return;
    }
    let current = head;
    while (current) {
        if (current.address === address) {
            current.value = newValue;
            current.address = newAddress;
            updateDisplay();
            resetInputs();
            return;
        }
        current = current.next;
    }
    alert("Address not found.");
}

function updateDisplay() {
    const container = document.getElementById("list-container");
    container.innerHTML = "";
    let current = head;
    const nodes = [];

    while (current) {
        const nodeBox = `
            <div class="row">
                <div class="col-12">
                    <div class="address node-box"><h5>Address:<br>${current.address}</h5></div> 
                </div>
                <div class="col-12">
                    <div class="node-box">
                        <div><h5>Prev:<br> ${current.prev ? current.prev.address : 'NULL'}<br></h5></div>
                    </div>
                    <div class="node-box">
                        <div><h5>Value: <br>${current.value}<br></h5></div>
                    </div>  
                    <div class="node-box">
                        <div><h5>Next: <br>${current.next ? current.next.address : 'NULL'}<h5></div>
                    </div>
                </div>
            </div>
        `;
        nodes.push(nodeBox);
        current = current.next;
    }

    // Join nodes and arrows in between nodes
    container.innerHTML = `
        <div class="node-container">
            ${nodes.join('<span class="arrow">⇔</span>')}
        </div>
    `;
}

function append() {
    const value = document.getElementById("value").value;
    if (!value || valueExists(value)) {
        alert("Enter a valid value, or the value already exists.");
        return;
    }
    if (size >= limit) {
        alert("List is full.");
        return;
    }
    const newNode = new Node(value);
    if (!tail) {
        head = tail = newNode;
    } else {
        tail.next = newNode;
        newNode.prev = tail;
        tail = newNode;
    }
    size++;
    updateDisplay();
    resetInputs();
}

function prepend() {
    const value = document.getElementById("value").value;
    if (!value || valueExists(value)) {
        alert("Enter a valid value, or the value already exists.");
        return;
    }
    if (size >= limit) {
        alert("List is full.");
        return;
    }
    const newNode = new Node(value);
    if (!head) {
        head = tail = newNode;
    } else {
        newNode.next = head;
        head.prev = newNode;
        head = newNode;
    }
    size++;
    updateDisplay();
    resetInputs();
}

function valueExists(value) {
    let current = head;
    while (current) {
        if (current.value === value) return true;
        current = current.next;
    }
    return false;
}

function insert() {
    const index = parseInt(document.getElementById("index").value);
    const value = document.getElementById("value").value;
    if (!value || valueExists(value) || isNaN(index) || index < 0 || index > size) {
        alert("Invalid index or value.");
        return;
    }
    if (size >= limit) {
        alert("List is full.");
        return;
    }
    const newNode = new Node(value);
    if (index === 0) {
        prepend();
        return;
    }
    if (index === size) {
        append();
        return;
    }
    let current = head;
    for (let i = 0; i < index - 1; i++) {
        current = current.next;
    }
    newNode.next = current.next;
    newNode.prev = current;
    if (current.next) current.next.prev = newNode;
    current.next = newNode;
    size++;
    updateDisplay();
    resetInputs();
}

function deleteHead() {
    if (!head) {
        alert("List is empty.");
        return;
    }
    head = head.next;
    if (head) head.prev = null;
    else tail = null;
    size--;
    updateDisplay();
}

function deleteTail() {
    if (!tail) {
        alert("List is empty.");
        return;
    }
    tail = tail.prev;
    if (tail) tail.next = null;
    else head = null;
    size--;
    updateDisplay();
}

function deleteIndex() {
    const index = parseInt(document.getElementById("index").value);
    if (isNaN(index) || index < 0 || index >= size) {
        alert("Invalid index.");
        return;
    }
    if (index === 0) {
        deleteHead();
        return;
    }
    if (index === size - 1) {
        deleteTail();
        return;
    }
    let current = head;
    for (let i = 0; i < index; i++) {
        current = current.next;
    }
    if (current.prev) current.prev.next = current.next;
    if (current.next) current.next.prev = current.prev;
    size--;
    updateDisplay();
}

function resetInputs() {
    document.getElementById("value").value = "";
    document.getElementById("index").value = "";
    document.getElementById("address").value = "";
    document.getElementById("new-address").value = "";
}

function clearList() {
    head = tail = null;
    size = 0;
    updateDisplay();
}

function sortList() {
    if (!head) return; // Check if the list is empty

    // Convert the doubly linked list to an array of nodes
    let nodes = [];
    let current = head;
    while (current) {
        nodes.push(current); // Push nodes into the array
        current = current.next;
    }

    // Sort the nodes array by the node value, considering both strings and numbers
    nodes.sort((a, b) => {
        // Try converting values to numbers
        const numA = Number(a.value);
        const numB = Number(b.value);

        // Check if both values are valid numbers
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;  // Numeric comparison
        } else {
            // If one or both values are not numbers, compare as strings
            return a.value.localeCompare(b.value);  // String comparison
        }
    });

    // Reconnect the sorted nodes back into the list
    for (let i = 0; i < nodes.length - 1; i++) {
        nodes[i].next = nodes[i + 1];
        nodes[i + 1].prev = nodes[i];
    }

    // Update head and tail pointers
    nodes[0].prev = null;
    nodes[nodes.length - 1].next = null;
    head = nodes[0];
    tail = nodes[nodes.length - 1];

    // Update the display after sorting
    updateDisplay();
}

function reverseList() {
    if (!head) return;
    let current = head;
    let prev = null;
    let next = null;
    while (current) {
        next = current.next;
        current.next = prev;
        current.prev = next;
        prev = current;
        current = next;
    }
    head = prev;
    updateDisplay();
}

function getSize() {
    let dllsize = size * 3
    alert(`Size: ${dllsize}`);
}

function isEmpty() {
    alert(size === 0 ? "True" : "False");
}

function isFull() {
    alert(size === limit ? "True" : "False");
}

function getHead() {
    alert(head ? head.value : "No head");
}

function getTail() {
    alert(tail ? tail.value : "No tail");
}

function find() {
    const address = document.getElementById("address").value;
    if (!address) {
        alert("Please provide an address.");
        return;
    }
    let current = head;
    while (current) {
        if (current.address === address) {
            alert(`Value at ${address}: ${current.value}`);
            return;
        }
        current = current.next;
    }
    alert("Address not found.");
}

function resetInputs() {
    document.getElementById("value").value = "";
    document.getElementById("index").value = "";
    document.getElementById("address").value = "";
    document.getElementById("new-address").value = "";  
}