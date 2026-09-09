/**
 * Studocu & Scribd Unblur & Clean Print Engine
 * Optimized with batch DOM traversal and deterministic container teardown.
 */

(function () {
  if (window.__studocu_engine_initialized__) return;
  window.__studocu_engine_initialized__ = true;

  // CAP-3: automatic cookie reset on doc entry. Scoped to document pages only
  // with suffix host matching. Loop-proof by navigation type: our own reload
  // (and any F5) reports type 'reload' and never re-requests — only genuine
  // navigate/back_forward entries ask the worker. Returning to a doc from
  // home therefore resets again, while reloads can never loop. A manual
  // refresh skips auto-reset (use the manual cookie button after F5).
  try {
    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    const onDocPath = path.includes('/document/');
    const onStudocuDoc = onDocPath && /(^|\.)studocu\.(com|vn)$/.test(host);
    const onScribdDoc = onDocPath && /(^|\.)scribd\.com$/.test(host);
    const provider = onStudocuDoc ? 'studocu' : (onScribdDoc ? 'scribd' : null);
    const navType = ((performance.getEntriesByType('navigation') || [])[0] || {}).type;
    const freshEntry = navType === 'navigate' || navType === 'back_forward';
    const canMessage = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage);
    if (provider && freshEntry && canMessage && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['userOptions'], (res) => {
        try {
          if ((res.userOptions || {}).autoCookieReset === false) return;
          chrome.runtime.sendMessage(
            { action: 'ENTRY_AUTO_RESET_REQUEST', domain: provider },
            (r) => { if (r && r.reset && r.cleared > 0) window.location.reload(); }
          );
        } catch (e) { /* entry reset skipped */ }
      });
    }
  } catch (e) { /* storage unavailable — skip entry reset */ }

  const SCALE_FACTOR = 4;
  const HEIGHT_SCALE_DIVISOR = 4;

  /**
   * Unblur and remove paywall overlays on live DOM
   */
  function unblurDocument() {
    // 1. Inject or verify CSS styles
    const styleId = 'w2m-unblur-style';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `
        html, body { overflow: auto !important; height: auto !important; user-select: text !important; }
        #upgrade-overlay, .banner-wrapper, [class*="paywall"], [class*="overlay"],
        [class*="preview_overlay"], [class*="blur_overlay"], [class*="modal_wrapper"],
        #page-container-wrapper + div, .advertisement, .doc_watermark, .scribd_watermark,
        [class*="watermark"],
        .between_page_ads, .promo_banner, .page_blur, .text_layer_blurred, .autofill_page_blur,
        div[class*="upsell"], div[class*="unlock_prompt"], div[class*="preview-banner"],
        [class*="AIToolbar"], [class*="CreationToggleList"] {
          display: none !important; opacity: 0 !important; pointer-events: none !important; z-index: -9999 !important;
        }
        .pf, .pc, #document-wrapper, .document_scroller, .page_missing_explanation, .document-wrapper, #viewer-wrapper {
          display: block !important; visibility: visible !important; opacity: 1 !important; filter: none !important; -webkit-filter: none !important;
        }
        .blurred_page, [class*="blur"] { filter: none !important; -webkit-filter: none !important; user-select: text !important; }
        .blurred_page:before, .blurred_page:after { display: none !important; }
      `;
      document.head.appendChild(styleEl);
    }

    // 2. Clear inline blur filters and overflow blocks
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';

    document.querySelectorAll('.blurred_page, .page_blur, .page-blur, div[data-page-index]').forEach(el => {
      el.style.filter = 'none';
      el.style.webkitFilter = 'none';
      el.style.opacity = '1';
      el.style.visibility = 'visible';
    });

    return { success: true, message: 'Unblur applied' };
  }

  /**
   * Helper: Copy computed styles safely with scaling
   */
  function copyComputedStyle(source, target, scaleFactor, shouldScaleHeight = false, shouldScaleWidth = false, heightScaleDivisor = 4, widthScaleDivisor = 4, shouldScaleMargin = false, marginScaleDivisor = 4) {
    const computedStyle = window.getComputedStyle(source);
    
    const normalProps = [
      'position', 'left', 'top', 'bottom', 'right',
      'font-family', 'font-weight', 'font-style',
      'color', 'background-color',
      'text-align', 'white-space',
      'display', 'visibility', 'opacity', 'z-index',
      'text-shadow', 'unicode-bidi', 'font-feature-settings', 'padding'
    ];
    
    const scaleProps = ['font-size', 'line-height'];
    let styleString = '';
    
    normalProps.forEach(prop => {
      const value = computedStyle.getPropertyValue(prop);
      if (value && value !== 'none' && value !== 'auto' && value !== 'normal') {
        styleString += `${prop}: ${value} !important; `;
      }
    });
    
    const widthValue = computedStyle.getPropertyValue('width');
    if (widthValue && widthValue !== 'none' && widthValue !== 'auto') {
      if (shouldScaleWidth) {
        const numValue = parseFloat(widthValue);
        if (!isNaN(numValue) && numValue > 0) {
          const unit = widthValue.replace(numValue.toString(), '');
          styleString += `width: ${numValue / widthScaleDivisor}${unit} !important; `;
        } else {
          styleString += `width: ${widthValue} !important; `;
        }
      } else {
        styleString += `width: ${widthValue} !important; `;
      }
    }
    
    const heightValue = computedStyle.getPropertyValue('height');
    if (heightValue && heightValue !== 'none' && heightValue !== 'auto') {
      if (shouldScaleHeight) {
        const numValue = parseFloat(heightValue);
        if (!isNaN(numValue) && numValue > 0) {
          const unit = heightValue.replace(numValue.toString(), '');
          styleString += `height: ${numValue / heightScaleDivisor}${unit} !important; `;
        } else {
          styleString += `height: ${heightValue} !important; `;
        }
      } else {
        styleString += `height: ${heightValue} !important; `;
      }
    }
    
    ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'].forEach(prop => {
      const value = computedStyle.getPropertyValue(prop);
      if (value && value !== 'auto') {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          if (shouldScaleMargin && numValue !== 0) {
            const unit = value.replace(numValue.toString(), '');
            styleString += `${prop}: ${numValue / marginScaleDivisor}${unit} !important; `;
          } else {
            styleString += `${prop}: ${value} !important; `;
          }
        }
      }
    });
    
    scaleProps.forEach(prop => {
      const value = computedStyle.getPropertyValue(prop);
      if (value && value !== 'none' && value !== 'auto' && value !== 'normal') {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue !== 0) {
          const unit = value.replace(numValue.toString(), '');
          styleString += `${prop}: ${numValue / scaleFactor}${unit} !important; `;
        } else {
          styleString += `${prop}: ${value} !important; `;
        }
      }
    });
    
    const transformOrigin = computedStyle.getPropertyValue('transform-origin');
    if (transformOrigin) {
      styleString += `transform-origin: ${transformOrigin} !important; -webkit-transform-origin: ${transformOrigin} !important; `;
    }
    
    styleString += 'overflow: visible !important; max-width: none !important; max-height: none !important; clip: auto !important; clip-path: none !important; ';
    target.style.cssText += styleString;
  }

  function deepCloneWithStyles(element, scaleFactor, heightScaleDivisor, depth = 0) {
    const clone = element.cloneNode(false);
    const hasTextClass = element.classList && element.classList.contains('t');
    const hasUnderscoreClass = element.classList && element.classList.contains('_');
    
    const shouldScaleMargin = element.tagName === 'SPAN' && 
                               element.classList && 
                               element.classList.contains('_') &&
                               Array.from(element.classList).some(cls => /^_(?:\d+[a-z]*|[a-z]+\d*)$/i.test(cls));
    
    copyComputedStyle(element, clone, scaleFactor, hasTextClass, hasUnderscoreClass, heightScaleDivisor, 4, shouldScaleMargin, scaleFactor);
    
    if (element.classList && element.classList.contains('pc')) {
      clone.style.setProperty('transform', 'none', 'important');
      clone.style.setProperty('-webkit-transform', 'none', 'important');
      clone.style.setProperty('overflow', 'visible', 'important');
      clone.style.setProperty('max-width', 'none', 'important');
      clone.style.setProperty('max-height', 'none', 'important');
    }
    
    if (element.childNodes.length === 1 && element.childNodes[0].nodeType === 3) {
      clone.textContent = element.textContent;
    } else {
      element.childNodes.forEach(child => {
        if (child.nodeType === 1) {
          clone.appendChild(deepCloneWithStyles(child, scaleFactor, heightScaleDivisor, depth + 1));
        } else if (child.nodeType === 3) {
          clone.appendChild(child.cloneNode(true));
        }
      });
    }
    return clone;
  }

  // Single source of truth for "the document's pages" — harvester progress,
  // stabilize loop, and viewer build all share it (no selector drift).
  const PAGE_SELECTORS_PRIMARY = 'div[data-page-index]';
  const PAGE_SELECTORS_FALLBACK = '.document_scroller .outer_page, .document_scroller .page_missing_explanation, .document_column .page_missing_explanation, .document-wrapper .page';

  function findDocPages() {
    const primary = document.querySelectorAll(PAGE_SELECTORS_PRIMARY);
    return primary.length > 0 ? primary : document.querySelectorAll(PAGE_SELECTORS_FALLBACK);
  }

  /**
   * CAP-2: remove blur/cover/junk nodes from a viewer clone and neutralize
   * filters on the page root. Clone-only — the live DOM is hidden, never removed.
   */
  function stripCloneJunk(root) {
    root.querySelectorAll('.page_blur, .text_layer_blurred, .autofill_page_blur, [class*="blur"], [class*="AIToolbar"], [class*="CreationToggleList"]').forEach(el => el.remove());
    if (root.classList) {
      Array.from(root.classList).filter(c => c.toLowerCase().includes('blur')).forEach(c => root.classList.remove(c));
    }
    root.style.setProperty('filter', 'none', 'important');
    root.style.setProperty('-webkit-filter', 'none', 'important');
    root.style.setProperty('backdrop-filter', 'none', 'important');
  }

  /**
   * Auto-scroll harvester: scrolls through entire document to force Studocu/Scribd
   * to load 100% of lazy-loaded pages before building clean print view.
   */
  async function forceLazyLoadAllPages(onProgress) {
    unblurDocument();
    
    const scrollContainer = document.scrollingElement || document.documentElement || document.body;
    const originalScrollPos = scrollContainer.scrollTop;
    const totalHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step = Math.max(window.innerHeight * 0.8, 600);
    
    // Quick down-scroll pass to trigger intersection observers
    for (let pos = 0; pos <= totalHeight; pos += step) {
      window.scrollTo({ top: pos, behavior: 'instant' });
      unblurDocument();
      if (typeof onProgress === 'function') {
        onProgress(findDocPages().length);
      }
      await new Promise(r => setTimeout(r, 60));
    }
    
    // Stabilize: slow lazy-loaders keep adding pages after the scroll pass —
    // wait until the count stops growing (fixes viewers built with only the
    // first pages on long docs). Bounded at ~30s so a stuck loader can't hang us.
    let lastCount = -1, stableRounds = 0;
    const stabilizeStart = Date.now();
    const countPages = () => findDocPages().length;
    while (stableRounds < 3 && Date.now() - stabilizeStart < 30000) {
      unblurDocument();
      const count = countPages();
      stableRounds = (count === lastCount) ? stableRounds + 1 : 0;
      lastCount = count;
      await new Promise(r => setTimeout(r, 500));
    }
    unblurDocument();
    window.scrollTo({ top: originalScrollPos, behavior: 'instant' });
  }

  /**
   * Build clean A4 viewer with full lazy-load guarantee.
   * previewOnly=true keeps the viewer on the page for in-place reading
   * (no print machinery); otherwise the viewer prints immediately.
   */
  async function buildCleanPrintableDocument(previewOnly = false) {
    // Entry ticket, taken synchronously: if a newer run starts while this one
    // is still harvesting, the stale run aborts without touching the DOM.
    const myTicket = (window.__w2mViewerTicket = (window.__w2mViewerTicket || 0) + 1);
    unblurDocument();

    // Refuse preview while a print session is active — building now would yank
    // the viewer out from under the ongoing print.
    if (previewOnly && (window.__w2mPrintActive || window.matchMedia('print').matches)) {
      alert('⚠️ Đang mở hộp thoại in — hãy đóng nó trước khi đọc tại chỗ.');
      return { success: false, error: 'PRINT_DIALOG_OPEN' };
    }

    // 1. Force lazy-load of all pages
    await forceLazyLoadAllPages();

    // Abort if superseded by a newer run — leave the DOM to the winner.
    if (myTicket !== window.__w2mViewerTicket) {
      return { success: false, error: 'SUPERSEDED' };
    }

    // 2. Remove any existing clean viewer — via its registered cleanup first
    // so prior listeners/timers are unhooked, not just orphaned.
    if (typeof window.__w2mViewerCleanup === 'function') {
      try { window.__w2mViewerCleanup(); } catch (e) { /* already torn down */ }
      window.__w2mViewerCleanup = null;
    }
    const existing = document.getElementById('clean-viewer-container');
    if (existing) existing.remove();

    // 3. Identify pages (Studocu or Scribd) — primary set wins so the same
    // logical page is never counted twice from both selector sets.
    let pages = findDocPages();

    if (pages.length === 0) {
      alert("⚠️ Không tìm thấy trang nào.\n(Hãy cuộn chuột xuống cuối tài liệu để trang web tải hết nội dung trước khi xuất!)");
      return { success: false, error: 'NO_PAGES_FOUND' };
    }

    const viewerContainer = document.createElement('div');
    viewerContainer.id = 'clean-viewer-container';

    // A per-run token stops a stale run (timers/listeners from an earlier
    // click) from tearing down a newer container sharing the same ID.
    const runToken = (window.__w2mViewerRun = (window.__w2mViewerRun || 0) + 1);
    viewerContainer.dataset.run = String(runToken);

    // Viewer styles ride inside the container so they vanish with it on teardown
    // (guarantees the host page is never left blanked by injected CSS).
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('content/viewer.css');
    viewerContainer.appendChild(styleLink);

    // Single stylesheet-error handler for both print and preview modes:
    // drop the viewer and say so — never leave a hidden/unstyled page.
    // (Declared `styleFailed` here so the print path below can reuse it.)
    let styleFailed = false;
    styleLink.addEventListener('error', () => {
      styleFailed = true;
      const c = document.getElementById('clean-viewer-container');
      if (c) c.remove();
      alert('⚠️ Không tải được giao diện in/đọc (viewer.css) — đã khôi phục trang gốc.');
    });

    pages.forEach((page, index) => {
      const pc = page.querySelector('.pc');
      let width = 595.3; // Fallback A4
      let height = 841.9;

      if (pc) {
        const pcStyle = window.getComputedStyle(pc);
        const pcWidth = parseFloat(pcStyle.width);
        const pcHeight = parseFloat(pcStyle.height);
        
        if (!isNaN(pcWidth) && pcWidth > 0 && !isNaN(pcHeight) && pcHeight > 0) {
          width = pcWidth;
          height = pcHeight;
        } else {
          const rect = pc.getBoundingClientRect();
          if (rect.width > 10 && rect.height > 10) {
            width = rect.width;
            height = rect.height;
          }
        }
      }
      
      const newPage = document.createElement('div');
      newPage.className = 'std-page';
      newPage.id = `std-page-${index + 1}`;
      newPage.setAttribute('data-page-number', index + 1);
      newPage.style.width = width + 'px';
      newPage.style.height = height + 'px';

      // Background Image Layer
      const originalImg = page.querySelector('img.bi') || page.querySelector('img');
      if (originalImg && originalImg.src) {
        const bgLayer = document.createElement('div');
        bgLayer.className = 'layer-bg';
        const imgClone = originalImg.cloneNode(true);
        imgClone.style.cssText = 'width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; filter: none !important; -webkit-filter: none !important;';
        bgLayer.appendChild(imgClone);
        newPage.appendChild(bgLayer);
      }

      // Text Layer
      const originalPc = page.querySelector('.pc');
      if (originalPc) {
        const textLayer = document.createElement('div');
        textLayer.className = 'layer-text';
        const pcClone = deepCloneWithStyles(originalPc, SCALE_FACTOR, HEIGHT_SCALE_DIVISOR);
        pcClone.querySelectorAll('img').forEach(img => img.style.display = 'none');
        textLayer.appendChild(pcClone);
        newPage.appendChild(textLayer);
      } else {
        // Scribd fallback text extraction if no .pc
        const textNodes = page.querySelectorAll('p, span, div.text_layer');
        if (textNodes.length > 0) {
          const textLayer = document.createElement('div');
          textLayer.className = 'layer-text';
          textNodes.forEach(tn => {
            textLayer.appendChild(tn.cloneNode(true));
          });
          newPage.appendChild(textLayer);
        }
      }

      // CAP-2: strip blur/cover/junk from the clone before it enters the viewer.
      stripCloneJunk(newPage);

      viewerContainer.appendChild(newPage);
    });

    document.body.appendChild(viewerContainer);

    // Preview (read-in-place) mode: keep the viewer on the page with a close
    // button and skip all print machinery (no timers, no listeners, no print).
    if (previewOnly) {
      // Shared closer for ✕ button and Escape key. It also clears the global
      // cleanup registry when it is the active run (no leaks, no stale kills).
      const escHandler = (e) => {
        if (e.key !== 'Escape') return;
        closePreview();
      };
      const closePreview = () => {
        if (window.__w2mViewerCleanup === closePreview) window.__w2mViewerCleanup = null;
        const c = document.getElementById('clean-viewer-container');
        if (c) c.remove();
        document.removeEventListener('keydown', escHandler);
      };
      const closeBtn = document.createElement('button');
      closeBtn.className = 'clean-viewer-close';
      closeBtn.textContent = '✕ Đóng';
      closeBtn.addEventListener('click', closePreview);
      document.addEventListener('keydown', escHandler);
      viewerContainer.appendChild(closeBtn);
      closeBtn.focus({ preventScroll: true });
      window.__w2mViewerCleanup = closePreview;
      return { success: true, count: pages.length, preview: true };
    }

    // Teardown removes the container — the viewer stylesheet rides inside it,
    // so no injected CSS is ever left blanking the host page.
    // (Run token was assigned at container creation; stale runs skip foreign tokens.)
    const mediaQueryList = window.matchMedia('print');
    let printEngaged = false;
    const teardownCleanViewer = () => {
      if (window.__w2mViewerCleanup === teardownCleanViewer) window.__w2mViewerCleanup = null;
      window.__w2mPrintActive = false;
      if (viewerContainer.isConnected) {
        viewerContainer.remove();
      } else {
        const c = document.getElementById('clean-viewer-container');
        if (c && c.dataset.run === String(runToken)) c.remove();
      }
      mediaQueryList.removeEventListener('change', cleanupHandler);
      window.removeEventListener('afterprint', teardownCleanViewer);
    };
    const cleanupHandler = (mql) => {
      if (mql.matches) {
        printEngaged = true;
      } else {
        teardownCleanViewer();
      }
    };
    mediaQueryList.addEventListener('change', cleanupHandler);
    window.addEventListener('afterprint', teardownCleanViewer);
    window.__w2mViewerCleanup = teardownCleanViewer;

    // Fallback: if the print dialog never opens (blocked/failed window.print),
    // don't leave the host page hidden behind the viewer.
    setTimeout(() => {
      if (!printEngaged && !window.matchMedia('print').matches) teardownCleanViewer();
    }, 30000);

    // Print once the viewer stylesheet is ready; the timeout fallback keeps a
    // slow/blocked stylesheet from hanging the flow silently.
    // (`styleFailed` and the error listener live with the <link> creation above.)
    let printFired = false;
    const firePrint = () => {
      if (printFired || styleFailed) return;
      // The viewer may have been replaced (e.g. read-in-place mode took
      // over) — never pop a print dialog over a foreign container.
      if (!viewerContainer.isConnected) return;
      printFired = true;
      window.__w2mPrintActive = true;
      try {
        window.print();
      } catch (e) {
        console.warn('window.print failed:', e);
        teardownCleanViewer();
        alert('⚠️ Không mở được hộp thoại in trên trang này.');
      }
    };
    styleLink.addEventListener('load', () => setTimeout(firePrint, 300));
    setTimeout(firePrint, 3000);

    return { success: true, count: pages.length };
  }

  /**
   * Extract document text content directly into clean Markdown
   * Reconstructs lines based on vertical DOM coordinates to prevent words bunching up.
   */
  function extractDocToMarkdown() {
    unblurDocument();

    const title = document.title.replace(/[\-–|].*$/, '').trim() || 'Studocu Document';
    const pages = document.querySelectorAll('div[data-page-index], .document_scroller .outer_page');
    let fullMarkdown = `# ${title}\n\n`;

    if (pages.length === 0) {
      return { success: false, markdown: '' };
    }

    pages.forEach((page, idx) => {
      fullMarkdown += `\n\n## --- Trang ${idx + 1} ---\n\n`;
      
      // Collect all text elements with their layout positions
      const textElements = Array.from(page.querySelectorAll('.pc span, .pc .t, .pc div, p, span.t'));
      
      if (textElements.length === 0) {
        fullMarkdown += (page.innerText || '').trim() + '\n';
        return;
      }

      // Group text elements by vertical line position (top coordinate)
      const lineMap = new Map();
      const LINE_TOLERANCE = 4; // pixels tolerance for same line

      textElements.forEach(el => {
        const text = el.innerText ? el.innerText.trim() : '';
        if (!text) return;
        // Ignore hidden or duplicate container text if child exists
        if (el.children.length > 0 && Array.from(el.children).some(c => c.classList && (c.classList.contains('t') || c.classList.contains('c')))) {
          return;
        }

        const rect = el.getBoundingClientRect();
        const top = rect.top;
        const left = rect.left;

        // Find existing line bucket
        let matchedLineKey = null;
        for (const lineKey of lineMap.keys()) {
          if (Math.abs(top - lineKey) <= LINE_TOLERANCE) {
            matchedLineKey = lineKey;
            break;
          }
        }

        if (matchedLineKey !== null) {
          lineMap.get(matchedLineKey).push({ left, text });
        } else {
          lineMap.set(top, [{ left, text }]);
        }
      });

      // Sort lines top to bottom
      const sortedTops = Array.from(lineMap.keys()).sort((a, b) => a - b);
      let pageText = '';

      sortedTops.forEach(topKey => {
        const lineItems = lineMap.get(topKey);
        // Sort items left to right
        lineItems.sort((a, b) => a.left - b.left);
        const lineContent = lineItems.map(item => item.text).join(' ');
        if (lineContent.trim()) {
          pageText += lineContent.trim() + '\n\n';
        }
      });

      fullMarkdown += (pageText.trim() || page.innerText.trim()) + '\n';
    });

    return {
      success: true,
      title,
      markdown: fullMarkdown,
      pageCount: pages.length
    };
  }

  // Message Listener
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'STUDOCU_UNBLUR') {
      const res = unblurDocument();
      sendResponse(res);
      return true;
    }
    if (msg.action === 'STUDOCU_PRINT_CLEAN') {
      buildCleanPrintableDocument(msg && msg.preview === true).then(res => {
        sendResponse(res);
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if (msg.action === 'STUDOCU_EXTRACT_MARKDOWN') {
      forceLazyLoadAllPages().then(() => {
        const res = extractDocToMarkdown();
        sendResponse(res);
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    if (msg.action === 'DETECT_DOC_PROVIDER') {
      const hostname = window.location.hostname.toLowerCase();
      const isStudocu = hostname.includes('studocu.');
      const isScribd = hostname.includes('scribd.');
      sendResponse({
        isDocumentSite: isStudocu || isScribd,
        provider: isStudocu ? 'studocu' : (isScribd ? 'scribd' : null),
        pageCount: document.querySelectorAll('div[data-page-index], .document_scroller .outer_page').length
      });
      return true;
    }
  });
})();
