/**
 * Shared renderer for the three linked-list pages (singly, doubly, circular).
 *
 * listView(step, kind) is pure: it turns a recorded step (see src/structures/linked-list.js
 * for the step shape) into a plain view model, so the arrow directions, tones, end caps
 * and old → new pointer text can be unit-tested in Node.
 * createListRenderer(...) paints that view into the DOM. Node boxes are keyed by
 * address and reused between frames, so a node that moves (sort, insert, unlink) is
 * the same element, and its move is animated with a short FLIP unless reduced motion
 * is on. No innerHTML, no inline styles: text goes through textContent, positions
 * through Element.animate.
 *
 * kind: "singly" | "doubly" | "circular".
 */

const TONE_BY_TYPE = {
    visit: "ht-tone-compare",
    compare: "ht-tone-compare",
    pick: "ht-tone-select",
    create: "ht-tone-sorted",
    link: "ht-tone-swap",
    relink: "ht-tone-swap",
    "swap-pointers": "ht-tone-swap",
    unlink: "ht-tone-swap",
    replace: "ht-tone-swap",
    update: "ht-tone-swap",
    open: "ht-tone-swap",
    peek: "node-highlight",
};
export const NODE_TONES = ["ht-tone-compare", "ht-tone-select", "ht-tone-sorted", "ht-tone-swap", "node-highlight"];
const POINTER_FIELDS = new Set(["next", "prev", "head", "tail"]);
const REMOVING = new Set(["unlink", "replace"]);

const show = (a) => (a === null || a === undefined ? "NULL" : String(a));

/** Text for one recorded pointer write, e.g. "abc002.next: abc003 → abc004" or "head: NULL → abc001". */
export function describeChange(c) {
    const target = c.address === null || c.address === undefined ? c.field : `${c.address}.${c.field}`;
    return `${target}: ${show(c.from)} → ${show(c.to)}`;
}

/** Arrow glyph for one pointer field between display neighbours a (left) and b (right). */
function arrowFor(a, b, field) {
    const forward = a[field] === b.address;
    const backward = b[field] === a.address;
    if (field === "prev") {
        // prev points left when b.prev = a, right when a.prev = b.
        if (backward && forward) return "⇄";
        if (backward) return "←";
        if (forward) return "→";
        return "";
    }
    if (forward && backward) return "⇄";
    if (forward) return "→";
    if (backward) return "←";
    return "";
}

/**
 * Pure view model for one step.
 * @returns {{ empty: boolean, start: object|null, items: object[], end: object|null,
 *             detached: object[], detachedLabel: string, changes: string[] }}
 */
export function listView(step, kind) {
    const snap = step.snapshot ?? { nodes: [] };
    const nodes = snap.nodes ?? [];
    const detachedRaw = snap.detached ?? [];
    const changes = step.changes ?? [];
    const cursors = step.cursors ?? {};
    const tone = step.found ? "node-highlight" : (TONE_BY_TYPE[step.type] ?? "");
    const active = new Set(step.addresses ?? []);
    const doubly = kind !== "singly";

    const cursorsAt = (address) => Object.entries(cursors).filter(([, a]) => a === address).map(([name]) => name);
    const changed = (address, field) => changes.find((c) => c.address === address && c.field === field);

    const nodeView = (n, { detached = false } = {}) => {
        const isHead = !detached && snap.head === n.address;
        const isTail = !detached && snap.tail === n.address;
        const fields = [];
        if (doubly) fields.push(fieldView("Prev", n.prev, changed(n.address, "prev")));
        fields.push(fieldView("Next", n.next, changed(n.address, "next")));
        const valueChange = changed(n.address, "value");
        const removed = detached && REMOVING.has(step.type);
        const labelParts = [
            isHead ? "head" : "", isTail ? "tail" : "",
            ...cursorsAt(n.address).map((c) => `${c} points here`),
            detached ? (removed ? "unlinked" : "not linked yet") : "",
            `address ${n.address}`,
            valueChange ? `value changed from ${valueChange.from} to ${n.value}` : `value ${n.value}`,
            ...fields.map((f) => f.from !== undefined
                ? `${f.name.toLowerCase()} changed from ${show(f.from)} to ${show(f.value)}`
                : `${f.name.toLowerCase()} ${show(f.value)}`),
        ].filter(Boolean);
        return {
            kind: "node",
            address: n.address,
            value: n.value,
            valueFrom: valueChange ? valueChange.from : undefined,
            role: isHead && isTail ? "HEAD & TAIL" : isHead ? "HEAD" : isTail ? "TAIL" : "",
            cursors: cursorsAt(n.address),
            tone: active.has(n.address) ? tone : "",
            detached,
            removed,
            fields,
            aria: labelParts.join(", "),
        };
    };

    const items = [];
    nodes.forEach((n, i) => {
        if (i > 0) {
            const a = nodes[i - 1];
            const touches = changes.some((c) => (c.field === "next" || c.field === "prev")
                && ((c.address === a.address && (c.from === n.address || c.to === n.address))
                    || (c.address === n.address && (c.from === a.address || c.to === a.address))));
            items.push({ kind: "link", next: arrowFor(a, n, "next"), prev: doubly ? arrowFor(a, n, "prev") : null, changed: touches });
        }
        items.push(nodeView(n));
    });

    const first = nodes[0];
    const last = nodes.at(-1);
    let start = null;
    let end = null;
    if (nodes.length) {
        if (kind === "doubly") {
            start = { label: "", text: "NULL", arrow: first.prev === null ? "←" : "", active: false, aria: "" };
            end = { label: "", text: "NULL", arrow: last.next === null ? "→" : "", active: false, aria: "" };
        } else if (kind === "singly") {
            end = { label: "TERMINAL", text: "NULL", arrow: last.next === null ? "→" : "", active: false, aria: "" };
        } else if (last.next === null) {
            end = { label: "RING OPEN", text: "NULL", arrow: "→", active: Boolean(step.wrap),
                aria: `tail.next is NULL while the ring is open` };
        } else {
            const home = last.next === snap.head;
            end = {
                label: home ? "BACK TO HEAD" : "TAIL.NEXT",
                text: `↺ ${last.next}`,
                arrow: "→",
                active: Boolean(step.wrap),
                aria: home ? `tail.next points back to head ${last.next}` : `${last.address}.next points at ${last.next}`,
            };
        }
    }

    const removing = REMOVING.has(step.type);
    return {
        empty: nodes.length === 0,
        start,
        items,
        end,
        detached: detachedRaw.map((n) => nodeView(n, { detached: true })),
        detachedLabel: detachedRaw.length ? (removing ? "Unlinked (nothing points at it):" : "Not in the chain yet:") : "",
        changes: changes.filter((c) => POINTER_FIELDS.has(c.field) || c.field === "value").map(describeChange),
    };
}

function fieldView(name, value, change) {
    return change ? { name, value, from: change.from } : { name, value };
}

/** Running totals up to and including step `index`: walk visits, comparisons, pointer writes. */
export function countUpTo(steps, index) {
    const out = { visits: 0, comparisons: 0, writes: 0 };
    for (let i = 0; i <= index && i < steps.length; i++) {
        const s = steps[i];
        if (s.type === "visit") out.visits++;
        if (s.type === "compare") out.comparisons++;
        out.writes += (s.changes ?? []).filter((c) => c.field !== "value").length;
    }
    return out;
}

/* ---------------- DOM painter ---------------- */

/**
 * @param {{ chain: HTMLElement, detached: HTMLElement, changes: HTMLElement }} els
 * @param {{ kind: "singly"|"doubly"|"circular", emptyClass?: string, reduceMotion?: () => boolean, doc?: Document }} opts
 */
export function createListRenderer(els, { kind, emptyClass = "text-muted text-italic", reduceMotion = () => false, doc = document } = {}) {
    /** @type {Map<string, HTMLElement>} */
    let boxes = new Map();

    const el = (tag, className, text) => {
        const e = doc.createElement(tag);
        if (className) e.className = className;
        if (text !== undefined) e.textContent = text;
        return e;
    };

    function paintBox(box, v) {
        box.className = ["node-box", "ll-node", v.tone, v.detached ? "ll-node-detached" : "", v.removed ? "ll-node-removed" : ""].filter(Boolean).join(" ");
        const parts = [];
        if (v.cursors.length) {
            const tags = el("div", "ll-cursors");
            tags.append(...v.cursors.map((c) => el("span", "ll-cursor", `${c} ↓`)));
            parts.push(tags);
        }
        if (v.role) parts.push(el("span", "slot-label slot-label-active", v.role));
        parts.push(el("div", "mono text-muted", v.address));
        const field = (f) => {
            const row = el("div", "mono text-secondary");
            if (f.from === undefined) { row.textContent = `${f.name}: ${show(f.value)}`; return row; }
            row.classList.add("ll-field-changed");
            row.append(`${f.name}: `, el("del", "ll-old", show(f.from)), " → ", el("ins", "ll-new", show(f.value)));
            return row;
        };
        const valueEl = el("strong", "mono");
        if (v.valueFrom === undefined) valueEl.textContent = String(v.value);
        else valueEl.append(el("del", "ll-old", String(v.valueFrom)), " → ", el("ins", "ll-new", String(v.value)));
        if (v.fields.length === 2) parts.push(field(v.fields[0]), valueEl, field(v.fields[1]));
        else parts.push(valueEl, field(v.fields[0]));
        box.replaceChildren(...parts);
        box.setAttribute("aria-label", v.aria);
    }

    function link(item) {
        const wrap = el("span", "arrow ll-link" + (item.changed ? " ll-link-changed" : "") + (item.prev === null ? "" : " ll-link-double"));
        wrap.setAttribute("aria-hidden", "true");
        if (item.prev === null) {
            wrap.textContent = item.next || "·";
            if (!item.next) wrap.classList.add("ll-link-none");
            return wrap;
        }
        const next = el("span", "ll-link-row", item.next || "·");
        const prev = el("span", "ll-link-row", item.prev || "·");
        if (!item.next) next.classList.add("ll-link-none");
        if (!item.prev) prev.classList.add("ll-link-none");
        wrap.append(next, prev);
        return wrap;
    }

    function cap(c) {
        const box = el("div", "node-box car-empty" + (c.active ? " ht-tone-compare" : ""));
        if (c.label) box.append(el("span", "slot-label", c.label));
        box.append(el("strong", "mono", c.text));
        if (c.aria) box.setAttribute("aria-label", c.aria);
        else box.setAttribute("aria-hidden", "true");
        return box;
    }

    function arrow(symbol) {
        const a = el("span", "arrow ll-link", symbol);
        a.setAttribute("aria-hidden", "true");
        return a;
    }

    function clear() {
        boxes = new Map();
        els.chain.replaceChildren(el("span", emptyClass, "List is empty"));
        els.detached.replaceChildren();
        els.detached.hidden = true;
        els.changes.textContent = "";
        els.changes.hidden = true;
    }

    function render(step) {
        const view = listView(step, kind);
        const animate = !reduceMotion();
        const before = new Map();
        if (animate) for (const [key, box] of boxes) if (box.isConnected) before.set(key, box.getBoundingClientRect());

        const next = new Map();
        const take = (v) => {
            let key = v.address;
            while (next.has(key)) key += "#";   // a replaced node can share its address with the new one for one frame
            const box = boxes.get(key) ?? el("div", "node-box");
            next.set(key, box);
            paintBox(box, v);
            return box;
        };

        if (view.empty) {
            els.chain.replaceChildren(el("span", emptyClass, "List is empty"));
        } else {
            const out = [];
            if (view.start) { out.push(cap(view.start)); if (view.start.arrow) out.push(arrow(view.start.arrow)); }
            for (const item of view.items) out.push(item.kind === "node" ? take(item) : link(item));
            if (view.end) { if (view.end.arrow) out.push(arrow(view.end.arrow)); out.push(cap(view.end)); }
            els.chain.replaceChildren(...out);
        }
        if (view.detached.length) {
            els.detached.replaceChildren(el("span", "ll-detached-label", view.detachedLabel), ...view.detached.map(take));
            els.detached.hidden = false;
        } else {
            els.detached.replaceChildren();
            els.detached.hidden = true;
        }
        els.changes.textContent = view.changes.length ? `Pointers written this step: ${view.changes.join(" · ")}` : "";
        els.changes.hidden = view.changes.length === 0;
        boxes = next;

        // FLIP: a node that kept its element but changed place slides from where it was.
        if (animate) {
            for (const [key, box] of next) {
                const old = before.get(key);
                if (!old || typeof box.animate !== "function") continue;
                const now = box.getBoundingClientRect();
                const dx = old.left - now.left;
                const dy = old.top - now.top;
                if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
                box.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 280, easing: "ease-out" });
            }
        }
        return view;
    }

    return { mount: (step) => (step ? render(step) : clear()), render, clear };
}
