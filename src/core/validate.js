/**
 * Shared input parsing for page controllers. DOM-free and unit-tested.
 * Returns values instead of throwing so pages can show inline messages.
 */

/**
 * Parse one whole number typed by a user.
 * Rejects empty input, decimals, words, leading zeros ("007") and out-of-range values.
 * @param {unknown} text
 * @param {{ min?: number, max?: number, label?: string }} [opts]
 * @returns {{ ok: true, value: number } | { ok: false, error: string }}
 */
export function parseInteger(text, { min = -Infinity, max = Infinity, label = "Value" } = {}) {
    const raw = String(text ?? "").trim();
    if (raw === "") return { ok: false, error: `${label} is required.` };
    if (!/^-?\d+$/.test(raw)) return { ok: false, error: `${label} must be a whole number (got "${raw}").` };
    if (/^-?0\d/.test(raw)) return { ok: false, error: `${label} should not start with 0 (write ${Number(raw)} instead).` };
    const value = Number(raw);
    if (value < min || value > max) {
        const range = max === Infinity ? `at least ${min}` : min === -Infinity ? `at most ${max}` : `between ${min} and ${max}`;
        return { ok: false, error: `${label} must be ${range}.` };
    }
    return { ok: true, value };
}
