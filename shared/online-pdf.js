(function (global) {
  function normalizePdfUrl(value) {
    const url = new URL(String(value || '').trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('PDF_URL_INVALID');
    }
    return url.href;
  }

  // Check the bytes too: download endpoints often have no .pdf suffix, and
  // authentication failures can return an HTML page with a successful status.
  async function fetchPdf(value) {
    const url = normalizePdfUrl(value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const limit = 50 * 1024 * 1024;
    try {
      const response = await fetch(url, { credentials: 'include', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (Number(response.headers.get('content-length')) > limit) throw new Error('PDF_TOO_LARGE');
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { value: chunk, done } = await reader.read();
          if (done) break;
          size += chunk.byteLength;
          if (size > limit) throw new Error('PDF_TOO_LARGE');
          chunks.push(chunk);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      }
      const blob = new Blob(chunks, { type: 'application/pdf' });
      const head = await blob.slice(0, 1024).text();
      if (!head.includes('%PDF-')) throw new Error('PDF_NOT_DOCUMENT');
      return blob;
    } finally {
      clearTimeout(timeout);
    }
  }

  global.wtpNormalizePdfUrl = normalizePdfUrl;
  global.wtpFetchOnlinePdf = fetchPdf;
})(globalThis);
