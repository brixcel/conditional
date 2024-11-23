class CircularQueue {
    constructor(capacity) {
        this.queue = new Array(capacity).fill(null);
        this.maxCap = capacity;
        this.front = -1;
        this.rear = -1;
        this.mustEmptyFirst = false;
    }

    getSize() {
        if (this.front === -1) return 0;
        if (this.rear >= this.front) return this.rear - this.front + 1;
        return this.maxCap - (this.front - this.rear - 1);
    }

    isEmpty() {
        return this.front === -1;
    }

    isFull() {
        return (this.rear + 1) % this.maxCap === this.front;
    }

    enqueue(data) {
        if (typeof data !== 'number' || isNaN(data)) {
            return "Only integers are allowed.";
        }

        if (data < 1 || data > 99) {
            return "Please enter a number between 1 and 99.";
        }

        if (this.mustEmptyFirst) {
            return "Please dequeue elements first.";
        }

        // Check if the value already exists in the queue
        if (this.queue.includes(data)) {
            return `${data} is already in the queue. Duplicates are not allowed.`;
        }

        if (this.isFull()) {
            this.mustEmptyFirst = true;
            return "Queue reached its maximum capacity.";
        }

        if (this.front === -1) {
            this.front = 0;
        }

        this.rear = (this.rear + 1) % this.maxCap;
        this.queue[this.rear] = data;
        return `${data} was added to the queue.`;
    }

    // Dequeue only if the value is at the front of the queue
    dequeueAtValue(value) {
        if (this.isEmpty()) {
            return "Nothing to dequeue.";
        }

        // Check if the specified value is at the front
        if (this.queue[this.front] !== value) {
            return `You can only dequeue from the front of the queue. The front is ${this.queue[this.front]}, not ${value}.`;
        }

        const frontElement = this.queue[this.front];
        this.queue[this.front] = null;
        this.updateFront();

        if (!this.isFull()) {
            this.mustEmptyFirst = false;
        }

        return `${frontElement} was removed from the queue.`;
    }

    updateFront() {
        if (this.front === this.rear) {
            this.front = -1;
            this.rear = -1;
            this.mustEmptyFirst = false;
        } else {
            this.front = (this.front + 1) % this.maxCap;
        }
    }

    peek() {
        if (this.isEmpty()) {
            return "Queue is empty.";
        }
        return `${this.queue[this.front]}`;
    }

    rearElement() {
        if (this.isEmpty()) {
            return "Queue is empty.";
        }
        return `${this.queue[this.rear]}`;
    }
}

let circularQueue = null;
const outputBox = document.getElementById("output");
const queueContainer = document.getElementById("queueContainer");
const status = document.getElementById("status");

function changeQueueSize() {
    const newSize = Math.min(10, Math.max(3, parseInt(document.getElementById("queueSize").value)));
    document.getElementById("queueSize").value = newSize; // Update input field to reflect valid size
    circularQueue = new CircularQueue(newSize);
    status.innerText = `Queue initialized with a size of ${newSize}.`;
    updateQueueDisplay();
}


function handleEnqueue() {
    let data = document.getElementById("enqueueValue").value.trim();

    if (!/^\d+$/.test(data)) {
        status.innerText = "Please enter a valid integer.";
        return;
    }

    if (!/^[1-9][0-9]?$/.test(data)) {
        status.innerText = "Please enter a valid integer between 1 and 99 (no leading zeros).";
        return;
    }

    data = parseInt(data, 10);

    if (data < 1 || data > 99) {
        status.innerText = "Please enter a number between 1 and 99.";
        return;
    }

    if (!circularQueue) {
        status.innerText = "Please set a valid queue limit first.";
        return;
    }

    const result = circularQueue.enqueue(data);
    status.innerText = result;
    updateQueueDisplay();
}

function handleDequeue() {
    const dequeueInput = document.getElementById("dequeueValue").value.trim();

    // Check if the input is empty or if the queue is not initialized
    if (!circularQueue) {
        status.innerText = "Please set a valid queue limit first.";
        return;
    }

    // Check for invalid input, including leading zeros
    if (!/^\d+$/.test(dequeueInput) || /^0\d+/.test(dequeueInput)) {
        status.innerText = "Please enter a valid integer without leading zeros.";
        return;
    }

    const value = parseInt(dequeueInput, 10);

    // Check if the input is within the valid range
    if (value < 1 || value > 99) {
        status.innerText = "Please enter a valid number between 1 and 99.";
        return;
    }

    // Proceed with dequeuing the value
    const result = circularQueue.dequeueAtValue(value);
    status.innerText = result;
    updateQueueDisplay();
}


function handlePeek() {
    if (!circularQueue) {
        status.innerText = "Please set a valid queue limit first.";
        return;
    }

    status.innerText = circularQueue.peek();
}

function handleRear() {
    if (!circularQueue) {
        status.innerText = "Please set a valid queue limit first.";
        return;
    }

    status.innerText = circularQueue.rearElement();
}

function handleSize() {
    if (!circularQueue) {
        status.innerText = "Please set a valid queue limit first.";
        return;
    }

    status.innerText = `Queue size: ${circularQueue.getSize()}`;
}

function handleIsEmpty() {
    if (!circularQueue) {
        status.innerText = "Please set a valid queue limit first.";
        return;
    }

    status.innerText = circularQueue.isEmpty() ? "TRUE" : "FALSE";
}

function handleIsFull() {
    if (!circularQueue) {
        status.innerText = "Please set a valid queue limit first.";
        return;
    }

    status.innerText = circularQueue.isFull() ? "TRUE" : "FALSE";
}

function calculatePositions(size, radius) {
    const positions = [];
    const centerX = 150, centerY = 150;
    const angleStep = (2 * Math.PI) / size;

    for (let i = 0; i < size; i++) {
        const angle = i * angleStep;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        positions.push({ x, y });
    }

    return positions;
}

function updateQueueDisplay() {
    queueContainer.innerHTML = ''; 
    if (!circularQueue || circularQueue.isEmpty()) {
        return;
    }

    const positions = calculatePositions(circularQueue.maxCap, 120);

    let i = circularQueue.front;
    do {
        const slot = document.createElement("div");
        slot.className = "queue-slot";
        slot.style.left = `${positions[i].x}px`;
        slot.style.top = `${positions[i].y}px`;
        if (circularQueue.queue[i] !== null) {
            slot.classList.add("filled");
            slot.innerText = circularQueue.queue[i];
        }
        queueContainer.appendChild(slot);

        // Add "Front" label at the front of the queue
        if (i === circularQueue.front) {
            addFrontLastIndicator(positions[i], "Front");
        }

        // Add "Last" label at the rear (last) of the queue
        if (i === circularQueue.rear) {
            addFrontLastIndicator(positions[i], "Last");
        }

        i = (i + 1) % circularQueue.maxCap;
    } while (i !== (circularQueue.rear + 1) % circularQueue.maxCap);
}

// Updated function to display "Front" and "Last" labels
function addFrontLastIndicator(position, label) {
    const indicator = document.createElement("div");
    indicator.className = "front-last-indicator";
    indicator.innerText = label;

    const offset = 50; // Increased offset to move labels farther away
    const angle = Math.atan2(position.y - 150, position.x - 150);
    const x = position.x + offset * Math.cos(angle);
    const y = position.y + offset * Math.sin(angle);

    indicator.style.left = `${x}px`;
    indicator.style.top = `${y}px`;
    queueContainer.appendChild(indicator);
}

changeQueueSize();
