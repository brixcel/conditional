let queue = [];
let maxQueueSize = 0;

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

// Initialize the queue
function initializeQueue() {
    const sizeInput = document.getElementById("queueSize").value;
    maxQueueSize = parseInt(sizeInput, 10);

    if (isNaN(maxQueueSize) || maxQueueSize <= 0) {
        showMessage("Please enter a valid queue size (greater than 0).");
        return;
    }

    queue = []; // Reset the queue
    updateQueueDisplay();
    showMessage(`Queue initialized with a maximum size of ${maxQueueSize}`);
}

// Check if the queue is empty
function isEmpty() {
    return queue.length === 0; // Returns true if the queue is empty, false otherwise
}

// Check if the queue is full
function isFull() {
    // Return false if maxQueueSize is not set or is less than 1
    if (maxQueueSize <= 0) {
        return false;
    }
    return queue.length >= maxQueueSize; // Return true if queue is full
}

// Add an element to the queue
function enqueue() {
    const queueInput = document.getElementById("queueInput").value.trim();

    if (!queueInput) {
        showMessage("Please enter a value to enqueue.");
        return;
    }

    if (isFull()) {
        showMessage("Queue is full!");
        return;
    }

    queue.push(queueInput); // Add the value to the queue
    updateQueueDisplay();
    showMessage(`Enqueued: ${queueInput}`);
}

// Remove an element from the queue
function dequeue() {
    if (isEmpty()) {
        showMessage("Queue is empty!");
        return;
    }

    const dequeuedElement = queue.shift(); // Remove the front element
    updateQueueDisplay();
    showMessage(`Dequeued: ${dequeuedElement}`);
}

// Peek the front element of the queue
function peek() {
    if (isEmpty()) {
        showMessage("Queue is empty!");
        return;
    }

    showMessage(`Front: ${queue[0]}`);
}

// Get the rear element of the queue
function rear() {
    if (isEmpty()) {
        showMessage("Queue is empty!");
        return;
    }

    showMessage(`Rear: ${queue[queue.length - 1]}`);
}

// Update the visual representation of the queue
function updateQueueDisplay() {
    const queueContainer = document.getElementById("queue");
    queueContainer.innerHTML = ""; // Clear the current display

    queue.forEach((item, index) => {
        const carElement = document.createElement("div");
        carElement.classList.add("car");

        const numberElement = document.createElement("div");
        numberElement.classList.add("number");
        numberElement.textContent = item;

        carElement.appendChild(numberElement);
        queueContainer.appendChild(carElement);
    });

    if (isEmpty()) {
        showMessage("Queue is currently empty.");
    }
}

// Show a message in the message box
function showMessage(message) {
    const messageElement = document.getElementById("queueMessage");
    messageElement.textContent = message;
}

// Add event listeners for the buttons
document.getElementById("setQueueSizeBtn").addEventListener("click", initializeQueue);
document.getElementById("enqueueBtn").addEventListener("click", enqueue);
document.getElementById("dequeueBtn").addEventListener("click", dequeue);
document.getElementById("peekBtn").addEventListener("click", peek);
document.getElementById("rearBtn").addEventListener("click", rear);
document.getElementById("isEmptyBtn").addEventListener("click", () => {
    const result = isEmpty(); // Check if queue is empty
    showMessage(`isEmpty: ${result}`); // Display true or false
});
document.getElementById("isFullBtn").addEventListener("click", () => {
    const result = isFull(); // Check if queue is full
    showMessage(`isFull: ${result}`); // Display true or false
});

// Load menu dynamically (if applicable)
fetch("menu.html")
    .then((response) => response.text())
    .then((data) => {
        document.getElementById("menu-container").innerHTML = data;

        // Initialize menu functionality
        const sideNavbar = document.getElementById("sideNavbar");
        const openBtn = document.getElementById("openBtn");
        const closeBtn = document.getElementById("closeBtn");

        if (openBtn) {
            openBtn.addEventListener("click", () => {
                sideNavbar.style.width = "250px";
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                sideNavbar.style.width = "0px";
            });
        }
    })
    .catch((error) => console.error("Error loading menu:", error));
