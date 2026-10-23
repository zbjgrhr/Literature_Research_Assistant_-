const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

function helpers(fetch) {
  const context = vm.createContext({ URL, Blob, AbortController, setTimeout, clearTimeout, fetch });
  vm.runInContext(fs.readFileSync(path.join(root, 'shared/online-pdf.js'), 'utf8'), context);
  return context;
}

test('URL validation preserves download queries and rejects unsupported schemes and credentials', () => {
  const api = helpers();
  assert.equal(api.wtpNormalizePdfUrl(' https://example.org/download?id=3#page=2 '), 'https://example.org/download?id=3#page=2');
  for (const url of ['javascript:alert(1)', 'file:///paper.pdf', 'data:application/pdf,123', 'https://user:pass@example.org/p.pdf', 'bad']) {
    assert.throws(() => api.wtpNormalizePdfUrl(url));
  }
});

test('PDF without extension or PDF MIME type loads with website credentials', async () => {
  let options;
  const api = helpers(async (url, opts) => {
    options = opts;
    return new Response('%PDF-1.7\nexample', { headers: { 'content-type': 'application/octet-stream' } });
  });
  const blob = await api.wtpFetchOnlinePdf('https://example.org/download?id=3');
  assert.equal(await blob.text(), '%PDF-1.7\nexample');
  assert.equal(options.credentials, 'include');
});

test('HTTP errors, HTML login pages and oversized declared responses fail explicitly', async () => {
  for (const [response, error] of [
    [new Response('', { status: 403 }), /HTTP 403/],
    [new Response('<html>Please log in</html>'), /PDF_NOT_DOCUMENT/],
    [new Response('', { headers: { 'content-length': 51 * 1024 * 1024 } }), /PDF_TOO_LARGE/]
  ]) {
    await assert.rejects(helpers(async () => response).wtpFetchOnlinePdf('https://example.org/paper'), error);
  }
});

test('streamed responses without content length are capped and cancelled', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(26 * 1024 * 1024)); },
    cancel() { cancelled = true; }
  }));
  await assert.rejects(helpers(async () => response).wtpFetchOnlinePdf('https://example.org/paper'), /PDF_TOO_LARGE/);
  assert.equal(cancelled, true);
});

test('background opens current PDF in reader and rejects invalid source URLs', async () => {
  let listener;
  const created = [];
  const noop = { addListener() {} };
  const context = helpers();
  context.importScripts = () => {};
  context.browser = {
    runtime: { getURL: p => 'chrome-extension://test/' + p, onInstalled: noop, onMessage: { addListener(fn) { listener = fn; } } },
    contextMenus: { onClicked: noop }, alarms: { onAlarm: noop }, commands: { onCommand: noop }, action: { onClicked: noop },
    tabs: { query: async () => [{ id: 1, url: 'https://example.org/download?id=3#page=2' }], create: async value => created.push(value), onRemoved: noop }
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'background/service-worker.js'), 'utf8'), context);
  const message = msg => new Promise(resolve => listener(msg, {}, resolve));
  assert.equal((await message({ type: 'OPEN_ONLINE_PDF' })).ok, true);
  assert.equal(new URL(created[0].url).searchParams.get('url'), 'https://example.org/download?id=3#page=2');
  assert.equal((await message({ type: 'OPEN_ONLINE_PDF', url: 'file:///paper.pdf' })).ok, false);
  assert.equal(created.length, 1);
});

test('highlight restoration does not remove saved annotations before PDF text is ready', async () => {
  let reads = 0;
  const context = vm.createContext({
    wtpViewerMode: true, wtpViewerDocumentReady: false,
    document: { readyState: 'loading', addEventListener() {} },
    browser: { storage: { local: { get() { reads++; throw new Error('must wait for render'); } } } }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'content/highlight-persist.js'), 'utf8'), context);
  await context.wtpHighlight.restoreHighlights();
  assert.equal(reads, 0);
});
