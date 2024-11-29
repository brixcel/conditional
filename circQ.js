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
class CircularQueue { 
    

    constructor(capacity) {
        this.queue = new Array(capacity).fill(null);
        this.capacity = capacity;
        this.front = -1;
        this.rear = -1;
    }

    getSize() {
        if (this.front === -1) return 0;
        if (this.rear >= this.front) return this.rear - this.front + 1;
        return this.capacity - (this.front - this.rear - 1);
    }

    isEmpty() {
        return this.front === -1;
    }

    isFull() {
        return (this.rear + 1) % this.capacity === this.front;
    }

    enqueue(data) {
        if (typeof data !== 'number' || isNaN(data) || !Number.isInteger(data)) {
            return "Only integers are allowed.";
        }

        if (data < 1 || data > 99) {
            return "Please enter a number between 1 and 99.";
        }

        if (this.isFull()) {
            return "Queue reached its maximum capacity.";
        }

        if (this.front === -1) {
            this.front = 0;
        }

        this.rear = (this.rear + 1) % this.capacity;
        this.queue[this.rear] = data;
        return `${data} was added to the queue.`;
    }

    dequeue() {
        if (this.isEmpty()) {
            return "Nothing to dequeue.";
        }

        const frontElement = this.queue[this.front];
        this.queue[this.front] = null;
        if (this.front === this.rear) {
            this.front = -1;
            this.rear = -1;
        } else {
            this.front = (this.front + 1) % this.capacity;
        }

        return `${frontElement} was removed from the queue.`;
    }

    peek() {
        return this.isEmpty() ? "Queue is empty." : `${this.queue[this.front]}`;
    }

    rearElement() {
        return this.isEmpty() ? "Queue is empty." : `${this.queue[this.rear]}`;
    }
}

let circularQueue = null;
const queueContainer = document.getElementById("queueContainer");
const status = document.getElementById("status");

function changeQueueSize() {
    const newSize = parseInt(document.getElementById("queueSize").value.trim(), 10);
    if (isNaN(newSize) || newSize <= 0 || newSize > 100) {
        status.innerText = "Please enter a valid queue size (1-100).";
        return;
    }
    circularQueue = new CircularQueue(newSize);
    status.innerText = `Queue initialized with a size of ${newSize}.`;
    updateQueueDisplay();
}

function handleEnqueue() {
    const enqueueInput = document.getElementById("enqueueValue");
    let data = enqueueInput.value.trim();
    enqueueInput.value = ""; // Clear input field

    if (!/^-?[1-9]\d*$/.test(data)) {
        status.innerText = "Please enter a valid integer.";
        return;
    }

    data = parseInt(data, 10);

    if (!circularQueue) {
        status.innerText = "Please set a valid queue limit first.";
        return;
    }
    const result = circularQueue.enqueue(data);
    status.innerText = result;
    updateQueueDisplay();
}

function handleDequeue() {
    const dequeueInput = document.getElementById("dequeueValue");
    let value = dequeueInput.value.trim();
    dequeueInput.value = ""; // Clear input field

    if (!/^-?[1-9]\d*$/.test(value)) {
        status.innerText = "Please enter a valid integer.";
        return;
    }

    value = parseInt(value, 10);

    if (!circularQueue) {
        status.innerText = "Please set a valid queue limit first.";
        return;
    }

    if (circularQueue.queue[circularQueue.front] !== value) {
        status.innerText = `You can only dequeue the front element. The front is ${circularQueue.queue[circularQueue.front]}, not ${value}.`;
        return;
    }

    const result = circularQueue.dequeue();
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

function calculatePositions(size, radius) {
    const positions = [];
    const centerX = radius + 30;
    const centerY = radius + 30;
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
    const radius = 120 + Math.min(circularQueue.getSize(), 100) * 5;
    queueContainer.style.width = `${2 * radius + 60}px`;
    queueContainer.style.height = `${2 * radius + 60}px`;
    const positions = calculatePositions(circularQueue.capacity, radius);
    let i = circularQueue.front;
    do {
        const slot = document.createElement("div");
        slot.className = "cqv-queue-slot";
        slot.style.left = `${positions[i].x}px`;
        slot.style.top = `${positions[i].y}px`;
        if (circularQueue.queue[i] !== null) {
            slot.classList.add("cqv-queue-slot-filled");
            slot.innerText = circularQueue.queue[i];
        }
        queueContainer.appendChild(slot);

        if (i === circularQueue.front) {
            addFrontLastIndicator(positions[i], "Front");
        }
        if (i === circularQueue.rear) {
            addFrontLastIndicator(positions[i], "Last");
        }
        i = (i + 1) % circularQueue.capacity;
    } while (i !== (circularQueue.rear + 1) % circularQueue.capacity);
}

function addFrontLastIndicator(position, label) {
    const indicator = document.createElement("div");
    indicator.className = "cqv-front-last-indicator";
    indicator.innerText = label;

    const offset = 50;
    const angle = Math.atan2(position.y - (queueContainer.clientHeight / 2), position.x - (queueContainer.clientWidth / 2));
    const x = position.x + offset * Math.cos(angle);
    const y = position.y + offset * Math.sin(angle);

    indicator.style.left = `${x}px`;
    indicator.style.top = `${y}px`;
    queueContainer.appendChild(indicator);
}

changeQueueSize();
