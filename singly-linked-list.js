let linkedList = [];
let maxSize = null;
let addressCounter = 101;
let maxSizeSet = false;

// Side Navbar functionality
document.addEventListener('DOMContentLoaded', function() {
    const sideNavbar = document.getElementById('sideNavbar');
    const closeBtn = document.getElementById('closeBtn');
    
    // Create and add open button for mobile views
    const openBtn = document.createElement('button');
    openBtn.innerHTML = '&#9776;'; // hamburger icon
    openBtn.className = 'open-btn';
    document.body.insertBefore(openBtn, document.body.firstChild);

    openBtn.addEventListener('click', function() {
        sideNavbar.style.left = '0';
    });

    closeBtn.addEventListener('click', function() {
        sideNavbar.style.left = '-250px';
    });
});

// Set the max size for the linked list
function setMaxSize() {
    if (maxSizeSet) {
        showMessage('Error: Max size has already been set and cannot be changed.', 'red');
        return;
    }

    const maxSizeInput = document.getElementById('maxSizeInput');
    const inputValue = maxSizeInput.value.trim();
    const parsedValue = parseInt(inputValue, 10);

    if (inputValue === '' || isNaN(parsedValue) || parsedValue < 1 || parsedValue > 20 || inputValue !== parsedValue.toString()) {
        showMessage('Error: Please enter a valid integer between 1 and 20.', 'red');
        maxSizeInput.value = '';
        return;
    }

    maxSize = parsedValue;
    maxSizeSet = true;
    showMessage('Success: Max size set to ' + maxSize + '.', 'green');
    document.getElementById('operationValue').disabled = false;
    document.getElementById('operationIndex').disabled = false;
    maxSizeInput.disabled = true;
    document.querySelector('button[onclick="setMaxSize()"]').disabled = true;
    displayList();
}

// Function to check if the value exists
function valueExists(value) {
    return linkedList.some(node => node.el === value);
}

// Append element to the list
function append() {
    const value = document.getElementById('operationValue').value;
    insert(value, null, 2);
}

// Prepend element to the list
function prepend() {
    const value = document.getElementById('operationValue').value;
    insert(value, 0, 2);
}

// Insert element at a specific index
function insertAt() {
    const value = document.getElementById('operationValue').value;
    const indexInput = document.getElementById('operationIndex');
    const index = indexInput.value.trim();
    
    if (index === "") {
        showMessage("Please enter a valid index for insertion.", "red");
        return;
    }
    
    insert(value, parseInt(index), 3);
}

// Insert element to the list
function insert(value, pos, parts) {
    if (value === null || value.trim() === "") {
        showMessage("Cannot insert an empty element.", "red");
        return;
    }

    if (valueExists(value)) {
        showMessage(`Error: Value '${value}' already exists in the list.`, "red");
        return;
    }

    if (maxSize === null || linkedList.length < maxSize) {
        const address = "adr" + addressCounter++;
        const node = { el: value, address: address, nx: null };

        if (pos === null && parts === 2) {
            linkedList.push(node);
            showMessage(`Element ${node.el} appended`, "green");
        } else if (pos === 0 && parts === 2) {
            linkedList.unshift(node);
            showMessage(`Element ${node.el} prepended`, "green");
        } else {
            if (pos < 0 || pos > linkedList.length) {
                showMessage("Invalid index for insertion", "red");
                addressCounter--;
                return;
            } else {
                linkedList.splice(pos, 0, node);
                showMessage(`Element ${node.el} inserted at index ${pos}`, "green");
            }
        }
        connectNodes();
        displayList();
    } else {
        showMessage("Linked List is Full!!", "red");
    }
}

// Delete head of the list
function deleteHead() {
    deleteIndex(0);
}

// Delete tail of the list
function deleteTail() {
    deleteIndex(linkedList.length - 1);
}

// Delete element at a specific index
function deleteIndex() {
    const indexInput = document.getElementById('operationIndex');
    const index = indexInput.value.trim();
    
    if (index === "") {
        showMessage("Please enter a valid index for deletion.", "red");
        return;
    }
    
    if (linkedList.length === 0) {
        showMessage('Error: List is empty.', 'red');
        return;
    }

    const parsedIndex = parseInt(index);
    if (parsedIndex < 0 || parsedIndex >= linkedList.length) {
        showMessage('Error: Invalid index.', 'red');
        return;
    }

    const deletedNode = linkedList.splice(parsedIndex, 1)[0];
    connectNodes();
    displayList();
    showMessage(`Success: Element ${deletedNode.el} at index ${parsedIndex} has been deleted`, 'green');
}

// Clear the entire list
function clearList() {
    linkedList = [];
    displayList();
    showMessage('Success: List cleared.', 'green');
}

// Display the current linked list
function displayList(highlightIndex = -1) {
    const display = document.getElementById('linkedListDisplay');
    if (linkedList.length === 0) {
        display.innerHTML = 'Linked List is empty.';
    } else {
        let listHTML = '<div style="display: flex; flex-wrap: wrap; justify-content: center; align-items: center;">';
        linkedList.forEach((node, index) => {
            const highlight = index === highlightIndex ? 'background-color: #FFFF00;' : '';
            listHTML += `
                <div style="display: inline-flex; align-items: center; margin: 5px;">
                    <div style="border: 2px solid #1877F2; background-color: #EAF3FF; padding: 10px; border-radius: 8px; ${highlight}">
                        <div style="font-weight: bold;">${node.el}</div>
                        <div style="font-size: 12px; color: #666;">Addr: ${node.address}</div>
                    </div>
                    ${index < linkedList.length - 1 ? '<span style="font-size: 24px; margin: 0 5px;">→</span>' : ''}
                </div>
            `;
        });
        const lastNode = linkedList[linkedList.length - 1];
        listHTML += `
    <span style="font-size: 24px; margin: 0 5px;">→</span>
    <div style="display: inline-flex; align-items: center; margin: 5px;">
        <div style="border: 2px dashed #1877F2; background-color: #F0F2F5; padding: 10px; border-radius: 8px;">
            <div style="font-weight: bold; color: #1877F2;">NULL</div>
            <div style="font-size: 12px; color: #666;">Next: ${lastNode.nx || 'null'}</div>
        </div>
    </div>
`;
        listHTML += `</div>`;
        display.innerHTML = listHTML;
    }
}

// Get the size of the list
function getSize() {
    const size = linkedList.length * 2; // Count both address and value
    showMessage(`Current list size: ${size}`, 'blue');
}

// Reverse the list
function reverseList() {
    if (linkedList.length >= 2) {
        linkedList.reverse();
        connectNodes();
        displayList();
        showMessage('Success: List reversed.', 'green');
    } else {
        showMessage('No content or only one element in the list', 'blue');
    }
}

// Find an element in the list
function findElement() {
    const value = document.getElementById('operationValue').value;
    const index = linkedList.findIndex(node => node.el === value);
    if (index !== -1) {
        displayList(index);
        showMessage(`Value ${value} found at index ${index}.`, 'green');
    } else {
        showMessage(`Value ${value} not found in the list.`, 'red');
    }
}

// Sort the list
function sortList() {
    if (linkedList.length >= 2) {
        linkedList.sort((a, b) => {
            const aValue = parseInt(a.el);
            const bValue = parseInt(b.el);
            return aValue - bValue;
        });
        connectNodes();
        displayList();
        showMessage('Success: List sorted from least to greatest.', 'green');
    } else {
        showMessage('No content or only one element in the list', 'blue');
    }
}

// Check if the list is empty
function isEmpty() {
    if (maxSize === null) {
        showMessage('Max size is not set.', 'blue');
    } else if (linkedList.length === 0) {
        showMessage('True', 'blue');
    } else {
        showMessage('False', 'blue');
    }
}

// Check if the list is full
function isFull() {
    if (maxSize === null) {
        showMessage('Max size is not set.', 'blue');
    } else if (linkedList.length >= maxSize) {
        showMessage('True', 'blue');
    } else {
        showMessage('False', 'blue');
    }
}

// Show message on the page
function showMessage(message, color) {
    document.getElementById('message').textContent = message;
    document.getElementById('message').style.color = color;
}

// Show the head of the list
function showHead() {
    if (linkedList.length === 0) {
        showMessage('Error: List is empty.', 'red');
        return;
    }
    const head = linkedList[0];
    displayList(0);
    showMessage(`Head of the list: Address - ${head.address}, Value - ${head.el}`, 'blue');
}

// Show the tail of the list
function showTail() {
    if (linkedList.length === 0) {
        showMessage('Error: List is empty.', 'red');
        return;
    }
    const tail = linkedList[linkedList.length - 1];
    displayList(linkedList.length - 1);
    showMessage(`Tail of the list: Address - ${tail.address}, Value - ${tail.el}`, 'blue');
}

// Connect nodes
function connectNodes() {
    for (let i = 0; i < linkedList.length - 1; i++) {
        linkedList[i].nx = linkedList[i + 1].address;
    }
    if (linkedList.length > 0) {
        linkedList[linkedList.length - 1].nx = null;
    }
}

// Update Address
function updateAddress() {
    const address = prompt("Enter the address of the element to update:");
    if (address) {
        const newValue = prompt("Enter the new value (positive integer only):");
        if (newValue && /^[1-9]\d*$/.test(newValue)) {
            const node = linkedList.find(node => node.address === address);
            if (node) {
                if (valueExists(newValue)) {
                    showMessage(`Error: Value '${newValue}' already exists in the list.`, "red");
                } else {
                    node.el = newValue;
                    showMessage(`Element at address ${address} updated to '${newValue}'`, "green");
                    displayList();
                }
            } else {
                showMessage(`No element found with address ${address}`, "red");
            }
        } else {
            showMessage("Error: Please enter a valid positive integer.", "red");
        }
    }
}

// Replace Address
function replaceAddress() {
    const oldAddress = prompt("Enter the address of the element to replace:");
    if (oldAddress) {
        const newValue = prompt("Enter the new value (positive integer only):");
        if (newValue && /^[1-9]\d*$/.test(newValue)) {
            const newAddress = prompt("Enter the new address:");
            if (newAddress) {
                const nodeIndex = linkedList.findIndex(node => node.address === oldAddress);
                if (nodeIndex !== -1) {
                    if (linkedList.some(node => node.address === newAddress)) {
                        showMessage(`Address ${newAddress} already exists. Choose a different address.`, "red");
                        return;
                    }
                    if (valueExists(newValue)) {
                        showMessage(`Error: Value '${newValue}' already exists in the list.`, "red");
                        return;
                    }
                    linkedList[nodeIndex].el = newValue;
                    linkedList[nodeIndex].address = newAddress;
                    connectNodes();
                    showMessage(`Element at address ${oldAddress} replaced with value '${newValue}' and new address '${newAddress}'`, "green");
                    displayList();
                } else {
                    showMessage(`No element found with address ${oldAddress}`, "red");
                }
            }
        } else {
            showMessage("Error: Please enter a valid positive integer.", "red");
        }
    }
}

