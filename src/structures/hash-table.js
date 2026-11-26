import { ok, fail, assertCapacity } from "./result.js";
import { parseInteger } from "../core/validate.js";

/**
 * Pure, DOM-free Hash Table supporting three collision-resolution strategies:
 *   1. Separate Chaining ("chaining")   — each bucket holds a chain of { key, value } entries.
 *   2. Linear Probing ("linear")        — open addressing, probe (h + i) mod m, DELETED tombstones.
 *   3. Quadratic Probing ("quadratic")  — open addressing, probe (h + i²) mod m, DELETED tombstones.
 *
 * Quadratic probing scheme (why it always terminates and always finds a slot):
 * - The table size m must be PRIME (allowed: 3, 5, 7, 11, 13, 17, 19). The constructor
 *   throws a readable RangeError and rehash() returns { ok: false } for any other size.
 * - For prime m, the offsets i² mod m for i = 0 .. ⌊m/2⌋ are pairwise distinct:
 *   i² ≡ j² (mod m) means m | (i − j)(i + j), and with 0 ≤ j < i ≤ ⌊m/2⌋ both factors
 *   lie strictly between 0 and m, so a prime m divides neither. Because (m − i)² ≡ i²,
 *   probes beyond i = ⌊m/2⌋ only repeat these slots. So the first ⌊m/2⌋ + 1 probes are
 *   exactly the set of slots key k can ever reach; every probe loop stops there.
 * - The load factor is kept at α = n / m ≤ 0.5, i.e. at most ⌊m/2⌋ live entries. A new key
 *   is only placed while n ≤ ⌊m/2⌋ − 1, so fewer than half of those ⌊m/2⌋ + 1 distinct probe
 *   slots can be OCCUPIED and a free (EMPTY or DELETED) slot is always found. An insert
 *   that would push α above 0.5 is refused with a readable error ("overflow" step);
 *   updating an existing key is still allowed at the limit. Tombstones do not count
 *   toward the limit because insert may reuse them.
 * - Tombstone semantics match linear probing exactly: search and delete skip DELETED and
 *   stop at EMPTY; insert remembers the first DELETED slot but keeps probing until EMPTY
 *   (or the probe set is exhausted) so it never duplicates a key stored further along.
 * - Quadratic probe/insert/found/delete steps carry probeIndex (i) and offset (i²).
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
    quadratic: {
        name: "Quadratic Probing",
        summary: "Open addressing with probe sequence (h(k) + i²) mod m for i = 0, 1, 2, … Jumping by growing squares breaks up the long runs that linear probing builds (primary clustering), but keys with the same home slot still follow the same path (secondary clustering). The table size must be prime and α is kept ≤ 0.5 so every insert is guaranteed to find a free slot. Deletions leave DELETED tombstones.",
        complexity: {
            insertAvg: "O(1 / (1 − α))",
            searchAvg: "O(1 / (1 − α))",
            deleteAvg: "O(1 / (1 − α))",
            worst: "O(m)",
            space: "O(m)",
            loadFactor: "α = n / m ≤ 0.5 enforced with m prime (at most ⌊m/2⌋ entries; rehash to a larger prime first)",
        },
        pseudocode: {
            insert: [
                "home ← ((key mod m) + m) mod m;  firstDel ← null",
                "for i ← 0 to ⌊m/2⌋:  idx ← (home + i²) mod m",
                "    if slot[idx] is OCCUPIED and slot[idx].key = key:  update value;  return",
                "    if slot[idx] is DELETED and firstDel = null:  firstDel ← idx",
                "    if slot[idx] is EMPTY:  break",
                "target ← firstDel ?? emptyIdx;  if size + 1 ≤ ⌊m/2⌋:  place at target;  return",
                "return load limit reached (α would exceed 0.5)",
            ],
            search: [
                "home ← ((key mod m) + m) mod m",
                "for i ← 0 to ⌊m/2⌋:  idx ← (home + i²) mod m",
                "    if slot[idx] is EMPTY:  return not found",
                "    if slot[idx] is DELETED:  continue   (skip tombstone)",
                "    if slot[idx].key = key:  return found (idx)",
                "return not found",
            ],
            delete: [
                "home ← ((key mod m) + m) mod m",
                "for i ← 0 to ⌊m/2⌋:  idx ← (home + i²) mod m",
                "    if slot[idx] is EMPTY:  return not found",
                "    if slot[idx] is DELETED:  continue   (skip tombstone)",
                "    if slot[idx].key = key:  slot[idx] ← DELETED;  size ← size − 1;  return",
                "return not found",
            ],
            rehash: [
                "entries ← collect all OCCUPIED (key, value) pairs (discard tombstones)",
                "slots ← array of newM EMPTY slots (newM prime, n ≤ ⌊newM/2⌋);  size ← 0",
                "for (key, value) in entries",
                "    probe (home + i²) mod newM for i = 0, 1, … and place at the first EMPTY slot",
            ],
        },
    },
};

/** Prime table sizes accepted by the quadratic strategy (within MIN..MAX capacity). */
export const QUADRATIC_CAPACITIES = Object.freeze([3, 5, 7, 11, 13, 17, 19]);

function isPrime(n) {
    if (!Number.isInteger(n) || n < 2) return false;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
    return true;
}

/**
 * Most live entries a table of `capacity` slots may hold under `strategy`.
 * chaining → null (no fixed limit), linear → capacity, quadratic → ⌊capacity / 2⌋ (α ≤ 0.5).
 */
export function maxEntriesFor(capacity, strategy) {
    if (strategy === "chaining") return null;
    if (strategy === "quadratic") return Math.floor(capacity / 2);
    return capacity;
}

/**
 * Readable reason why `capacity` is not allowed for `strategy`, or null when it is valid.
 * Every strategy needs an integer in [MIN_CAPACITY, MAX_CAPACITY]; quadratic also needs a prime.
 */
export function capacityError(capacity, strategy = "chaining") {
    if (!Number.isInteger(capacity) || capacity < HashTable.MIN_CAPACITY || capacity > HashTable.MAX_CAPACITY) {
        return `Table size must be an integer between ${HashTable.MIN_CAPACITY} and ${HashTable.MAX_CAPACITY}.`;
    }
    if (strategy === "quadratic" && !isPrime(capacity)) {
        return `Quadratic Probing needs a prime table size so the probe sequence reaches enough distinct slots: choose one of ${QUADRATIC_CAPACITIES.join(", ")} (got ${capacity}).`;
    }
    return null;
}

/**
 * Smallest valid capacity ≥ `desired` for `strategy` that can hold `count` entries,
 * or null if none exists up to MAX_CAPACITY. Useful when switching strategies.
 */
export function fitCapacity(strategy, desired, count) {
    const start = Number.isInteger(desired) ? Math.max(HashTable.MIN_CAPACITY, desired) : HashTable.MIN_CAPACITY;
    for (let m = start; m <= HashTable.MAX_CAPACITY; m++) {
        if (capacityError(m, strategy) !== null) continue;
        const limit = maxEntriesFor(m, strategy);
        if (limit === null || count <= limit) return m;
    }
    return null;
}

function quadraticSlot(home, i, capacity) {
    return (home + i * i) % capacity;
}

function formatQuadraticProbe(home, i, capacity) {
    return `(h + i²) mod m = (${home} + ${i}²) mod ${capacity} = ${quadraticSlot(home, i, capacity)}`;
}

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
     * @param {{ strategy?: "chaining" | "linear" | "quadratic" }} [opts]
     * @throws {RangeError} bad capacity, unknown strategy, or a non-prime size for "quadratic".
     */
    constructor(capacity = HashTable.DEFAULT_CAPACITY, { strategy = "chaining" } = {}) {
        assertCapacity(capacity, HashTable.MIN_CAPACITY, HashTable.MAX_CAPACITY, "Hash table");
        if (!Object.prototype.hasOwnProperty.call(HASH_STRATEGIES, strategy)) {
            throw new RangeError(`Unknown hash table strategy: ${strategy}`);
        }
        const sizeProblem = capacityError(capacity, strategy);
        if (sizeProblem !== null) throw new RangeError(sizeProblem);
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
    /** Most live entries allowed at the current capacity (null = no fixed limit, chaining). */
    get maxSize() { return maxEntriesFor(this.capacity, this.strategy); }
    /** True when a NEW key would be refused (linear: every slot used; quadratic: α would exceed 0.5). */
    isFull() { return this.strategy !== "chaining" && this._size >= this.maxSize; }

    /** Plain deep-cloned snapshot safe for StepPlayer replay and external inspection. */
    snapshot() {
        return {
            strategy: this.strategy,
            capacity: this.capacity,
            size: this._size,
            loadFactor: this._size / this.capacity,
            tombstones: this._tombstones,
            totalCollisions: this._totalCollisions,
            maxSize: maxEntriesFor(this.capacity, this.strategy),
            buckets: this.strategy === "chaining"
                ? this.buckets.map(chain => chain.map(e => ({ key: e.key, value: e.value })))
                : null,
            slots: this.strategy !== "chaining"
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
        probeIndex = null,
        offset = null,
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
            probeIndex,
            offset,
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
        const quadratic = this.strategy === "quadratic";
        const limit = quadratic ? Math.floor(this.capacity / 2) + 1 : this.capacity;
        for (let i = 0; i < limit; i++) {
            const idx = quadratic ? quadraticSlot(home, i, this.capacity) : (home + i) % this.capacity;
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
        if (this.strategy === "quadratic") return this._insertQuadratic(key, val);
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
        if (this.strategy === "quadratic") return this._searchQuadratic(key);
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
        if (this.strategy === "quadratic") return this._deleteQuadratic(key);
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

    /* ---------------- Quadratic probing ---------------- */

    /** Number of distinct slots on a quadratic probe path for prime m: ⌊m/2⌋ + 1. */
    _quadraticProbeCount() {
        return Math.floor(this.capacity / 2) + 1;
    }

    _quadraticProbeText(home, i) {
        return i === 0
            ? `Probe i = 0: slot ${home} (home)`
            : `Probe i = ${i}: ${formatQuadraticProbe(home, i, this.capacity)}`;
    }

    /**
     * Same contract as linear insert: update when the key exists (allowed even at the
     * load limit), otherwise place at the first tombstone on the path or at the EMPTY
     * slot that ended the scan. Refuses a new key when α would exceed 0.5. O(m) worst.
     */
    _insertQuadratic(key, value) {
        const steps = [];
        const m = this.capacity;
        const home = hashKey(key, m);
        const probeCount = this._quadraticProbeCount();
        let probes = 0;
        let firstTombstone = null;
        let firstTombstoneI = null;
        let emptyIdx = null;
        let emptyI = null;
        let sawCollision = false;

        this._step(steps, {
            type: "hash",
            operation: "insert",
            indices: [home],
            homeIndex: home,
            key,
            line: 1,
            probes,
            message: `Insert ${formatEntry(key, value)}: compute ${formatHashFormula(key, m, home)}. Start quadratic probing at slot ${home} (slots (${home} + i²) mod ${m} for i = 0 … ${probeCount - 1}).`,
        });

        for (let i = 0; i < probeCount; i++) {
            const idx = quadraticSlot(home, i, m);
            const slot = this.slots[idx];
            const at = this._quadraticProbeText(home, i);
            const next = i + 1 < probeCount ? ` Next: ${formatQuadraticProbe(home, i + 1, m)}.` : "";
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
                        probeIndex: i,
                        offset: i * i,
                        message: `${at} already holds key ${key}: updated ${formatEntry(key, prevValue)} → ${formatEntry(key, value)}. Size stays ${this._size}.`,
                    });
                    return ok({ key, value, bucket: idx, updated: true, collision: false, reusedTombstone: false, probes, probeIndex: i }, steps);
                }
                sawCollision = true;
                this._step(steps, {
                    type: "probe",
                    operation: "insert",
                    indices: [idx],
                    homeIndex: home,
                    key,
                    line: 2,
                    probes,
                    probeIndex: i,
                    offset: i * i,
                    message: `${at} is occupied by key ${slot.key} ≠ ${key} (collision).${next}`,
                });
            } else if (slot.state === "deleted") {
                const isFirst = firstTombstone === null;
                if (isFirst) { firstTombstone = idx; firstTombstoneI = i; }
                this._step(steps, {
                    type: "probe",
                    operation: "insert",
                    indices: [idx],
                    homeIndex: home,
                    key,
                    line: 4,
                    probes,
                    probeIndex: i,
                    offset: i * i,
                    message: isFirst
                        ? `${at} is a DELETED tombstone — remember it as the first reusable slot, but keep probing in case key ${key} already exists further along.${next}`
                        : `${at} is also a DELETED tombstone — keep probing until an EMPTY slot confirms key ${key} is new.${next}`,
                });
            } else {
                emptyIdx = idx;
                emptyI = i;
                this._step(steps, {
                    type: "probe",
                    operation: "insert",
                    indices: [idx],
                    homeIndex: home,
                    key,
                    line: 5,
                    probes,
                    probeIndex: i,
                    offset: i * i,
                    message: firstTombstone !== null
                        ? `${at} is EMPTY: key ${key} is not in the table, so reuse the earlier tombstone at slot ${firstTombstone}.`
                        : `${at} is EMPTY — ready to place ${formatEntry(key, value)}.`,
                });
                break;
            }
        }

        const limit = this.maxSize;
        const targetIdx = firstTombstone !== null ? firstTombstone : emptyIdx;
        if (this._size + 1 > limit || targetIdx === null) {
            // targetIdx === null cannot happen while size < ⌊m/2⌋ (see module JSDoc); kept as a guard.
            const fit = fitCapacity("quadratic", m + 1, this._size + 1);
            const error = this._size + 1 > limit
                ? `Quadratic Probing keeps α ≤ 0.5: a table of size ${m} holds at most ${limit} entr${limit === 1 ? "y" : "ies"} and already has ${this._size}, so key ${key} cannot be inserted. ${fit !== null ? `Rehash to a prime size of at least ${fit} first.` : "Delete entries first."}`
                : `No free slot on the quadratic probe path of key ${key} (home ${home}). Rehash to a larger prime size first.`;
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
        const placedI = reusedTombstone ? firstTombstoneI : emptyI;
        if (reusedTombstone) this._tombstones--;
        if (sawCollision) this._totalCollisions++;

        this.slots[targetIdx] = { state: "occupied", key, value };
        this._size++;

        const alpha = `α = ${this._size}/${m} = ${this.loadFactor.toFixed(2)}`;
        this._step(steps, {
            type: "insert",
            operation: "insert",
            indices: [targetIdx],
            homeIndex: home,
            key,
            line: 6,
            probes,
            probeIndex: placedI,
            offset: placedI * placedI,
            message: reusedTombstone
                ? `Placed ${formatEntry(key, value)} into recycled tombstone slot ${targetIdx} (i = ${placedI}, offset +${placedI * placedI} from home ${home}). ${alpha}.`
                : placedI === 0
                    ? `Placed ${formatEntry(key, value)} directly at home slot ${targetIdx}. ${alpha}.`
                    : `Placed ${formatEntry(key, value)} at slot ${targetIdx} = ${formatQuadraticProbe(home, placedI, m)}. ${alpha}.`,
        });

        return ok({ key, value, bucket: targetIdx, updated: false, collision: sawCollision, reusedTombstone, probes, probeIndex: placedI }, steps);
    }

    /** Quadratic search: skips tombstones, stops at EMPTY or after ⌊m/2⌋ + 1 probes. O(m) worst. */
    _searchQuadratic(key) {
        const steps = [];
        const m = this.capacity;
        const home = hashKey(key, m);
        const probeCount = this._quadraticProbeCount();
        let probes = 0;

        this._step(steps, {
            type: "hash",
            operation: "search",
            indices: [home],
            homeIndex: home,
            key,
            line: 1,
            probes,
            message: `Search key ${key}: compute ${formatHashFormula(key, m, home)}. Start quadratic probing at slot ${home}.`,
        });

        for (let i = 0; i < probeCount; i++) {
            const idx = quadraticSlot(home, i, m);
            const slot = this.slots[idx];
            const at = this._quadraticProbeText(home, i);
            const next = i + 1 < probeCount ? ` Next: ${formatQuadraticProbe(home, i + 1, m)}.` : "";
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
                    probeIndex: i,
                    offset: i * i,
                    message: `${at} is EMPTY (never occupied): key ${key} cannot appear further along its probe sequence (${probes} probe${probes === 1 ? "" : "s"}).`,
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
                    probeIndex: i,
                    offset: i * i,
                    message: `${at} is a DELETED tombstone — do not stop!${next}`,
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
                probeIndex: i,
                offset: i * i,
                message: match
                    ? `Found ${formatEntry(key, slot.value)} at slot ${idx} (i = ${i}) after ${probes} probe${probes === 1 ? "" : "s"}.`
                    : `${at} holds key ${slot.key} ≠ ${key}.${next}`,
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
            message: `Checked all ${probeCount} distinct slots (i = 0 … ${probeCount - 1}) on key ${key}'s quadratic probe path without finding it.`,
        });
        return ok({ found: false, key, value: null, bucket: null, chainIndex: null, probes }, steps);
    }

    /** Quadratic delete: same path as search; the hit becomes a DELETED tombstone. O(m) worst. */
    _deleteQuadratic(key) {
        const steps = [];
        const m = this.capacity;
        const home = hashKey(key, m);
        const probeCount = this._quadraticProbeCount();
        let probes = 0;

        this._step(steps, {
            type: "hash",
            operation: "delete",
            indices: [home],
            homeIndex: home,
            key,
            line: 1,
            probes,
            message: `Delete key ${key}: compute ${formatHashFormula(key, m, home)}. Start quadratic probing at slot ${home}.`,
        });

        for (let i = 0; i < probeCount; i++) {
            const idx = quadraticSlot(home, i, m);
            const slot = this.slots[idx];
            const at = this._quadraticProbeText(home, i);
            const next = i + 1 < probeCount ? ` Next: ${formatQuadraticProbe(home, i + 1, m)}.` : "";
            probes++;

            if (slot.state === "empty") {
                const error = `Key ${key} was not found (stopped at EMPTY slot ${idx}, probe i = ${i}).`;
                this._step(steps, {
                    type: "not-found",
                    operation: "delete",
                    indices: [idx],
                    homeIndex: home,
                    key,
                    line: 3,
                    probes,
                    probeIndex: i,
                    offset: i * i,
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
                    probeIndex: i,
                    offset: i * i,
                    message: `${at} is a DELETED tombstone — skip it and keep probing.${next}`,
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
                    probeIndex: i,
                    offset: i * i,
                    message: `Deleted ${formatEntry(removed.key, removed.value)} from slot ${idx} (i = ${i}) and left a DELETED tombstone so later probe chains stay intact. Size = ${this._size}, tombstones = ${this._tombstones}.`,
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
                probeIndex: i,
                offset: i * i,
                message: `${at} holds key ${slot.key} ≠ ${key}.${next}`,
            });
        }

        const error = `Key ${key} was not found after checking all ${probeCount} distinct slots on its quadratic probe path.`;
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
     * Structural self-check. Returns null when sound, otherwise a description of the first problem.
     * - chaining: every entry sits in bucket h(key); keys unique; size = entry count.
     * - open addressing: slot shapes valid; occupied count = size; DELETED count = tombstones;
     *   keys unique; every stored key is reachable from its home slot along the strategy's
     *   probe sequence without crossing an EMPTY slot.
     * - quadratic additionally: capacity is prime and size ≤ ⌊m/2⌋.
     */
    integrityError() {
        const m = this.capacity;
        const seen = new Set();
        if (this.strategy === "chaining") {
            if (!Array.isArray(this.buckets) || this.buckets.length !== m) return `expected ${m} buckets`;
            let count = 0;
            for (let b = 0; b < m; b++) {
                for (const e of this.buckets[b]) {
                    if (seen.has(e.key)) return `key ${e.key} stored twice`;
                    seen.add(e.key);
                    if (hashKey(e.key, m) !== b) return `key ${e.key} is in bucket ${b} but hashes to ${hashKey(e.key, m)}`;
                    count++;
                }
            }
            if (count !== this._size) return `found ${count} entries but size is ${this._size}`;
            return null;
        }

        if (!Array.isArray(this.slots) || this.slots.length !== m) return `expected ${m} slots`;
        const quadratic = this.strategy === "quadratic";
        if (quadratic) {
            const sizeProblem = capacityError(m, "quadratic");
            if (sizeProblem !== null) return sizeProblem;
            if (this._size > this.maxSize) return `size ${this._size} exceeds the α ≤ 0.5 limit of ${this.maxSize}`;
        }
        let occupied = 0;
        let deleted = 0;
        for (let idx = 0; idx < m; idx++) {
            const s = this.slots[idx];
            if (s.state === "occupied") {
                occupied++;
                if (seen.has(s.key)) return `key ${s.key} stored twice`;
                seen.add(s.key);
            } else if (s.state === "deleted" || s.state === "empty") {
                if (s.state === "deleted") deleted++;
                if (s.key !== null || s.value !== null) return `${s.state} slot ${idx} still carries data`;
            } else {
                return `slot ${idx} has unknown state ${s.state}`;
            }
        }
        if (occupied !== this._size) return `found ${occupied} occupied slots but size is ${this._size}`;
        if (deleted !== this._tombstones) return `found ${deleted} DELETED slots but tombstones is ${this._tombstones}`;

        const probeCount = quadratic ? this._quadraticProbeCount() : m;
        for (let idx = 0; idx < m; idx++) {
            const s = this.slots[idx];
            if (s.state !== "occupied") continue;
            const home = hashKey(s.key, m);
            let reached = false;
            for (let i = 0; i < probeCount; i++) {
                const at = quadratic ? quadraticSlot(home, i, m) : (home + i) % m;
                if (at === idx) { reached = true; break; }
                if (this.slots[at].state === "empty") {
                    return `key ${s.key} at slot ${idx} is unreachable: its probe path from home ${home} hits EMPTY slot ${at} first`;
                }
            }
            if (!reached) return `key ${s.key} at slot ${idx} is not on its probe path from home ${home}`;
        }
        return null;
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
        if (this.strategy === "quadratic") {
            const sizeProblem = capacityError(newCapacity, "quadratic");
            if (sizeProblem !== null) return fail(sizeProblem);
            const limit = maxEntriesFor(newCapacity, "quadratic");
            if (this._size > limit) {
                const fit = fitCapacity("quadratic", newCapacity, this._size);
                return fail(`A Quadratic Probing table of size ${newCapacity} holds at most ${limit} entr${limit === 1 ? "y" : "ies"} (α ≤ 0.5), but there are ${this._size}. ${fit !== null ? `Pick a prime size of at least ${fit}.` : "Delete entries first."}`);
            }
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
            } else if (this.strategy === "quadratic") {
                // Fresh table with n ≤ ⌊m/2⌋ (checked above), so an EMPTY slot exists for some i ≤ ⌊m/2⌋.
                let i = 0;
                let target = home;
                while (this.slots[target].state === "occupied") {
                    i++;
                    target = quadraticSlot(home, i, this.capacity);
                }
                if (i > 0) this._totalCollisions++;
                totalProbes += i + 1;
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
                    probeIndex: i,
                    offset: i * i,
                    message: i === 0
                        ? `Rehashed ${formatEntry(entry.key, entry.value)} → ${formatHashFormula(entry.key, this.capacity, home)} (placed at slot ${target}).`
                        : `Rehashed ${formatEntry(entry.key, entry.value)} → home ${home}, collided ${i} time${i === 1 ? "" : "s"}, placed at ${formatQuadraticProbe(home, i, this.capacity)}.`,
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

/**
 * Parses a table-size field. With `strategy` given, also applies that strategy's rule
 * (quadratic: prime sizes only). Without it, behaves exactly as before.
 */
export function parseCapacityInput(text, strategy) {
    const res = parseInteger(text, { min: HashTable.MIN_CAPACITY, max: HashTable.MAX_CAPACITY, label: "Table size" });
    if (!res.ok || strategy === undefined) return res;
    const problem = capacityError(res.value, strategy);
    return problem === null ? res : { ok: false, error: problem };
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
 * With strategy "quadratic" the count is capped at ⌊capacity/2⌋ so every entry fits (α ≤ 0.5).
 */
export function sampleDataset(capacity = HashTable.DEFAULT_CAPACITY, random = Math.random, strategy = "chaining") {
    const limit = maxEntriesFor(capacity, strategy);
    const baseCount = Math.min(Math.max(3, capacity - 1), 6);
    const count = limit === null ? baseCount : Math.min(baseCount, limit);
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
