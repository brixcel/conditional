import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateBank, prepareQuiz, grade, normalizeAnswer } from "../src/quiz/quiz.js";
import { BinarySearchTree, BST_INFO } from "../src/structures/bst.js";
import { AVLTree, AVL_INFO } from "../src/structures/avl.js";
import { Trie, TRIE_INFO, validateWord } from "../src/structures/trie.js";
import { RedBlackTree, RB_INFO } from "../src/structures/red-black.js";
import { RB_DEMOS, parseShape } from "../src/pages/red-black-demos.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUIZZES_DIR = path.join(ROOT, "content", "quizzes");

const G16_IDS = ["bst", "avl-tree", "trie", "red-black-tree"];
const REQUIRED_TYPES = ["mcq", "multi", "truefalse", "predict", "complexity"];
const REQUIRED_DIFFS = ["easy", "medium", "hard"];

function loadBank(id) {
  const file = path.join(QUIZZES_DIR, `${id}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function getQuestion(bank, id) {
  const q = bank.questions.find((item) => item.id === id);
  assert.ok(q, `Expected question "${id}" in bank "${bank.id}"`);
  return q;
}

function assertAllPredictsCovered(bank, verifiedPredictIds) {
  const actual = bank.questions.filter((q) => q.type === "predict").map((q) => q.id).sort();
  const covered = [...verifiedPredictIds].sort();
  assert.deepEqual(
    covered,
    actual,
    `Bank "${bank.id}" must verify every predict question in tests/quiz-banks-g16.test.js`
  );
}

function preorderValues(node, out = []) {
  if (!node) return out;
  out.push(node.value);
  preorderValues(node.left, out);
  preorderValues(node.right, out);
  return out;
}

function leafDepths(node, depth = 0, out = []) {
  if (!node) return out;
  if (!node.left && !node.right) {
    out.push({ value: node.value, depth });
    return out;
  }
  leafDepths(node.left, depth + 1, out);
  leafDepths(node.right, depth + 1, out);
  return out;
}

function runRbDemo(demoKey) {
  const demo = RB_DEMOS[demoKey];
  assert.ok(demo, `Expected RB_DEMOS["${demoKey}"]`);
  const tree = RedBlackTree.fromSnapshot(parseShape(demo.shape));
  const res = demo.op === "insert" ? tree.insert(demo.key) : tree.delete(demo.key);
  assert.equal(res.ok, true, `demo ${demoKey} op failed`);
  return { tree, res, demo };
}

/* =========================================================================
   1. Structural & contract checks for all 4 G16 quiz banks
   ========================================================================= */

for (const id of G16_IDS) {
  test(`G16 quiz bank "${id}" meets schema, count, review, type, and difficulty contracts`, () => {
    const bank = loadBank(id);
    assert.equal(bank.id, id);
    assert.equal(bank.reviewed, null, `${id}.json must have reviewed: null before Claude review`);

    const v = validateBank(bank);
    assert.equal(v.ok, true, `${id}.json validation failed: ${v.errors.join("; ")}`);

    assert.ok(
      bank.questions.length >= 12 && bank.questions.length <= 16,
      `${id}.json must have 12–16 questions, got ${bank.questions.length}`
    );

    const types = new Set(bank.questions.map((q) => q.type));
    for (const t of REQUIRED_TYPES) {
      assert.ok(types.has(t), `${id}.json missing question type "${t}"`);
    }

    const diffs = new Set(bank.questions.map((q) => q.difficulty));
    for (const d of REQUIRED_DIFFS) {
      assert.ok(diffs.has(d), `${id}.json missing difficulty "${d}"`);
    }

    const quiz = prepareQuiz(bank, { count: bank.questions.length, shuffleChoices: false });
    for (const q of quiz.questions) {
      const submission =
        q.type === "multi" ? q.answerIndices
          : (q.type === "mcq" || q.type === "complexity") ? q.answerIndex
            : q.answer;
      const g = grade(q, submission);
      assert.equal(g.correct, true, `${q.id} failed self-grade on its own answer`);
    }
  });
}

/* =========================================================================
   2. bst — recompute every predict + module-verifiable answer
   ========================================================================= */

test("G16 bst: all 5 predict questions and 9 additional questions match BinarySearchTree", () => {
  const bank = loadBank("bst");
  const verifiedPredicts = [];

  // bst-001 (mcq): BST ancestor invariant — 55 goes right of 50, never under 30; illegal placement fails integrityError()
  {
    const q = getQuestion(bank, "bst-001");
    const t = new BinarySearchTree();
    for (const v of [50, 30, 55]) t.insert(v);
    assert.equal(t.root.value, 50);
    assert.equal(t.root.left.value, 30);
    assert.equal(t.root.left.right, null);
    assert.equal(t.root.right.value, 55);
    // Construct the invalid tree described in the prompt (55 as right child of 30 under root 50)
    const bad = new BinarySearchTree();
    for (const v of [50, 30, 40]) bad.insert(v);
    bad.root.left.right.value = 55;
    assert.notEqual(bad.integrityError(), null);
    assert.equal(q.answer, "No: 55 is in the left subtree of 50, so it must be strictly smaller than 50");
  }

  // bst-002 (truefalse): empty height -1, single-node height 0
  {
    const q = getQuestion(bank, "bst-002");
    const t = new BinarySearchTree();
    const emptyH = t.height();
    t.insert(50);
    const singleH = t.height();
    assert.equal(emptyH === -1 && singleH === 0, q.answer);
  }

  // bst-003 (predict, list): In-Order of [50, 30, 70, 20, 40, 60]
  {
    const q = getQuestion(bank, "bst-003");
    const t = new BinarySearchTree();
    for (const v of [50, 30, 70, 20, 40, 60]) t.insert(v);
    const computed = t.traverse("inorder").value.join(", ");
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // bst-004 (mcq): duplicate insert rejected, size unchanged
  {
    const q = getQuestion(bank, "bst-004");
    const t = new BinarySearchTree();
    for (const v of [50, 30, 70]) t.insert(v);
    const dup = t.insert(30);
    assert.equal(dup.ok, false);
    assert.equal(dup.steps.at(-1).type, "duplicate");
    assert.equal(t.size, 3);
    assert.equal(q.answer, "The insertion is rejected because BST keys must be unique, and the tree is unchanged");
  }

  // bst-005 (complexity): balanced search O(log n)
  {
    const q = getQuestion(bank, "bst-005");
    assert.ok(BST_INFO.complexity.search.includes(`${q.answer} balanced`));
  }

  // bst-006 (predict, list): Pre-Order of [50, 30, 70, 20, 40, 60, 80]
  {
    const q = getQuestion(bank, "bst-006");
    const t = new BinarySearchTree();
    for (const v of [50, 30, 70, 20, 40, 60, 80]) t.insert(v);
    const computed = t.traverse("preorder").value.join(", ");
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // bst-007 (predict, text): default tree delete(50) -> new root 60
  {
    const q = getQuestion(bank, "bst-007");
    const t = new BinarySearchTree();
    for (const v of [50, 30, 70, 20, 40, 60, 80, 65]) t.insert(v);
    const del = t.delete(50);
    assert.equal(del.ok, true);
    assert.equal(del.value.case, "two-children");
    assert.equal(del.value.successorValue, 60);
    const computed = String(t.root.value);
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // bst-008 (multi): delete cases (leaf, 1-child, 2-child successor; NOT immediate left child)
  {
    const q = getQuestion(bank, "bst-008");
    const makeDefault = () => {
      const t = new BinarySearchTree();
      for (const v of [50, 30, 70, 20, 40, 60, 80, 65]) t.insert(v);
      return t;
    };
    const checks = [
      () => {
        const t = makeDefault();
        const r = t.delete(20);
        return r.ok && r.value.case === "leaf" && t.size === 7 && t.root.left.left === null;
      },
      () => {
        const t = makeDefault();
        const r = t.delete(60);
        return r.ok && r.value.case === "one-child" && t.root.right.left.value === 65;
      },
      () => {
        const t = makeDefault();
        const r = t.delete(50);
        return r.ok && r.value.case === "two-children" && r.value.successorValue === 60 && t.root.value === 60;
      },
      () => {
        const t = makeDefault();
        t.delete(50);
        return t.root.value === 30;
      }
    ];
    const expected = q.choices.filter((_, i) => checks[i]());
    assert.deepEqual(expected, q.answer);
  }

  // bst-009 (complexity): sorted insert skewed worst-case O(n)
  {
    const q = getQuestion(bank, "bst-009");
    const t = new BinarySearchTree();
    const sorted = [10, 20, 30, 40, 50, 60];
    for (const v of sorted) t.insert(v);
    assert.equal(t.height(), sorted.length - 1);
    const search60 = t.search(60);
    assert.equal(search60.value.found, true);
    assert.equal(search60.steps.length, sorted.length);
    assert.ok(BST_INFO.complexity.search.includes(`${q.answer} skewed`));
  }

  // bst-010 (truefalse): negative keys down to -99, 0 valid, capacity 31
  {
    const q = getQuestion(bank, "bst-010");
    const t = new BinarySearchTree(31);
    const built = [-99, 0, 999].every((v) => t.insert(v).ok);
    const valid = built && t.capacity === 31 && t.min().value.value === -99 && t.max().value.value === 999;
    assert.equal(valid, q.answer);
  }

  // bst-011 (predict, list): Post-Order of [40, 20, 60, 10, 30, 50]
  {
    const q = getQuestion(bank, "bst-011");
    const t = new BinarySearchTree();
    for (const v of [40, 20, 60, 10, 30, 50]) t.insert(v);
    const computed = t.traverse("postorder").value.join(", ");
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // bst-012 (predict, list): [40, 20, 60, 50, 70, 55] delete(40) -> Level-Order
  {
    const q = getQuestion(bank, "bst-012");
    const t = new BinarySearchTree();
    for (const v of [40, 20, 60, 50, 70, 55]) t.insert(v);
    assert.equal(t.delete(40).ok, true);
    const computed = t.traverse("levelorder").value.join(", ");
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // bst-013 (complexity): full traversal O(n)
  {
    const q = getQuestion(bank, "bst-013");
    assert.equal(BST_INFO.complexity.traverse, q.answer);
  }

  // bst-014 (multi): universal BST invariants
  {
    const q = getQuestion(bank, "bst-014");
    const makeBalanced = () => {
      const t = new BinarySearchTree();
      for (const v of [50, 30, 70, 20, 40, 60, 80, 65]) t.insert(v);
      return t;
    };
    const makeSkewed = () => {
      const t = new BinarySearchTree();
      for (const v of [1, 2, 3, 4, 5, 6, 7, 8]) t.insert(v);
      return t;
    };
    const checks = [
      () => {
        for (const t of [makeBalanced(), makeSkewed()]) {
          const order = t.traverse("inorder").value;
          for (let i = 1; i < order.length; i++) if (!(order[i - 1] < order[i])) return false;
        }
        return true;
      },
      () => {
        for (const t of [makeBalanced(), makeSkewed()]) {
          let curr = t.root;
          while (curr.left) curr = curr.left;
          if (curr.value !== t.min().value.value) return false;
        }
        return true;
      },
      () => {
        const t = makeBalanced();
        let succ = t.root.right;
        while (succ.left) succ = succ.left;
        return succ.left === null && succ.value === 60;
      },
      () => {
        const skewed = makeSkewed();
        return skewed.height() <= Math.ceil(Math.log2(skewed.size + 1));
      },
      () => {
        const order = makeBalanced().traverse("levelorder").value;
        return order.every((v, i) => i === 0 || order[i - 1] < v);
      }
    ];
    const expected = q.choices.filter((_, i) => checks[i]());
    assert.deepEqual(expected, q.answer);
  }

  assertAllPredictsCovered(bank, verifiedPredicts);
});

/* =========================================================================
   3. avl-tree — recompute every predict + module-verifiable answer
   ========================================================================= */

test("G16 avl-tree: all 4 predict questions and 10 additional questions match AVLTree", () => {
  const bank = loadBank("avl-tree");
  const verifiedPredicts = [];

  // avl-tree-001 (mcq): bf of 30 before LL rotation after [30, 20, 10] is +2
  {
    const q = getQuestion(bank, "avl-tree-001");
    const t = new AVLTree();
    t.insert(30);
    t.insert(20);
    const res = t.insert(10);
    const unbal = res.steps.find((s) => s.type === "unbalanced");
    const n30 = unbal.snapshot.nodes.find((n) => n.value === 30);
    assert.equal(n30.balance, 2);
    assert.equal(q.answer, "+2 (unbalanced, left-heavy)");
  }

  // avl-tree-002 (truefalse): single-node height 0, empty height -1
  {
    const q = getQuestion(bank, "avl-tree-002");
    const t = new AVLTree();
    const h0 = t.height();
    t.insert(42);
    const h1 = t.height();
    assert.equal(h0 === -1 && h1 === 0, q.answer);
  }

  // avl-tree-003 (predict, text): [30, 20, 10] -> root 20
  {
    const q = getQuestion(bank, "avl-tree-003");
    const t = new AVLTree();
    for (const v of [30, 20, 10]) t.insert(v);
    const computed = String(t.root.value);
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // avl-tree-004 (complexity): search worst-case O(log n)
  {
    const q = getQuestion(bank, "avl-tree-004");
    assert.equal(AVL_INFO.operations.search.complexity, q.answer);
  }

  // avl-tree-005 (mcq): [10, 20, 30] -> RR single left rotation around 10
  {
    const q = getQuestion(bank, "avl-tree-005");
    const t = new AVLTree();
    t.insert(10);
    t.insert(20);
    const res = t.insert(30);
    assert.equal(res.value.rotations.length, 1);
    assert.equal(res.value.rotations[0].case, "RR");
    assert.equal(res.value.rotations[0].pivotValue, 10);
    const rotSteps = res.steps.filter((s) => s.type.startsWith("rotate-")).map((s) => s.type);
    assert.deepEqual(rotSteps, ["rotate-left"]);
    assert.equal(q.answer, "RR case: a single left rotation around 10");
  }

  // avl-tree-006 (predict, list): [30, 10, 20] LR -> pre-order "20, 10, 30"
  {
    const q = getQuestion(bank, "avl-tree-006");
    const t = new AVLTree();
    for (const v of [30, 10, 20]) t.insert(v);
    const computed = preorderValues(t.root).join(", ");
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // avl-tree-007 (predict, text): default build [10, 20, 30, 40, 50, 25] -> root "30"
  {
    const q = getQuestion(bank, "avl-tree-007");
    const t = new AVLTree();
    for (const v of [10, 20, 30, 40, 50, 25]) t.insert(v);
    const computed = String(t.root.value);
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // avl-tree-008 (mcq): [10, 30, 20] RL -> rotate right on 30, then left on 10
  {
    const q = getQuestion(bank, "avl-tree-008");
    const t = new AVLTree();
    t.insert(10);
    t.insert(30);
    const res = t.insert(20);
    assert.equal(res.value.rotations.length, 1);
    assert.equal(res.value.rotations[0].case, "RL");
    const rotSteps = res.steps.filter((s) => s.type.startsWith("rotate-")).map((s) => s.type);
    assert.deepEqual(rotSteps, ["rotate-right", "rotate-left"]);
    assert.equal(q.answer, "Rotate right around 30, then rotate left around 10");
  }

  // avl-tree-009 (multi): valid AVL invariants (leaves need NOT be equal depth)
  {
    const q = getQuestion(bank, "avl-tree-009");
    const makeSample = () => {
      const t = new AVLTree();
      for (const v of [20, 10, 30, 5]) t.insert(v);
      return t;
    };
    const checks = [
      () => makeSample().integrityError() === null,
      () => {
        const arr = makeSample().toArray();
        return arr.every((v, i) => i === 0 || arr[i - 1] < v);
      },
      () => {
        const t = makeSample();
        return t.height() < 1.44 * Math.log2(t.size + 2);
      },
      () => AVL_INFO.operations.height.complexity === "O(1)",
      () => {
        const depths = new Set(leafDepths(makeSample().root).map((x) => x.depth));
        return depths.size === 1;
      }
    ];
    const expected = q.choices.filter((_, i) => checks[i]());
    assert.deepEqual(expected, q.answer);
  }

  // avl-tree-010 (complexity): single rotation O(1)
  {
    const q = getQuestion(bank, "avl-tree-010");
    assert.ok(AVL_INFO.complexity.rotation.startsWith(q.answer));
  }

  // avl-tree-011 (truefalse): delete can cascade (>1 rotation) -> false
  {
    const q = getQuestion(bank, "avl-tree-011");
    const t = new AVLTree();
    for (const v of [50, 25, 75, 15, 35, 65, 85, 5, 20, 30, 60, 1]) t.insert(v);
    const del = t.delete(85);
    assert.equal(del.ok, true);
    assert.ok(del.value.rotations.length >= 2);
    assert.equal(del.value.rotations.length <= 1, q.answer);
  }

  // avl-tree-012 (predict, list): [20, 10, 30, 15] delete(30) LR -> pre-order "15, 10, 20"
  {
    const q = getQuestion(bank, "avl-tree-012");
    const t = new AVLTree();
    for (const v of [20, 10, 30, 15]) t.insert(v);
    assert.equal(t.delete(30).ok, true);
    const computed = preorderValues(t.root).join(", ");
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // avl-tree-013 (mcq): [20, 10, 30, 5, 15] delete(30) with bf(10)=0 -> LL, height unchanged
  {
    const q = getQuestion(bank, "avl-tree-013");
    const t = new AVLTree();
    for (const v of [20, 10, 30, 5, 15]) t.insert(v);
    const hBefore = t.height();
    const res = t.delete(30);
    assert.equal(res.ok, true);
    assert.equal(res.value.rotations.length, 1);
    assert.equal(res.value.rotations[0].case, "LL");
    assert.equal(res.value.rotations[0].pivotValue, 20);
    assert.equal(t.height(), hBefore);
    assert.equal(q.answer, "LL case: a single right rotation around 20, leaving the subtree height unchanged");
  }

  // avl-tree-014 (multi): insert/delete implementation properties
  {
    const q = getQuestion(bank, "avl-tree-014");
    const checks = [
      () => {
        const t = new AVLTree();
        for (const v of [10, 20, 30, 40, 50, 25, 15, 5, 1]) {
          const r = t.insert(v);
          if (r.value.rotations.length > 1) return false;
        }
        return AVL_INFO.complexity.insert.includes("at most 1 single or double rotation");
      },
      () => {
        const t = new AVLTree();
        for (const v of [50, 25, 75, 15, 35, 65, 85, 5, 20, 30, 60, 1]) t.insert(v);
        const del = t.delete(85);
        return del.ok && del.value.rotations.length >= 2 && AVL_INFO.complexity.delete.includes("up to O(log n) rotations");
      },
      () => {
        const t = new AVLTree();
        for (const v of [20, 10, 30, 25]) t.insert(v);
        const r = t.delete(20);
        return r.ok && r.value.case === "two-children" && r.value.successorValue === 25;
      },
      () => {
        const t = new AVLTree(3);
        for (const v of [10, 20, 30]) t.insert(v);
        const dup = t.insert(20);
        return !dup.ok && dup.steps.at(-1).type === "duplicate";
      },
      () => {
        const t = new AVLTree();
        t.insert(30);
        t.insert(10);
        const before = t.toArray();
        t.insert(20); // LR double rotation
        const expected = [...before, 20].sort((a, b) => a - b);
        return JSON.stringify(t.toArray()) !== JSON.stringify(expected);
      }
    ];
    const expected = q.choices.filter((_, i) => checks[i]());
    assert.deepEqual(expected, q.answer);
  }

  assertAllPredictsCovered(bank, verifiedPredicts);
});

/* =========================================================================
   4. trie — recompute every predict + module-verifiable answer
   ========================================================================= */

test("G16 trie: all 5 predict questions and 9 additional questions match Trie", () => {
  const bank = loadBank("trie");
  const verifiedPredicts = [];

  // trie-001 (truefalse): empty Trie has size 0 and nodeCount 1
  {
    const q = getQuestion(bank, "trie-001");
    const t = new Trie();
    assert.equal(t.size === 0 && t.nodeCount === 1, q.answer);
  }

  // trie-002 (mcq): insert "card" -> search("car") false, startsWith("car") true
  {
    const q = getQuestion(bank, "trie-002");
    const t = new Trie();
    t.insert("card");
    const s = t.search("car");
    const p = t.startsWith("car");
    assert.equal(s.value.found, false);
    assert.equal(p.value.found, true);
    assert.equal(q.answer, 'search("car") returns found: false, while startsWith("car") returns found: true');
  }

  // trie-003 (predict, text): insert "cat", "car" -> nodeCount 5
  {
    const q = getQuestion(bank, "trie-003");
    const t = new Trie();
    t.insert("cat");
    t.insert("car");
    const computed = String(t.nodeCount);
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // trie-004 (mcq): validateWord accepts only "\"  Tree  \"" among the 4 choices
  {
    const q = getQuestion(bank, "trie-004");
    const stripQuotes = (s) => s.replace(/^"|"$/g, "");
    const accepted = q.choices.filter((c) => validateWord(stripQuotes(c)).ok);
    assert.deepEqual(accepted, [q.answer]);
    const t = new Trie();
    const ins = t.insert(stripQuotes(q.answer));
    assert.equal(ins.ok, true);
    assert.equal(ins.value.word, "tree");
  }

  // trie-005 (complexity): insert/search/startsWith/delete O(L)
  {
    const q = getQuestion(bank, "trie-005");
    for (const op of ["insert", "search", "startsWith", "delete"]) {
      assert.ok(TRIE_INFO.complexity[op].startsWith(q.answer));
    }
  }

  // trie-006 (predict, list): ["care", "cat", "car", "dog", "card"] wordsWithPrefix("ca")
  {
    const q = getQuestion(bank, "trie-006");
    const t = new Trie();
    for (const w of ["care", "cat", "car", "dog", "card"]) t.insert(w);
    const computed = t.wordsWithPrefix("ca").value.join(", ");
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // trie-007 (predict, text): ["car", "card"] delete("car") -> nodeCount 5
  {
    const q = getQuestion(bank, "trie-007");
    const t = new Trie();
    t.insert("car");
    t.insert("card");
    const del = t.delete("car");
    assert.equal(del.value.outcome, "unmark-only");
    const computed = String(t.nodeCount);
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // trie-008 (predict, text): ["dog", "door"] delete("door") -> nodeCount 4
  {
    const q = getQuestion(bank, "trie-008");
    const t = new Trie();
    t.insert("dog");
    t.insert("door");
    const del = t.delete("door");
    assert.equal(del.value.outcome, "partial-prune");
    const computed = String(t.nodeCount);
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // trie-009 (multi): pruning cases on default trie
  {
    const q = getQuestion(bank, "trie-009");
    const defaultWords = ["cat", "car", "card", "care", "dog", "door", "bat"];
    const tests = [
      { word: "car", expectedCase: "unmark-only", expectedPruned: 0 },
      { word: "door", expectedCase: "partial-prune", expectedPruned: 2 },
      { word: "bat", expectedCase: "full-prune", expectedPruned: 3 },
      { word: "cat", expectedCase: "full-prune", expectedPruned: 3 }
    ];
    const expected = q.choices.filter((_, i) => {
      const t = new Trie();
      for (const w of defaultWords) t.insert(w);
      const r = t.delete(tests[i].word);
      return r.ok && r.value.outcome === tests[i].expectedCase && r.value.prunedCount === tests[i].expectedPruned;
    });
    assert.deepEqual(expected, q.answer);
  }

  // trie-010 (complexity): space O(total characters)
  {
    const q = getQuestion(bank, "trie-010");
    assert.ok(TRIE_INFO.complexity.space.startsWith(q.answer));
  }

  // trie-011 (predict, text): ["bat", "car", "card", "cart"], delete("bat"), delete("card") -> nodeCount 5
  {
    const q = getQuestion(bank, "trie-011");
    const t = new Trie();
    for (const w of ["bat", "car", "card", "cart"]) t.insert(w);
    assert.equal(t.delete("bat").ok, true);
    assert.equal(t.delete("card").ok, true);
    const computed = String(t.nodeCount);
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // trie-012 (truefalse): atomic maxNodes pre-probe leaves 0 partial nodes -> false
  {
    const q = getQuestion(bank, "trie-012");
    const t = new Trie({ maxNodes: 6 });
    t.insert("cat");
    const before = t.nodeCount; // 4
    const res = t.insert("dog");
    assert.equal(res.ok, false);
    assert.equal(res.steps.at(-1).type, "overflow");
    const createdPartialNodes = t.nodeCount > before;
    assert.equal(createdPartialNodes, q.answer);
  }

  // trie-013 (complexity): wordsWithPrefix O(L + K)
  {
    const q = getQuestion(bank, "trie-013");
    assert.ok(TRIE_INFO.complexity.wordsWithPrefix.startsWith(q.answer));
  }

  // trie-014 (multi): Trie invariants
  {
    const q = getQuestion(bank, "trie-014");
    const checks = [
      () => {
        const t = new Trie();
        for (const w of ["cat", "car", "card", "dog", "door"]) t.insert(w);
        t.delete("door");
        t.delete("car");
        const snap = t.snapshot();
        return snap.nodes
          .filter((n) => n.id !== snap.rootId && n.children.length === 0)
          .every((n) => n.isEnd === true);
      },
      () => {
        const t = new Trie();
        t.insert("card");
        const beforeCount = t.nodeCount;
        const del = t.delete("car");
        return !del.ok && t.nodeCount === beforeCount && t.size === 1;
      },
      () => {
        const t = new Trie({ maxWords: 10, maxNodes: 5 });
        t.insert("card"); // root + c,a,r,d = 5 === maxNodes
        assert.equal(t.nodeCount, 5);
        const ins = t.insert("car");
        return ins.ok && t.nodeCount === 5 && t.size === 2;
      },
      () => {
        const t = new Trie();
        t.insert("a");
        const snap = t.snapshot();
        const root = snap.nodes.find((n) => n.id === snap.rootId);
        return root.isEnd === true;
      }
    ];
    const expected = q.choices.filter((_, i) => checks[i]());
    assert.deepEqual(expected, q.answer);
  }

  assertAllPredictsCovered(bank, verifiedPredicts);
});

/* =========================================================================
   5. red-black-tree — recompute every predict + module-verifiable answer
   ========================================================================= */

test("G16 red-black-tree: all 4 predict questions and 10 additional questions match RedBlackTree", () => {
  const bank = loadBank("red-black-tree");
  const verifiedPredicts = [];

  // red-black-tree-001 (multi): the 5 RB properties (verified directly + via integrityError violations; red node CAN have NIL children)
  {
    const q = getQuestion(bank, "red-black-tree-001");
    const t = new RedBlackTree();
    t.insert(20);
    t.insert(10);
    assert.equal(t.integrityError(), null);
    const snap = t.snapshot();
    const redLeaf = t.root.left;
    const checks = [
      () => snap.nodes.every((n) => n.color === "red" || n.color === "black"),
      () => {
        const badRoot = RedBlackTree.fromSnapshot(parseShape("20B(10R,30R)"));
        badRoot.root.color = "red";
        return t.root.color === "black" && badRoot.integrityError() !== null;
      },
      () => t.root.right === null && t.root.left.left === null && t.integrityError() === null,
      () => {
        const parentRedHasRedChild = (node) => {
          if (!node) return false;
          if (node.color === "red" && ((node.left && node.left.color === "red") || (node.right && node.right.color === "red"))) return true;
          return parentRedHasRedChild(node.left) || parentRedHasRedChild(node.right);
        };
        const twoReds = RedBlackTree.fromSnapshot(parseShape("20B(10B(5R,-),30B)"));
        twoReds.root.left.color = "red";
        return !parentRedHasRedChild(t.root) && twoReds.integrityError() !== null;
      },
      () => {
        const badBh = RedBlackTree.fromSnapshot(parseShape("20B(10B,30B)"));
        badBh.root.left.color = "red";
        return t.blackHeight() === 1 && badBh.integrityError() !== null;
      },
      () => redLeaf.color === "red" && redLeaf.left !== null && redLeaf.right !== null
    ];
    const expected = q.choices.filter((_, i) => checks[i]());
    assert.deepEqual(expected, q.answer);
  }

  // red-black-tree-002 (mcq): new leaf starts red
  {
    const q = getQuestion(bank, "red-black-tree-002");
    const t = new RedBlackTree();
    t.insert(20);
    const res = t.insert(10);
    const attach = res.steps.find((s) => s.type === "insert");
    const n10 = attach.snapshot.nodes.find((n) => n.value === 10);
    assert.equal(n10.color, "red");
    assert.equal(q.answer, "Red, so no root-to-NIL path gains an extra black node and the black-height rule stays intact");
  }

  // red-black-tree-003 (truefalse): first key starts red -> recolored black -> blackHeight 1
  {
    const q = getQuestion(bank, "red-black-tree-003");
    const t = new RedBlackTree();
    const res = t.insert(10);
    const attach = res.steps.find((s) => s.type === "insert");
    const rootBlack = res.steps.find((s) => s.type === "root-black");
    const matched =
      attach.snapshot.nodes.find((n) => n.value === 10).color === "red" &&
      rootBlack.snapshot.nodes.find((n) => n.value === 10).color === "black" &&
      t.blackHeight() === 1;
    assert.equal(matched, q.answer);
  }

  // red-black-tree-004 (predict, text): Insert case 1 (left) -> blackHeight "2"
  {
    const q = getQuestion(bank, "red-black-tree-004");
    const { tree } = runRbDemo("insert-1-left");
    const computed = String(tree.blackHeight());
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // red-black-tree-005 (complexity): search, insert, delete worst-case O(log n)
  {
    const q = getQuestion(bank, "red-black-tree-005");
    assert.equal(RB_INFO.operations.search.complexity, q.answer);
    assert.equal(RB_INFO.operations.insert.complexity, q.answer);
    assert.equal(RB_INFO.operations.delete.complexity, q.answer);
  }

  // red-black-tree-006 (predict, list): insert [20, 30, 25] -> pre-order "25, 20, 30"
  {
    const q = getQuestion(bank, "red-black-tree-006");
    const t = new RedBlackTree();
    for (const v of [20, 30, 25]) t.insert(v);
    const computed = preorderValues(t.root).join(", ");
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // red-black-tree-007 (mcq): uncle color separates Case 1 recolor vs Cases 2/3 rotations
  {
    const q = getQuestion(bank, "red-black-tree-007");
    const c1 = runRbDemo("insert-1-left");
    const c3 = runRbDemo("insert-3-left");
    const countRotations = (res) => res.steps.filter((s) => s.type.startsWith("rotate-")).length;
    assert.equal(countRotations(c1.res), 0);
    assert.equal(c1.res.value.fixes[0].case, "uncle-red");
    assert.equal(countRotations(c3.res), 1);
    assert.equal(c3.res.value.fixes[0].case, "line");
    assert.equal(
      q.answer,
      "The color of z's uncle (p's sibling): red triggers Case 1 recoloring; black (or NIL) triggers Cases 2 or 3 rotations"
    );
  }

  // red-black-tree-008 (predict, text): Delete case 1 -> 2 (left) -> new root "20"
  {
    const q = getQuestion(bank, "red-black-tree-008");
    const { tree } = runRbDemo("delete-1-left");
    const computed = String(tree.root.value);
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // red-black-tree-009 (mcq): at most 2 rotations insert, at most 3 delete
  {
    const q = getQuestion(bank, "red-black-tree-009");
    assert.ok(RB_INFO.complexity.insert.includes("at most 2 rotations"));
    assert.ok(RB_INFO.complexity.delete.includes("at most 3 rotations"));
    assert.equal(q.answer, "At most 2 rotations for insert and at most 3 rotations for delete");
  }

  // red-black-tree-010 (complexity): repeating recoloring loop O(log n)
  {
    const q = getQuestion(bank, "red-black-tree-010");
    assert.equal(RB_INFO.operations.insert.complexity, q.answer);
    assert.equal(RB_INFO.operations.delete.complexity, q.answer);
  }

  // red-black-tree-011 (truefalse): deleting red leaf or two-child node with red successor needs 0 fix-ups
  {
    const q = getQuestion(bank, "red-black-tree-011");
    const t1 = RedBlackTree.fromSnapshot(parseShape("20B(10R,30R)"));
    const d1 = t1.delete(10);
    const t2 = RedBlackTree.fromSnapshot(parseShape("20B(10B,30B(25R,-))"));
    const d2 = t2.delete(20);
    const noFixup =
      d1.ok && d1.value.removedColor === "red" && d1.value.fixes.length === 0 &&
      d2.ok && d2.value.removedColor === "red" && d2.value.fixes.length === 0;
    assert.equal(noFixup, q.answer);
  }

  // red-black-tree-012 (mcq): Delete Case 1 converts red sibling into black sibling -> Cases 2/3/4
  {
    const q = getQuestion(bank, "red-black-tree-012");
    const { res } = runRbDemo("delete-1-left");
    assert.deepEqual(res.value.fixes.map((f) => f.case), ["sibling-red", "black-nephews"]);
    assert.equal(
      q.answer,
      "It recolors w black and the parent red, then rotates the parent toward x so x gets a black sibling and Cases 2, 3, or 4 can follow"
    );
  }

  // red-black-tree-013 (predict, list): Delete case 3 -> 4 (left) -> pre-order "15, 10, 20"
  {
    const q = getQuestion(bank, "red-black-tree-013");
    const { tree } = runRbDemo("delete-34-left");
    const computed = preorderValues(tree.root).join(", ");
    assert.equal(normalizeAnswer(computed, q.format), normalizeAnswer(q.answer, q.format));
    assert.equal(grade(q, computed).correct, true);
    verifiedPredicts.push(q.id);
  }

  // red-black-tree-014 (multi): CLRS delete fix-up cases 1–4
  {
    const q = getQuestion(bank, "red-black-tree-014");
    const countRotations = (res) => res.steps.filter((s) => s.type.startsWith("rotate-")).length;
    const checks = [
      () => {
        const repeatC2 = RedBlackTree.fromSnapshot(parseShape("10B(5B(2B,7B),20B(15B,25B))"));
        const res = repeatC2.delete(2);
        return res.ok && res.value.fixes.length === 2 &&
          res.value.fixes.every((f) => f.case === "black-nephews") &&
          countRotations(res) === 0;
      },
      () => {
        const d4 = runRbDemo("delete-4-left");
        return d4.res.value.fixes.map((f) => f.case).join(",") === "far-red" && countRotations(d4.res) === 1;
      },
      () => {
        const d34 = runRbDemo("delete-34-left");
        return d34.res.value.fixes.map((f) => f.case).join(",") === "near-red,far-red";
      },
      () => {
        const drc = runRbDemo("delete-red-child");
        return drc.res.value.fixes.length === 0 && countRotations(drc.res) === 0;
      },
      () => {
        const d2 = runRbDemo("delete-2-root");
        return countRotations(d2.res) >= 1;
      }
    ];
    const expected = q.choices.filter((_, i) => checks[i]());
    assert.deepEqual(expected, q.answer);
  }

  assertAllPredictsCovered(bank, verifiedPredicts);
});
