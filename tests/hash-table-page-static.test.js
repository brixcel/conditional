import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HASH_STRATEGIES } from "../src/structures/hash-table.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const html = readFileSync(`${root}hash-table.html`, "utf8");
const js = readFileSync(`${root}src/pages/hash-table-page.js`, "utf8");

test("hash-table.html offers every strategy the module defines", () => {
    const select = html.match(/<select id="strategySelect">([\s\S]*?)<\/select>/);
    assert.ok(select, "strategy select present");
    const values = [...select[1].matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(values.sort(), Object.keys(HASH_STRATEGIES).sort());
    assert.match(select[1], /<option value="quadratic">Quadratic Probing \(Open Addressing, prime m\)<\/option>/);
});

test("hash-table.html has the ids the page controller writes to", () => {
    const ids = [...js.matchAll(/\$\("([A-Za-z]+)"\)/g)].map(m => m[1]);
    for (const id of new Set(ids)) {
        assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
    }
});

test("hash-table page controller avoids innerHTML, inline styles and native dialogs", () => {
    assert.doesNotMatch(js, /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML/);
    assert.doesNotMatch(js, /\.style\b/);
    assert.doesNotMatch(js, /\b(alert|confirm|prompt)\s*\(/);
    assert.doesNotMatch(html, /\sstyle="/);
});

test("hash-table page never calls new HashTable outside the guarded helper", () => {
    const calls = [...js.matchAll(/new HashTable\(/g)].length;
    // One for the initial default table (constant, valid) and one inside makeTable's try block.
    assert.equal(calls, 2);
    assert.match(js, /try \{\s*return \{ ok: true, table: new HashTable\(capacity, \{ strategy \}\) \};/);
});
