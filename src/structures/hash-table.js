import { ok, fail, assertCapacity } from "./result.js";
import { parseInteger } from "../core/validate.js";

/**
 * Pure, DOM-free Hash Table supporting two collision-resolution strategies:
 *   1. Separate Chaining ("chaining") — each bucket holds a chain of { key, value } entries.
 *   2. Linear Probing ("linear")      — open addressing in a fixed slot array with DELETED tombstones.
 *
 * Every operation executes on the real table and records snapshots per event so
 * the UI (StepPlayer) replays exact states rather than hand-scripted frames.
 *
 * Conventions:
 * - Integer keys (including 0 and negatives): h(k) = ((k mod m) + m) mod m ∈ [0, m - 1].
 * - Optional string values (null when omitted).
 * - Never returns -1 as a sentinel; missing indices are null.
 * - Snapshots and returned entries are always deep copies.
 */

export const KEY_LIMITS = { min: -9999, max: 9999 };
export const VALUE_MAX_LENGTH = 24;

export const HASH_STRATEGIES = {
    chaining: {
        name: "Separate Chaining",
        summary: "Each bucket holds a linked chain of entries that hash to the same index. Collisions append to the bucket's chain, avoiding primary clustering and fixed-slot overflow.",
        complexity: {
            insertAvg: "O(1 + α)",
            searchAvg: "O(1 + α)",
            deleteAvg: "O(1 + α)",
            worst: "O(n)",
            space: "O(n + m)",
            loadFactor: "α = n / m (may exceed 1; rehash around α > 1.0)",
        },
        pseudocode: {
            insert: [
                "idx ← ((key mod m) + m) mod m",
                "for node in buckets[idx]",
                "    if node.key = key:  node.value ← value;  return updated",
                "append (key, value) to buckets[idx];  size ← size + 1",
            ],
            search: [
                "idx ← ((key mod m) + m) mod m",
                "for node in buckets[idx]",
                "    if node.key = key:  return found (node)",
                "return not found",
            ],
            delete: [
                "idx ← ((key mod m) + m) mod m",
                "for node in buckets[idx]",
                "    if node.key = key:  remove node;  size ← size − 1;  return removed",
                "return not found",
            ],
            rehash: [
                "entries ← collect all live (key, value) pairs",
                "buckets ← array of newM empty chains;  size ← 0",
                "for (key, value) in entries",
                "    idx ← ((key mod newM) + newM) mod newM;  append to buckets[idx]",
            ],
        },
    },
    linear: {
        name: "Linear Probing",
        summary: "Open addressing: every entry lives directly inside the slot array. On collision at h(k), probe (h(k) + 1) mod m, (h(k) + 2) mod m, … until an empty slot is found. Deletions leave a DELETED tombstone so later probe chains remain reachable.",
        complexity: {
            insertAvg: "O(1 / (1 − α))",
            searchAvg: "O(1 / (1 − α))",
            deleteAvg: "O(1 / (1 − α))",
            worst: "O(n)",
            space: "O(m)",
            loadFactor: "α = n / m ≤ 1 (rehash around α > 0.7 to limit clustering)",
        },
        pseudocode: {
            insert: [
                "home ← ((key mod m) + m) mod m;  firstDel ← null",
                "for i ← 0 to m − 1:  idx ← (home + i) mod m",
                "    if slot[idx] is OCCUPIED and slot[idx].key = key:  update value;  return",
                "    if slot[idx] is DELETED and firstDel = null:  firstDel ← idx",
                "    if slot[idx] is EMPTY:  break",
                "target ← firstDel ?? emptyIdx;  if target ≠ null:  place at target;  return",
                "return table full (overflow)",
            ],
            search: [
                "home ← ((key mod m) + m) mod m",
                "for i ← 0 to m − 1:  idx ← (home + i) mod m",
                "    if slot[idx] is EMPTY:  return not found",
                "    if slot[idx] is DELETED:  continue   (skip tombstone)",
                "    if slot[idx].key = key:  return found (idx)",
                "return not found",
            ],
            delete: [
                "home ← ((key mod m) + m) mod m",
                "for i ← 0 to m − 1:  idx ← (home + i) mod m",
                "    if slot[idx] is EMPTY:  return not found",
                "    if slot[idx] is DELETED:  continue   (skip tombstone)",
                "    if slot[idx].key = key:  slot[idx] ← DELETED;  size ← size − 1;  return",
                "return not found",
            ],
            rehash: [
                "entries ← collect all OCCUPIED (key, value) pairs (discard tombstones)",
                "slots ← array of newM EMPTY slots;  size ← 0;  tombstones ← 0",
                "for (key, value) in entries",
                "    probe from ((key mod newM) + newM) mod newM and place (key, value)",
            ],
        },
    },
};

function assertIntegerKey(key) {
    if (typeof key !== "number" || !Number.isInteger(key)) {
        throw new TypeError(`Hash table key must be an integer (got ${key})`);
    }
}

function normalizeValue(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        throw new TypeError(`Hash table value must be a string, number, boolean, or null (got ${typeof value})`);
    }
    const text = String(value).trim();
    return text === "" ? null : text;
}

function formatEntry(key, value) {
    return value === null ? `${key}` : `${key}: "${value}"`;
}

function formatHashFormula(key, capacity, home) {
    return key >= 0
        ? `h(${key}) = ${key} mod ${capacity} = ${home}`
        : `h(${key}) = ((${key} mod ${capacity}) + ${capacity}) mod ${capacity} = ${home}`;
}

/**
 * Mathematical non-negative modulo hash: always in [0, capacity - 1], even for negative keys.
 */
export function hashKey(key, capacity) {
    assertIntegerKey(key);
    assertCapacity(capacity, HashTable.MIN_CAPACITY, HashTable.MAX_CAPACITY, "Hash table");
    return ((key % capacity) + capacity) % capacity;
}

export class HashTable {
    static MIN_CAPACITY = 3;
    static MAX_CAPACITY = 19;
    static DEFAULT_CAPACITY = 7;

    /**
     * @param {number} [capacity=7]
     * @param {{ strategy?: "chaining" | "linear" }} [opts]
     */
    constructor(capacity = HashTable.DEFAULT_CAPACITY, { strategy = "chaining" } = {}) {
        assertCapacity(capacity, HashTable.MIN_CAPACITY, HashTable.MAX_CAPACITY, "Hash table");
        if (!Object.prototype.hasOwnProperty.call(HASH_STRATEGIES, strategy)) {
            throw new RangeError(`Unknown hash table strategy: ${strategy}`);
        }
        this.strategy = strategy;
        this.capacity = capacity;
        this._initStorage(capacity);
    }

    _initStorage(capacity) {
        this.capacity = capacity;
        this._size = 0;
        this._tombstones = 0;
        this._totalCollisions = 0;
        if (this.strategy === "chaining") {
            this.buckets = Array.from({ length: capacity }, () => []);
            this.slots = null;
        } else {
            this.buckets = null;
            this.slots = Array.from({ length: capacity }, () => ({ state: "empty", key: null, value: null }));
        }
    }

    get size() { return this._size; }
    get tombstones() { return this._tombstones; }
    get totalCollisions() { return this._totalCollisions; }
    get loadFactor() { return this._size / this.capacity; }
    isEmpty() { return this._size === 0; }
    isFull() { return this.strategy === "linear" && this._size === this.capacity; }

    /** Plain deep-cloned snapshot safe for StepPlayer replay and external inspection. */
    snapshot() {
        return {
            strategy: this.strategy,
            capacity: this.capacity,
            size: this._size,
            loadFactor: this._size / this.capacity,
            tombstones: this._tombstones,
            totalCollisions: this._totalCollisions,
            buckets: this.strategy === "chaining"
                ? this.buckets.map(chain => chain.map(e => ({ key: e.key, value: e.value })))
                : null,
            slots: this.strategy === "linear"
                ? this.slots.map(s => ({ state: s.state, key: s.key, value: s.value }))
                : null,
        };
    }

    /** Returns deep copies of all stored { key, value } entries in table order. */
    entries() {
        const out = [];
        if (this.strategy === "chaining") {
            for (const chain of this.buckets) {
                for (const entry of chain) out.push({ key: entry.key, value: entry.value });
            }
        } else {
            for (const slot of this.slots) {
                if (slot.state === "occupied") out.push({ key: slot.key, value: slot.value });
            }
        }
        return out;
    }

    _step(steps, {
        type,
        operation,
        indices = [],
        homeIndex = null,
        chainIndex = null,
        key = null,
        line = 1,
        message = "",
        probes = 0,
    }) {
        steps.push({
            type,
            operation,
            indices: indices.slice(),
            homeIndex,
            chainIndex,
            key,
            line,
            message,
            probes,
            snapshot: this.snapshot(),
        });
    }

    /** Side-effect-free lookup helper returning { found, key, value, bucket }. */
    get(key) {
        assertIntegerKey(key);
        const home = hashKey(key, this.capacity);
        if (this.strategy === "chaining") {
            const chain = this.buckets[home];
            for (let j = 0; j < chain.length; j++) {
                if (chain[j].key === key) {
                    return { found: true, key, value: chain[j].value, bucket: home, chainIndex: j };
                }
            }
            return { found: false, key, value: null, bucket: null, chainIndex: null };
        }
        for (let i = 0; i < this.capacity; i++) {
            const idx = (home + i) % this.capacity;
            const slot = this.slots[idx];
            if (slot.state === "empty") return { found: false, key, value: null, bucket: null, chainIndex: null };
            if (slot.state === "occupied" && slot.key === key) {
                return { found: true, key, value: slot.value, bucket: idx, chainIndex: null };
            }
        }
        return { found: false, key, value: null, bucket: null, chainIndex: null };
    }

    has(key) { return this.get(key).found; }

    /**
     * Insert a new (key, value) pair or update the value if `key` already exists.
     */
    insert(key, value = null) {
        assertIntegerKey(key);
        const val = normalizeValue(value);
        return this.strategy === "chaining"
            ? this._insertChaining(key, val)
            : this._insertLinear(key, val);
    }

    _insertChaining(key, value) {
        const steps = [];
        const idx = hashKey(key, this.capacity);
        const chain = this.buckets[idx];
        let probes = 0;

        this._step(steps, {
            type: "hash",
            operation: "insert",
            indices: [idx],
            homeIndex: idx,
            key,
            line: 1,
            probes,
            message: `Insert ${formatEntry(key, value)}: compute ${formatHashFormula(key, this.capacity, idx)}. Inspect bucket ${idx}.`,
        });

        for (let j = 0; j < chain.length; j++) {
            probes++;
            const existing = chain[j];
            const match = existing.key === key;
            this._step(steps, {
                type: "probe",
                operation: "insert",
                indices: [idx],
                homeIndex: idx,
                chainIndex: j,
                key,
                line: 2,
                probes,
                message: `Compare key ${key} with bucket ${idx} node ${j} (key ${existing.key}): ${match ? "match — update existing entry." : "different key, advance along chain."}`,
            });
            if (match) {
                const prevValue = existing.value;
                existing.value = value;
                this._step(steps, {
                    type: "update",
                    operation: "insert",
                    indices: [idx],
                    homeIndex: idx,
                    chainIndex: j,
                    key,
                    line: 3,
                    probes,
                    message: `Updated key ${key} in bucket ${idx} (node ${j}): ${formatEntry(key, prevValue)} → ${formatEntry(key, value)}. Size stays ${this._size}.`,
                });
                return ok({ key, value, bucket: idx, chainIndex: j, updated: true, collision: false, probes }, steps);
            }
        }

        const hadCollision = chain.length > 0;
        if (hadCollision) this._totalCollisions++;
        chain.push({ key, value });
        this._size++;
        const newChainIdx = chain.length - 1;

        this._step(steps, {
            type: "insert",
            operation: "insert",
            indices: [idx],
            homeIndex: idx,
            chainIndex: newChainIdx,
            key,
            line: 4,
            probes,
            message: hadCollision
                ? `Collision at bucket ${idx}: appended ${formatEntry(key, value)} to chain (now ${chain.length} nodes). Load factor α = ${this._size}/${this.capacity} = ${this.loadFactor.toFixed(2)}.`
                : `Bucket ${idx} was empty: inserted ${formatEntry(key, value)} at chain index 0. Load factor α = ${this._size}/${this.capacity} = ${this.loadFactor.toFixed(2)}.`,
        });

        return ok({ key, value, bucket: idx, chainIndex: newChainIdx, updated: false, collision: hadCollision, probes }, steps);
    }

    _insertLinear(key, value) {
        const steps = [];
        const home = hashKey(key, this.capacity);
        let probes = 0;
        let firstTombstone = null;
        let emptyIdx = null;
        let sawCollision = false;

        this._step(steps, {
            type: "hash",
            operation: "insert",
            indices: [home],
            homeIndex: home,
            key,
            line: 1,
            probes,
            message: `Insert ${formatEntry(key, value)}: compute ${formatHashFormula(key, this.capacity, home)}. Start linear probing at slot ${home}.`,
        });

        for (let i = 0; i < this.capacity; i++) {
            const idx = (home + i) % this.capacity;
            const slot = this.slots[idx];
            probes++;

            if (slot.state === "occupied") {
                if (slot.key === key) {
                    const prevValue = slot.value;
                    slot.value = value;
                    this._step(steps, {
                        type: "update",
                        operation: "insert",
                        indices: [idx],
                        homeIndex: home,
                        key,
                        line: 3,
                        probes,
                        message: `Slot ${idx} already holds key ${key}: updated ${formatEntry(key, prevValue)} → ${formatEntry(key, value)}. Size stays ${this._size}.`,
                    });
                    return ok({ key, value, bucket: idx, updated: true, collision: false, reusedTombstone: false, probes }, steps);
                }
                sawCollision = true;
                const nextIdx = (idx + 1) % this.capacity;
                const wrapped = nextIdx < idx;
                this._step(steps, {
                    type: "probe",
                    operation: "insert",
                    indices: [idx],
                    homeIndex: home,
                    key,
                    line: 2,
                    probes,
                    message: `Collision at slot ${idx} (occupied by key ${slot.key} ≠ ${key}). Probe next slot (${idx} + 1) mod ${this.capacity} = ${nextIdx}${wrapped ? " (wrapped around)" : ""}.`,
                });
            } else if (slot.state === "deleted") {
                const isFirst = firstTombstone === null;
                if (isFirst) firstTombstone = idx;
                this._step(steps, {
                    type: "probe",
                    operation: "insert",
                    indices: [idx],
                    homeIndex: home,
                    key,
                    line: 4,
                    probes,
                    message: isFirst
                        ? `Slot ${idx} is a DELETED tombstone — remember it as the first reusable slot, but keep probing in case key ${key} already exists further along.`
                        : `Slot ${idx} is also a DELETED tombstone — keep probing until an EMPTY slot confirms key ${key} is new.`,
                });
            } else {
                emptyIdx = idx;
                this._step(steps, {
                    type: "probe",
                    operation: "insert",
                    indices: [idx],
                    homeIndex: home,
                    key,
                    line: 5,
                    probes,
                    message: firstTombstone !== null
                        ? `Reached EMPTY slot ${idx}: key ${key} is not in the table, so reuse the earlier tombstone at slot ${firstTombstone}.`
                        : `Slot ${idx} is EMPTY — ready to place ${formatEntry(key, value)}.`,
                });
                break;
            }
        }

        const targetIdx = firstTombstone !== null ? firstTombstone : emptyIdx;
        if (targetIdx === null) {
            const error = `Hash table is full (${this._size}/${this.capacity} slots occupied): cannot insert key ${key}. Rehash to a larger size first.`;
            this._step(steps, {
                type: "overflow",
                operation: "insert",
                indices: [],
                homeIndex: home,
                key,
                line: 7,
                probes,
                message: error,
            });
            return fail(error, steps);
        }

        const reusedTombstone = firstTombstone !== null;
        if (reusedTombstone) this._tombstones--;
        if (sawCollision) this._totalCollisions++;

        this.slots[targetIdx] = { state: "occupied", key, value };
        this._size++;

        const offset = (targetIdx - home + this.capacity) % this.capacity;
        this._step(steps, {
            type: "insert",
            operation: "insert",
            indices: [targetIdx],
            homeIndex: home,
            key,
            line: 6,
            probes,
            message: reusedTombstone
                ? `Placed ${formatEntry(key, value)} into recycled tombstone slot ${targetIdx} (offset +${offset} from home ${home}). α = ${this._size}/${this.capacity} = ${this.loadFactor.toFixed(2)}.`
                : offset === 0
                    ? `Placed ${formatEntry(key, value)} directly at home slot ${targetIdx}. α = ${this._size}/${this.capacity} = ${this.loadFactor.toFixed(2)}.`
                    : `Placed ${formatEntry(key, value)} at slot ${targetIdx} after ${offset} probe step${offset === 1 ? "" : "s"} from home ${home}. α = ${this._size}/${this.capacity} = ${this.loadFactor.toFixed(2)}.`,
        });

        return ok({ key, value, bucket: targetIdx, updated: false, collision: sawCollision, reusedTombstone, probes }, steps);
    }

    /**
     * Search for `key` and record every hash/probe step.
     * Always returns ok({ found, key, value, bucket, chainIndex, probes }, steps).
     */
    search(key) {
        assertIntegerKey(key);
        return this.strategy === "chaining"
            ? this._searchChaining(key)
            : this._searchLinear(key);
    }

    _searchChaining(key) {
        const steps = [];
        const idx = hashKey(key, this.capacity);
        const chain = this.buckets[idx];
        let probes = 0;

        this._step(steps, {
            type: "hash",
            operation: "search",
            indices: [idx],
            homeIndex: idx,
            key,
            line: 1,
            probes,
            message: `Search key ${key}: compute ${formatHashFormula(key, this.capacity, idx)}. Scan bucket ${idx} (${chain.length} node${chain.length === 1 ? "" : "s"}).`,
        });

        for (let j = 0; j < chain.length; j++) {
            probes++;
            const entry = chain[j];
            const match = entry.key === key;
            this._step(steps, {
                type: "probe",
                operation: "search",
                indices: [idx],
                homeIndex: idx,
                chainIndex: j,
                key,
                line: 2,
                probes,
                message: `Compare target ${key} with bucket ${idx} node ${j} (key ${entry.key}): ${match ? "match!" : "not equal, follow next pointer."}`,
            });
            if (match) {
                this._step(steps, {
                    type: "found",
                    operation: "search",
                    indices: [idx],
                    homeIndex: idx,
                    chainIndex: j,
                    key,
                    line: 3,
                    probes,
                    message: `Found ${formatEntry(key, entry.value)} at bucket ${idx}, chain index ${j} after ${probes} probe${probes === 1 ? "" : "s"}.`,
                });
                return ok({ found: true, key, value: entry.value, bucket: idx, chainIndex: j, probes }, steps);
            }
        }

        this._step(steps, {
            type: "not-found",
            operation: "search",
            indices: [idx],
            homeIndex: idx,
            key,
            line: 4,
            probes,
            message: chain.length === 0
                ? `Bucket ${idx} is empty: key ${key} is not in the hash table.`
                : `Reached the end of bucket ${idx}'s chain after ${probes} probe${probes === 1 ? "" : "s"}: key ${key} is not in the table.`,
        });
        return ok({ found: false, key, value: null, bucket: null, chainIndex: null, probes }, steps);
    }

    _searchLinear(key) {
        const steps = [];
        const home = hashKey(key, this.capacity);
        let probes = 0;

        this._step(steps, {
            type: "hash",
            operation: "search",
            indices: [home],
            homeIndex: home,
            key,
            line: 1,
            probes,
            message: `Search key ${key}: compute ${formatHashFormula(key, this.capacity, home)}. Start probing at slot ${home}.`,
        });

        for (let i = 0; i < this.capacity; i++) {
            const idx = (home + i) % this.capacity;
            const slot = this.slots[idx];
            probes++;

            if (slot.state === "empty") {
                this._step(steps, {
                    type: "not-found",
                    operation: "search",
                    indices: [idx],
                    homeIndex: home,
                    key,
                    line: 3,
                    probes,
                    message: `Slot ${idx} is EMPTY (never occupied): key ${key} cannot appear further along the probe sequence (${probes} probe${probes === 1 ? "" : "s"}).`,
                });
                return ok({ found: false, key, value: null, bucket: null, chainIndex: null, probes }, steps);
            }

            if (slot.state === "deleted") {
                this._step(steps, {
                    type: "probe",
                    operation: "search",
                    indices: [idx],
                    homeIndex: home,
                    key,
                    line: 4,
                    probes,
                    message: `Slot ${idx} is a DELETED tombstone — do not stop! Continue probing to (${idx} + 1) mod ${this.capacity} = ${(idx + 1) % this.capacity}.`,
                });
                continue;
            }

            const match = slot.key === key;
            this._step(steps, {
                type: match ? "found" : "probe",
                operation: "search",
                indices: [idx],
                homeIndex: home,
                key,
                line: 5,
                probes,
                message: match
                    ? `Found ${formatEntry(key, slot.value)} at slot ${idx} after ${probes} probe${probes === 1 ? "" : "s"}.`
                    : `Slot ${idx} holds key ${slot.key} ≠ ${key}. Probe next slot (${idx} + 1) mod ${this.capacity} = ${(idx + 1) % this.capacity}.`,
            });
            if (match) {
                return ok({ found: true, key, value: slot.value, bucket: idx, chainIndex: null, probes }, steps);
            }
        }

        this._step(steps, {
            type: "not-found",
            operation: "search",
            indices: [],
            homeIndex: home,
            key,
            line: 6,
            probes,
            message: `Checked all ${this.capacity} slots without finding key ${key}.`,
        });
        return ok({ found: false, key, value: null, bucket: null, chainIndex: null, probes }, steps);
    }

    /**
     * Delete `key` from the table. Fails with a readable message (and steps) if absent.
     */
    delete(key) {
        assertIntegerKey(key);
        return this.strategy === "chaining"
            ? this._deleteChaining(key)
            : this._deleteLinear(key);
    }

    _deleteChaining(key) {
        const steps = [];
        const idx = hashKey(key, this.capacity);
        const chain = this.buckets[idx];
        let probes = 0;

        this._step(steps, {
            type: "hash",
            operation: "delete",
            indices: [idx],
            homeIndex: idx,
            key,
            line: 1,
            probes,
            message: `Delete key ${key}: compute ${formatHashFormula(key, this.capacity, idx)}. Inspect bucket ${idx}.`,
        });

        for (let j = 0; j < chain.length; j++) {
            probes++;
            const entry = chain[j];
            const match = entry.key === key;
            this._step(steps, {
                type: "probe",
                operation: "delete",
                indices: [idx],
                homeIndex: idx,
                chainIndex: j,
                key,
                line: 2,
                probes,
                message: `Compare target ${key} with bucket ${idx} node ${j} (key ${entry.key}): ${match ? "match — unlink node from chain." : "different key, continue."}`,
            });
            if (match) {
                const [removed] = chain.splice(j, 1);
                this._size--;
                this._step(steps, {
                    type: "delete",
                    operation: "delete",
                    indices: [idx],
                    homeIndex: idx,
                    chainIndex: null,
                    key,
                    line: 3,
                    probes,
                    message: `Removed ${formatEntry(removed.key, removed.value)} from bucket ${idx}. Size is now ${this._size} (α = ${this.loadFactor.toFixed(2)}).`,
                });
                return ok({ key: removed.key, value: removed.value, bucket: idx, probes }, steps);
            }
        }

        const error = `Key ${key} was not found in bucket ${idx}, so nothing was deleted.`;
        this._step(steps, {
            type: "not-found",
            operation: "delete",
            indices: [idx],
            homeIndex: idx,
            key,
            line: 4,
            probes,
            message: error,
        });
        return fail(error, steps);
    }

    _deleteLinear(key) {
        const steps = [];
        const home = hashKey(key, this.capacity);
        let probes = 0;

        this._step(steps, {
            type: "hash",
            operation: "delete",
            indices: [home],
            homeIndex: home,
            key,
            line: 1,
            probes,
            message: `Delete key ${key}: compute ${formatHashFormula(key, this.capacity, home)}. Start probing at slot ${home}.`,
        });

        for (let i = 0; i < this.capacity; i++) {
            const idx = (home + i) % this.capacity;
            const slot = this.slots[idx];
            probes++;

            if (slot.state === "empty") {
                const error = `Key ${key} was not found (stopped at EMPTY slot ${idx}).`;
                this._step(steps, {
                    type: "not-found",
                    operation: "delete",
                    indices: [idx],
                    homeIndex: home,
                    key,
                    line: 3,
                    probes,
                    message: error,
                });
                return fail(error, steps);
            }

            if (slot.state === "deleted") {
                this._step(steps, {
                    type: "probe",
                    operation: "delete",
                    indices: [idx],
                    homeIndex: home,
                    key,
                    line: 4,
                    probes,
                    message: `Slot ${idx} is a DELETED tombstone — skip it and keep probing.`,
                });
                continue;
            }

            if (slot.key === key) {
                const removed = { key: slot.key, value: slot.value };
                this.slots[idx] = { state: "deleted", key: null, value: null };
                this._size--;
                this._tombstones++;
                this._step(steps, {
                    type: "delete",
                    operation: "delete",
                    indices: [idx],
                    homeIndex: home,
                    key,
                    line: 5,
                    probes,
                    message: `Deleted ${formatEntry(removed.key, removed.value)} from slot ${idx} and left a DELETED tombstone so later probe chains stay intact. Size = ${this._size}, tombstones = ${this._tombstones}.`,
                });
                return ok({ key: removed.key, value: removed.value, bucket: idx, probes }, steps);
            }

            this._step(steps, {
                type: "probe",
                operation: "delete",
                indices: [idx],
                homeIndex: home,
                key,
                line: 5,
                probes,
                message: `Slot ${idx} holds key ${slot.key} ≠ ${key}. Probe next slot (${idx} + 1) mod ${this.capacity} = ${(idx + 1) % this.capacity}.`,
            });
        }

        const error = `Key ${key} was not found after checking all ${this.capacity} slots.`;
        this._step(steps, {
            type: "not-found",
            operation: "delete",
            indices: [],
            homeIndex: home,
            key,
            line: 6,
            probes,
            message: error,
        });
        return fail(error, steps);
    }

    /**
     * Reallocate the table to `newCapacity` (or same capacity to purge tombstones)
     * and re-insert every live entry with recorded steps.
     */
    rehash(newCapacity) {
        if (!Number.isInteger(newCapacity) || newCapacity < HashTable.MIN_CAPACITY || newCapacity > HashTable.MAX_CAPACITY) {
            return fail(`Table size must be an integer between ${HashTable.MIN_CAPACITY} and ${HashTable.MAX_CAPACITY}.`);
        }
        if (this.strategy === "linear" && newCapacity < this._size) {
            return fail(`Cannot shrink a Linear Probing table to ${newCapacity} while it holds ${this._size} entries. Delete entries or pick a size ≥ ${this._size}.`);
        }

        const oldCapacity = this.capacity;
        const oldTombstones = this._tombstones;
        const live = this.entries();
        const steps = [];

        this._step(steps, {
            type: "rehash",
            operation: "rehash",
            indices: [],
            line: 1,
            probes: 0,
            message: `Rehash (${oldCapacity} → ${newCapacity}): collected ${live.length} live entr${live.length === 1 ? "y" : "ies"}${oldTombstones > 0 ? ` and discarding ${oldTombstones} tombstone${oldTombstones === 1 ? "" : "s"}` : ""}.`,
        });

        this._initStorage(newCapacity);

        this._step(steps, {
            type: "rehash",
            operation: "rehash",
            indices: [],
            line: 2,
            probes: 0,
            message: `Allocated fresh table of size m = ${newCapacity}. Now re-hashing each entry under h(k) = k mod ${newCapacity}.`,
        });

        let totalProbes = 0;
        for (const entry of live) {
            const home = hashKey(entry.key, this.capacity);
            if (this.strategy === "chaining") {
                const chain = this.buckets[home];
                if (chain.length > 0) this._totalCollisions++;
                chain.push({ key: entry.key, value: entry.value });
                this._size++;
                totalProbes++;
                this._step(steps, {
                    type: "rehash",
                    operation: "rehash",
                    indices: [home],
                    homeIndex: home,
                    chainIndex: chain.length - 1,
                    key: entry.key,
                    line: 4,
                    probes: totalProbes,
                    message: `Rehashed ${formatEntry(entry.key, entry.value)} → ${formatHashFormula(entry.key, this.capacity, home)} (bucket ${home}, chain index ${chain.length - 1}).`,
                });
            } else {
                let target = home;
                let hops = 0;
                while (this.slots[target].state === "occupied") {
                    target = (target + 1) % this.capacity;
                    hops++;
                }
                if (hops > 0) this._totalCollisions++;
                totalProbes += hops + 1;
                this.slots[target] = { state: "occupied", key: entry.key, value: entry.value };
                this._size++;
                this._step(steps, {
                    type: "rehash",
                    operation: "rehash",
                    indices: [target],
                    homeIndex: home,
                    key: entry.key,
                    line: 4,
                    probes: totalProbes,
                    message: hops === 0
                        ? `Rehashed ${formatEntry(entry.key, entry.value)} → ${formatHashFormula(entry.key, this.capacity, home)} (placed at slot ${target}).`
                        : `Rehashed ${formatEntry(entry.key, entry.value)} → home ${home}, collided ${hops} time${hops === 1 ? "" : "s"}, placed at slot ${target}.`,
                });
            }
        }

        return ok({ capacity: this.capacity, size: this._size, clearedTombstones: oldTombstones }, steps);
    }

    clear() {
        this._initStorage(this.capacity);
        const steps = [];
        this._step(steps, {
            type: "clear",
            operation: "insert",
            indices: [],
            line: 1,
            probes: 0,
            message: `Cleared the ${HASH_STRATEGIES[this.strategy].name} table (m = ${this.capacity}). All buckets are empty.`,
        });
        return ok(null, steps);
    }
}

export function parseKeyInput(text) {
    return parseInteger(text, { min: KEY_LIMITS.min, max: KEY_LIMITS.max, label: "Key" });
}

export function parseCapacityInput(text) {
    return parseInteger(text, { min: HashTable.MIN_CAPACITY, max: HashTable.MAX_CAPACITY, label: "Table size" });
}

export function parseValueInput(text) {
    const raw = String(text ?? "").trim();
    if (raw.length > VALUE_MAX_LENGTH) {
        return { ok: false, error: `Value must be at most ${VALUE_MAX_LENGTH} characters.` };
    }
    return { ok: true, value: raw === "" ? null : raw };
}

/**
 * Generates a small demo dataset with intentional collisions mod `capacity`
 * so students immediately see Separate Chaining chains and Linear Probing offsets.
 */
export function sampleDataset(capacity = HashTable.DEFAULT_CAPACITY, random = Math.random) {
    const count = Math.min(Math.max(3, capacity - 1), 6);
    const labels = ["Ana", "Ben", "Cara", "Dan", "Eva", "Fox"];
    const baseBucket = Math.floor(random() * capacity);
    const secondBucket = (baseBucket + 1) % capacity;
    const keys = [];
    const seen = new Set();

    // Seed two colliding keys in baseBucket and one in secondBucket to illustrate collisions/clustering.
    const seeds = [
        baseBucket + capacity * (1 + Math.floor(random() * 3)),
        baseBucket + capacity * (4 + Math.floor(random() * 3)),
        secondBucket + capacity * (1 + Math.floor(random() * 4)),
    ];
    for (const k of seeds) {
        if (keys.length < count && !seen.has(k)) {
            seen.add(k);
            keys.push(k);
        }
    }
    while (keys.length < count) {
        const k = Math.floor(random() * 90) + 1;
        if (!seen.has(k)) {
            seen.add(k);
            keys.push(k);
        }
    }
    return keys.map((key, i) => ({ key, value: labels[i % labels.length] }));
}
