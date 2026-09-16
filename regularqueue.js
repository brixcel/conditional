// Initialize queue-related variables
let queue = [];
let maxQueueSize = 0;
let dequeueOccurred = false;
let clearQueueInitiated = false;

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
        showMessage("Queue size is already set. Please reset the queue size first.", "warning");
        return;
    }

    if (sizeInput.startsWith('0')) {
        showMessage("Queue size cannot start with zero. Please enter a valid positive number.", "error");
        return;
    }

    maxQueueSize = parseInt(sizeInput, 10);

    if (isNaN(maxQueueSize) || maxQueueSize <= 0) {
        showMessage("Please enter a valid queue size (greater than 0).", "error");
        return;
    }

    queue = [];
    dequeueOccurred = false;
    clearQueueInitiated = false;
    updateQueueDisplay();
    showMessage(`Queue initialized with a maximum size of ${maxQueueSize}.`, "success");
    updateButtonStates();
}

// Reset the Queue Size
function resetQueueSize() {
    maxQueueSize = 0;
    queue = [];
    dequeueOccurred = false;
    clearQueueInitiated = false;
    updateQueueDisplay();
    showMessage("Queue size has been reset. Please set a new queue size.", "info");
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
        showMessage("Please set the queue size first.", "warning");
        return;
    }

    if (dequeueOccurred && !clearQueueInitiated && !isEmpty()) {
        showMessage("Cannot enqueue after a dequeue operation without clearing the queue first.", "warning");
        return;
    }

    const queueInputElement = document.getElementById("queueInput");
    const queueInput = queueInputElement.value.trim();

    if (!/^[1-9]\d*$/.test(queueInput)) {
        showMessage("Please enter a valid number to enqueue. The number should not start with zero.", "error");
        return;
    }

    if (isFull()) {
        showMessage("Queue is full! Cannot enqueue more elements.", "error");
        return;
    }

    queue.push(queueInput);
    dequeueOccurred = false;
    clearQueueInitiated = false;
    updateQueueDisplay();
    showMessage(`Enqueued: ${queueInput}`, "success");

    queueInputElement.value = "";
    updateButtonStates();
}

function dequeue() {
    if (maxQueueSize === 0) {
        showMessage("Please set the queue size first.", "warning");
        return;
    }

    const queueInputElement = document.getElementById("queueInput");
    const queueInput = queueInputElement.value.trim();

    if (isEmpty()) {
        showMessage("Queue is empty! Nothing to dequeue.", "warning");
        return;
    }

    if (!/^[1-9]\d*$/.test(queueInput)) {
        showMessage("Please enter a valid number to dequeue. The number should not start with zero.", "error");
        return;
    }

    if (queue[0] !== queueInput) {
        showMessage(`The front of the queue is ${queue[0]}. Please enter this number to dequeue.`, "error");
        return;
    }

    const dequeuedElement = queue.shift();
    dequeueOccurred = true;
    updateQueueDisplay();
    showMessage(`Dequeued: ${dequeuedElement}`, "info");

    queueInputElement.value = "";
    updateButtonStates();
}

// Clear the Queue
function clearQueue() {
    queue = [];
    dequeueOccurred = false;
    clearQueueInitiated = true;
    updateQueueDisplay();
    showMessage("Queue has been cleared.", "info");
    updateButtonStates();
}

// Peek the Front Element
function peek() {
    if (maxQueueSize === 0) {
        showMessage("Please set the queue size first.", "warning");
        return;
    }

    if (isEmpty()) {
        showMessage("Queue is empty! Nothing to peek.", "warning");
        return;
    }

    showMessage(`Front Element: ${queue[0]}`, "info");
    updateButtonStates();
}

// Get the Rear Element
function rear() {
    if (maxQueueSize === 0) {
        showMessage("Please set the queue size first.", "warning");
        return;
    }

    if (isEmpty()) {
        showMessage("Queue is empty! Nothing at the rear.", "warning");
        return;
    }

    showMessage(`Rear Element: ${queue[queue.length - 1]}`, "info");
    updateButtonStates();
}

// Check if the Queue is Empty
function checkIsEmpty() {
    if (maxQueueSize === 0) {
        showMessage("Please set the queue size first.", "warning");
        return;
    }

    showMessage(`isEmpty: ${isEmpty()}`, "info");
    updateButtonStates();
}

// Check if the Queue is Full
function checkIsFull() {
    if (maxQueueSize === 0) {
        showMessage("Please set the queue size first.", "warning");
        return;
    }

    showMessage(`isFull: ${isFull()}`, "info");
    updateButtonStates();
}

// Update the Visual Representation of the Queue
function updateQueueDisplay() {
    const queueContainer = document.getElementById("queue");
    queueContainer.innerHTML = "";
    queue.forEach((item, index) => {
        const carWrapper = document.createElement("div");
        carWrapper.style.display = "inline-flex";
        carWrapper.style.flexDirection = "column";
        carWrapper.style.alignItems = "center";
        carWrapper.style.gap = "4px";

        // Pointer label
        let pointerLabel = "";
        if (index === 0 && index === queue.length - 1) {
            pointerLabel = "FRONT & REAR";
        } else if (index === 0) {
            pointerLabel = "FRONT (0)";
        } else if (index === queue.length - 1) {
            pointerLabel = `REAR (${index})`;
        } else {
            pointerLabel = `[${index}]`;
        }

        const labelDiv = document.createElement("span");
        labelDiv.style.fontSize = "0.72rem";
        labelDiv.style.fontWeight = "700";
        labelDiv.style.color = (index === 0 || index === queue.length - 1) ? "var(--primary-light)" : "var(--text-muted)";
        labelDiv.textContent = pointerLabel;

        const carElement = document.createElement("div");
        carElement.classList.add("car");

        const numberElement = document.createElement("div");
        numberElement.classList.add("number");
        numberElement.textContent = item;

        carElement.appendChild(numberElement);
        carWrapper.appendChild(labelDiv);
        carWrapper.appendChild(carElement);
        queueContainer.appendChild(carWrapper);
    });

    if (isEmpty()) {
        queueContainer.innerHTML = '<span style="color: var(--text-muted); font-style: italic; margin: auto;">Queue is currently empty.</span>';
    }
    updateButtonStates();
}

// Show a Message in the Alert Box at the Top
function showMessage(message, type = "info") {
    if (!queueMessage) return;
    queueMessage.textContent = message;
    queueMessage.className = `alert-banner alert-${type}`;
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
if (clearQueueBtn) clearQueueBtn.addEventListener("click", clearQueue);

// Function to update the states of queue control buttons
function updateButtonStates() {
    const isQueueMaxSizeSet = maxQueueSize > 0;
    const isQueueEmpty = queue.length === 0;
    const isQueueFull = queue.length >= maxQueueSize;

    enqueueBtn.disabled = !isQueueMaxSizeSet || isQueueFull;
    dequeueBtn.disabled = !isQueueMaxSizeSet || isQueueEmpty;
    peekBtn.disabled = !isQueueMaxSizeSet || isQueueEmpty;
    rearBtn.disabled = !isQueueMaxSizeSet || isQueueEmpty;
    isEmptyBtn.disabled = !isQueueMaxSizeSet;
    isFullBtn.disabled = !isQueueMaxSizeSet;
    if (clearQueueBtn) clearQueueBtn.disabled = !isQueueMaxSizeSet || isQueueEmpty;
}

// Initially disable all buttons except for the set and reset buttons
updateButtonStates();
