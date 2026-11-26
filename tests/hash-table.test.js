import { test } from "node:test";
import assert from "node:assert/strict";
import {
    HashTable,
    HASH_STRATEGIES,
    hashKey,
    parseKeyInput,
    parseCapacityInput,
    parseValueInput,
    sampleDataset,
} from "../src/structures/hash-table.js";

function seeded(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function assertStepsValid(steps, strategy) {
    assert.ok(Array.isArray(steps) && steps.length > 0, "operation must record at least one step");
    for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const code = HASH_STRATEGIES[strategy].pseudocode[s.operation];
        assert.ok(code, `unknown operation in step: ${s.operation}`);
        assert.ok(s.line >= 1 && s.line <= code.length, `${strategy}.${s.operation}: line ${s.line} out of 1..${code.length}`);
        assert.ok(typeof s.message === "string" && s.message.length > 0);
        if (i > 0) assert.ok(s.probes >= steps[i - 1].probes, "probe count must be non-decreasing");
        assert.equal(s.snapshot.strategy, strategy);
    }
}

/* ---------------- Hash function & validators ---------------- */

test("hashKey always returns a non-negative bucket index including for 0 and negatives", () => {
    for (const cap of [3, 7, 11, 19]) {
        for (const key of [-9999, -14, -7, -1, 0, 1, 7, 14, 9999]) {
            const h = hashKey(key, cap);
            assert.ok(Number.isInteger(h) && h >= 0 && h < cap, `hashKey(${key}, ${cap}) = ${h}`);
        }
    }
    assert.equal(hashKey(-1, 7), 6);
    assert.equal(hashKey(-7, 7), 0);
    assert.equal(hashKey(0, 7), 0);
});

test("constructor and key validation reject invalid arguments", () => {
    for (const bad of [0, 2, 20, -5, 4.5, NaN, "7"]) {
        assert.throws(() => new HashTable(bad), RangeError);
    }
    assert.throws(() => new HashTable(7, { strategy: "cuckoo" }), RangeError);

    const ht = new HashTable(7);
    for (const badKey of ["7", 1.5, NaN, Infinity, null, undefined]) {
        assert.throws(() => ht.insert(badKey), TypeError);
        assert.throws(() => ht.search(badKey), TypeError);
        assert.throws(() => ht.delete(badKey), TypeError);
    }
});

test("parseKeyInput, parseCapacityInput and parseValueInput handle boundaries cleanly", () => {
    assert.deepEqual(parseKeyInput("0"), { ok: true, value: 0 });
    assert.deepEqual(parseKeyInput("-9999"), { ok: true, value: -9999 });
    assert.deepEqual(parseKeyInput("9999"), { ok: true, value: 9999 });
    assert.equal(parseKeyInput("").ok, false);
    assert.equal(parseKeyInput("10000").ok, false);
    assert.equal(parseKeyInput("1.2").ok, false);

    assert.deepEqual(parseCapacityInput("3"), { ok: true, value: 3 });
    assert.deepEqual(parseCapacityInput("19"), { ok: true, value: 19 });
    assert.equal(parseCapacityInput("2").ok, false);
    assert.equal(parseCapacityInput("20").ok, false);

    assert.deepEqual(parseValueInput("  "), { ok: true, value: null });
    assert.deepEqual(parseValueInput(" Ana "), { ok: true, value: "Ana" });
    assert.equal(parseValueInput("x".repeat(25)).ok, false);
});

/* ---------------- Model-based property tests (both strategies) ---------------- */

for (const strategy of ["chaining", "linear"]) {
    test(`${strategy}: matches a reference Map across 200 seeded random operation sequences`, () => {
        const rand = seeded(strategy === "chaining" ? 101 : 202);

        for (let round = 0; round < 200; round++) {
            const cap = HashTable.MIN_CAPACITY + Math.floor(rand() * (HashTable.MAX_CAPACITY - HashTable.MIN_CAPACITY + 1));
            const ht = new HashTable(cap, { strategy });
            const model = new Map();

            for (let op = 0; op < 60; op++) {
                const roll = rand();
                // Draw from a tight key space (including 0 and negatives) to force heavy collisions & updates.
                const key = Math.floor(rand() * (cap * 3)) - cap;

                if (roll < 0.45) {
                    const val = rand() < 0.7 ? `v${op}` : null;
                    const res = ht.insert(key, val);
                    assertStepsValid(res.steps, strategy);

                    const alreadyPresent = model.has(key);
                    if (strategy === "linear" && !alreadyPresent && model.size === ht.capacity) {
                        assert.equal(res.ok, false);
                        assert.equal(res.steps.at(-1).type, "overflow");
                    } else {
                        assert.equal(res.ok, true);
                        assert.equal(res.value.updated, alreadyPresent);
                        model.set(key, val);
                    }
                } else if (roll < 0.72) {
                    const res = ht.search(key);
                    assertStepsValid(res.steps, strategy);
                    assert.equal(res.ok, true);
                    if (model.has(key)) {
                        assert.equal(res.value.found, true);
                        assert.equal(res.value.value, model.get(key));
                        assert.ok(res.value.bucket >= 0 && res.value.bucket < ht.capacity);
                    } else {
                        assert.equal(res.value.found, false);
                        assert.equal(res.value.bucket, null);
                    }
                } else if (roll < 0.94) {
                    const res = ht.delete(key);
                    assertStepsValid(res.steps, strategy);
                    if (model.has(key)) {
                        assert.equal(res.ok, true);
                        assert.equal(res.value.value, model.get(key));
                        model.delete(key);
                    } else {
                        assert.equal(res.ok, false);
                        assert.equal(res.steps.at(-1).type, "not-found");
                    }
                } else {
                    // Occasional rehash (including same size to purge tombstones or resize)
                    const nextCap = HashTable.MIN_CAPACITY + Math.floor(rand() * (HashTable.MAX_CAPACITY - HashTable.MIN_CAPACITY + 1));
                    const res = ht.rehash(nextCap);
                    if (strategy === "linear" && nextCap < model.size) {
                        assert.equal(res.ok, false);
                    } else {
                        assert.equal(res.ok, true);
                        assertStepsValid(res.steps, strategy);
                        assert.equal(ht.capacity, nextCap);
                        assert.equal(ht.tombstones, 0);
                    }
                }

                // Check structural invariants after every single operation
                assert.equal(ht.size, model.size);
                assert.equal(ht.isEmpty(), model.size === 0);
                assert.equal(ht.loadFactor, model.size / ht.capacity);
                const entries = ht.entries();
                assert.equal(entries.length, model.size);
                for (const e of entries) {
                    assert.equal(model.has(e.key), true);
                    assert.equal(e.value, model.get(e.key));
                }
                if (strategy === "linear") {
                    const occupied = ht.slots.filter(s => s.state === "occupied").length;
                    const deleted = ht.slots.filter(s => s.state === "deleted").length;
                    assert.equal(occupied, model.size);
                    assert.equal(deleted, ht.tombstones);
                }
            }
        }
    });
}

/* ---------------- Strategy-specific edge cases ---------------- */

test("separate chaining: handles collisions, load factor > 1, 0 and negative keys", () => {
    const ht = new HashTable(3, { strategy: "chaining" });
    // Keys 0, 3, -3, 6 all hash to bucket 0 mod 3
    ht.insert(0, "zero");
    ht.insert(3, "three");
    ht.insert(-3, "neg-three");
    ht.insert(6, "six");

    assert.equal(ht.size, 4);
    assert.ok(ht.loadFactor > 1);
    assert.equal(ht.buckets[0].length, 4);
    assert.equal(ht.totalCollisions, 3);

    // Update middle node without duplicating
    const upd = ht.insert(-3, "updated");
    assert.equal(upd.ok, true);
    assert.equal(upd.value.updated, true);
    assert.equal(ht.size, 4);
    assert.equal(ht.get(-3).value, "updated");

    // Delete head and verify remaining entries stay intact
    const del = ht.delete(0);
    assert.equal(del.ok, true);
    assert.equal(ht.has(0), false);
    assert.equal(ht.get(6).found, true);
});

test("linear probing: tombstones preserve probe chains, and insert reuses tombstones without creating duplicates", () => {
    const ht = new HashTable(5, { strategy: "linear" });
    // Keys 2, 7, 12 all hash to home slot 2
    ht.insert(2, "a");   // slot 2
    ht.insert(7, "b");   // slot 3
    ht.insert(12, "c");  // slot 4

    // Delete 7 (slot 3 becomes DELETED tombstone)
    const del = ht.delete(7);
    assert.equal(del.ok, true);
    assert.equal(ht.slots[3].state, "deleted");
    assert.equal(ht.tombstones, 1);

    // Searching 12 MUST skip tombstone at slot 3 and find 12 at slot 4
    const found12 = ht.search(12);
    assert.equal(found12.value.found, true);
    assert.equal(found12.value.bucket, 4);
    assert.equal(found12.value.value, "c");

    // Updating 12 MUST update slot 4 (NOT insert a duplicate at tombstone slot 3!)
    const upd12 = ht.insert(12, "c2");
    assert.equal(upd12.ok, true);
    assert.equal(upd12.value.updated, true);
    assert.equal(upd12.value.bucket, 4);
    assert.equal(ht.size, 2);
    assert.equal(ht.slots[3].state, "deleted");

    // Inserting new key 17 (home 2) MUST reuse tombstone at slot 3
    const ins17 = ht.insert(17, "d");
    assert.equal(ins17.ok, true);
    assert.equal(ins17.value.reusedTombstone, true);
    assert.equal(ins17.value.bucket, 3);
    assert.equal(ht.tombstones, 0);
});

test("linear probing: full table rejects new key with overflow but still updates existing key", () => {
    const ht = new HashTable(3, { strategy: "linear" });
    ht.insert(1, "one");
    ht.insert(2, "two");
    ht.insert(3, "three");
    assert.equal(ht.isFull(), true);

    const overflow = ht.insert(4, "four");
    assert.equal(overflow.ok, false);
    assert.equal(overflow.steps.at(-1).type, "overflow");
    assert.match(overflow.error, /full/i);

    // Updating an existing key when full must still succeed
    const updateExisting = ht.insert(2, "TWO");
    assert.equal(updateExisting.ok, true);
    assert.equal(updateExisting.value.updated, true);
    assert.equal(ht.get(2).value, "TWO");

    // Searching/deleting absent key in a full table terminates cleanly (no infinite loop)
    assert.equal(ht.search(99).value.found, false);
    assert.equal(ht.delete(99).ok, false);
});

test("linear probing: full of tombstones still allows insert and rehash clears all tombstones", () => {
    const ht = new HashTable(3, { strategy: "linear" });
    ht.insert(10); ht.insert(20); ht.insert(30);
    ht.delete(10); ht.delete(20); ht.delete(30);
    assert.equal(ht.size, 0);
    assert.equal(ht.tombstones, 3);

    // Searching absent key when every slot is a tombstone terminates cleanly
    assert.equal(ht.search(99).value.found, false);

    // Inserting into an all-tombstone table reuses the first probed tombstone
    const ins = ht.insert(5, "five");
    assert.equal(ins.ok, true);
    assert.equal(ins.value.reusedTombstone, true);
    assert.equal(ht.size, 1);
    assert.equal(ht.tombstones, 2);

    // Rehash to same capacity clears remaining tombstones
    const reh = ht.rehash(3);
    assert.equal(reh.ok, true);
    assert.equal(ht.tombstones, 0);
    assert.equal(ht.get(5).value, "five");
});

test("snapshots and entries are deep copies (external mutation cannot corrupt table)", () => {
    const ht = new HashTable(5, { strategy: "chaining" });
    ht.insert(10, "orig");
    const snap = ht.snapshot();
    snap.buckets[0][0].value = "hacked";
    snap.buckets[0].push({ key: 999, value: "evil" });
    assert.equal(ht.get(10).value, "orig");
    assert.equal(ht.size, 1);

    const list = ht.entries();
    list[0].value = "mutated";
    assert.equal(ht.get(10).value, "orig");
});

test("sampleDataset produces valid distinct integer keys with intentional collisions", () => {
    const data = sampleDataset(7, seeded(42));
    assert.ok(data.length >= 3 && data.length <= 6);
    const keys = new Set(data.map(d => d.key));
    assert.equal(keys.size, data.length);
    const buckets = new Set(data.map(d => hashKey(d.key, 7)));
    assert.ok(buckets.size < data.length, "demo dataset should demonstrate at least one collision");
});

test("registry entries carry name, summary, complexity and pseudocode", () => {
    for (const [key, info] of Object.entries(HASH_STRATEGIES)) {
        assert.ok(info.name && info.summary, key);
        for (const f of ["insertAvg", "searchAvg", "deleteAvg", "worst", "space", "loadFactor"]) {
            assert.ok(info.complexity[f], `${key}.complexity.${f}`);
        }
        for (const op of ["insert", "search", "delete", "rehash"]) {
            assert.ok(Array.isArray(info.pseudocode[op]) && info.pseudocode[op].length > 0, `${key}.pseudocode.${op}`);
        }
    }
});
