// Initialize stack capacity and size
let stackCapacity = 0;
let stackSize = 0;
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

// Function to set the stack capacity when the "Set Stack Capacity" button is clicked
function setStackCapacity() {
    let capacity = prompt("Enter the maximum capacity of the stack (positive whole number):");

    // Validate that the input is a positive whole number
    if (capacity !== null) {
        capacity = capacity.trim();  // Remove any extra spaces
        
        // Check if capacity is a valid positive whole number
        if (capacity && !isNaN(capacity) && parseInt(capacity) > 0 && 
            !capacity.startsWith('0') && Number.isInteger(Number(capacity))) {
            stackCapacity = parseInt(capacity, 10);
            stackSize = 0;  // Reset stack size when setting capacity
            alert(`Stack capacity set to ${stackCapacity}`);

            // Enable other buttons after setting the capacity
            enableActionButtons();
            
            // Disable the Set Stack Capacity button
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
    document.getElementById('stack-sizeButton').disabled = false;  // Enable the size button
}

// Function to refresh the page and reset the capacity
function refreshCapacity() {
    // Reload the page to reset everything
    location.reload();
}

// Push button event listener
document.getElementById('stack-pushButton').addEventListener('click', function() {
    const inputValue = document.getElementById('stack-numberInput').value.trim();
    
    // Validate if the input is a valid positive whole number (integer)
    if (inputValue && !isNaN(inputValue) && parseFloat(inputValue) === parseInt(inputValue) && parseInt(inputValue) > 0 &&
        !inputValue.startsWith('0')) {
        if (stackSize < stackCapacity) {
            // Create a new bar div
            const newBar = document.createElement('div');
            newBar.classList.add('stack-bar');
            
            // Set the text of the bar to the input value
            newBar.textContent = inputValue;
            
            // Get the stack-box container
            const stackBox = document.querySelector('.stack-box');
            
            // Add the new bar to the bottom of the stack (stacking from top to bottom)
            stackBox.appendChild(newBar);
            
            // Update the stack size
            stackSize++;
            
            // Scroll to the bottom of the container to show the latest added element
            stackBox.scrollTop = stackBox.scrollHeight;  // Scroll to the bottom of the container
            
            // Clear the input field after pushing
            document.getElementById('stack-numberInput').value = '';
        } else {
            // Warn the user if they try to add more items than the capacity
            alert('The stack is full! Cannot add more items.');
        }
    } else {
        alert('Please enter a valid positive whole number (e.g., 1, 2, 3), it should not start with 0 and cannot be negative.');
    }
});

// Pop button event listener
document.getElementById('stack-popButton').addEventListener('click', function() {
    const stackBox = document.querySelector('.stack-box');
    
    // Check if the stack has any items to pop
    if (stackSize > 0) {
        // Remove the top bar (last element)
        stackBox.removeChild(stackBox.lastElementChild);
        
        // Update the stack size
        stackSize--;
    } else {
        alert('The stack is empty! Cannot pop any items.');
    }
});

// Peek button event listener
document.getElementById('stack-peekButton').addEventListener('click', function() {
    const stackBox = document.querySelector('.stack-box');
    
    // Check if the stack has any items to peek
    if (stackSize > 0) {
        const topBar = stackBox.lastElementChild; // The last element is the top of the stack
        topBar.classList.add('stack-highlight'); // Add the highlight class to the top element
        topBar.style.backgroundColor = "#FFFF80"; // Light yellow color
        
        setTimeout(() => {
            topBar.classList.remove('stack-highlight');
            topBar.style.backgroundColor = ""; // Reset the background color
        }, 1000); // Removes the highlight after 1 second
    } else {
        alert('The stack is empty! Cannot peek.');
    }
});

// Is Empty button event listener
document.getElementById('stack-isEmptyButton').addEventListener('click', function() {
    if (stackSize === 0) {
        alert('True. The stack is empty.');
    } else {
        alert('False. The stack is not empty.');
    }
});

// Is Full button event listener
document.getElementById('stack-isFullButton').addEventListener('click', function() {
    if (stackSize === stackCapacity) {
        alert('True. The stack is full.');
    } else {
        alert('False. The stack is not full.');
    }
});

// Size button event listener
document.getElementById('stack-sizeButton').addEventListener('click', function() {
    alert(`The current size of the stack is: ${stackSize}`);
});

// Add event listener for the Set Capacity button
document.getElementById('stack-setCapacityButton').addEventListener('click', setStackCapacity);

// Add event listener for the Refresh button
document.getElementById('stack-refreshButton').addEventListener('click', refreshCapacity);
