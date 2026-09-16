/**
 * ============================================================================
 * Comprehensive DSA & Regression Test Suite
 * Data Structures & Algorithms Visualization Project (Phases 1 - 6)
 * ============================================================================
 * Run: node test_regression.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

function suite(name, fn) {
  console.log(`\n======================================================`);
  console.log(` SUITE: ${name}`);
  console.log(`======================================================`);
  fn();
}

// ----------------------------------------------------------------------------
// 1. STACK REGRESSION SUITE
// ----------------------------------------------------------------------------
suite('1. Stack (LIFO) Model & Invariants', () => {
  class Stack {
    constructor(maxSize = 8) {
      this.items = [];
      this.maxSize = maxSize;
    }
    push(item) {
      if (this.isFull()) return { success: false, error: 'Stack Overflow' };
      this.items.push(item);
      return { success: true, item };
    }
    pop() {
      if (this.isEmpty()) return { success: false, error: 'Stack Underflow' };
      return { success: true, item: this.items.pop() };
    }
    peek() {
      if (this.isEmpty()) return null;
      return this.items[this.items.length - 1];
    }
    isEmpty() { return this.items.length === 0; }
    isFull() { return this.items.length >= this.maxSize; }
    size() { return this.items.length; }
    clear() { this.items = []; }
  }

  test('Stack initial state is empty with size 0', () => {
    const s = new Stack(6);
    assert.strictEqual(s.isEmpty(), true);
    assert.strictEqual(s.isFull(), false);
    assert.strictEqual(s.size(), 0);
    assert.strictEqual(s.peek(), null);
  });

  test('Stack push & pop adheres strictly to LIFO ordering', () => {
    const s = new Stack(5);
    s.push(10);
    s.push(20);
    s.push(30);
    assert.strictEqual(s.size(), 3);
    assert.strictEqual(s.peek(), 30);
    assert.strictEqual(s.pop().item, 30);
    assert.strictEqual(s.peek(), 20);
    assert.strictEqual(s.pop().item, 20);
    assert.strictEqual(s.pop().item, 10);
    assert.strictEqual(s.isEmpty(), true);
  });

  test('Stack overflow guard prevents pushing beyond capacity', () => {
    const s = new Stack(3);
    assert.strictEqual(s.push(1).success, true);
    assert.strictEqual(s.push(2).success, true);
    assert.strictEqual(s.push(3).success, true);
    assert.strictEqual(s.isFull(), true);
    const overflowRes = s.push(4);
    assert.strictEqual(overflowRes.success, false);
    assert.strictEqual(overflowRes.error, 'Stack Overflow');
    assert.strictEqual(s.size(), 3);
  });

  test('Stack underflow guard prevents popping empty stack', () => {
    const s = new Stack(3);
    const underflowRes = s.pop();
    assert.strictEqual(underflowRes.success, false);
    assert.strictEqual(underflowRes.error, 'Stack Underflow');
    assert.strictEqual(s.peek(), null);
  });

  test('Stack clear operation empties all items', () => {
    const s = new Stack(5);
    s.push(10);
    s.push(20);
    s.clear();
    assert.strictEqual(s.isEmpty(), true);
    assert.strictEqual(s.size(), 0);
    assert.strictEqual(s.peek(), null);
  });
});

// ----------------------------------------------------------------------------
// 2. REGULAR QUEUE REGRESSION SUITE
// ----------------------------------------------------------------------------
suite('2. Regular Queue (FIFO) Model & Invariants', () => {
  class Queue {
    constructor(maxSize = 8) {
      this.items = [];
      this.maxSize = maxSize;
    }
    enqueue(item) {
      if (this.isFull()) return { success: false, error: 'Queue Overflow' };
      this.items.push(item);
      return { success: true, item };
    }
    dequeue() {
      if (this.isEmpty()) return { success: false, error: 'Queue Underflow' };
      return { success: true, item: this.items.shift() };
    }
    peek() { return this.isEmpty() ? null : this.items[0]; }
    rear() { return this.isEmpty() ? null : this.items[this.items.length - 1]; }
    isEmpty() { return this.items.length === 0; }
    isFull() { return this.items.length >= this.maxSize; }
    size() { return this.items.length; }
    clear() { this.items = []; }
  }

  test('Queue adheres strictly to FIFO ordering', () => {
    const q = new Queue(5);
    q.enqueue('First');
    q.enqueue('Second');
    q.enqueue('Third');
    assert.strictEqual(q.peek(), 'First');
    assert.strictEqual(q.rear(), 'Third');
    assert.strictEqual(q.dequeue().item, 'First');
    assert.strictEqual(q.peek(), 'Second');
    assert.strictEqual(q.dequeue().item, 'Second');
    assert.strictEqual(q.dequeue().item, 'Third');
    assert.strictEqual(q.isEmpty(), true);
  });

  test('Queue overflow & underflow boundaries', () => {
    const q = new Queue(2);
    assert.strictEqual(q.enqueue('A').success, true);
    assert.strictEqual(q.enqueue('B').success, true);
    assert.strictEqual(q.isFull(), true);
    assert.strictEqual(q.enqueue('C').success, false);
    assert.strictEqual(q.dequeue().item, 'A');
    assert.strictEqual(q.dequeue().item, 'B');
    assert.strictEqual(q.dequeue().success, false);
  });
});

// ----------------------------------------------------------------------------
// 3. CIRCULAR QUEUE REGRESSION SUITE
// ----------------------------------------------------------------------------
suite('3. Circular Queue Modulo & Wrap-Around Logic', () => {
  class CircularQueue {
    constructor(capacity = 5) {
      this.capacity = capacity;
      this.items = new Array(capacity).fill(null);
      this.front = -1;
      this.rear = -1;
      this.count = 0;
    }
    enqueue(value) {
      if (this.isFull()) return { success: false, error: 'Queue is full' };
      if (this.isEmpty()) {
        this.front = 0;
        this.rear = 0;
      } else {
        this.rear = (this.rear + 1) % this.capacity;
      }
      this.items[this.rear] = value;
      this.count++;
      return { success: true, front: this.front, rear: this.rear };
    }
    dequeue() {
      if (this.isEmpty()) return { success: false, error: 'Queue is empty' };
      const val = this.items[this.front];
      this.items[this.front] = null;
      this.count--;
      if (this.front === this.rear) {
        this.front = -1;
        this.rear = -1;
      } else {
        this.front = (this.front + 1) % this.capacity;
      }
      return { success: true, value: val, front: this.front, rear: this.rear };
    }
    isEmpty() { return this.count === 0; }
    isFull() { return this.count === this.capacity; }
  }

  test('Circular Queue multi-cycle wrap-around enqueue & dequeue', () => {
    const cq = new CircularQueue(4);
    // Fill queue
    cq.enqueue(1);
    cq.enqueue(2);
    cq.enqueue(3);
    cq.enqueue(4);
    assert.strictEqual(cq.isFull(), true);
    assert.strictEqual(cq.front, 0);
    assert.strictEqual(cq.rear, 3);

    // Dequeue 3 items
    assert.strictEqual(cq.dequeue().value, 1);
    assert.strictEqual(cq.dequeue().value, 2);
    assert.strictEqual(cq.dequeue().value, 3);
    assert.strictEqual(cq.front, 3);
    assert.strictEqual(cq.rear, 3);
    assert.strictEqual(cq.count, 1);

    // Enqueue 3 new items (wrap around to 0, 1, 2)
    cq.enqueue(5); // rear = 0
    cq.enqueue(6); // rear = 1
    cq.enqueue(7); // rear = 2
    assert.strictEqual(cq.isFull(), true);
    assert.strictEqual(cq.front, 3);
    assert.strictEqual(cq.rear, 2);

    // Dequeue in expected cyclic sequence
    assert.strictEqual(cq.dequeue().value, 4); // slot 3
    assert.strictEqual(cq.dequeue().value, 5); // slot 0
    assert.strictEqual(cq.dequeue().value, 6); // slot 1
    assert.strictEqual(cq.dequeue().value, 7); // slot 2
    assert.strictEqual(cq.isEmpty(), true);
  });
});

// ----------------------------------------------------------------------------
// 4. PRIORITY QUEUE REGRESSION SUITE
// ----------------------------------------------------------------------------
suite('4. Priority Queue Precedence & Order', () => {
  class PriorityQueue {
    constructor(maxSize = 8) {
      this.items = [];
      this.maxSize = maxSize;
    }
    enqueue(value, priority = 3) {
      if (this.isFull()) return { success: false, error: 'Queue is full' };
      const p = parseInt(priority, 10);
      const elem = { value, priority: isNaN(p) ? 3 : Math.max(1, Math.min(5, p)) };
      let added = false;
      for (let i = 0; i < this.items.length; i++) {
        if (elem.priority > this.items[i].priority) {
          this.items.splice(i, 0, elem);
          added = true;
          break;
        }
      }
      if (!added) this.items.push(elem);
      return { success: true, item: elem };
    }
    dequeue() {
      if (this.isEmpty()) return { success: false, error: 'Queue is empty' };
      return { success: true, item: this.items.shift() };
    }
    peek() { return this.isEmpty() ? null : this.items[0]; }
    isEmpty() { return this.items.length === 0; }
    isFull() { return this.items.length >= this.maxSize; }
  }

  test('Higher numeric priority elements are dequeued first', () => {
    const pq = new PriorityQueue(10);
    pq.enqueue('Normal Task', 2);
    pq.enqueue('Urgent Task', 5);
    pq.enqueue('Low Task', 1);
    pq.enqueue('High Task', 4);

    assert.strictEqual(pq.peek().value, 'Urgent Task');
    assert.strictEqual(pq.dequeue().item.value, 'Urgent Task');
    assert.strictEqual(pq.dequeue().item.value, 'High Task');
    assert.strictEqual(pq.dequeue().item.value, 'Normal Task');
    assert.strictEqual(pq.dequeue().item.value, 'Low Task');
    assert.strictEqual(pq.isEmpty(), true);
  });

  test('Priority clamping strictly bounds priority to 1-5', () => {
    const pq = new PriorityQueue(5);
    pq.enqueue('Max Clamp', 999);
    pq.enqueue('Min Clamp', -50);
    assert.strictEqual(pq.items[0].priority, 5);
    assert.strictEqual(pq.items[1].priority, 1);
  });
});

// ----------------------------------------------------------------------------
// 5. SINGLY LINKED LIST REGRESSION SUITE
// ----------------------------------------------------------------------------
suite('5. Singly Linked List Operations & Invariants', () => {
  class SNode {
    constructor(val) {
      this.value = val;
      this.next = null;
    }
  }

  class SinglyLinkedList {
    constructor() {
      this.head = null;
      this.tail = null;
      this.length = 0;
    }
    append(val) {
      const node = new SNode(val);
      if (!this.head) {
        this.head = node;
        this.tail = node;
      } else {
        this.tail.next = node;
        this.tail = node;
      }
      this.length++;
    }
    prepend(val) {
      const node = new SNode(val);
      if (!this.head) {
        this.head = node;
        this.tail = node;
      } else {
        node.next = this.head;
        this.head = node;
      }
      this.length++;
    }
    insertAt(index, val) {
      if (index < 0 || index > this.length) return false;
      if (index === 0) { this.prepend(val); return true; }
      if (index === this.length) { this.append(val); return true; }
      const node = new SNode(val);
      let curr = this.head;
      for (let i = 0; i < index - 1; i++) curr = curr.next;
      node.next = curr.next;
      curr.next = node;
      this.length++;
      return true;
    }
    deleteHead() {
      if (!this.head) return null;
      const val = this.head.value;
      this.head = this.head.next;
      this.length--;
      if (this.length === 0) this.tail = null;
      return val;
    }
    deleteTail() {
      if (!this.head) return null;
      if (this.length === 1) return this.deleteHead();
      let curr = this.head;
      while (curr.next !== this.tail) curr = curr.next;
      const val = this.tail.value;
      curr.next = null;
      this.tail = curr;
      this.length--;
      return val;
    }
    deleteAt(index) {
      if (index < 0 || index >= this.length) return null;
      if (index === 0) return this.deleteHead();
      if (index === this.length - 1) return this.deleteTail();
      let curr = this.head;
      for (let i = 0; i < index - 1; i++) curr = curr.next;
      const val = curr.next.value;
      curr.next = curr.next.next;
      this.length--;
      return val;
    }
    reverse() {
      let prev = null;
      let curr = this.head;
      this.tail = this.head;
      while (curr) {
        const next = curr.next;
        curr.next = prev;
        prev = curr;
        curr = next;
      }
      this.head = prev;
    }
    sort() {
      const arr = this.toArray().sort((a, b) => a - b);
      this.head = null;
      this.tail = null;
      this.length = 0;
      arr.forEach(v => this.append(v));
    }
    toArray() {
      const arr = [];
      let curr = this.head;
      while (curr) {
        arr.push(curr.value);
        curr = curr.next;
      }
      return arr;
    }
  }

  test('SLL Prepend, Append, and InsertAt arbitrary index', () => {
    const sll = new SinglyLinkedList();
    sll.append(20);
    sll.prepend(10);
    sll.append(40);
    sll.insertAt(2, 30);
    assert.deepStrictEqual(sll.toArray(), [10, 20, 30, 40]);
    assert.strictEqual(sll.head.value, 10);
    assert.strictEqual(sll.tail.value, 40);
    assert.strictEqual(sll.length, 4);
  });

  test('SLL Deletion from Head, Tail, and Middle index', () => {
    const sll = new SinglyLinkedList();
    [10, 20, 30, 40, 50].forEach(v => sll.append(v));
    assert.strictEqual(sll.deleteHead(), 10);
    assert.strictEqual(sll.deleteTail(), 50);
    assert.strictEqual(sll.deleteAt(1), 30);
    assert.deepStrictEqual(sll.toArray(), [20, 40]);
    assert.strictEqual(sll.head.value, 20);
    assert.strictEqual(sll.tail.value, 40);
  });

  test('SLL Reversal inverts pointer order correctly', () => {
    const sll = new SinglyLinkedList();
    [1, 2, 3, 4, 5].forEach(v => sll.append(v));
    sll.reverse();
    assert.deepStrictEqual(sll.toArray(), [5, 4, 3, 2, 1]);
    assert.strictEqual(sll.head.value, 5);
    assert.strictEqual(sll.tail.value, 1);
  });

  test('SLL Sort arranges values in ascending order', () => {
    const sll = new SinglyLinkedList();
    [45, 12, 89, 3, 23].forEach(v => sll.append(v));
    sll.sort();
    assert.deepStrictEqual(sll.toArray(), [3, 12, 23, 45, 89]);
  });
});

// ----------------------------------------------------------------------------
// 6. DOUBLY LINKED LIST REGRESSION SUITE
// ----------------------------------------------------------------------------
suite('6. Doubly Linked List Bidirectional Invariants', () => {
  class DNode {
    constructor(val) {
      this.value = val;
      this.prev = null;
      this.next = null;
    }
  }

  class DoublyLinkedList {
    constructor() {
      this.head = null;
      this.tail = null;
      this.length = 0;
    }
    append(val) {
      const node = new DNode(val);
      if (!this.head) {
        this.head = node;
        this.tail = node;
      } else {
        node.prev = this.tail;
        this.tail.next = node;
        this.tail = node;
      }
      this.length++;
    }
    prepend(val) {
      const node = new DNode(val);
      if (!this.head) {
        this.head = node;
        this.tail = node;
      } else {
        node.next = this.head;
        this.head.prev = node;
        this.head = node;
      }
      this.length++;
    }
    deleteHead() {
      if (!this.head) return null;
      const val = this.head.value;
      if (this.head === this.tail) {
        this.head = null;
        this.tail = null;
      } else {
        this.head = this.head.next;
        this.head.prev = null;
      }
      this.length--;
      return val;
    }
    deleteTail() {
      if (!this.tail) return null;
      const val = this.tail.value;
      if (this.head === this.tail) {
        this.head = null;
        this.tail = null;
      } else {
        this.tail = this.tail.prev;
        this.tail.next = null;
      }
      this.length--;
      return val;
    }
    verifyBidirectionalPointers() {
      let curr = this.head;
      let count = 0;
      while (curr) {
        count++;
        if (curr.next && curr.next.prev !== curr) return false;
        if (curr.prev && curr.prev.next !== curr) return false;
        curr = curr.next;
      }
      return count === this.length;
    }
  }

  test('DLL Maintains strict prev & next reciprocity through operations', () => {
    const dll = new DoublyLinkedList();
    dll.append(100);
    dll.append(200);
    dll.prepend(50);
    dll.append(300);
    assert.strictEqual(dll.verifyBidirectionalPointers(), true);
    assert.strictEqual(dll.deleteHead(), 50);
    assert.strictEqual(dll.verifyBidirectionalPointers(), true);
    assert.strictEqual(dll.deleteTail(), 300);
    assert.strictEqual(dll.verifyBidirectionalPointers(), true);
    assert.strictEqual(dll.head.value, 100);
    assert.strictEqual(dll.tail.value, 200);
  });
});

// ----------------------------------------------------------------------------
// 7. CIRCULAR LINKED LIST REGRESSION SUITE
// ----------------------------------------------------------------------------
suite('7. Circular Linked List Loopback & Cycle Invariants', () => {
  class CNode {
    constructor(val) {
      this.value = val;
      this.next = null;
    }
  }

  class CircularLinkedList {
    constructor() {
      this.head = null;
      this.tail = null;
      this.length = 0;
    }
    append(val) {
      const node = new CNode(val);
      if (!this.head) {
        this.head = node;
        this.tail = node;
        node.next = this.head;
      } else {
        this.tail.next = node;
        this.tail = node;
        this.tail.next = this.head;
      }
      this.length++;
    }
    prepend(val) {
      const node = new CNode(val);
      if (!this.head) {
        this.head = node;
        this.tail = node;
        node.next = this.head;
      } else {
        node.next = this.head;
        this.head = node;
        this.tail.next = this.head;
      }
      this.length++;
    }
    deleteHead() {
      if (!this.head) return null;
      const val = this.head.value;
      if (this.head === this.tail) {
        this.head = null;
        this.tail = null;
      } else {
        this.head = this.head.next;
        this.tail.next = this.head;
      }
      this.length--;
      return val;
    }
    verifyCycle() {
      if (!this.head) return this.length === 0 && !this.tail;
      return this.tail.next === this.head;
    }
  }

  test('CLL maintains tail.next === head cycle at all times', () => {
    const cll = new CircularLinkedList();
    cll.append(10);
    cll.append(20);
    cll.prepend(5);
    assert.strictEqual(cll.verifyCycle(), true);
    assert.strictEqual(cll.tail.next.value, 5);
    assert.strictEqual(cll.deleteHead(), 5);
    assert.strictEqual(cll.verifyCycle(), true);
    assert.strictEqual(cll.head.value, 10);
    assert.strictEqual(cll.tail.next.value, 10);
  });
});

// ----------------------------------------------------------------------------
// 8. AVL TREE SELF-BALANCING & ROTATIONS SUITE
// ----------------------------------------------------------------------------
suite('8. AVL Tree Self-Balancing & Rotations', () => {
  class AVLNode {
    constructor(val) {
      this.value = val;
      this.left = null;
      this.right = null;
      this.height = 1;
    }
  }

  class AVLTree {
    constructor() {
      this.root = null;
      this.rotations = [];
    }
    getHeight(n) { return n ? n.height : 0; }
    getBalanceFactor(n) { return n ? this.getHeight(n.left) - this.getHeight(n.right) : 0; }
    updateHeight(n) {
      if (n) n.height = 1 + Math.max(this.getHeight(n.left), this.getHeight(n.right));
    }
    rotateRight(y) {
      const x = y.left;
      const T2 = x.right;
      x.right = y;
      y.left = T2;
      this.updateHeight(y);
      this.updateHeight(x);
      return x;
    }
    rotateLeft(x) {
      const y = x.right;
      const T2 = y.left;
      y.left = x;
      x.right = T2;
      this.updateHeight(x);
      this.updateHeight(y);
      return y;
    }
    insert(val) {
      this.root = this._insert(this.root, val);
    }
    _insert(node, val) {
      if (!node) return new AVLNode(val);
      if (val < node.value) node.left = this._insert(node.left, val);
      else if (val > node.value) node.right = this._insert(node.right, val);
      else return node; // No duplicates

      this.updateHeight(node);
      const bf = this.getBalanceFactor(node);

      // LL Case -> Right Rotation
      if (bf > 1 && val < node.left.value) {
        this.rotations.push('LL');
        return this.rotateRight(node);
      }
      // RR Case -> Left Rotation
      if (bf < -1 && val > node.right.value) {
        this.rotations.push('RR');
        return this.rotateLeft(node);
      }
      // LR Case -> Left-Right Rotation
      if (bf > 1 && val > node.left.value) {
        this.rotations.push('LR');
        node.left = this.rotateLeft(node.left);
        return this.rotateRight(node);
      }
      // RL Case -> Right-Left Rotation
      if (bf < -1 && val < node.right.value) {
        this.rotations.push('RL');
        node.right = this.rotateRight(node.right);
        return this.rotateLeft(node);
      }
      return node;
    }
    inOrder(node = this.root, res = []) {
      if (node) {
        this.inOrder(node.left, res);
        res.push(node.value);
        this.inOrder(node.right, res);
      }
      return res;
    }
    isBalanced(node = this.root) {
      if (!node) return true;
      const bf = this.getBalanceFactor(node);
      if (Math.abs(bf) > 1) return false;
      return this.isBalanced(node.left) && this.isBalanced(node.right);
    }
  }

  test('AVL: LL Rotation (Right Rotation) on [30, 20, 10]', () => {
    const tree = new AVLTree();
    tree.insert(30);
    tree.insert(20);
    tree.insert(10);
    assert.strictEqual(tree.root.value, 20);
    assert.strictEqual(tree.root.left.value, 10);
    assert.strictEqual(tree.root.right.value, 30);
    assert.strictEqual(tree.isBalanced(), true);
    assert.strictEqual(tree.rotations.includes('LL'), true);
  });

  test('AVL: RR Rotation (Left Rotation) on [10, 20, 30]', () => {
    const tree = new AVLTree();
    tree.insert(10);
    tree.insert(20);
    tree.insert(30);
    assert.strictEqual(tree.root.value, 20);
    assert.strictEqual(tree.root.left.value, 10);
    assert.strictEqual(tree.root.right.value, 30);
    assert.strictEqual(tree.isBalanced(), true);
    assert.strictEqual(tree.rotations.includes('RR'), true);
  });

  test('AVL: LR Double Rotation on [30, 10, 20]', () => {
    const tree = new AVLTree();
    tree.insert(30);
    tree.insert(10);
    tree.insert(20);
    assert.strictEqual(tree.root.value, 20);
    assert.strictEqual(tree.root.left.value, 10);
    assert.strictEqual(tree.root.right.value, 30);
    assert.strictEqual(tree.isBalanced(), true);
    assert.strictEqual(tree.rotations.includes('LR'), true);
  });

  test('AVL: RL Double Rotation on [10, 30, 20]', () => {
    const tree = new AVLTree();
    tree.insert(10);
    tree.insert(30);
    tree.insert(20);
    assert.strictEqual(tree.root.value, 20);
    assert.strictEqual(tree.root.left.value, 10);
    assert.strictEqual(tree.root.right.value, 30);
    assert.strictEqual(tree.isBalanced(), true);
    assert.strictEqual(tree.rotations.includes('RL'), true);
  });

  test('AVL: Randomized dataset strictly preserves BST & Balance invariants', () => {
    const tree = new AVLTree();
    const values = [50, 25, 75, 10, 30, 60, 80, 5, 15, 27, 35, 55, 65, 78, 90, 1, 4, 12, 18];
    values.forEach(v => tree.insert(v));
    
    assert.strictEqual(tree.isBalanced(), true, 'Tree must remain balanced (|BF| <= 1)');
    const inOrder = tree.inOrder();
    const sorted = [...values].sort((a, b) => a - b);
    assert.deepStrictEqual(inOrder, sorted, 'In-order traversal must equal sorted dataset');
  });
});

// ----------------------------------------------------------------------------
// 9. ARCHITECTURE & HTML/CSS/JS INTEGRATION SUITE
// ----------------------------------------------------------------------------
suite('9. Architecture, CSS Tokens & Nav Integration', () => {
  const workspace = __dirname;
  const htmlFiles = [
    'index.html',
    'stack.html',
    'regular-queue.html',
    'circular-queue.html',
    'priority-queue.html',
    'singly-linked-list.html',
    'doubly-linked-list.html',
    'circular-linked-list.html',
    'avl-tree.html'
  ];

  test('All 9 HTML documents exist with valid academic structure and no legacy Tailwind CDN', () => {
    for (const file of htmlFiles) {
      const filePath = path.join(workspace, file);
      assert.strictEqual(fs.existsSync(filePath), true, `File missing: ${file}`);
      const content = fs.readFileSync(filePath, 'utf8');
      
      assert.strictEqual(content.includes('<!DOCTYPE html>'), true, `${file} missing <!DOCTYPE html>`);
      assert.strictEqual(/<title>.*<\/title>/i.test(content), true, `${file} missing <title>`);
      assert.strictEqual(content.includes('main.css'), true, `${file} missing main.css stylesheet link`);
      assert.strictEqual(content.includes('shared.js'), true, `${file} missing shared.js script link`);
      assert.strictEqual(content.includes('cdn.tailwindcss.com'), false, `${file} contains legacy tailwind CDN link`);
    }
  });

  test('Academic CSS design tokens and layout classes are defined in main.css', () => {
    const cssContent = fs.readFileSync(path.join(workspace, 'main.css'), 'utf8');
    assert.strictEqual(cssContent.includes('--primary:'), true, 'main.css missing --primary token');
    assert.strictEqual(cssContent.includes('--bg-page:'), true, 'main.css missing --bg-page token');
    assert.strictEqual(cssContent.includes('--font-main:'), true, 'main.css missing --font-main token');
    assert.strictEqual(cssContent.includes('.side-navbar'), true, 'main.css missing .side-navbar');
    assert.strictEqual(cssContent.includes('.page-header'), true, 'main.css missing .page-header');
    assert.strictEqual(cssContent.includes('.control-section') || cssContent.includes('.controls-row'), true, 'main.css missing control classes');
    assert.strictEqual(cssContent.includes('.viz-stage') || cssContent.includes('.stage'), true, 'main.css missing stage classes');
    assert.strictEqual(cssContent.includes('.output-box') || cssContent.includes('.log-container'), true, 'main.css missing output or log classes');
  });

  test('Shared navigation module (shared.js) initializes overlay, drawer and toast', () => {
    const jsContent = fs.readFileSync(path.join(workspace, 'shared.js'), 'utf8');
    assert.strictEqual(jsContent.includes('initNavigation'), true, 'shared.js missing initNavigation');
    assert.strictEqual(jsContent.includes('showToast'), true, 'shared.js missing showToast');
    assert.strictEqual(jsContent.includes('navCategories'), true, 'shared.js missing categorized navCategories');
  });
});

console.log(`\n======================================================`);
console.log(` SUMMARY: ${passedTests} / ${totalTests} assertions passed (${Math.round(passedTests / totalTests * 100)}%)`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
