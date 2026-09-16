/**
 * stack.js - Academic Stack (LIFO) Visualizer Logic
 */

// Initialize stack capacity and size
let stackCapacity = 0;
let stackSize = 0;

function notify(message, type = "info") {
    if (window.DSA_UI && typeof window.DSA_UI.showToast === "function") {
        window.DSA_UI.showToast(message, type);
    } else {
        alert(message);
    }
}

// Function to disable/enable the mutation textbox based on capacity
function disableTextbox() {
    const numberInput = document.getElementById('stack-numberInput');
    if (numberInput) {
        numberInput.disabled = (stackCapacity <= 0);
    }
}

// Disable textbox by default until capacity is set
disableTextbox();

// Function to set the stack capacity
function setStackCapacity() {
    let capacityValue = null;
    const capacityInput = document.getElementById('stack-capacityInput');

    if (capacityInput && capacityInput.value) {
        capacityValue = capacityInput.value.trim();
    } else {
        capacityValue = prompt("Enter the maximum capacity of the stack (1 - 12):");
    }

    if (capacityValue !== null) {
        capacityValue = String(capacityValue).trim();

        if (capacityValue && !isNaN(capacityValue) && parseInt(capacityValue, 10) > 0 && 
            !capacityValue.startsWith('0') && Number.isInteger(Number(capacityValue))) {
            
            stackCapacity = parseInt(capacityValue, 10);
            if (stackCapacity > 12) stackCapacity = 12; // Cap max height for optimal viewport display
            
            stackSize = 0;
            const stackBox = document.querySelector('.stack-box');
            if (stackBox) stackBox.innerHTML = '';

            notify(`Stack capacity successfully set to ${stackCapacity}`, "success");
            enableActionButtons();
            disableTextbox();
            
            const setCapBtn = document.getElementById('stack-setCapacityButton');
            if (setCapBtn) setCapBtn.disabled = true;
            if (capacityInput) capacityInput.disabled = true;
            
            updateStackState();
        } else {
            notify("Please enter a valid positive whole number greater than 0 (e.g., 5).", "error");
        }
    }
}

// Function to enable action buttons after setting capacity
function enableActionButtons() {
    ['stack-pushButton', 'stack-popButton', 'stack-peekButton', 
     'stack-isEmptyButton', 'stack-isFullButton', 'stack-sizeButton'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = false;
    });
}

// Function to reset stack state in-place without page reload
function refreshCapacity() {
    stackCapacity = 0;
    stackSize = 0;
    
    const stackBox = document.querySelector('.stack-box');
    if (stackBox) stackBox.innerHTML = '';

    const numberInput = document.getElementById('stack-numberInput');
    if (numberInput) {
        numberInput.value = '';
        numberInput.disabled = true;
    }

    const capacityInput = document.getElementById('stack-capacityInput');
    if (capacityInput) {
        capacityInput.disabled = false;
        capacityInput.value = '6';
    }

    const setCapBtn = document.getElementById('stack-setCapacityButton');
    if (setCapBtn) setCapBtn.disabled = false;

    ['stack-pushButton', 'stack-popButton', 'stack-peekButton', 
     'stack-isEmptyButton', 'stack-isFullButton', 'stack-sizeButton'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = true;
    });

    updateStackState();
    notify("Stack state reset. Please allocate a new capacity.", "info");
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
const pushBtn = document.getElementById('stack-pushButton');
if (pushBtn) {
    pushBtn.addEventListener('click', function() {
        const numberInput = document.getElementById('stack-numberInput');
        let inputValue = numberInput ? numberInput.value.trim() : '';
        
        if (inputValue && !isNaN(inputValue) && parseFloat(inputValue) === parseInt(inputValue, 10) && 
            parseInt(inputValue, 10) > 0 && !inputValue.startsWith('0')) {
            if (stackSize < stackCapacity) {
                const newBar = document.createElement('div');
                newBar.classList.add('stack-bar');
                newBar.textContent = inputValue;
                
                const stackBox = document.querySelector('.stack-box');
                if (stackBox) {
                    stackBox.appendChild(newBar);
                    stackSize++;
                    stackBox.scrollTop = stackBox.scrollHeight;
                }
                numberInput.value = '';
                updateStackState();
                notify(`Pushed ${inputValue} onto Top of Stack`, "success");
            } else {
                notify('Stack Overflow! Maximum capacity reached.', "error");
            }
        } else {
            notify('Please enter a valid positive whole integer (e.g. 10, 42).', "error");
        }
    });
}

// Pop button event listener
const popBtn = document.getElementById('stack-popButton');
if (popBtn) {
    popBtn.addEventListener('click', function() {
        const stackBox = document.querySelector('.stack-box');
        
        if (stackSize > 0 && stackBox && stackBox.lastElementChild) {
            const topElementValue = stackBox.lastElementChild.textContent;
            const numberInput = document.getElementById('stack-numberInput');
            const userInput = numberInput ? numberInput.value.trim() : '';

            // If user supplied a number, verify it matches top; otherwise pop directly
            if (userInput === '' || userInput === topElementValue) {
                stackBox.removeChild(stackBox.lastElementChild);
                stackSize--;
                if (numberInput) numberInput.value = '';
                updateStackState();
                notify(`Popped ${topElementValue} from Top of Stack (LIFO)`, "info");
            } else {
                notify(`LIFO Rule: Top element is ${topElementValue}, not ${userInput}.`, "error");
            }
        } else {
            notify('Stack Underflow! Cannot pop from an empty stack.', "error");
        }
    });
}

// Peek button event listener
const peekBtn = document.getElementById('stack-peekButton');
if (peekBtn) {
    peekBtn.addEventListener('click', function() {
        const stackBox = document.querySelector('.stack-box');
        
        if (stackSize > 0 && stackBox && stackBox.lastElementChild) {
            const topBar = stackBox.lastElementChild;
            topBar.classList.add('stack-highlight');
            notify(`Peek: Top element is ${topBar.textContent}`, "info");
            
            setTimeout(() => {
                topBar.classList.remove('stack-highlight');
            }, 1200);
        } else {
            notify('The stack is empty. Top is null.', "info");
        }
    });
}

// Is Empty button event listener
const isEmptyBtn = document.getElementById('stack-isEmptyButton');
if (isEmptyBtn) {
    isEmptyBtn.addEventListener('click', function() {
        notify(stackSize === 0 ? 'IsEmpty: TRUE (Size is 0)' : 'IsEmpty: FALSE (Stack contains elements)', "info");
    });
}

// Is Full button event listener
const isFullBtn = document.getElementById('stack-isFullButton');
if (isFullBtn) {
    isFullBtn.addEventListener('click', function() {
        notify(stackSize === stackCapacity ? 'IsFull: TRUE (Stack is at max capacity)' : 'IsFull: FALSE (Available space remains)', "info");
    });
}

// Size button event listener
const sizeBtn = document.getElementById('stack-sizeButton');
if (sizeBtn) {
    sizeBtn.addEventListener('click', function() {
        notify(`Current Stack Size: ${stackSize} / ${stackCapacity} elements`, "info");
    });
}

// Set Capacity & Reset button listeners
const setCapBtn = document.getElementById('stack-setCapacityButton');
if (setCapBtn) {
    setCapBtn.addEventListener('click', () => {
        setStackCapacity();
        updateStackState();
    });
}

const refreshBtn = document.getElementById('stack-refreshButton');
if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshCapacity);
}