let linkedList = [];
let maxSize = null;
let addressCounter = 1;
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
    updateButtonStates();

    // Add event listener for operationValue input
    const operationValueInput = document.getElementById('operationValue');
    operationValueInput.addEventListener('input', function(e) {
        let value = e.target.value;
        // Remove any non-digit characters
        value = value.replace(/\D/g, '');
        // Remove leading zeros
        value = value.replace(/^0+/, '');
        // Ensure the value is not empty
        if (value === '') {
            e.target.value = '';
        } else {
            // Parse the value as an integer
            const intValue = parseInt(value, 10);
            // Ensure the value is a positive integer
            e.target.value = intValue > 0 ? intValue.toString() : '';
        }
    });

    // Add event listener for operationIndex input
    const operationIndexInput = document.getElementById('operationIndex');
    operationIndexInput.addEventListener('input', function(e) {
        let value = e.target.value;
        value = value.replace(/\D/g, ''); // Remove non-digit characters
        e.target.value = value;
    });

    // Add event listener for maxSizeInput
    const maxSizeInput = document.getElementById('maxSizeInput');
    maxSizeInput.addEventListener('input', function(e) {
        let value = e.target.value;
        // Only allow the exact numbers 1-20
        if (/^(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20)$/.test(value)) {
            e.target.value = value;
        } else {
            e.target.value = '';
        }
    });

    updateButtonStates();
});

// Reset function to refresh the website
function resetWebsite() {
    location.reload();
}

// Set the max size for the linked list
function setMaxSize() {
    if (maxSizeSet) {
        showMessage('Error: Max size has already been set and cannot be changed.', 'red');
        return;
    }

    const maxSizeInput = document.getElementById('maxSizeInput');
    const inputValue = maxSizeInput.value.trim();

    if (!/^(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20)$/.test(inputValue)) {
        showMessage('Error: Please enter a valid integer between 1 and 20.', 'red');
        maxSizeInput.value = '';
        return;
    }

    maxSize = parseInt(inputValue, 10);
    maxSizeSet = true;
    showMessage('Success: Max size set to ' + maxSize + '.', 'green');
    document.getElementById('operationValue').disabled = false;
    maxSizeInput.disabled = true;
    document.querySelector('button[onclick="setMaxSize()"]').disabled = true;
    displayList();
    updateButtonStates();
}

// Function to check if the value exists
function valueExists(value) {
    return linkedList.some(node => node.el === value);
}

// Validate positive integer
function validatePositiveInteger(value) {
    return /^[1-9]\d*$/.test(value) && parseInt(value) > 0;
}

// Append function
function append() {
    const valueInput = document.getElementById('operationValue');
    const value = valueInput.value.trim();
    
    if (value === '' || !validatePositiveInteger(value)) {
        showMessage("Please enter a valid positive integer.", "red");
        return;
    }
    
    insert(value, null, 2);
    valueInput.value = ''; // Clear input field
}

// Prepend function
function prepend() {
    const valueInput = document.getElementById('operationValue');
    const value = valueInput.value.trim();
    
    if (value === '' || !validatePositiveInteger(value)) {
        showMessage("Please enter a valid positive integer.", "red");
        return;
    }
    
    insert(value, 0, 2);
    valueInput.value = ''; // Clear input field
}

// Insert function
function insert(value, pos, parts) {
    if (!validatePositiveInteger(value)) {
        showMessage("Cannot insert an invalid value. Please enter a positive integer.", "red");
        return;
    }

    if (valueExists(value)) {
        showMessage(`Error: Value '${value}' already exists in the list.`, "red");
        return;
    }

    if (maxSize === null || linkedList.length < maxSize) {
        const availableAddresses = Array.from({length: maxSize}, (_, i) => `abc${String(i + 1).padStart(3, '0')}`)
            .filter(addr => !linkedList.some(node => node.address === addr));
        const address = availableAddresses[0] || `abc${String(addressCounter++).padStart(3, '0')}`;
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
                return;
            } else {
                linkedList.splice(pos, 0, node);
                showMessage(`Element ${node.el} inserted at index ${pos}`, "green");
            }
        }
        connectNodes();
        displayList();
        updateButtonStates();
    } else {
        showMessage("Linked List is Full!!", "red");
    }
}

// Delete head of the list
function deleteHead() {
    if (linkedList.length === 0) {
        showMessage('Error: List is empty.', 'red');
        return;
    }
    const deletedNode = linkedList.shift();
    connectNodes();
    displayList();
    showMessage(`Success: Head element ${deletedNode.el} has been deleted`, 'green');
    updateButtonStates();
}

// Delete tail of the list
function deleteTail() {
    if (linkedList.length === 0) {
        showMessage('Error: List is empty.', 'red');
        return;
    }
    const deletedNode = linkedList.pop();
    connectNodes();
    displayList();
    showMessage(`Success: Tail element ${deletedNode.el} has been deleted`, 'green');
    updateButtonStates();
}

// Delete element at a specific index
function deleteIndex() {
    if (linkedList.length === 0) {
        showMessage('Error: List is empty.', 'red');
        return;
    }

    const index = prompt(`Enter the index to delete (0 to ${linkedList.length - 1}):`);
    if (index === null) return; // User cancelled

    if (!/^(0|[1-9]\d*)$/.test(index) || parseInt(index) >= linkedList.length) {
        showMessage('Error: Invalid index. Please enter a non-negative integer within the list range.', 'red');
        return;
    }

    const parsedIndex = parseInt(index);
    const deletedNode = linkedList.splice(parsedIndex, 1)[0];
    connectNodes();
    displayList();
    showMessage(`Success: Element ${deletedNode.el} at index ${parsedIndex} has been deleted`, 'green');
    updateButtonStates();
}

// Clear the entire list
function clearList() {
    linkedList = [];
    displayList();
    showMessage('Success: List cleared.', 'green');
    updateButtonStates();
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
    const addressInput = document.getElementById('findAddressInput');
    const address = addressInput.value.trim();
    const index = linkedList.findIndex(node => node.address === address);
    if (index !== -1) {
        displayList(index);
        showMessage(`Address ${address} found at index ${index}. Element: ${linkedList[index].el}`, 'green');
    } else {
        showMessage(`Address ${address} not found in the list.`, 'red');
    }
    addressInput.value = ''; // Clear input field
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
        showMessage('Is Empty: True', 'blue');
    } else {
        showMessage('Is Empty: False', 'blue');
    }
}

// Check if the list is full
function isFull() {
    if (maxSize === null) {
        showMessage('Max size is not set.', 'blue');
    } else if (linkedList.length >= maxSize) {
        showMessage('Is Full: True', 'blue');
    } else {
        showMessage('Is Full: False', 'blue');
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
    if (!address) {
        showMessage("Error: Address cannot be empty.", "red");
        return;
    }

    const node = linkedList.find(node => node.address === address);
    if (!node) {
        showMessage(`Error: No element found with address ${address}`, "red");
        return;
    }

    const newValue = prompt("Enter the new value (positive integer only):");
    if (!newValue || !validatePositiveInteger(newValue)) {
        showMessage("Error: Please enter a valid positive integer.", "red");
        return;
    }

    if (valueExists(newValue)) {
        showMessage(`Error: Value '${newValue}' already exists in the list.`, "red");
        return;
    }

    node.el = newValue;
    showMessage(`Element at address ${address} updated to '${newValue}'`, "green");
    displayList();
}

// Replace Address
function replaceAddress() {
    const oldAddress = prompt("Enter the address of the element to replace:");
    if (!oldAddress) {
        showMessage("Error: Old address cannot be empty.", "red");
        return;
    }

    const nodeIndex = linkedList.findIndex(node => node.address === oldAddress);
    if (nodeIndex === -1) {
        showMessage(`Error: No element found with address ${oldAddress}`, "red");
        return;
    }

    const newValue = prompt("Enter the new value (positive integer only):");
    if (!newValue || !validatePositiveInteger(newValue)) {
        showMessage("Error: Please enter a valid positive integer.", "red");
        return;
    }

    if (valueExists(newValue)) {
        showMessage(`Error: Value '${newValue}' already exists in the list.`, "red");
        return;
    }

    const newAddress = prompt("Enter the new address:");
    if (!newAddress) {
        showMessage("Error: New address cannot be empty.", "red");
        return;
    }

    if (linkedList.some(node => node.address === newAddress)) {
        showMessage(`Error: Cannot replace address as address ${newAddress} already exists.`, "red");
        return;
    }

    linkedList[nodeIndex].el = newValue;
    linkedList[nodeIndex].address = newAddress;
    connectNodes();
    showMessage(`Element at address ${oldAddress} replaced with value '${newValue}' and new address '${newAddress}'`, "green");
    displayList();
}

// Update button states
function updateButtonStates() {
    const buttons = document.querySelectorAll('.operation-btn');
    const isMaxSizeSet = maxSizeSet;
    const isEmpty = linkedList.length === 0;
    const isFull = maxSize !== null && linkedList.length >= maxSize;
    const hasOnlyOneElement = linkedList.length === 1;

    buttons.forEach(button => {
        if (button.id === 'setMaxSizeBtn') {
            button.disabled = isMaxSizeSet;
        } else if (['appendBtn', 'prependBtn', 'insertAtBtn'].includes(button.id)) {
            button.disabled = !isMaxSizeSet || isFull;
        } else if (['getSizeBtn', 'isFullBtn', 'isEmptyBtn'].includes(button.id)) {
            button.disabled = !isMaxSizeSet;
        } else if (['deleteHeadBtn', 'deleteTailBtn', 'deleteIndexBtn', 'showHeadBtn', 'showTailBtn', 'findBtn', 'updateAddressBtn', 'replaceAddressBtn', 'clearListBtn'].includes(button.id)) {
            button.disabled = !isMaxSizeSet || isEmpty;
        } else if (['sortBtn', 'reverseBtn'].includes(button.id)) {
            button.disabled = !isMaxSizeSet || isEmpty || hasOnlyOneElement;
        } else {
            button.disabled = !isMaxSizeSet;
        }
    });

    // Enable/disable the operationValue input
    const operationValueInput = document.getElementById('operationValue');
    operationValueInput.disabled = !isMaxSizeSet || isFull;

    // Enable/disable the findAddressInput
    const findAddressInput = document.getElementById('findAddressInput');
    findAddressInput.disabled = !isMaxSizeSet || isEmpty;
}

// Check if the insertion at an index is possible
function checkInsertIndex() {
    const indexInput = document.getElementById('operationIndex');
    const index = parseInt(indexInput.value.trim());
    const errorMessage = document.getElementById('insertIndexError');
    
    if (isNaN(index) || index < 0 || index > linkedList.length) {
        errorMessage.textContent = 'Invalid index for insertion';
        errorMessage.style.color = 'red';
    } else {
        errorMessage.textContent = '';
    }

    // Clear the input value after checking
    setTimeout(() => {
        indexInput.value = '';
    }, 2000);
}

// Update the insertAt function
function insertAt() {
    if (linkedList.length >= maxSize) {
        showMessage("Error: List is full. Cannot insert more elements.", "red");
        return;
    }

    const index = prompt("Enter the index to insert at (0 to " + linkedList.length + "):");
    if (index === null) return; // User cancelled

    if (!/^(0|[1-9]\d*)$/.test(index) || parseInt(index) > linkedList.length) {
        showMessage("Error: Invalid index. Please enter a non-negative integer within the list range.", "red");
        return;
    }

    const value = prompt("Enter the value to insert:");
    if (value === null) return; // User cancelled

    if (!validatePositiveInteger(value)) {
        showMessage("Error: Please enter a valid positive integer.", "red");
        return;
    }

    if (valueExists(value)) {
        showMessage(`Error: Value '${value}' already exists in the list.`, "red");
        return;
    }

    insert(value, parseInt(index), 3);
}

