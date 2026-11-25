/**
 * Shared result helpers for data-structure modules.
 * Every mutating operation returns { ok, value?, error?, steps }.
 * A step is { type, indices, message, snapshot } where snapshot is plain data.
 */
export const ok = (value, steps = []) => ({ ok: true, value, steps });
export const fail = (error, steps = []) => ({ ok: false, error, steps });

/** Throws RangeError unless n is an integer in [min, max]. Used by constructors only. */
export function assertCapacity(n, min, max, name) {
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new RangeError(`${name} capacity must be an integer from ${min} to ${max} (got ${n})`);
    }
}

export function assertValue(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new TypeError(`Value must be a finite number (got ${v})`);
}
