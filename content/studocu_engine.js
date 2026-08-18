/**
 * Studocu & Scribd Unblur & Clean Print Engine
 * Optimized with batch DOM traversal and deterministic container teardown.
 */

(function () {
  if (window.__studocu_engine_initialized__) return;
  window.__studocu_engine_initialized__ = true;

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
        #page-container-wrapper + div, .advertisement, .doc_watermark, .scribd_watermark,
        .between_page_ads, .promo_banner, .page_blur, .text_layer_blurred, .autofill_page_blur {
          display: none !important; opacity: 0 !important; pointer-events: none !important; z-index: -9999 !important;
        }
        .pf, .pc, #document-wrapper, .document_scroller, .page_missing_explanation {
          display: block !important; visibility: visible !important; opacity: 1 !important; filter: none !important; -webkit-filter: none !important;
        }
        .blurred_page { filter: none !important; -webkit-filter: none !important; user-select: text !important; }
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

  /**
   * Build clean A4 printable viewer
   */
  function buildCleanPrintableDocument() {
    unblurDocument();

    // 1. Remove any existing clean viewer
    const existing = document.getElementById('clean-viewer-container');
    if (existing) existing.remove();

    // 2. Identify pages (Studocu or Scribd)
    let pages = document.querySelectorAll('div[data-page-index]');
    if (pages.length === 0) {
      pages = document.querySelectorAll('.document_scroller .page_missing_explanation, .document_scroller .outer_page, .document_column .page_missing_explanation');
    }

    if (pages.length === 0) {
      alert("⚠️ Không tìm thấy trang nào.\n(Hãy cuộn chuột xuống cuối tài liệu để trang web tải hết nội dung trước khi xuất!)");
      return { success: false, error: 'NO_PAGES_FOUND' };
    }

    const viewerContainer = document.createElement('div');
    viewerContainer.id = 'clean-viewer-container';

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
        imgClone.style.cssText = 'width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block;';
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

      viewerContainer.appendChild(newPage);
    });

    document.body.appendChild(viewerContainer);

    // Auto cleanup listener after print completes or cancels
    const mediaQueryList = window.matchMedia('print');
    const cleanupHandler = (mql) => {
      if (!mql.matches) {
        const c = document.getElementById('clean-viewer-container');
        if (c) c.remove();
        mediaQueryList.removeEventListener('change', cleanupHandler);
      }
    };
    mediaQueryList.addEventListener('change', cleanupHandler);

    setTimeout(() => {
      window.print();
    }, 1000);

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
      const res = buildCleanPrintableDocument();
      sendResponse(res);
      return true;
    }
    if (msg.action === 'STUDOCU_EXTRACT_MARKDOWN') {
      const res = extractDocToMarkdown();
      sendResponse(res);
      return true;
    }
    if (msg.action === 'DETECT_DOC_PROVIDER') {
      const isStudocu = window.location.hostname.includes('studocu.com');
      const isScribd = window.location.hostname.includes('scribd.com');
      sendResponse({
        isDocumentSite: isStudocu || isScribd,
        provider: isStudocu ? 'studocu' : (isScribd ? 'scribd' : null),
        pageCount: document.querySelectorAll('div[data-page-index], .document_scroller .outer_page').length
      });
      return true;
    }
  });
})();
