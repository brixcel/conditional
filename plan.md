Based on the audit you just completed, I want you to now start implementing the improvements.

**Do NOT migrate to React yet.** Keep the current HTML/CSS/JS architecture for now, but clean it up properly and establish a reusable structure. We can reconsider React later if the project grows enough to justify it.

Work in phases and **do not blindly rewrite the entire project at once**.

## PHASE 1 — Fix confirmed correctness and production issues

Before touching the visual redesign, fix every confirmed P0 issue from the audit:

1. Remove the unresolved Git merge-conflict markers from `index.html`.
2. Fix the AVL Tree implementation issue:

   * First determine whether the intended educational behavior is supposed to be a real AVL tree.
   * The page is currently presented as an AVL Tree but behaves as a normal BST with a manual "Balance Tree" operation.
   * Preserve the intended educational purpose.
   * Implement proper AVL insertion/deletion with rotations and balance-factor logic if that is clearly the intended behavior.
   * Do NOT simply hide or rename the problem without explaining what you changed.
3. Fix `getSize()` on Singly Linked List.
4. Fix `getSize()` on Doubly Linked List.
5. Fix the broken Priority Queue hamburger/menu JavaScript error.
6. Fix the Stack page's mobile heading overflow.
7. Fix the hamburger/menu overlap with headings on Priority Queue and Doubly Linked List.
8. Remove/reconcile the dead/orphaned implementations of Circular Queue and Doubly Linked List.

   * There must be one clear source of truth for each data structure.
   * Before deleting anything, verify that the file is genuinely unused.
9. Fix the other confirmed correctness issues from the audit:

   * falsy-zero validation bug
   * `-1` sentinel collision
   * wasted node allocation in `insertAt(value, 0)`
   * duplicate function definitions where they cause incorrect behavior

After Phase 1, run through the affected functionality again and verify that the fixes actually work.

---

# PHASE 2 — Establish a consistent front-end foundation

Before redesigning individual pages, fix the architectural problems causing the UI inconsistency.

Create a shared structure for:

* Sidebar/navigation
* Hamburger/menu button
* Page container
* Page header
* Buttons
* Inputs
* Validation/error messages
* Success/info messages
* Visualization containers
* Operation logs
* Empty states
* Tooltips/help text

There should be **one source of truth** for shared UI behavior.

Do not copy the sidebar into nine different HTML files again.

Use reusable JavaScript/CSS modules or another lightweight approach that works with the current project.

Also:

* Deduplicate `main.css`
* Remove conflicting/repeated media queries
* Remove unnecessary inline styles
* Remove the Priority Queue Tailwind CDN dependency
* Make all pages use the same styling system
* Make sure Singly and Doubly Linked List use the same global styling foundation
* Keep page-specific styles isolated where appropriate

Do NOT introduce React just to solve these problems.

---

# PHASE 3 — UI/UX redesign

Once the foundation is stable, redesign the interface.

The goal is NOT to make it flashy.

This is an educational **Data Structures & Algorithms visualization tool**, so the UI should feel:

* Clean
* Modern
* Academic/technical
* Easy to understand
* Consistent
* Visual
* Responsive
* Intentional

Avoid generic "AI-generated dashboard" aesthetics.

Do NOT fill the interface with:

* excessive gradients
* glowing blue effects
* unnecessary glassmorphism
* excessive cards
* giant decorative headings
* meaningless animations
* excessive rounded containers

Prioritize information hierarchy and the actual visualizations.

### Establish a design system

Define consistent:

* Colors
* Typography
* Spacing scale
* Border radius
* Shadows
* Button hierarchy
* Input styles
* Status colors
* Icon usage
* Responsive breakpoints

Use semantic colors so destructive actions such as Reset/Clear are visually distinguishable from normal actions.

### Page structure

Make the pages follow a consistent hierarchy:

Sidebar/navigation
↓
Page header
↓
Short explanation of the data structure
↓
Controls / operations
↓
Visualization
↓
Current state / output
↓
Operation history or educational information

Do not force every page into exactly the same layout if the visualization requires something different. Keep the **design language consistent**, not necessarily the exact layout.

---

# PHASE 4 — Mobile responsiveness

Treat mobile as a first-class layout, not an afterthought.

Test at minimum:

* 375px
* 390px
* 768px
* desktop width

Specifically verify:

* Sidebar
* Hamburger button
* Page titles
* Forms
* Buttons
* Visualization areas
* Tables
* Operation logs
* Educational content

Nothing should overlap, overflow horizontally, or require awkward scrolling.

The Stack heading and Priority/Doubly hamburger issues found in the audit must definitely be resolved.

---

# PHASE 5 — Educational UX improvements

Because this is a DSA teaching tool, improve the interface so students can understand what is happening.

For visualizations, consider useful feedback such as:

* Highlighting the affected node/element
* Showing the operation being performed
* Showing before/after state where useful
* Clear empty/full states
* Clear validation messages
* Clear indication of the current structure state
* Better operation history

For AVL specifically, the visualization should make rotations understandable rather than simply redrawing the tree.

Do not add animations just for decoration. Animations should communicate the algorithm.

---

# PHASE 6 — Verification

After implementation, do a full regression pass.

Test every major operation on every data structure.

Create a checklist such as:

### Stack

* Set capacity
* Push
* Pop
* Peek
* Is Empty
* Is Full
* Size
* Reset

### Regular Queue

* Initialize
* Enqueue
* Dequeue
* Peek
* Rear
* Is Empty
* Is Full
* Clear
* Size

### Circular Queue

* Enqueue
* Dequeue
* Wrap-around
* Full state
* Empty state
* Clear
* Size

### Priority Queue

* Enqueue with priorities
* Correct ordering
* Dequeue
* Peek
* Rear
* Full/empty states
* Clear
* Size
* Navigation

### Singly Linked List

Test every available operation and verify size/node count.

### Doubly Linked List

Test every available operation and verify size/node count.

### Circular Linked List

Test insertion, deletion, reverse, sorting, searching, operation history, and edge cases.

### AVL Tree

Test:

* Normal insertion
* LL rotation
* RR rotation
* LR rotation
* RL rotation
* Deletion
* Root changes
* Height
* Balance factor
* Parent/child relationships
* Edge cases

Also check the browser console for JavaScript errors throughout the site.

---

# IMPORTANT IMPLEMENTATION RULES

1. Do not migrate to React.
2. Do not rewrite working functionality unnecessarily.
3. Preserve the existing educational content unless it is demonstrably incorrect.
4. Fix correctness before cosmetic polish.
5. Keep one implementation/source of truth per data structure.
6. Reuse shared UI instead of copy-pasting it.
7. Do not introduce unnecessary dependencies.
8. Do not add visual effects just because they look impressive.
9. If you discover something that contradicts the audit, verify it before changing it.
10. If you encounter an architectural decision that could significantly change the project, stop and explain the tradeoff before proceeding.

## Execution order

Follow this exact order:

**P0 correctness → shared architecture → design system → page redesign → mobile → educational UX → full regression testing**

After each phase, briefly report:

* What changed
* What files changed
* What was verified
* Any remaining issues

Start with **Phase 1 only**. Do not begin the UI redesign until the confirmed correctness and production issues have been fixed and verified.
