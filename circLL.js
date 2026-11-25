const ADDRESS_RE = /^[A-Za-z0-9_-]{1,20}$/;

function showCllMessage(message, type = 'info') {
    const banner = document.getElementById('cllMessage');
    if (banner) {
        if (!message) {
            banner.textContent = '';
            banner.hidden = true;
            return;
        }
        const isError = type === 'error';
        banner.className = `alert-banner alert-live alert-${type}`;
        banner.setAttribute('role', isError ? 'alert' : 'status');
        banner.setAttribute('aria-live', isError ? 'assertive' : 'polite');
        banner.textContent = message;
        banner.hidden = false;
    }
    if (message && window.DSA_UI && typeof window.DSA_UI.showToast === 'function') {
        window.DSA_UI.showToast(message, type);
    }
}

function parseStrictInt(raw, { min = -Infinity, max = Infinity, label = 'Value', disallowLeadingZeros = false } = {}) {
    const trimmed = raw === null || raw === undefined ? '' : String(raw).trim();
    if (trimmed === '') {
        return { ok: false, error: `Please enter a ${label.toLowerCase()}.` };
    }
    if (disallowLeadingZeros && /^0[0-9]+$/.test(trimmed)) {
        return { ok: false, error: `Invalid ${label.toLowerCase()}: leading zeros are not allowed.` };
    }
    if (!/^[+-]?\d+$/.test(trimmed)) {
        return { ok: false, error: `${label} must be a whole number.` };
    }
    const value = Number(trimmed);
    if (!Number.isSafeInteger(value)) {
        return { ok: false, error: `${label} is out of safe integer range.` };
    }
    if (value < min) {
        return { ok: false, error: `${label} must be at least ${min}.` };
    }
    if (value > max) {
        return { ok: false, error: `${label} must be at most ${max}.` };
    }
    return { ok: true, value };
}

function isValidAddress(addr) {
    return ADDRESS_RE.test(addr);
}

class Node {
    constructor(value) {
        this.value = value;
        this.address = null;
        this.next = null;
        this.prev = null;
    }
}

class LinkedList {
    constructor(maxSize) {
        this.head = null;
        this.maxSize = maxSize;
        this.size = 0;
        this.counter = 1;
    }

    append(value) {
        if (this.size >= this.maxSize) {
            showCllMessage('List is full! Maximum capacity reached.', 'error');
            return false;
        }

        const newNode = new Node(value);
        newNode.address = 'abc_' + String(this.counter).padStart(3, '0');
        this.counter++;

        if (!this.head) {
            this.head = newNode;
            newNode.next = newNode;
            newNode.prev = newNode;
        } else {
            const lastNode = this.head.prev;
            lastNode.next = newNode;
            newNode.prev = lastNode;
            newNode.next = this.head;
            this.head.prev = newNode;
        }

        this.size++;
        return true;
    }

    prepend(value) {
        if (this.size >= this.maxSize) {
            showCllMessage('List is full! Maximum capacity reached.', 'error');
            return false;
        }

        const newNode = new Node(value);
        newNode.address = 'abc_' + String(this.counter).padStart(3, '0');
        this.counter++;

        if (!this.head) {
            this.head = newNode;
            newNode.next = this.head;
            newNode.prev = this.head;
        } else {
            let lastNode = this.head;
            while (lastNode.next !== this.head) {
                lastNode = lastNode.next;
            }

            newNode.next = this.head;
            newNode.prev = lastNode;
            lastNode.next = newNode;
            this.head.prev = newNode;
            this.head = newNode;
        }

        this.size++;
        return true;
    }

    insertAt(value, index) {
        if (index < 0 || index > this.size) {
            showCllMessage(`Index ${index} is out of bounds. Valid index range is 0 to ${this.size}.`, 'error');
            return false;
        }

        if (this.size >= this.maxSize) {
            showCllMessage('List is full! Maximum capacity reached.', 'error');
            return false;
        }

        if (index === 0) {
            return this.prepend(value);
        }

        const newNode = new Node(value);
        newNode.address = 'abc_' + String(this.counter).padStart(3, '0');
        this.counter++;

        let current = this.head;
        for (let i = 0; i < index - 1; i++) {
            current = current.next;
        }

        if (current.next === this.head) {
            newNode.next = this.head;
            newNode.prev = current;
            current.next = newNode;
            this.head.prev = newNode;
        } else {
            newNode.next = current.next;
            current.next.prev = newNode;
            current.next = newNode;
            newNode.prev = current;
        }

        this.size++;
        return true;
    }

    deleteHead() {
        if (!this.head) return false;

        if (this.size === 1) {
            this.head = null;
        } else {
            let lastNode = this.head;
            while (lastNode.next !== this.head) {
                lastNode = lastNode.next;
            }

            this.head = this.head.next;
            this.head.prev = lastNode;
            lastNode.next = this.head;

            this.head.prevAddress = lastNode.address;
            this.head.nextAddress = this.head.next ? this.head.next.address : 'n/a';
            lastNode.nextAddress = this.head.address;
        }

        this.size--;
        return true;
    }

    deleteTail() {
        if (!this.head) return false;

        if (this.size === 1) {
            this.head = null;
        } else {
            let current = this.head;
            let previous = null;

            while (current.next !== this.head) {
                previous = current;
                current = current.next;
            }

            previous.next = this.head;
            this.head.prev = previous;

            previous.nextAddress = this.head.address;
            this.head.prevAddress = previous.address;
        }

        this.size--;
        return true;
    }

    deleteAt(index) {
        if (this.is_empty()) {
            showCllMessage('The list is empty. Nothing to delete.', 'error');
            return false;
        }

        if (index < 0 || index >= this.size) {
            showCllMessage(`Invalid index ${index}. Valid range is 0 to ${this.size - 1}.`, 'error');
            return false;
        }

        if (index === 0) {
            return this.deleteHead();
        }

        if (index === this.size - 1) {
            return this.deleteTail();
        }

        let current = this.head;
        let count = 0;
        while (count < index) {
            current = current.next;
            count++;
        }

        current.prev.next = current.next;
        current.next.prev = current.prev;
        this.size--;
        return true;
    }

    clear() {
        this.head = null;
        this.size = 0;
    }

    toArray() {
        const array = [];
        if (!this.head) {
            return array;
        }

        let current = this.head;
        do {
            array.push({
                value: current.value,
                address: current.address,
                prevAddress: this.size === 1 ? 'Null' : current.prev.address,
                nextAddress: this.size === 1 ? 'Null' : current.next.address
            });
            current = current.next;
        } while (current !== this.head);

        return array;
    }

    findNode(address) {
        if (!this.head) return null;

        let current = this.head;
        do {
            if (current.address === address) {
                return current;
            }
            current = current.next;
        } while (current !== this.head);

        return null;
    }

    find(address) {
        const node = this.findNode(address);
        return node ? node.value : null;
    }

    reverse() {
        if (this.size <= 1) return;

        let prev = null;
        let current = this.head;
        let next;
        const oldHead = this.head;

        do {
            next = current.next;
            current.next = prev;
            current.prev = next;
            prev = current;
            current = next;
        } while (current !== oldHead);

        this.head = prev;
        oldHead.next = this.head;
        this.head.prev = oldHead;
    }

    sort() {
        if (this.size <= 1) return;

        let current = this.head;
        const nodes = [];

        do {
            nodes.push(current);
            current = current.next;
        } while (current !== this.head);

        nodes.sort((a, b) => a.value - b.value);

        for (let i = 0; i < nodes.length; i++) {
            nodes[i].next = nodes[(i + 1) % nodes.length];
            nodes[i].prev = nodes[(i - 1 + nodes.length) % nodes.length];
        }

        this.head = nodes[0];
    }

    getSize() {
        return this.size;
    }

    headNode() {
        return this.head ? this.head.value : null;
    }

    tailNode() {
        if (!this.head) return null;
        let current = this.head;
        while (current.next !== this.head) {
            current = current.next;
        }
        return current.value;
    }

    is_empty() {
        return this.size === 0;
    }

    is_full() {
        return this.size >= this.maxSize;
    }

    updateValue(address, newValue) {
        const node = this.findNode(address);
        if (!node) return false;
        node.value = newValue;
        return true;
    }
}

let linkedList = null;

function requireListReady() {
    if (!linkedList) {
        showCllMessage('Please set the maximum list capacity first.', 'error');
        const maxInput = document.getElementById('maxSizeInput');
        if (maxInput) maxInput.focus();
        return false;
    }
    return true;
}

function updateVisualization() {
    const currentList = document.getElementById('currentList');
    if (!currentList) return;

    currentList.innerHTML = '';

    const nodes = linkedList ? linkedList.toArray() : [];
    if (nodes.length === 0) {
        const empty = document.createElement('span');
        empty.style.color = 'var(--text-muted)';
        empty.style.fontStyle = 'italic';
        empty.style.margin = 'auto';
        empty.textContent = 'List is empty';
        currentList.appendChild(empty);
        return;
    }

    nodes.forEach((node, index) => {
        const nodeElement = document.createElement('div');
        nodeElement.className = 'node';

        const valEl = document.createElement('div');
        valEl.className = 'node-value';
        valEl.textContent = String(node.value);

        const addrEl = document.createElement('div');
        addrEl.className = 'node-address';
        addrEl.textContent = `Address: ${node.address}`;

        const prevEl = document.createElement('div');
        prevEl.className = 'node-prev';
        prevEl.textContent = `Prev: ${node.prevAddress !== 'N/A' ? node.prevAddress : 'N/A'}`;

        const nextEl = document.createElement('div');
        nextEl.className = 'node-next';
        nextEl.textContent = `Next: ${node.nextAddress !== 'N/A' ? node.nextAddress : 'N/A'}`;

        nodeElement.append(valEl, addrEl, prevEl, nextEl);
        currentList.appendChild(nodeElement);

        if (index < nodes.length - 1) {
            const arrow = document.createElement('div');
            arrow.className = 'arrow';
            arrow.textContent = '↔';
            currentList.appendChild(arrow);
        }
    });

    if (nodes.length > 1) {
        const tailNode = currentList.lastElementChild;
        const headNode = currentList.firstElementChild;
        if (tailNode && headNode) {
            drawStraightLink(tailNode, headNode, currentList);
        }
    }
}

function drawStraightLink(tailNode, headNode, container) {
    const tailPosition = tailNode.getBoundingClientRect();
    const headPosition = headNode.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const tailX = tailPosition.left - containerRect.left + tailPosition.width / 2;
    const headX = headPosition.left - containerRect.left + headPosition.width / 2;

    const tailBottom = tailPosition.bottom - containerRect.top;
    const headBottom = headPosition.bottom - containerRect.top;
    const lineY = Math.max(tailBottom, headBottom) + 20;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', container.offsetWidth);
    svg.setAttribute('height', container.offsetHeight);
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.pointerEvents = 'none';
    svg.setAttribute('viewBox', `0 0 ${container.offsetWidth} ${container.offsetHeight}`);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const arrowGap = 8;
    const d = `
        M ${tailX},${tailBottom}
        L ${tailX},${lineY}
        L ${headX},${lineY}
        L ${headX},${headBottom + arrowGap}
    `;

    path.setAttribute('d', d);
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arrowhead)');

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '4');
    marker.setAttribute('refX', '3');
    marker.setAttribute('refY', '4');
    marker.setAttribute('orient', '0');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 4, 3 0, 6 4');
    polygon.setAttribute('fill', 'currentColor');

    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);
    svg.appendChild(path);
    container.appendChild(svg);
}

function clearInputs() {
    ['valueInput', 'indexInput', 'nodeAddress', 'newAddressInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

function addOperationLog(operation) {
    const logContainer = document.getElementById('operationsLog');
    if (!logContainer) return;
    if (logContainer.textContent.trim() === 'No operations yet.') {
        logContainer.innerHTML = '';
    }
    const logEntry = document.createElement('div');
    logEntry.classList.add('log-entry');
    logEntry.textContent = operation;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function setControlsDisabled(disabled) {
    const buttons = document.querySelectorAll('#cllOpsModify button, #cllOpsQuery button');
    buttons.forEach(button => {
        button.disabled = disabled;
    });
    ['valueInput', 'indexInput', 'nodeAddress', 'newAddressInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
    });
}

function disableAllInputs() {
    setControlsDisabled(true);
    const reminder = document.getElementById('sizeReminder');
    if (reminder) reminder.hidden = false;
}

function enableOperations() {
    setControlsDisabled(false);
    const reminder = document.getElementById('sizeReminder');
    if (reminder) reminder.hidden = true;
}

function setMaxSize() {
    const maxSizeInput = document.getElementById('maxSizeInput');
    const parsed = parseStrictInt(maxSizeInput ? maxSizeInput.value : '', {
        min: 1,
        label: 'Maximum size',
        disallowLeadingZeros: true
    });

    if (!parsed.ok) {
        showCllMessage(parsed.error, 'error');
        if (maxSizeInput) maxSizeInput.focus();
        return;
    }

    linkedList = new LinkedList(parsed.value);
    enableOperations();
    if (maxSizeInput) maxSizeInput.disabled = true;
    const setBtn = document.getElementById('setMaxSizeButton');
    if (setBtn) setBtn.disabled = true;
    showCllMessage(`Maximum size set to ${parsed.value}.`, 'success');
    addOperationLog(`Set maximum size to ${parsed.value}`);
    updateVisualization();
}

function append() {
    if (!requireListReady()) return;
    const valueInput = document.getElementById('valueInput');
    const parsed = parseStrictInt(valueInput ? valueInput.value : '', { min: 1, label: 'Value' });
    if (!parsed.ok) {
        showCllMessage(parsed.error, 'error');
        if (valueInput) valueInput.focus();
        return;
    }
    if (linkedList.append(parsed.value)) {
        updateVisualization();
        showCllMessage(`Appended value ${parsed.value}.`, 'success');
        addOperationLog(`Appended value: ${parsed.value}`);
        clearInputs();
    }
}

function prepend() {
    if (!requireListReady()) return;
    const valueInput = document.getElementById('valueInput');
    const parsed = parseStrictInt(valueInput ? valueInput.value : '', { min: 1, label: 'Value' });
    if (!parsed.ok) {
        showCllMessage(parsed.error, 'error');
        if (valueInput) valueInput.focus();
        return;
    }
    if (linkedList.prepend(parsed.value)) {
        updateVisualization();
        showCllMessage(`Prepended value ${parsed.value}.`, 'success');
        addOperationLog(`Prepended value: ${parsed.value}`);
        clearInputs();
    }
}

function insertAtIndex() {
    if (!requireListReady()) return;
    const valueInput = document.getElementById('valueInput');
    const indexInput = document.getElementById('indexInput');

    const parsedVal = parseStrictInt(valueInput ? valueInput.value : '', { min: 1, label: 'Value' });
    if (!parsedVal.ok) {
        showCllMessage(parsedVal.error, 'error');
        if (valueInput) valueInput.focus();
        return;
    }

    const parsedIdx = parseStrictInt(indexInput ? indexInput.value : '', { min: 0, label: 'Index' });
    if (!parsedIdx.ok) {
        showCllMessage(parsedIdx.error, 'error');
        if (indexInput) indexInput.focus();
        return;
    }

    if (linkedList.insertAt(parsedVal.value, parsedIdx.value)) {
        updateVisualization();
        showCllMessage(`Inserted value ${parsedVal.value} at index ${parsedIdx.value}.`, 'success');
        addOperationLog(`Inserted value ${parsedVal.value} at index ${parsedIdx.value}`);
        clearInputs();
    }
}

function deleteHead() {
    if (!requireListReady()) return;
    if (linkedList.deleteHead()) {
        updateVisualization();
        showCllMessage('Deleted head node.', 'success');
        addOperationLog('Deleted head node');
    } else {
        showCllMessage('Cannot delete head: the list is empty.', 'error');
        addOperationLog('Failed to delete head (list is empty)');
    }
}

function deleteTail() {
    if (!requireListReady()) return;
    if (linkedList.deleteTail()) {
        updateVisualization();
        showCllMessage('Deleted tail node.', 'success');
        addOperationLog('Deleted tail node');
    } else {
        showCllMessage('Cannot delete tail: the list is empty.', 'error');
        addOperationLog('Failed to delete tail (list is empty)');
    }
}

function deleteByIndex() {
    if (!requireListReady()) return;
    const indexInput = document.getElementById('indexInput');
    const parsedIdx = parseStrictInt(indexInput ? indexInput.value : '', { min: 0, label: 'Index' });
    if (!parsedIdx.ok) {
        showCllMessage(parsedIdx.error, 'error');
        if (indexInput) indexInput.focus();
        return;
    }
    if (linkedList.deleteAt(parsedIdx.value)) {
        updateVisualization();
        showCllMessage(`Deleted node at index ${parsedIdx.value}.`, 'success');
        addOperationLog(`Deleted node at index ${parsedIdx.value}`);
        clearInputs();
    }
}

function clearList() {
    if (!requireListReady()) return;
    linkedList.clear();
    linkedList = null;
    updateVisualization();
    clearInputs();

    const maxSizeInput = document.getElementById('maxSizeInput');
    if (maxSizeInput) {
        maxSizeInput.value = '';
        maxSizeInput.disabled = false;
    }
    const setBtn = document.getElementById('setMaxSizeButton');
    if (setBtn) setBtn.disabled = false;

    disableAllInputs();
    showCllMessage('Cleared the list and reset maximum size.', 'info');
    addOperationLog('Cleared the list and reset max size');
}

function size() {
    if (!requireListReady()) return;
    const currentSize = linkedList.getSize();
    showCllMessage(`Current list size: ${currentSize} / ${linkedList.maxSize}`, 'info');
    addOperationLog(`Current list size: ${currentSize}`);
}

function reverseList() {
    if (!requireListReady()) return;
    if (linkedList.is_empty()) {
        showCllMessage('The list is empty. Nothing to reverse.', 'info');
        addOperationLog('The list is empty. Nothing to reverse.');
        return;
    }
    linkedList.reverse();
    updateVisualization();
    showCllMessage('Reversed the circular linked list.', 'success');
    addOperationLog('Reversed the list');
}

function find() {
    if (!requireListReady()) return;
    const addressInput = document.getElementById('nodeAddress');
    const address = addressInput ? addressInput.value.trim() : '';
    if (!address) {
        showCllMessage('Enter a target address in the Target Address field to find.', 'error');
        if (addressInput) addressInput.focus();
        return;
    }

    const result = linkedList.find(address);
    if (result !== null) {
        showCllMessage(`Found node at address ${address}: value = ${result}.`, 'success');
        addOperationLog(`Found node with address ${address}. Value: ${result}`);
    } else {
        showCllMessage(`Address ${address} not found in the list.`, 'error');
        addOperationLog(`Address ${address} not found in the list`);
    }
}

function showHead() {
    if (!requireListReady()) return;
    const head = linkedList.headNode();
    if (head !== null) {
        showCllMessage(`Head node value: ${head}`, 'info');
        addOperationLog(`Head node value: ${head}`);
    } else {
        showCllMessage('List is empty.', 'info');
        addOperationLog('List is empty');
    }
}

function showTail() {
    if (!requireListReady()) return;
    const tail = linkedList.tailNode();
    if (tail !== null) {
        showCllMessage(`Tail node value: ${tail}`, 'info');
        addOperationLog(`Tail node value: ${tail}`);
    } else {
        showCllMessage('List is empty.', 'info');
        addOperationLog('List is empty');
    }
}

function checkIfEmpty() {
    if (!requireListReady()) return;
    const empty = linkedList.is_empty();
    showCllMessage(`Is the list empty? ${empty ? 'True' : 'False'}`, 'info');
    addOperationLog(`Is the list empty? ${empty}`);
}

function checkIfFull() {
    if (!requireListReady()) return;
    const full = linkedList.is_full();
    showCllMessage(`Is the list full? ${full ? 'True' : 'False'}`, 'info');
    addOperationLog(`Is the list full? ${full}`);
}

function sortList() {
    if (!requireListReady()) return;
    if (linkedList.is_empty()) {
        showCllMessage('The list is empty. Nothing to sort.', 'info');
        addOperationLog('The list is empty. Nothing to sort.');
        return;
    }
    linkedList.sort();
    updateVisualization();
    showCllMessage('Sorted the circular linked list in ascending order.', 'success');
    addOperationLog('Sorted the list');
}

function update() {
    if (!requireListReady()) return;
    if (linkedList.is_empty()) {
        showCllMessage('The list is empty. Nothing to update.', 'error');
        return;
    }

    const addressInput = document.getElementById('nodeAddress');
    const valueInput = document.getElementById('valueInput');
    const address = addressInput ? addressInput.value.trim() : '';

    if (!address) {
        showCllMessage('Enter the target address in the Target Address field to update.', 'error');
        if (addressInput) addressInput.focus();
        return;
    }

    const parsedVal = parseStrictInt(valueInput ? valueInput.value : '', { min: 1, label: 'New value' });
    if (!parsedVal.ok) {
        showCllMessage(parsedVal.error, 'error');
        if (valueInput) valueInput.focus();
        return;
    }

    if (linkedList.updateValue(address, parsedVal.value)) {
        updateVisualization();
        showCllMessage(`Updated node at address ${address} to value ${parsedVal.value}.`, 'success');
        addOperationLog(`Updated node at address ${address} to value ${parsedVal.value}`);
        clearInputs();
    } else {
        showCllMessage(`Address ${address} not found in the list.`, 'error');
        addOperationLog(`Failed to update node at address ${address}`);
        if (addressInput) addressInput.focus();
    }
}

function replace() {
    if (!requireListReady()) return;
    if (linkedList.is_empty()) {
        showCllMessage('The list is empty. Nothing to replace.', 'error');
        addOperationLog('Attempted to replace a node, but the list is empty.');
        return;
    }

    const addressInput = document.getElementById('nodeAddress');
    const newAddressInput = document.getElementById('newAddressInput');
    const valueInput = document.getElementById('valueInput');

    const address = addressInput ? addressInput.value.trim() : '';
    const newAddress = newAddressInput ? newAddressInput.value.trim() : '';

    if (!address) {
        showCllMessage('Enter the target address to replace in the Target Address field.', 'error');
        if (addressInput) addressInput.focus();
        return;
    }

    const targetNode = linkedList.findNode(address);
    if (!targetNode) {
        showCllMessage(`Node with address ${address} not found.`, 'error');
        addOperationLog(`Failed to replace node with address ${address}. Node not found.`);
        if (addressInput) addressInput.focus();
        return;
    }

    if (!newAddress) {
        showCllMessage('Enter a replacement address in the New Address field.', 'error');
        if (newAddressInput) newAddressInput.focus();
        return;
    }

    if (!isValidAddress(newAddress)) {
        showCllMessage('New address must be 1–20 letters, digits, underscores, or hyphens.', 'error');
        if (newAddressInput) newAddressInput.focus();
        return;
    }

    if (newAddress !== address && linkedList.findNode(newAddress) !== null) {
        showCllMessage(`Address ${newAddress} already exists in the list.`, 'error');
        if (newAddressInput) newAddressInput.focus();
        return;
    }

    const parsedVal = parseStrictInt(valueInput ? valueInput.value : '', { min: 1, label: 'New value' });
    if (!parsedVal.ok) {
        showCllMessage(parsedVal.error, 'error');
        if (valueInput) valueInput.focus();
        return;
    }

    targetNode.address = newAddress;
    targetNode.value = parsedVal.value;

    updateVisualization();
    showCllMessage(`Replaced ${address} with address ${newAddress} and value ${parsedVal.value}.`, 'success');
    addOperationLog(`Node at address ${address} replaced with new address ${newAddress} and new value ${parsedVal.value}`);
    clearInputs();
}

document.addEventListener('DOMContentLoaded', () => {
    disableAllInputs();
});
