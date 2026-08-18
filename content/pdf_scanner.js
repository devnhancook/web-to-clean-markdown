/**
 * Universal PDF Scanner Content Script
 * Scans page DOM for .pdf links in <a>, <embed>, <iframe>, and data attributes.
 */

(function () {
  if (window.__pdf_scanner_initialized__) return;
  window.__pdf_scanner_initialized__ = true;

  function scanPdfLinks() {
    const pdfMap = new Map();

    // 1. Scan <a> tags
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;

      try {
        const absUrl = new URL(href, window.location.href).href;
        if (isPdfUrl(absUrl)) {
          const text = (a.innerText || a.getAttribute('title') || a.getAttribute('aria-label') || '').trim();
          const filename = extractFilename(absUrl);
          pdfMap.set(absUrl, {
            url: absUrl,
            filename: filename,
            title: text || filename,
            source: 'anchor'
          });
        }
      } catch (e) {
        // Invalid URL ignore
      }
    });

    // 2. Scan <embed> and <iframe> tags
    document.querySelectorAll('embed[src], iframe[src]').forEach(el => {
      const src = el.getAttribute('src');
      if (!src) return;
      try {
        const absUrl = new URL(src, window.location.href).href;
        if (isPdfUrl(absUrl) || (el.getAttribute('type') || '').includes('pdf')) {
          const filename = extractFilename(absUrl);
          pdfMap.set(absUrl, {
            url: absUrl,
            filename: filename,
            title: `Embedded: ${filename}`,
            source: 'embed'
          });
        }
      } catch (e) {}
    });

    // 3. Scan elements with data-pdf, data-url, data-href
    document.querySelectorAll('[data-pdf], [data-pdf-url], [data-download-url]').forEach(el => {
      const val = el.getAttribute('data-pdf') || el.getAttribute('data-pdf-url') || el.getAttribute('data-download-url');
      if (!val) return;
      try {
        const absUrl = new URL(val, window.location.href).href;
        if (isPdfUrl(absUrl)) {
          const text = el.innerText.trim();
          const filename = extractFilename(absUrl);
          pdfMap.set(absUrl, {
            url: absUrl,
            filename: filename,
            title: text || filename,
            source: 'data-attribute'
          });
        }
      } catch (e) {}
    });

    return Array.from(pdfMap.values());
  }

  function isPdfUrl(url) {
    if (!url) return false;
    const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
    return cleanUrl.endsWith('.pdf') || url.toLowerCase().includes('.pdf?') || url.includes('/pdf/') || url.includes('format=pdf') || url.includes('type=pdf');
  }

  function extractFilename(url) {
    try {
      const path = new URL(url).pathname;
      const base = path.split('/').filter(Boolean).pop();
      if (base && base.toLowerCase().endsWith('.pdf')) {
        return decodeURIComponent(base);
      }
      return 'document.pdf';
    } catch (e) {
      return 'document.pdf';
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'SCAN_PDF_LINKS') {
      const pdfs = scanPdfLinks();
      sendResponse({ success: true, count: pdfs.length, pdfs });
      return true;
    }
  });
})();
