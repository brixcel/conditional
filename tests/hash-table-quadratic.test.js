import { test } from "node:test";
import assert from "node:assert/strict";
import {
    HashTable,
    HASH_STRATEGIES,
    QUADRATIC_CAPACITIES,
    hashKey,
    capacityError,
    maxEntriesFor,
    fitCapacity,
    parseCapacityInput,
    sampleDataset,
} from "../src/structures/hash-table.js";

function mulberry32(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

/** Shape checks for every quadratic step, including the i / i² fields the page displays. */
function assertQuadraticSteps(steps, key) {
    assert.ok(Array.isArray(steps) && steps.length > 0);
    for (let n = 0; n < steps.length; n++) {
        const s = steps[n];
        const code = HASH_STRATEGIES.quadratic.pseudocode[s.operation];
        assert.ok(code, `unknown operation ${s.operation}`);
        assert.ok(s.line >= 1 && s.line <= code.length, `line ${s.line} out of 1..${code.length}`);
        assert.ok(typeof s.message === "string" && s.message.length > 0);
        assert.equal(s.snapshot.strategy, "quadratic");
        if (n > 0) assert.ok(s.probes >= steps[n - 1].probes);
        if (s.probeIndex !== null && s.operation !== "rehash") {
            const m = s.snapshot.capacity;
            assert.equal(s.offset, s.probeIndex * s.probeIndex, "offset must be i²");
            assert.equal(s.homeIndex, hashKey(key, m));
            assert.ok(s.probeIndex <= Math.floor(m / 2), "probe index never exceeds ⌊m/2⌋");
            assert.deepEqual(s.indices, [(s.homeIndex + s.offset) % m], "slot must equal (h + i²) mod m");
        }
    }
    // The probe steps of one operation visit i = 0, 1, 2, … in order.
    const probeIs = steps.filter(s => s.probeIndex !== null && s.type !== "insert" && s.type !== "rehash").map(s => s.probeIndex);
    probeIs.forEach((i, n) => assert.equal(i, n, "probe numbers must be consecutive from 0"));
}

function assertMatchesModel(ht, model) {
    assert.equal(ht.integrityError(), null);
    assert.equal(ht.size, model.size);
    assert.equal(ht.isEmpty(), model.size === 0);
    assert.equal(ht.isFull(), model.size >= Math.floor(ht.capacity / 2));
    assert.ok(ht.loadFactor <= 0.5, "α must never exceed 0.5");
    const entries = ht.entries();
    assert.equal(entries.length, model.size);
    for (const e of entries) {
        assert.ok(model.has(e.key));
        assert.equal(e.value, model.get(e.key));
    }
    assert.equal(ht.slots.filter(s => s.state === "deleted").length, ht.tombstones);
}

/* ---------------- Property test against a Map model ---------------- */

test("quadratic: 300 seeded sequences match a Map model with α ≤ 0.5 and integrity after every op", () => {
    const rand = mulberry32(0xC15);
    let refusals = 0;
    let reuses = 0;
    let tombstoneSkips = 0;

    for (let round = 0; round < 300; round++) {
        const cap = pick(rand, QUADRATIC_CAPACITIES);
        const ht = new HashTable(cap, { strategy: "quadratic" });
        const model = new Map();

        for (let op = 0; op < 60; op++) {
            const m = ht.capacity;
            // Small key range including 0 and negatives: many keys share each home slot.
            const key = Math.floor(rand() * (m * 3)) - m;
            const roll = rand();
            const sizeBefore = ht.size;

            if (roll < 0.45) {
                const val = rand() < 0.7 ? `v${op}` : null;
                const res = ht.insert(key, val);
                assertQuadraticSteps(res.steps, key);
                // Steps before the final one show the table as it was before the mutation.
                for (const s of res.steps.slice(0, -1)) assert.equal(s.snapshot.size, sizeBefore);
                if (!model.has(key) && model.size >= Math.floor(m / 2)) {
                    assert.equal(res.ok, false);
                    assert.equal(res.steps.at(-1).type, "overflow");
                    assert.equal(res.steps.at(-1).line, 7);
                    assert.match(res.error, /α ≤ 0\.5/);
                    refusals++;
                } else {
                    assert.equal(res.ok, true, res.error);
                    assert.equal(res.value.updated, model.has(key));
                    if (res.value.reusedTombstone) reuses++;
                    model.set(key, val);
                }
            } else if (roll < 0.72) {
                const res = ht.search(key);
                assertQuadraticSteps(res.steps, key);
                assert.equal(res.ok, true);
                tombstoneSkips += res.steps.filter(s => s.line === 4).length;
                assert.equal(res.value.found, model.has(key));
                if (model.has(key)) {
                    assert.equal(res.value.value, model.get(key));
                    assert.equal(ht.slots[res.value.bucket].key, key);
                } else {
                    assert.equal(res.value.bucket, null);
                }
                assert.deepEqual(ht.get(key).found, model.has(key));
            } else if (roll < 0.94) {
                const res = ht.delete(key);
                assertQuadraticSteps(res.steps, key);
                if (model.has(key)) {
                    assert.equal(res.ok, true);
                    assert.equal(res.value.value, model.get(key));
                    assert.equal(ht.slots[res.value.bucket].state, "deleted");
                    model.delete(key);
                } else {
                    assert.equal(res.ok, false);
                    assert.equal(res.steps.at(-1).type, "not-found");
                }
            } else {
                const next = pick(rand, QUADRATIC_CAPACITIES);
                const res = ht.rehash(next);
                if (model.size > Math.floor(next / 2)) {
                    assert.equal(res.ok, false);
                    assert.equal(ht.capacity, m, "failed rehash must not change the table");
                } else {
                    assert.equal(res.ok, true, res.error);
                    assert.equal(ht.capacity, next);
                    assert.equal(ht.tombstones, 0);
                    assertQuadraticSteps(res.steps, null);
                }
            }
            assertMatchesModel(ht, model);
        }
    }
    // The generator must actually exercise the interesting paths.
    assert.ok(refusals > 50, `load-limit refusals exercised (${refusals})`);
    assert.ok(reuses > 50, `tombstone reuse exercised (${reuses})`);
    assert.ok(tombstoneSkips > 50, `search tombstone skips exercised (${tombstoneSkips})`);
});

test("integrityError stays null for chaining and linear across seeded sequences", () => {
    const rand = mulberry32(77);
    for (const strategy of ["chaining", "linear"]) {
        for (let round = 0; round < 50; round++) {
            const ht = new HashTable(3 + Math.floor(rand() * 17), { strategy });
            for (let op = 0; op < 40; op++) {
                const key = Math.floor(rand() * ht.capacity * 3) - ht.capacity;
                const r = rand();
                if (r < 0.5) ht.insert(key, "x");
                else if (r < 0.8) ht.delete(key);
                else ht.search(key);
                assert.equal(ht.integrityError(), null, `${strategy} round ${round} op ${op}`);
            }
        }
    }
});

/* ---------------- Hand-written probe sequences ---------------- */

test("quadratic: exact slots visited for a collision chain at home 0 in m = 11", () => {
    const ht = new HashTable(11, { strategy: "quadratic" });
    // 0, 11, 22, 33, 44 all hash to 0. Offsets i² = 0, 1, 4, 9, 16 → slots 0, 1, 4, 9, 5.
    const placed = [0, 11, 22, 33, 44].map(k => ht.insert(k, `k${k}`));
    assert.deepEqual(placed.map(r => r.value.bucket), [0, 1, 4, 9, 5]);
    assert.deepEqual(placed.map(r => r.value.probeIndex), [0, 1, 2, 3, 4]);

    const last = placed[4].steps;
    const probes = last.filter(s => s.type === "probe");
    assert.deepEqual(probes.map(s => s.indices[0]), [0, 1, 4, 9, 5]);
    assert.deepEqual(probes.map(s => s.probeIndex), [0, 1, 2, 3, 4]);
    assert.deepEqual(probes.map(s => s.offset), [0, 1, 4, 9, 16]);
    assert.match(probes[4].message, /\(0 \+ 4²\) mod 11 = 5/);
    assert.equal(last.at(-1).type, "insert");
    assert.equal(last.at(-1).line, 6);
    assert.equal(last.at(-1).offset, 16);

    // Linear probing would have put 44 in slot 4: quadratic jumps past the cluster.
    const lin = new HashTable(11, { strategy: "linear" });
    for (const k of [0, 11, 22, 33, 44]) lin.insert(k);
    assert.equal(lin.get(44).bucket, 4);

    // Search follows the identical path.
    const found = ht.search(44);
    assert.equal(found.value.found, true);
    assert.equal(found.value.bucket, 5);
    assert.deepEqual(found.steps.filter(s => s.probeIndex !== null).map(s => s.indices[0]), [0, 1, 4, 9, 5]);
    assert.equal(ht.integrityError(), null);
});

test("quadratic: probe path wraps around the end of the array (m = 7, home 5)", () => {
    const ht = new HashTable(7, { strategy: "quadratic" });
    // 5, 12, 19 hash to 5: slots 5, (5+1)%7 = 6, (5+4)%7 = 2.
    assert.deepEqual([5, 12, 19].map(k => ht.insert(k).value.bucket), [5, 6, 2]);
    // Searching 26 (home 5, absent) visits 5, 6, 2, then (5+9)%7 = 0 which is EMPTY.
    const miss = ht.search(26);
    assert.equal(miss.value.found, false);
    assert.deepEqual(miss.steps.filter(s => s.probeIndex !== null).map(s => s.indices[0]), [5, 6, 2, 0]);
    assert.equal(miss.steps.at(-1).line, 3);
});

test("quadratic: 0 and negative keys use the non-negative home slot", () => {
    const ht = new HashTable(7, { strategy: "quadratic" });
    assert.equal(ht.insert(0, "zero").value.bucket, 0);
    assert.equal(ht.insert(-7, "neg").value.bucket, 1); // home 0, i = 1
    assert.equal(ht.insert(-1).value.bucket, 6);        // home 6
    assert.equal(ht.get(0).value, "zero");
    assert.equal(ht.get(-7).value, "neg");
    assert.equal(ht.integrityError(), null);
});

/* ---------------- Tombstones ---------------- */

test("quadratic: tombstones keep chains reachable and insert reuses the first one without duplicating", () => {
    const ht = new HashTable(11, { strategy: "quadratic" });
    ht.insert(0, "a");   // slot 0
    ht.insert(11, "b");  // slot 1
    ht.insert(22, "c");  // slot 4

    const del = ht.delete(11);
    assert.equal(del.ok, true);
    assert.equal(del.steps.at(-1).probeIndex, 1);
    assert.equal(ht.slots[1].state, "deleted");
    assert.equal(ht.tombstones, 1);
    assert.equal(ht.integrityError(), null);

    // Search must skip the tombstone at slot 1 and reach 22 at slot 4.
    const s22 = ht.search(22);
    assert.equal(s22.value.found, true);
    assert.equal(s22.value.bucket, 4);
    assert.ok(s22.steps.some(s => s.line === 4 && s.indices[0] === 1), "tombstone skip step recorded");

    // Updating 22 must update slot 4, not drop a duplicate into the tombstone.
    const upd = ht.insert(22, "c2");
    assert.equal(upd.value.updated, true);
    assert.equal(upd.value.bucket, 4);
    assert.equal(ht.slots[1].state, "deleted");
    assert.equal(ht.size, 2);

    // A new key with home 0 reuses the first tombstone (slot 1, i = 1).
    const ins = ht.insert(33, "d");
    assert.equal(ins.ok, true);
    assert.equal(ins.value.reusedTombstone, true);
    assert.equal(ins.value.bucket, 1);
    assert.equal(ins.value.probeIndex, 1);
    assert.equal(ins.steps.at(-1).offset, 1);
    assert.equal(ht.tombstones, 0);
    assert.equal(ht.integrityError(), null);
});

test("quadratic: search terminates when the probe path has no EMPTY slot", () => {
    const ht = new HashTable(3, { strategy: "quadratic" }); // probe path = 2 slots, limit 1 entry
    ht.insert(1); ht.delete(1);   // slot 1 → tombstone
    ht.insert(2); ht.delete(2);   // slot 2 → tombstone
    ht.insert(0, "z");            // slot 0
    assert.equal(ht.tombstones, 2);
    // Key 3 (home 0) path: slot 0 (key 0), slot 1 (tombstone) → exhausted.
    const miss = ht.search(3);
    assert.equal(miss.value.found, false);
    assert.equal(miss.steps.at(-1).line, 6);
    assert.equal(miss.value.probes, 2);
    assert.equal(ht.delete(3).ok, false);
    assert.equal(ht.integrityError(), null);
});

test("quadratic: tombstones do not count toward the load limit", () => {
    const ht = new HashTable(5, { strategy: "quadratic" }); // limit 2
    ht.insert(0); ht.insert(5);
    ht.delete(0); ht.delete(5);
    assert.equal(ht.tombstones, 2);
    assert.equal(ht.insert(10).ok, true);
    assert.equal(ht.insert(15).ok, true);
    assert.equal(ht.size, 2);
    assert.equal(ht.integrityError(), null);
});

/* ---------------- Load limit and sizes ---------------- */

test("quadratic: refuses a new key once α would exceed 0.5, still updates existing keys", () => {
    const ht = new HashTable(7, { strategy: "quadratic" });
    assert.equal(ht.maxSize, 3);
    for (const k of [1, 2, 3]) assert.equal(ht.insert(k).ok, true);
    assert.equal(ht.isFull(), true);
    assert.equal(ht.loadFactor, 3 / 7);

    const refused = ht.insert(4, "four");
    assert.equal(refused.ok, false);
    assert.equal(refused.steps.at(-1).type, "overflow");
    assert.equal(refused.steps.at(-1).line, 7);
    assert.match(refused.error, /at most 3 entries/);
    assert.match(refused.error, /at least 11/);
    assert.equal(ht.size, 3);
    assert.equal(ht.has(4), false);

    const upd = ht.insert(2, "TWO");
    assert.equal(upd.ok, true);
    assert.equal(upd.value.updated, true);

    ht.delete(1);
    assert.equal(ht.insert(4).ok, true);
    assert.equal(ht.integrityError(), null);

    // Rehash to a larger prime lifts the limit.
    assert.equal(ht.rehash(11).ok, true);
    assert.equal(ht.maxSize, 5);
    assert.equal(ht.insert(5).ok, true);
    assert.equal(ht.insert(6).ok, true);
    assert.equal(ht.insert(7).ok, false);
});

test("quadratic: m = 3 holds exactly one entry", () => {
    const ht = new HashTable(3, { strategy: "quadratic" });
    assert.equal(ht.insert(0).ok, true);
    assert.equal(ht.insert(1).ok, false);
});

test("quadratic: non-prime sizes are rejected with a readable message", () => {
    for (const bad of [4, 6, 8, 9, 10, 12, 14, 15, 16, 18]) {
        assert.throws(() => new HashTable(bad, { strategy: "quadratic" }), /prime table size/);
        assert.match(capacityError(bad, "quadratic"), /3, 5, 7, 11, 13, 17, 19/);
        assert.equal(capacityError(bad, "linear"), null);
        assert.equal(parseCapacityInput(String(bad), "quadratic").ok, false);
        assert.equal(parseCapacityInput(String(bad)).ok, true, "strategy-less parse is unchanged");
    }
    for (const good of QUADRATIC_CAPACITIES) {
        assert.equal(capacityError(good, "quadratic"), null);
        assert.deepEqual(parseCapacityInput(String(good), "quadratic"), { ok: true, value: good });
    }
    assert.match(capacityError(20, "quadratic"), /between 3 and 19/);

    const ht = new HashTable(7, { strategy: "quadratic" });
    ht.insert(1, "a");
    const res = ht.rehash(8);
    assert.equal(res.ok, false);
    assert.match(res.error, /prime/);
    assert.equal(ht.capacity, 7);
    assert.equal(ht.get(1).value, "a");
});

test("quadratic: rehash refuses a prime that is too small for the live entries", () => {
    const ht = new HashTable(11, { strategy: "quadratic" });
    for (const k of [1, 2, 3, 4]) ht.insert(k);
    const res = ht.rehash(7); // holds at most 3
    assert.equal(res.ok, false);
    assert.match(res.error, /at most 3/);
    assert.match(res.error, /at least 11/);
    assert.equal(ht.size, 4);
    assert.equal(ht.capacity, 11);
});

test("quadratic: rehash re-places keys along (h + i²) and clears tombstones", () => {
    const ht = new HashTable(7, { strategy: "quadratic" });
    ht.insert(0); ht.insert(7); ht.insert(3);
    ht.delete(3);
    const res = ht.rehash(13);
    assert.equal(res.ok, true);
    assert.equal(res.value.clearedTombstones, 1);
    assert.equal(ht.tombstones, 0);
    assert.equal(ht.get(0).bucket, 0);
    assert.equal(ht.get(7).bucket, 7);
    // Same size: 0 and 13 collide, 13 goes to (0 + 1²) mod 13 = 1.
    ht.insert(13);
    assert.equal(ht.get(13).bucket, 1);
    const same = ht.rehash(13);
    const step13 = same.steps.find(s => s.key === 13);
    assert.equal(step13.probeIndex, 1);
    assert.equal(step13.offset, 1);
    assert.equal(ht.integrityError(), null);
});

test("helpers: maxEntriesFor, fitCapacity, sampleDataset respect the strategy", () => {
    assert.equal(maxEntriesFor(7, "chaining"), null);
    assert.equal(maxEntriesFor(7, "linear"), 7);
    assert.equal(maxEntriesFor(7, "quadratic"), 3);
    assert.equal(fitCapacity("quadratic", 7, 3), 7);
    assert.equal(fitCapacity("quadratic", 7, 4), 11);
    assert.equal(fitCapacity("quadratic", 8, 0), 11);
    assert.equal(fitCapacity("quadratic", 3, 10), null);
    assert.equal(fitCapacity("linear", 5, 9), 9);
    assert.equal(fitCapacity("chaining", 5, 100), 5);

    for (const cap of QUADRATIC_CAPACITIES) {
        const data = sampleDataset(cap, mulberry32(cap), "quadratic");
        assert.ok(data.length <= Math.floor(cap / 2));
        const ht = new HashTable(cap, { strategy: "quadratic" });
        for (const d of data) assert.equal(ht.insert(d.key, d.value).ok, true);
    }
    // Default argument keeps the old dataset size.
    assert.equal(sampleDataset(7, mulberry32(1)).length, 6);
});

test("quadratic: snapshots expose slots and maxSize as deep copies", () => {
    const ht = new HashTable(7, { strategy: "quadratic" });
    ht.insert(3, "x");
    const snap = ht.snapshot();
    assert.equal(snap.buckets, null);
    assert.equal(snap.slots.length, 7);
    assert.equal(snap.maxSize, 3);
    snap.slots[3].key = 999;
    assert.equal(ht.get(3).found, true);
    assert.equal(ht.slots[3].key, 3);
});

test("integrityError detects a key moved off its quadratic path and an EMPTY gap", () => {
    const ht = new HashTable(11, { strategy: "quadratic" });
    ht.insert(0); ht.insert(11); ht.insert(22); // slots 0, 1, 4
    // Corrupt: blank slot 1 to EMPTY (as a naive delete would) — 22 becomes unreachable.
    ht.slots[1] = { state: "empty", key: null, value: null };
    ht._size--;
    assert.match(ht.integrityError(), /unreachable/);

    const ht2 = new HashTable(11, { strategy: "quadratic" });
    ht2.insert(0);
    ht2.slots[2] = { state: "occupied", key: 11, value: null }; // 11's path is 0, 1, 4, …; slot 1 EMPTY first
    ht2._size++;
    assert.match(ht2.integrityError(), /unreachable/);
});
