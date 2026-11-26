// Shared keyboard shortcuts for StepPlayer pages.
// Pure module: no document/window access at import time, so Node tests can import it.
//
// Mapping (identical to the per-page handlers it replaces):
//   Space      -> preventDefault + player.toggle()
//   ArrowRight -> player.pause() + player.next()
//   ArrowLeft  -> player.prev()
//   Home       -> player.reset()

const IGNORED_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A", "SUMMARY"]);
const IGNORED_ROLES = new Set(["button", "link", "checkbox", "switch", "tab", "menuitem", "slider", "option"]);

/**
 * Should a keydown event drive the player?
 * False when a modifier is held, Space auto-repeats, or focus is on a control
 * that owns the key itself (form fields, buttons, links, ARIA widgets).
 */
export function shouldHandlePlayerKey(event) {
    if (!event) return false;
    if (event.ctrlKey || event.altKey || event.metaKey) return false;
    if (event.repeat && event.key === " ") return false;

    const target = event.target;
    if (!target) return true;

    const tag = typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";
    if (IGNORED_TAGS.has(tag)) return false;
    if (target.isContentEditable) return false;

    const role = typeof target.getAttribute === "function" ? target.getAttribute("role") : null;
    if (typeof role === "string" && IGNORED_ROLES.has(role.trim().toLowerCase())) return false;

    return true;
}

/**
 * Attach the player shortcuts to `target` (usually `document`).
 * Returns a function that removes the listener.
 */
export function bindPlayerKeys(target, player) {
    const onKeyDown = (e) => {
        if (!shouldHandlePlayerKey(e)) return;
        if (e.key === " ") { e.preventDefault(); player.toggle(); }
        else if (e.key === "ArrowRight") { player.pause(); player.next(); }
        else if (e.key === "ArrowLeft") player.prev();
        else if (e.key === "Home") player.reset();
    };
    target.addEventListener("keydown", onKeyDown);
    return () => target.removeEventListener("keydown", onKeyDown);
}
