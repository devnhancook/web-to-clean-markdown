/**
 * Universal PDF Scanner Content Script
 * Scans page DOM for .pdf links in <a>, <embed>, <iframe>, and data attributes.
 */

(function () {
  if (window.__pdf_scanner_initialized__) return;
  window.__pdf_scanner_initialized__ = true;

  function scanPdfLinks() {
    const pdfMap = new Map();

    function addPdf(rawUrl, titleHint, sourceHint) {
      if (!rawUrl || typeof rawUrl !== 'string') return;
      
      // Check if rawUrl itself is PDF or contains a nested PDF URL in query params (like pdf.js, google viewer, etc.)
      const extractedUrls = extractAllPdfUrlsFromTarget(rawUrl);
      extractedUrls.forEach(targetUrl => {
        try {
          const absUrl = new URL(targetUrl, window.location.href).href;
          if (!pdfMap.has(absUrl)) {
            const filename = extractFilename(absUrl);
            pdfMap.set(absUrl, {
              url: absUrl,
              filename: filename,
              title: (titleHint || filename).trim(),
              source: sourceHint || 'scanner'
            });
          }
        } catch (e) {}
      });
    }

    // 1. Scan all <a> tags
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      const text = (a.innerText || a.getAttribute('title') || a.getAttribute('aria-label') || '').trim();
      addPdf(href, text, 'link');
    });

    // 2. Scan <embed>, <iframe>, <object> tags (including viewer.html?file=... URLs)
    document.querySelectorAll('embed[src], iframe[src], object[data]').forEach(el => {
      const src = el.getAttribute('src') || el.getAttribute('data');
      const title = el.getAttribute('title') || 'Embedded PDF Document';
      addPdf(src, title, 'embed');
    });

    // 3. Scan elements with custom data attributes or src attributes
    document.querySelectorAll('[data-pdf], [data-pdf-url], [data-download-url], [data-src], [data-file], [data-url]').forEach(el => {
      const val = el.getAttribute('data-pdf') || el.getAttribute('data-pdf-url') || el.getAttribute('data-download-url') || el.getAttribute('data-src') || el.getAttribute('data-file') || el.getAttribute('data-url');
      const text = el.innerText.trim() || el.getAttribute('title') || '';
      addPdf(val, text, 'data-attr');
    });

    // 4. Scan button onclick or script links matching .pdf
    document.querySelectorAll('button[onclick], a[onclick], div[onclick]').forEach(el => {
      const onclickAttr = el.getAttribute('onclick') || '';
      const matches = onclickAttr.match(/https?:\/\/[^\s'"]+\.pdf[^\s'"]*|\/[^\s'"]+\.pdf[^\s'"]*/gi);
      if (matches) {
        matches.forEach(m => addPdf(m, el.innerText.trim(), 'onclick'));
      }
    });

    return Array.from(pdfMap.values());
  }

  function extractAllPdfUrlsFromTarget(target) {
    const results = [];
    if (!target) return results;

    // Check direct
    if (isPdfUrl(target)) {
      results.push(target);
    }

    // Check if target is a viewer URL containing file=..., url=..., doc=..., src=...
    try {
      const urlObj = new URL(target, window.location.href);
      const params = ['file', 'url', 'doc', 'src', 'pdf', 'target', 'link'];
      params.forEach(p => {
        const val = urlObj.searchParams.get(p);
        if (val && isPdfUrl(val)) {
          results.push(val);
        }
      });
    } catch (e) {}

    return results;
  }

  function isPdfUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    
    // Quick patterns
    if (lower.includes('.pdf')) return true;
    if (lower.includes('/pdf/')) return true;
    if (lower.includes('format=pdf') || lower.includes('type=pdf') || lower.includes('response-content-type=application/pdf')) return true;
    if (lower.includes('drive.google.com/file') || lower.includes('docs.google.com/viewer')) return true;
    
    return false;
  }

  function extractFilename(url) {
    try {
      const urlObj = new URL(url);
      
      // If filename parameter is explicitly present in query
      const fnParam = urlObj.searchParams.get('filename') || urlObj.searchParams.get('name') || urlObj.searchParams.get('file');
      if (fnParam) {
        const cleanFn = decodeURIComponent(fnParam.split('?')[0].split('#')[0]);
        if (cleanFn.toLowerCase().endsWith('.pdf')) return cleanFn;
        return `${cleanFn}.pdf`;
      }

      const path = urlObj.pathname;
      const base = path.split('/').filter(Boolean).pop();
      if (base) {
        let cleanBase = decodeURIComponent(base.split('?')[0].split('#')[0]);
        cleanBase = cleanBase.replace(/\.pdf$/i, ''); // Strip trailing .pdf if any
        return `${cleanBase}.pdf`;
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
