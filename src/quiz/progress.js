/**
 * Quiz progress store. DOM-free; storage is injected so it can be tested with a fake
 * and so the app keeps working when localStorage is missing (private mode), full,
 * or holds corrupt data. No method ever throws.
 *
 * The whole state lives under ONE key as JSON:
 *   { version: 1,
 *     banks:   { [bankId]: { attempts: [{ score, total, percent, date, hintsUsed }] } },
 *     lessons: { [lessonId]: date | null } }
 *
 * State is always kept in memory as well, so within one page load progress works
 * even when nothing can be saved; `persistent` tells the page whether it was saved.
 *
 * Dates are supplied by the caller (recordAttempt's `date`) or by an injected
 * `clock` function; this module never reads the system time itself.
 */

export const DEFAULT_KEY = "ursac-dsa-progress";
export const MAX_ATTEMPTS_KEPT = 50;

/**
 * Best-effort access to globalThis.localStorage. Reading the property itself can throw
 * (Safari private mode, sandboxed iframes, cookies blocked), so it is wrapped.
 * @returns {Storage | null}
 */
export function getDefaultStorage() {
    try {
        const s = globalThis.localStorage;
        return s && typeof s.getItem === "function" && typeof s.setItem === "function" ? s : null;
    } catch {
        return null;
    }
}

const emptyState = (version) => ({ version, banks: {}, lessons: {} });
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const validDate = (d) => (typeof d === "string" && d !== "") || (typeof d === "number" && Number.isFinite(d));

function cleanAttempt(a) {
    if (!isPlainObject(a)) return null;
    const { score, total } = a;
    if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(score) || score < 0 || score > total) return null;
    return {
        score, total,
        percent: Math.round((score / total) * 100),
        date: validDate(a.date) ? a.date : null,
        hintsUsed: Number.isInteger(a.hintsUsed) && a.hintsUsed >= 0 ? a.hintsUsed : 0,
    };
}

/** Keep only well-formed parts of a parsed state; anything odd is dropped, not trusted. */
function sanitize(raw, version) {
    const state = emptyState(version);
    if (isPlainObject(raw.banks)) {
        for (const [id, bank] of Object.entries(raw.banks)) {
            if (!isPlainObject(bank) || !Array.isArray(bank.attempts)) continue;
            const attempts = bank.attempts.map(cleanAttempt).filter(Boolean).slice(-MAX_ATTEMPTS_KEPT);
            state.banks[id] = { attempts };
        }
    }
    if (isPlainObject(raw.lessons)) {
        for (const [id, date] of Object.entries(raw.lessons)) state.lessons[id] = validDate(date) ? date : null;
    }
    return state;
}

/**
 * @param {Storage | null | undefined} storage  anything with getItem/setItem (removeItem optional)
 * @param {{ key?: string, version?: number, clock?: () => (string|number),
 *           migrations?: Record<number, (old: object) => object> }} [opts]
 *   migrations[n] upgrades a version-n state to version n + 1.
 */
export function createProgressStore(storage, { key = DEFAULT_KEY, version = 1, clock = null, migrations = {} } = {}) {
    /** True while the last read/write to storage worked. */
    let persistent = false;
    /** Why the store fell back, for a page to show (null when all is well). */
    let problem = null;

    function read() {
        if (!storage) { problem = "unavailable"; return null; }
        try {
            const text = storage.getItem(key);
            persistent = true;
            return text;
        } catch {
            problem = "unavailable";
            return null;
        }
    }

    function write(state) {
        if (!storage) { persistent = false; problem = "unavailable"; return false; }
        try {
            storage.setItem(key, JSON.stringify(state));
            persistent = true;
            problem = null;
            return true;
        } catch (e) {
            persistent = false;
            problem = e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014) ? "quota" : "unavailable";
            return false;
        }
    }

    /** Copy unreadable data aside once before it gets overwritten, so nothing is lost silently. */
    function backup(text) {
        try { storage.setItem(`${key}:backup`, text); } catch { /* best effort */ }
    }

    function load() {
        const text = read();
        if (text === null || text === undefined) return emptyState(version);
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = undefined; }
        if (!isPlainObject(parsed)) { problem = "corrupt"; backup(text); return emptyState(version); }

        let v = parsed.version;
        let data = parsed;
        if (v === version) return sanitize(data, version);
        if (Number.isInteger(v) && v < version) {
            try {
                while (v < version) {
                    const step = migrations[v];
                    if (typeof step !== "function") throw new Error(`no migration from v${v}`);
                    data = step(data);
                    v++;
                }
                if (isPlainObject(data)) return sanitize(data, version);
            } catch { /* fall through to reset */ }
        }
        // Unknown, newer or unmigratable version: start fresh but keep a copy of the old data.
        problem = "version";
        backup(text);
        return emptyState(version);
    }

    let state = load();
    const now = () => {
        if (typeof clock !== "function") return null;
        try { const d = clock(); return validDate(d) ? d : null; } catch { return null; }
    };
    const bankOf = (id) => state.banks[id]?.attempts ?? [];

    const store = {
        get persistent() { return persistent; },
        /** null | "unavailable" | "quota" | "corrupt" | "version" */
        get problem() { return problem; },

        /**
         * Record a finished quiz. `score` is the number correct out of `total`.
         * @returns {{ ok: true, saved: boolean, attempt: object } | { ok: false, error: string }}
         */
        recordAttempt(bankId, { score, total, date, hintsUsed = 0 } = {}) {
            if (typeof bankId !== "string" || bankId === "") return { ok: false, error: "bankId must be a non-empty string" };
            const attempt = cleanAttempt({ score, total, hintsUsed, date: date ?? now() });
            if (!attempt) return { ok: false, error: "score and total must be whole numbers with 0 ≤ score ≤ total and total > 0" };
            const attempts = bankOf(bankId).concat(attempt).slice(-MAX_ATTEMPTS_KEPT);
            state = { ...state, banks: { ...state.banks, [bankId]: { attempts } } };
            return { ok: true, saved: write(state), attempt: { ...attempt } };
        },

        /** Best attempt by percent (ties: the earlier one), or null if never attempted. */
        bestScore(bankId) {
            let best = null;
            for (const a of bankOf(bankId)) if (!best || a.percent > best.percent) best = a;
            return best ? { ...best } : null;
        },

        /** Copies of all kept attempts, oldest first. */
        attempts(bankId) { return bankOf(bankId).map((a) => ({ ...a })); },

        lastAttempt(bankId) { const list = bankOf(bankId); return list.length ? { ...list[list.length - 1] } : null; },

        /** Mastered when the best attempt reaches `threshold` percent (default 80). */
        isMastered(bankId, threshold = 80) { const b = store.bestScore(bankId); return b !== null && b.percent >= threshold; },

        markLessonViewed(id, date) {
            if (typeof id !== "string" || id === "") return { ok: false, error: "lesson id must be a non-empty string" };
            const d = date ?? now();
            state = { ...state, lessons: { ...state.lessons, [id]: validDate(d) ? d : null } };
            return { ok: true, saved: write(state) };
        },

        hasViewedLesson(id) { return Object.prototype.hasOwnProperty.call(state.lessons, id); },

        /** Forget all progress (memory and storage). */
        reset() {
            state = emptyState(version);
            let saved = false;
            if (storage) {
                try {
                    if (typeof storage.removeItem === "function") storage.removeItem(key);
                    else storage.setItem(key, JSON.stringify(state));
                    saved = true;
                    persistent = true;
                    problem = null;
                } catch { persistent = false; }
            }
            return { ok: true, saved };
        },

        /** Deep copy of the whole state (JSON-safe), e.g. for a "download my progress" button. */
        export() { return JSON.parse(JSON.stringify(state)); },
    };
    return store;
}
