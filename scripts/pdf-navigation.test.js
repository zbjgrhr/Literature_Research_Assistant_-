const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const flush = () => new Promise(setImmediate);

async function setup(tabs = []) {
  const listeners = {};
  const updated = [];
  const event = key => ({ addListener(fn, filter) { listeners[key] = fn; if (filter) listeners.filter = filter; } });
  const context = vm.createContext({ URL, console, Blob, AbortController, setTimeout, clearTimeout,
    browser: {
      runtime: { getURL: p => 'chrome-extension://test/' + p, onInstalled: event('installed'), onStartup: event('startup') },
      webRequest: { onHeadersReceived: event('headers') },
      tabs: { query: async () => tabs, get: async id => tabs.find(tab => tab.id === id), update: async (id, value) => updated.push({ id, ...value }), onUpdated: event('updated') }
    }
  });
  for (const file of ['shared/online-pdf.js', 'background/pdf-navigation.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  await flush();
  return { listeners, updated, tabs };
}

test('reload picks up already-open PDF tabs, retaining queries and page fragments', async () => {
  const api = await setup([{ id: 1, url: 'https://example.org/Paper.PDF?token=abc#page=2' }, { id: 2, url: 'https://example.org/article' }]);
  assert.equal(api.updated.length, 1);
  assert.equal(new URL(api.updated[0].url).searchParams.get('url'), 'https://example.org/Paper.PDF?token=abc#page=2');
});

test('PDF MIME header recognizes top-level endpoints without a PDF suffix', async () => {
  const api = await setup([{ id: 1, url: 'about:blank', pendingUrl: 'https://example.org/download?id=7#page=3' }]);
  api.listeners.headers({ tabId: 1, url: 'https://example.org/download?id=7', statusCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/pdf; charset=binary' }] });
  await flush();
  assert.equal(api.updated.length, 1);
  assert.equal(new URL(api.updated[0].url).searchParams.get('url'), 'https://example.org/download?id=7#page=3');
  assert.equal(api.listeners.filter.types.join(','), 'main_frame');
});

test('response callback ignores HTML, attachments, HTTP errors and requests without a tab', async () => {
  const api = await setup([{ id: 1, url: 'https://example.org/download' }]);
  const event = { tabId: 1, url: 'https://example.org/download', statusCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }] };
  api.listeners.headers(event);
  api.listeners.headers({ ...event, statusCode: 403, responseHeaders: [{ name: 'Content-Type', value: 'application/pdf' }] });
  api.listeners.headers({ ...event, tabId: -1, responseHeaders: [{ name: 'Content-Type', value: 'application/pdf' }] });
  api.listeners.headers({ ...event, responseHeaders: [{ name: 'Content-Type', value: 'application/pdf' }, { name: 'Content-Disposition', value: 'attachment; filename=paper.pdf' }] });
  await flush();
  assert.equal(api.updated.length, 0);
});

test('stale response does not replace a page after the user navigates away', async () => {
  const api = await setup([{ id: 1, url: 'https://example.org/other' }]);
  api.listeners.headers({ tabId: 1, url: 'https://example.org/download', statusCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/pdf' }] });
  await flush();
  assert.equal(api.updated.length, 0);
});

test('cached PDF completion is detected, and the reader URL cannot redirect into itself', async () => {
  const api = await setup([{ id: 1, url: 'https://example.org/paper.pdf' }]);
  api.updated.length = 0;
  api.listeners.updated(1, { status: 'complete' }, api.tabs[0]);
  await flush();
  assert.equal(api.updated.length, 1);
  api.tabs[0].url = api.updated[0].url;
  api.listeners.updated(1, { status: 'complete' }, api.tabs[0]);
  await flush();
  assert.equal(api.updated.length, 1);
});
