let stackMaxCapacity = 0;
let stackCurrentSize = 0;

// Side Navbar Elements
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

// Function to configure the stack's maximum capacity
function configureStackMaxCapacity() {
    const userInput = document.getElementById('stackCapacityInput').value.trim();

    // Check if input starts with '0' or is not a valid number
    if (userInput.startsWith('0')) {
        displayMessage("Stack capacity cannot start with zero. Please enter a valid positive number.");
        return;
    }

    if (userInput && !isNaN(userInput) && parseInt(userInput) > 0 && Number.isInteger(Number(userInput))) {
        stackMaxCapacity = parseInt(userInput, 10);
        stackCurrentSize = 0;
        displayMessage(`Stack capacity set to ${stackMaxCapacity}`);
        
        enableStackButtons();
        document.getElementById('setStackCapacityBtn').disabled = true;
        document.getElementById('stackCapacityInput').disabled = true;
    } else {
        displayMessage("Please enter a valid positive whole number.");
    }
}

// Function to display output messages
function displayMessage(message) {
    document.getElementById('outputMessage').textContent = message;
}

// Function to enable stack control buttons
function enableStackButtons() {
    document.getElementById('addElementBtn').disabled = false;
    document.getElementById('removeElementBtn').disabled = false;
    document.getElementById('viewTopElementBtn').disabled = false;
    document.getElementById('checkStackEmptyBtn').disabled = false;
    document.getElementById('checkStackFullBtn').disabled = false;
    document.getElementById('viewRearElementBtn').disabled = false;  // Enable rear button
}

// Add element to stack
document.getElementById('addElementBtn').addEventListener('click', function() {
    const elementValue = document.getElementById('stackElementInput').value.trim();

    if (elementValue) {
        if (stackCurrentSize < stackMaxCapacity) {
            const newStackElement = document.createElement('div');
            newStackElement.classList.add('stackBar');
            newStackElement.textContent = elementValue;

            const stackContainer = document.querySelector('.stackVisualContainer');
            stackContainer.appendChild(newStackElement);

            stackCurrentSize++;
            displayMessage(`Added element: ${elementValue}`);
            document.getElementById('stackElementInput').value = '';
        } else {
            displayMessage("The stack is full! Cannot add more items.");
        }
    } else {
        displayMessage("Please enter a value.");
    }
});

// Remove element from stack with validation
document.getElementById('removeElementBtn').addEventListener('click', function() {
    const elementToRemove = document.getElementById('stackElementInput').value.trim();
    const stackContainer = document.querySelector('.stackVisualContainer');

    if (!elementToRemove) {
        displayMessage("Please enter a value to pop.");
        return;
    }

    if (stackCurrentSize > 0) {
        const topElement = stackContainer.lastElementChild;

        if (topElement.textContent === elementToRemove) {
            stackContainer.removeChild(topElement);
            stackCurrentSize--;
            displayMessage(`Removed element: ${elementToRemove}`);
        } else {
            displayMessage("Error: The entered value is not at the top of the stack.");
        }
    } else {
        displayMessage("The stack is empty! Cannot remove any items.");
    }

    document.getElementById('stackElementInput').value = '';
});

// View the top element of the stack
document.getElementById('viewTopElementBtn').addEventListener('click', function() {
    const stackContainer = document.querySelector('.stackVisualContainer');

    if (stackCurrentSize > 0) {
        const topElement = stackContainer.lastElementChild;
        displayMessage(`Top element: ${topElement.textContent}`);
    } else {
        displayMessage("The stack is empty! Cannot view the top element.");
    }
});

// View the rear (bottom) element of the stack
document.getElementById('viewRearElementBtn').addEventListener('click', function() {
    const stackContainer = document.querySelector('.stackVisualContainer');

    if (stackCurrentSize > 0) {
        const rearElement = stackContainer.firstElementChild;  // Bottom element
        displayMessage(`Rear element: ${rearElement.textContent}`);
    } else {
        displayMessage("The stack is empty! Cannot view the rear element.");
    }
});

// Check if the stack is empty
document.getElementById('checkStackEmptyBtn').addEventListener('click', function() {
    displayMessage(stackCurrentSize === 0 ? "True: The stack is empty." : "False: The stack is not empty.");
});

// Check if the stack is full
document.getElementById('checkStackFullBtn').addEventListener('click', function() {
    displayMessage(stackCurrentSize === stackMaxCapacity ? "True: The stack is full." : "False: The stack is not full.");
});

// Event listener for setting stack capacity
document.getElementById('setStackCapacityBtn').addEventListener('click', configureStackMaxCapacity);

// Event listener for resetting the stack
document.getElementById('resetStackBtn').addEventListener('click', function() {
    location.reload();
});
window.addEventListener('resize', () => {
    // Check if the navbar is open and the window width is greater than a specific size (e.g., 768px)
    if (window.innerWidth >= 768) {
        sideNavbar.classList.remove('active');
        mainContent.classList.remove('shifted');
    }
});
