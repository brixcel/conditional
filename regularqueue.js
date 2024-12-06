// Initialize queue-related variables
let queue = [];
let maxQueueSize = 0;
let dequeueOccurred = false;
let clearQueueInitiated = false;

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

// Queue Control Elements
const setQueueSizeBtn = document.getElementById("setQueueSizeBtn");
const resetQueueSizeBtn = document.getElementById("resetQueueSizeBtn");
const enqueueBtn = document.getElementById("enqueueBtn");
const dequeueBtn = document.getElementById("dequeueBtn");
const peekBtn = document.getElementById("peekBtn");
const rearBtn = document.getElementById("rearBtn");
const isEmptyBtn = document.getElementById("isEmptyBtn");
const isFullBtn = document.getElementById("isFullBtn");
const clearQueueBtn = document.getElementById("clearQueueBtn");

// Message Display Element
const queueMessage = document.getElementById("queueMessage");

// Initialize the Queue
function initializeQueue() {
    const sizeInput = document.getElementById("queueSize").value.trim();

    if (maxQueueSize > 0) {
        showMessage("❌ Queue size is already set. Please reset the queue size first.");
        return;
    }

    if (sizeInput.startsWith('0')) {
        showMessage("❌ Queue size cannot start with zero. Please enter a valid positive number.");
        return;
    }

    maxQueueSize = parseInt(sizeInput, 10);

    if (isNaN(maxQueueSize) || maxQueueSize <= 0) {
        showMessage("❌ Please enter a valid queue size (greater than 0).");
        return;
    }

    queue = [];
    dequeueOccurred = false;
    clearQueueInitiated = false;
    updateQueueDisplay();
    showMessage(`✅ Queue initialized with a maximum size of ${maxQueueSize}.`);
    updateButtonStates();
}

// Reset the Queue Size
function resetQueueSize() {
    maxQueueSize = 0;
    queue = [];
    dequeueOccurred = false;
    clearQueueInitiated = false;
    updateQueueDisplay();
    showMessage("🔄 Queue size has been reset. Please set a new queue size.");
    document.getElementById("queueSize").value = "";
    updateButtonStates();
}

// Check if the Queue is Empty
function isEmpty() {
    return queue.length === 0;
}

// Check if the Queue is Full
function isFull() {
    return maxQueueSize > 0 && queue.length >= maxQueueSize;
}

// Enqueue an Element
function enqueue() {
    if (maxQueueSize === 0) {
        showMessage("❌ Please set the queue size first.");
        return;
    }

    if (dequeueOccurred && !clearQueueInitiated && !isEmpty()) {
        showMessage("❌ Cannot enqueue after a dequeue operation without clearing the queue first.");
        return;
    }

    const queueInputElement = document.getElementById("queueInput");
    const queueInput = queueInputElement.value.trim();

    if (!/^[1-9]\d*$/.test(queueInput)) {
        showMessage("❌ Please enter a valid number to enqueue. The number should not start with zero.");
        return;
    }

    if (isFull()) {
        showMessage("⚠️ Queue is full! Cannot enqueue more elements.");
        return;
    }

    queue.push(queueInput);
    dequeueOccurred = false;
    clearQueueInitiated = false;
    updateQueueDisplay();
    showMessage(`✅ Enqueued: ${queueInput}`);

    // Automatically clear the input field after a successful enqueue operation
    queueInputElement.value = "";
    updateButtonStates();
}

function dequeue() {
    if (maxQueueSize === 0) {
        showMessage("❌ Please set the queue size first.");
        return;
    }

    const queueInputElement = document.getElementById("queueInput");
    const queueInput = queueInputElement.value.trim();

    if (isEmpty()) {
        showMessage("⚠️ Queue is empty! Nothing to dequeue.");
        return;
    }

    if (!/^[1-9]\d*$/.test(queueInput)) {
        showMessage("❌ Please enter a valid number to dequeue. The number should not start with zero.");
        return;
    }

    if (queue[0] !== queueInput) {
        showMessage(`❌ The front of the queue is ${queue[0]}. Please enter this number to dequeue.`);
        return;
    }

    const dequeuedElement = queue.shift();
    dequeueOccurred = true;
    updateQueueDisplay();
    showMessage(`✅ Dequeued: ${dequeuedElement}`);

    // Automatically clear the input field after a successful dequeue operation
    queueInputElement.value = "";
    updateButtonStates();
}

// Clear the Queue
function clearQueue() {
    queue = [];
    dequeueOccurred = false; // Reset this flag after clearing the queue
    clearQueueInitiated = true; // Set this flag to allow enqueueing again
    updateQueueDisplay();
    showMessage("🔄 Queue has been cleared.");
    updateButtonStates();
}

// Peek the Front Element
function peek() {
    if (maxQueueSize === 0) {
        showMessage("❌ Please set the queue size first.");
        return;
    }

    if (isEmpty()) {
        showMessage("⚠️ Queue is empty! Nothing to peek.");
        return;
    }

    showMessage(`🔍 Front Element: ${queue[0]}`);
    updateButtonStates();
}

// Get the Rear Element
function rear() {
    if (maxQueueSize === 0) {
        showMessage("❌ Please set the queue size first.");
        return;
    }

    if (isEmpty()) {
        showMessage("⚠️ Queue is empty! Nothing at the rear.");
        return;
    }

    showMessage(`🔍 Rear Element: ${queue[queue.length - 1]}`);
    updateButtonStates();
}

// Check if the Queue is Empty
function checkIsEmpty() {
    if (maxQueueSize === 0) {
        showMessage("❌ Please set the queue size first.");
        return;
    }

    showMessage(`✅ isEmpty: ${isEmpty()}`);
    updateButtonStates();
}

// Check if the Queue is Full
function checkIsFull() {
    if (maxQueueSize === 0) {
        showMessage("❌ Please set the queue size first.");
        return;
    }

    showMessage(`✅ isFull: ${isFull()}`);
    updateButtonStates();
}

// Update the Visual Representation of the Queue
function updateQueueDisplay() {
    const queueContainer = document.getElementById("queue");
    queueContainer.innerHTML = "";
    queue.forEach((item) => {
        const carElement = document.createElement("div");
        carElement.classList.add("car");

        const numberElement = document.createElement("div");
        numberElement.classList.add("number");
        numberElement.textContent = item;

        carElement.appendChild(numberElement);
        queueContainer.appendChild(carElement);
    });

    if (isEmpty()) {
        showMessage("ℹ️ Queue is currently empty.");
    }
    updateButtonStates();
}

// Show a Message in the Message Box at the Top
function showMessage(message) {
    queueMessage.textContent = message;
    queueMessage.style.display = 'block'; 

    setTimeout(() => {
        queueMessage.style.display = 'none';
    }, 5000);
}

// Add Event Listeners for Queue Control Buttons
setQueueSizeBtn.addEventListener("click", initializeQueue);
resetQueueSizeBtn.addEventListener("click", resetQueueSize);
enqueueBtn.addEventListener("click", enqueue);
dequeueBtn.addEventListener("click", dequeue);
peekBtn.addEventListener("click", peek);
rearBtn.addEventListener("click", rear);
isEmptyBtn.addEventListener("click", checkIsEmpty);
isFullBtn.addEventListener("click", checkIsFull);
clearQueueBtn.addEventListener("click", clearQueue);

// Handle Window Resize to Close the Side Navbar if Window is Resized to Desktop
window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
        sideNavbar.style.width = "0";
    }
});

// Function to update the states of queue control buttons
function updateButtonStates() {
    const isQueueMaxSizeSet = maxQueueSize > 0;
    const isQueueEmpty = queue.length === 0;
    const isQueueFull = queue.length >= maxQueueSize;

    // Disable all buttons by default except setQueueSizeBtn and resetQueueSizeBtn
    enqueueBtn.disabled = !isQueueMaxSizeSet || isQueueFull;
    dequeueBtn.disabled = !isQueueMaxSizeSet || isQueueEmpty;
    peekBtn.disabled = !isQueueMaxSizeSet || isQueueEmpty;
    rearBtn.disabled = !isQueueMaxSizeSet || isQueueEmpty;
    isEmptyBtn.disabled = !isQueueMaxSizeSet;
    isFullBtn.disabled = !isQueueMaxSizeSet;
    clearQueueBtn.disabled = !isQueueMaxSizeSet || isQueueEmpty;
}

// Initially disable all buttons except for the set and reset buttons
updateButtonStates(); 
