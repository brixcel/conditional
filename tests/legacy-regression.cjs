/**
 * ============================================================================
 * Page & Architecture Regression Checks
 * Data Structures & Algorithms Visualization Project
 * ============================================================================
 * Run: node tests/legacy-regression.cjs   (or: npm test)
 *
 * History (C10, 2026-11): this file used to hold suites 1-8, which tested
 * COPIES of the Stack / Queue / Linked List / AVL classes pasted into this file.
 * They were removed; their behaviours are now asserted against the real code in
 * tests/structures.test.js, tests/*linked-list.test.js and tests/avl.test.js
 * (avl-real.test.js was replaced in C12 when the AVL page moved to src/structures/avl.js).
 *
 * What remains reads the real files on disk:
 *   - every *.html page in the repo root (discovered, not hard-coded)
 *   - the local scripts each page loads, plus everything under src/pages/
 *   - main.css tokens and the shared.js navigation config
 * Plain CommonJS, no dependencies.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

function suite(name, fn) {
  console.log(`\n======================================================`);
  console.log(` SUITE: ${name}`);
  console.log(`======================================================`);
  fn();
}

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const toPosix = (p) => p.split(path.sep).join('/');

/** Native dialogs. The lookbehind keeps showAlert( / myconfirm( from matching; window.alert( still matches. */
const DIALOG_RE = /(?<![\w$])(alert|prompt|confirm)\s*\(/g;
/** Inline style attributes, double or single quoted. */
const STYLE_ATTR_RE = /\sstyle\s*=\s*["']/gi;

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Returns ["file:line alert(", ...] for every native dialog call in `text`. */
function findDialogs(rel, text) {
  const hits = [];
  for (const m of text.matchAll(DIALOG_RE)) hits.push(`${rel}:${lineOf(text, m.index)} ${m[1]}(`);
  return hits;
}

/** Local <script src> values (classic and type="module"), in document order. */
function localScriptSrcs(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const src = m[1].split(/[?#]/)[0];
    if (/^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('data:')) continue; // remote, not ours
    out.push(src.replace(/^\.\//, ''));
  }
  return out;
}

/** Stylesheet hrefs from <link rel="stylesheet">. */
function stylesheetHrefs(html) {
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\brel\s*=\s*["'][^"']*\bstylesheet\b/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (href) out.push(href[1].replace(/^\.\//, ''));
  }
  return out;
}

/** All files under a directory, as repo-relative POSIX paths. */
function walk(relDir) {
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = toPosix(path.join(relDir, entry.name));
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(m?js)$/.test(entry.name)) out.push(rel);
  }
  return out.sort();
}

/** The href values inside the navCategories array literal in shared.js. */
function navHrefs(sharedJs) {
  const start = sharedJs.indexOf('navCategories = [');
  assert.ok(start !== -1, 'shared.js has no "navCategories = [" declaration');
  // Find the matching closing bracket of the array literal.
  let depth = 0;
  let end = -1;
  for (let i = sharedJs.indexOf('[', start); i < sharedJs.length; i++) {
    if (sharedJs[i] === '[') depth++;
    else if (sharedJs[i] === ']' && --depth === 0) { end = i; break; }
  }
  assert.ok(end !== -1, 'navCategories array literal is not closed');
  const block = sharedJs.slice(start, end + 1);
  return [...block.matchAll(/\bhref\s*:\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

const htmlPages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
const sharedJs = read('shared.js');

// ----------------------------------------------------------------------------
// 1. PAGE DISCOVERY & NAVIGATION
// ----------------------------------------------------------------------------
suite('1. Page Discovery & Navigation (shared.js navCategories)', () => {
  test(`Discovered ${htmlPages.length} HTML pages in the repo root, including index.html`, () => {
    assert.ok(htmlPages.includes('index.html'), 'index.html not found in repo root');
    assert.ok(htmlPages.length >= 2, `expected several pages, found ${htmlPages.length}`);
  });

  let hrefs = [];
  test('navCategories in shared.js lists at least one href, with no duplicates', () => {
    hrefs = navHrefs(sharedJs);
    assert.ok(hrefs.length > 0, 'navCategories has no href entries');
    const dupes = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
    assert.deepStrictEqual(dupes, [], `duplicate nav hrefs: ${dupes.join(', ')}`);
  });

  test('Every navCategories href points at an existing file', () => {
    const missing = hrefs.filter((h) => !fs.existsSync(path.join(ROOT, h.split(/[?#]/)[0])));
    assert.deepStrictEqual(missing, [], `nav hrefs with no file: ${missing.join(', ')}`);
  });

  test('Every HTML page except index.html is listed in navCategories', () => {
    const unlisted = htmlPages.filter((p) => p !== 'index.html' && !hrefs.includes(p));
    assert.deepStrictEqual(unlisted, [], `pages missing from the nav: ${unlisted.join(', ')}`);
  });
});

// ----------------------------------------------------------------------------
// 2. PER-PAGE CHECKS (every *.html in the repo root)
// ----------------------------------------------------------------------------
suite('2. Per-Page Structure, Inline Styles & Native Dialogs', () => {
  for (const page of htmlPages) {
    const html = read(page);
    const scripts = localScriptSrcs(html);

    test(`${page}: doctype, <title>, no legacy Tailwind CDN`, () => {
      assert.ok(/<!DOCTYPE html>/i.test(html), 'missing <!DOCTYPE html>');
      assert.ok(/<title>[^<]*\S[^<]*<\/title>/i.test(html), 'missing or empty <title>');
      assert.ok(!html.includes('cdn.tailwindcss.com'), 'contains the legacy Tailwind CDN');
    });

    test(`${page}: loads main.css and shared.js`, () => {
      assert.ok(stylesheetHrefs(html).includes('main.css'), 'no <link rel="stylesheet" href="main.css">');
      assert.ok(scripts.includes('shared.js'), 'no <script src="shared.js">');
    });

    test(`${page}: has 0 style="" attributes`, () => {
      const hits = [...html.matchAll(STYLE_ATTR_RE)].map((m) => `${page}:${lineOf(html, m.index)}`);
      assert.deepStrictEqual(hits, [], `inline style attributes at ${hits.join(', ')}`);
    });

    test(`${page}: 0 alert/prompt/confirm in the page and its local scripts (${scripts.join(', ') || 'none'})`, () => {
      const missing = scripts.filter((s) => !fs.existsSync(path.join(ROOT, s)));
      assert.deepStrictEqual(missing, [], `page loads scripts that do not exist: ${missing.join(', ')}`);
      const hits = [...findDialogs(page, html), ...scripts.flatMap((s) => findDialogs(s, read(s)))];
      assert.deepStrictEqual(hits, [], `native dialogs: ${hits.join('; ')}`);
    });
  }
});

// ----------------------------------------------------------------------------
// 3. PAGE MODULES (src/pages/**, which module pages import from)
// ----------------------------------------------------------------------------
suite('3. Page Modules under src/pages/', () => {
  const pageModules = walk('src/pages');

  test(`src/pages/ contains page modules (${pageModules.length} found)`, () => {
    assert.ok(pageModules.length > 0, 'no .js files under src/pages/');
  });

  test('0 alert/prompt/confirm in any file under src/pages/', () => {
    const hits = pageModules.flatMap((f) => findDialogs(f, read(f)));
    assert.deepStrictEqual(hits, [], `native dialogs: ${hits.join('; ')}`);
  });
});

// ----------------------------------------------------------------------------
// 4. SHARED CSS & NAV MODULE
// ----------------------------------------------------------------------------
suite('4. CSS Tokens & Shared Navigation Module', () => {
  test('Academic CSS design tokens and layout classes are defined in main.css', () => {
    const cssContent = read('main.css');
    assert.strictEqual(cssContent.includes('--primary:'), true, 'main.css missing --primary token');
    assert.strictEqual(cssContent.includes('--bg-page:'), true, 'main.css missing --bg-page token');
    assert.strictEqual(cssContent.includes('--font-main:'), true, 'main.css missing --font-main token');
    assert.strictEqual(cssContent.includes('.side-navbar'), true, 'main.css missing .side-navbar');
    assert.strictEqual(cssContent.includes('.page-header'), true, 'main.css missing .page-header');
    assert.strictEqual(cssContent.includes('.control-section') || cssContent.includes('.controls-row'), true, 'main.css missing control classes');
    assert.strictEqual(cssContent.includes('.viz-stage') || cssContent.includes('.stage'), true, 'main.css missing stage classes');
    assert.strictEqual(cssContent.includes('.output-box') || cssContent.includes('.log-container'), true, 'main.css missing output or log classes');
  });

  test('Shared navigation module (shared.js) initializes overlay, drawer and toast', () => {
    assert.strictEqual(sharedJs.includes('initNavigation'), true, 'shared.js missing initNavigation');
    assert.strictEqual(sharedJs.includes('showToast'), true, 'shared.js missing showToast');
    assert.strictEqual(sharedJs.includes('navCategories'), true, 'shared.js missing categorized navCategories');
  });

  test('0 alert/prompt/confirm in shared.js', () => {
    const hits = findDialogs('shared.js', sharedJs);
    assert.deepStrictEqual(hits, [], `native dialogs: ${hits.join('; ')}`);
  });
});

console.log(`\n======================================================`);
console.log(` SUMMARY: ${passedTests} / ${totalTests} assertions passed (${Math.round(passedTests / totalTests * 100)}%)`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) process.exitCode = 1;
