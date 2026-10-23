/** CSP-safe flag: local file reader page (no inline scripts in reader.html). */
globalThis.wtpViewerMode = true;

// Set identity before the selection/highlight scripts initialize.
try {
  const source = new URLSearchParams(location.search).get('url');
  if (source) globalThis.wtpViewerPageKeyOverride = wtpNormalizePdfUrl(source).split('#')[0];
} catch { /* The reader displays validation errors after initialization. */ }

globalThis.wtpViewerDocumentReady = false;
