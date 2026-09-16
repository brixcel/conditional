// Initialize stack capacity and size
let stackCapacity = 0;
let stackSize = 0;

// Function to disable the textbox if the stack capacity is not set
function disableTextbox() {
    const numberInput = document.getElementById('stack-numberInput');
    if (numberInput) {
        numberInput.disabled = (stackCapacity <= 0);
    }
}

// Call this function initially to disable the textbox by default
disableTextbox();

// Function to set the stack capacity when the "Set Stack Capacity" button is clicked
function setStackCapacity() {
    let capacity = prompt("Enter the maximum capacity of the stack (positive whole number):");

    // Validate that the input is a positive whole number
    if (capacity !== null) {
        capacity = capacity.trim();

        if (capacity && !isNaN(capacity) && parseInt(capacity, 10) > 0 && 
            !capacity.startsWith('0') && Number.isInteger(Number(capacity))) {
            stackCapacity = parseInt(capacity, 10);
            stackSize = 0;

            if (window.DSA_UI) {
                window.DSA_UI.showToast(`Stack capacity set to ${stackCapacity}`, "success");
            } else {
                alert(`Stack capacity set to ${stackCapacity}`);
            }

            enableActionButtons();
            disableTextbox();
            document.getElementById('stack-setCapacityButton').disabled = true;
        } else {
            alert("Please enter a valid positive whole number greater than 0. It should not start with 0.");
        }
    }
}

// Function to enable action buttons after setting capacity
function enableActionButtons() {
    document.getElementById('stack-pushButton').disabled = false;
    document.getElementById('stack-popButton').disabled = false;
    document.getElementById('stack-peekButton').disabled = false;
    document.getElementById('stack-isEmptyButton').disabled = false;
    document.getElementById('stack-isFullButton').disabled = false;
    document.getElementById('stack-sizeButton').disabled = false;
}

// Function to refresh the page and reset the capacity
function refreshCapacity() {
    location.reload();
}

function updateStackState() {
    const topEl = document.getElementById('stack-top-val');
    const sizeEl = document.getElementById('stack-size-val');
    const stackBox = document.querySelector('.stack-box');
    
    if (sizeEl) {
        sizeEl.innerText = `${stackSize} / ${stackCapacity}`;
    }
    if (topEl) {
        if (stackSize > 0 && stackBox && stackBox.lastElementChild) {
            topEl.innerText = stackBox.lastElementChild.textContent;
        } else {
            topEl.innerText = 'Empty (None)';
        }
    }
}

// Push button event listener
document.getElementById('stack-pushButton').addEventListener('click', function() {
    const numberInput = document.getElementById('stack-numberInput');
    const inputValue = numberInput.value.trim();
    
    if (inputValue && !isNaN(inputValue) && parseFloat(inputValue) === parseInt(inputValue, 10) && 
        parseInt(inputValue, 10) > 0 && !inputValue.startsWith('0')) {
        if (stackSize < stackCapacity) {
            const newBar = document.createElement('div');
            newBar.classList.add('stack-bar');
            newBar.textContent = inputValue;
            
            const stackBox = document.querySelector('.stack-box');
            stackBox.appendChild(newBar);
            stackSize++;
            stackBox.scrollTop = stackBox.scrollHeight;
            numberInput.value = '';
            updateStackState();
        } else {
            alert('The stack is full! Cannot add more items.');
        }
    } else {
        alert('Please enter a valid positive whole number (e.g., 1, 2, 3), it should not start with 0 and cannot be negative.');
    }
});

// Pop button event listener
document.getElementById('stack-popButton').addEventListener('click', function() {
    const stackBox = document.querySelector('.stack-box');
    
    if (stackSize > 0) {
        const topElementValue = stackBox.lastElementChild.textContent;
        const userInput = document.getElementById('stack-numberInput').value.trim();

        if (userInput === topElementValue) {
            stackBox.removeChild(stackBox.lastElementChild);
            stackSize--;
            document.getElementById('stack-numberInput').value = '';
            updateStackState();
        } else {
            alert(`Incorrect input. According to LIFO, the number to pop should be: ${topElementValue}`);
        }
    } else {
        alert('The stack is empty! Cannot pop any items.');
    }
});

// Peek button event listener
document.getElementById('stack-peekButton').addEventListener('click', function() {
    const stackBox = document.querySelector('.stack-box');
    
    if (stackSize > 0) {
        const topBar = stackBox.lastElementChild;
        topBar.classList.add('stack-highlight');
        
        setTimeout(() => {
            topBar.classList.remove('stack-highlight');
        }, 1000);
    } else {
        alert('The stack is empty! Cannot peek.');
    }
});

// Is Empty button event listener
document.getElementById('stack-isEmptyButton').addEventListener('click', function() {
    alert(stackSize === 0 ? 'True. The stack is empty.' : 'False. The stack is not empty.');
});

// Is Full button event listener
document.getElementById('stack-isFullButton').addEventListener('click', function() {
    alert(stackSize === stackCapacity ? 'True. The stack is full.' : 'False. The stack is not full.');
});

// Size button event listener
document.getElementById('stack-sizeButton').addEventListener('click', function() {
    alert(`The current size of the stack is: ${stackSize}`);
});

// Add event listeners for capacity & reset
document.getElementById('stack-setCapacityButton').addEventListener('click', () => {
    setStackCapacity();
    updateStackState();
});
document.getElementById('stack-refreshButton').addEventListener('click', refreshCapacity);