// Native PDF viewers don't expose their selection to content scripts. Move
// top-level PDF navigations into our own reader, where the normal tools run.
(function () {
  const navigating = new Set();
  const stripHash = value => String(value || '').split('#')[0];
  function isPdfPath(value) {
    try {
      const url = new URL(wtpNormalizePdfUrl(value));
      return /\.pdf$/i.test(decodeURIComponent(url.pathname));
    } catch { return false; }
  }

  async function openInReader(tabId, source) {
    if (tabId < 0 || navigating.has(tabId)) return;
    navigating.add(tabId);
    try {
      const url = wtpNormalizePdfUrl(source);
      const tab = await browser.tabs.get(tabId);
      // Don't replace a page the user has already navigated away to. Keep
      // the original fragment so page links remain available to the reader.
      const current = [tab.pendingUrl, tab.url].find(value => stripHash(value) === stripHash(url));
      if (!current) return;
      await browser.tabs.update(tabId, {
        url: browser.runtime.getURL('viewer/reader.html') + '?url=' + encodeURIComponent(current)
      });
    } catch (error) {
      console.warn('[WTP] PDF navigation failed', error?.message || String(error));
    } finally {
      navigating.delete(tabId);
    }
  }

  browser.webRequest.onHeadersReceived.addListener(details => {
    if (details.tabId < 0 || details.statusCode < 200 || details.statusCode >= 300) return;
    const headers = details.responseHeaders || [];
    const header = name => headers.find(item => item.name.toLowerCase() === name)?.value || '';
    if (/^attachment\b/i.test(header('content-disposition'))) return;
    if (/^application\/pdf\b/i.test(header('content-type'))) {
      void openInReader(details.tabId, details.url);
    }
  }, { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] }, ['responseHeaders']);

  // Covers native PDF tabs that were already open when the extension was
  // installed/reloaded, plus cached PDFs for which no response event arrives.
  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.status === 'complete' && isPdfPath(tab.url)) void openInReader(tabId, tab.url);
  });
  async function scanOpenTabs() {
    const tabs = await browser.tabs.query({});
    await Promise.all(tabs.filter(tab => isPdfPath(tab.url)).map(tab => openInReader(tab.id, tab.url)));
  }
  browser.runtime.onInstalled.addListener(() => { void scanOpenTabs(); });
  browser.runtime.onStartup.addListener(() => { void scanOpenTabs(); });
  void scanOpenTabs();
})();
