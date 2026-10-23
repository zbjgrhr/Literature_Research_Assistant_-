document.getElementById('btn-open-current-pdf')?.addEventListener('click', async () => {
  const status = document.getElementById('online-pdf-status');
  try {
    const result = await browser.runtime.sendMessage({ type: 'OPEN_ONLINE_PDF' });
    if (!result?.ok) throw new Error(result?.error || 'Unable to open PDF');
    window.close();
  } catch (error) {
    status.textContent = wtpBilingual('onlinePdfFailed') + ' (' + error.message + ')';
  }
});

document.getElementById('btn-open-viewer')?.addEventListener('click', async () => {
  try {
    await browser.runtime.sendMessage({ type: 'OPEN_VIEWER' });
    window.close();
  } catch (e) {
    alert(e.message || String(e));
  }
});

document.getElementById('btn-open-viewer-last')?.addEventListener('click', async () => {
  try {
    await browser.runtime.sendMessage({ type: 'OPEN_VIEWER_LAST' });
    window.close();
  } catch (e) {
    alert(e.message || String(e));
  }
});

wtpInitPanelApp(document.body, {
  inPage: false,
  onAddNote: async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) return;
    try {
      await browser.runtime.sendMessage({ type: 'OPEN_NOTE_MODAL', tabId: tab.id });
      window.close();
    } catch (e) {
      alert(e.message || String(e));
    }
  }
});
