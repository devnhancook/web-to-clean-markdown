/**
 * Popup Script for Web to Clean Markdown & Study Archiver
 * Author: @devnhancook
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements - Header & Tabs
  const tabBtnClipper = document.getElementById('tab-btn-clipper');
  const tabBtnScanner = document.getElementById('tab-btn-scanner');
  const tabBtnVault = document.getElementById('tab-btn-vault');
  const viewClipper = document.getElementById('view-clipper');
  const viewScanner = document.getElementById('view-scanner');
  const viewVault = document.getElementById('view-vault');
  const vaultCountBadge = document.getElementById('vault-count-badge');
  const pdfCountBadge = document.getElementById('pdf-count-badge');
  const statVaultTotal = document.getElementById('stat-vault-total');
  const btnOptions = document.getElementById('open-options');

  // Doc Helper Card (Studocu/Scribd)
  const docHelperBanner = document.getElementById('doc-helper-banner');
  const docProviderName = document.getElementById('doc-provider-name');
  const btnDocCleanPrint = document.getElementById('btn-doc-clean-print');
  const btnDocExtractMd = document.getElementById('btn-doc-extract-md');
  const btnDocReadInline = document.getElementById('btn-doc-read-inline');
  const btnCookieClean = document.getElementById('btn-cookie-clean');

  // Elements - Clipper View
  const elTitle = document.getElementById('article-title');
  const elDomain = document.getElementById('domain-badge');
  const elReadTime = document.getElementById('read-time-badge');
  const elWords = document.getElementById('stat-words');
  const elTokens = document.getElementById('stat-tokens');
  const elPreview = document.getElementById('markdown-preview');
  const saveSubjectTag = document.getElementById('save-subject-tag');

  const btnCopy = document.getElementById('btn-copy-llm');
  const btnSaveVault = document.getElementById('btn-save-vault');
  const btnDownload = document.getElementById('btn-download-md');
  const btnSelect = document.getElementById('btn-select-element');

  // Elements - Scanner View
  const pdfListContainer = document.getElementById('pdf-list-container');
  const btnRescanPdfs = document.getElementById('btn-rescan-pdfs');
  const btnDownloadAllPdfs = document.getElementById('btn-download-all-pdfs');

  // Elements - Vault View
  const vaultSearch = document.getElementById('vault-search');
  const tagFilterContainer = document.getElementById('tag-filter-container');
  const vaultList = document.getElementById('vault-list');
  const btnExportVault = document.getElementById('btn-export-vault');
  const btnClearVault = document.getElementById('btn-clear-vault');

  // Elements - Reader Modal
  const readerModal = document.getElementById('reader-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalTag = document.getElementById('modal-tag');
  const modalDate = document.getElementById('modal-date');
  const modalUrl = document.getElementById('modal-url');
  const modalBody = document.getElementById('modal-body');
  const modalBtnCopy = document.getElementById('modal-btn-copy');
  const modalBtnDownload = document.getElementById('modal-btn-download');
  const btnCloseModal = document.getElementById('btn-close-modal');

  let currentParsedData = null;
  let activeTabId = null;
  let activeTabUrl = '';
  let savedUserOptions = {};
  let vaultArticles = [];
  let currentFilterTag = 'ALL';
  let activeModalArticle = null;
  let scannedPdfs = [];

  // ================= TAB NAVIGATION =================
  function switchTab(activeBtn, activeView) {
    [tabBtnClipper, tabBtnScanner, tabBtnVault].forEach(b => b.classList.remove('active'));
    [viewClipper, viewScanner, viewVault].forEach(v => v.classList.remove('active'));

    activeBtn.classList.add('active');
    activeView.classList.add('active');
  }

  tabBtnClipper.addEventListener('click', () => switchTab(tabBtnClipper, viewClipper));
  tabBtnScanner.addEventListener('click', () => {
    switchTab(tabBtnScanner, viewScanner);
    renderPdfScanner();
  });
  tabBtnVault.addEventListener('click', () => {
    switchTab(tabBtnVault, viewVault);
    renderVault();
  });

  // ================= LOAD STORAGE DATA =================
  function loadVault() {
    chrome.storage.local.get(['vaultArticles', 'userOptions'], (res) => {
      vaultArticles = res.vaultArticles || [];
      savedUserOptions = res.userOptions || {};
      updateVaultCounts();
    });
  }

  function updateVaultCounts() {
    const count = vaultArticles.length;
    if (vaultCountBadge) vaultCountBadge.innerText = count;
    if (statVaultTotal) statVaultTotal.innerText = count;
  }

  loadVault();

  // ================= ACTIVE TAB PARSING =================
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    elTitle.innerText = 'Cannot clip browser system page. Open any public website.';
    btnCopy.disabled = true;
    btnDownload.disabled = true;
    btnSaveVault.disabled = true;
    btnSelect.disabled = true;
    return;
  }

  activeTabId = tab.id;
  activeTabUrl = tab.url;

  try {
    const urlObj = new URL(tab.url);
    elDomain.innerText = urlObj.hostname.replace('www.', '');
  } catch (e) {
    elDomain.innerText = 'Webpage';
  }

  // Ensure content scripts and engines are injected
  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      files: [
        'lib/Readability.js',
        'lib/turndown.js',
        'lib/turndown-plugin-gfm.js',
        'content/content.js',
        'content/studocu_engine.js',
        'content/pdf_scanner.js'
      ]
    });
  } catch (err) {
    console.warn('Script injection warning:', err);
  }

  // 1. Detect Studocu / Scribd directly from URL + Content Script
  const lowerUrl = (activeTabUrl || '').toLowerCase();
  const isDocDomain = lowerUrl.includes('studocu.') || lowerUrl.includes('scribd.');
  if (isDocDomain) {
    docHelperBanner.style.display = 'flex';
    docProviderName.innerText = lowerUrl.includes('studocu.') ? 'Studocu Document' : 'Scribd Document';
  }

  chrome.tabs.sendMessage(activeTabId, { action: 'DETECT_DOC_PROVIDER' }, (res) => {
    if (res && res.isDocumentSite) {
      docHelperBanner.style.display = 'flex';
      docProviderName.innerText = res.provider === 'studocu' ? 'Studocu Document' : 'Scribd Document';
    }
  });

  // 2. Request Clean Markdown from Content Script
  chrome.tabs.sendMessage(activeTabId, { action: 'GET_CLEAN_MARKDOWN', options: savedUserOptions }, (response) => {
    if (chrome.runtime.lastError || !response || typeof response.markdown !== 'string') {
      elTitle.innerText = (response && response.title) || tab.title || 'Untitled Page';
      elPreview.innerText = 'Unable to parse page automatically. Use "Smart Selector" or PDF Scanner.';
      return;
    }

    currentParsedData = response;
    elTitle.innerText = response.title || tab.title;
    elReadTime.innerText = `${response.readTimeMinutes || 1} min read`;
    elWords.innerText = (response.wordCount || 0).toLocaleString();
    elTokens.innerText = `~${Math.round((response.wordCount || 0) * 1.35).toLocaleString()}`;
    elPreview.innerText = response.markdown.slice(0, 1500) + (response.markdown.length > 1500 ? '\n\n...[Preview Truncated]' : '');
  });

  // 3. Auto Scan PDF Links on page load (with retry for dynamic/iframe viewers)
  scanPageForPdfs();
  setTimeout(scanPageForPdfs, 600);
  setTimeout(scanPageForPdfs, 1500);

  function scanPageForPdfs() {
    chrome.tabs.sendMessage(activeTabId, { action: 'SCAN_PDF_LINKS' }, (res) => {
      if (res && res.success && Array.isArray(res.pdfs)) {
        scannedPdfs = res.pdfs;
        if (pdfCountBadge) pdfCountBadge.innerText = scannedPdfs.length;
        renderPdfScanner();
      }
    });
  }

  // ================= STUDOCU / SCRIBD ACTIONS =================
  // Idle labels captured once at init — handlers must restore these constants,
  // never the live innerHTML (a previous error text must not become the baseline).
  const idlePrintLabel = btnDocCleanPrint.innerHTML;
  const idleReadLabel = btnDocReadInline.innerHTML;

  btnDocCleanPrint.addEventListener('click', async () => {
    if (btnDocCleanPrint.disabled) return;
    btnDocCleanPrint.disabled = true;
    btnDocCleanPrint.innerHTML = `<span>⏳ Đang xử lý A4...</span>`;

    // Single-engine flow: the content-script engine (studocu_engine.js)
    // force-loads all lazy pages, unblurs, builds the viewer and prints.
    // A timeout guards against an engine that never responds.
    let timeoutId = null;
    try {
      const res = await Promise.race([
        chrome.tabs.sendMessage(activeTabId, { action: 'STUDOCU_PRINT_CLEAN' }),
        new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('print-timeout')), 120000); })
      ]);
      if (!res || !res.success) {
        if (res && res.error === 'SUPERSEDED') {
          // A newer run took over — restore quietly, no error noise.
          btnDocCleanPrint.innerHTML = idlePrintLabel;
          btnDocCleanPrint.disabled = false;
          return;
        }
        throw new Error((res && res.error) || 'engine-failed');
      }
    } catch (e) {
      const isTimeout = e && e.message === 'print-timeout';
      console.warn('Clean print message warning:', e);
      // Visible failure state — the popup console is invisible to users.
      btnDocCleanPrint.innerHTML = isTimeout
        ? `<span>⌛ Lâu bất thường — engine vẫn chạy ngầm, dialog in có thể hiện sau.</span>`
        : `<span>⚠️ Lỗi xuất PDF — thử lại.</span>`;
      btnDocCleanPrint.disabled = false;
      return;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    btnDocCleanPrint.innerHTML = idlePrintLabel;
    btnDocCleanPrint.disabled = false;
  });

  btnDocReadInline.addEventListener('click', async () => {
    if (btnDocReadInline.disabled) return;
    btnDocReadInline.disabled = true;
    btnDocReadInline.innerHTML = `<span>⏳ Đang mở...</span>`;

    // Read-in-place flow: same shared engine, preview mode builds the viewer
    // and leaves it on the page (no print). Close the popup so the user
    // can read — the viewer stays behind with its own ✕ button.
    let timeoutId = null;
    try {
      const res = await Promise.race([
        chrome.tabs.sendMessage(activeTabId, { action: 'STUDOCU_PRINT_CLEAN', preview: true }),
        new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('print-timeout')), 120000); })
      ]);
      if (!res || !res.success) {
        if (res && res.error === 'SUPERSEDED') {
          btnDocReadInline.innerHTML = idleReadLabel;
          btnDocReadInline.disabled = false;
          return;
        }
        throw new Error((res && res.error) || 'engine-failed');
      }
      window.close();
      return;
    } catch (e) {
      console.warn('Read-in-place warning:', e);
      // Visible failure state — the popup console is invisible to users.
      btnDocReadInline.innerHTML = `<span>⚠️ Lỗi — thử lại.</span>`;
      btnDocReadInline.disabled = false;
      return;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  });

  btnCookieClean.addEventListener('click', async () => {
    btnCookieClean.innerText = 'Đang quét cookie...';
    try {
      const allCookies = await chrome.cookies.getAll({});
      let count = 0;
      for (const cookie of allCookies) {
        if (cookie.domain.includes('studocu') || cookie.domain.includes('scribd')) {
          let cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
          const protocol = cookie.secure ? "https:" : "http:";
          const url = `${protocol}//${cleanDomain}${cookie.path}`;
          await chrome.cookies.remove({ url: url, name: cookie.name, storeId: cookie.storeId });
          count++;
        }
      }
      btnCookieClean.innerText = `Đã xóa ${count} cookies!`;
      setTimeout(() => {
        chrome.tabs.reload(activeTabId);
        window.close();
      }, 1000);
    } catch (e) {
      btnCookieClean.innerText = 'Lỗi xóa cookie';
    }
  });

  btnDocExtractMd.addEventListener('click', () => {
    btnDocExtractMd.innerText = 'Đang trích xuất...';
    chrome.tabs.sendMessage(activeTabId, { action: 'STUDOCU_EXTRACT_MARKDOWN' }, (res) => {
      btnDocExtractMd.innerText = 'Trích xuất Text';
      if (res && res.success && res.markdown) {
        currentParsedData = {
          title: res.title,
          markdown: res.markdown,
          wordCount: res.markdown.split(/\s+/).length,
          readTimeMinutes: Math.ceil(res.markdown.split(/\s+/).length / 200),
          url: tab.url
        };
        elTitle.innerText = res.title;
        elWords.innerText = currentParsedData.wordCount.toLocaleString();
        elTokens.innerText = `~${Math.round(currentParsedData.wordCount * 1.35).toLocaleString()}`;
        elPreview.innerText = res.markdown.slice(0, 1500) + (res.markdown.length > 1500 ? '\n\n...[Preview Truncated]' : '');
        switchTab(tabBtnClipper, viewClipper);
      }
    });
  });

  // ================= PDF SCANNER TAB RENDERING =================
  btnRescanPdfs.addEventListener('click', () => {
    btnRescanPdfs.innerText = 'Đang quét...';
    scanPageForPdfs();
    setTimeout(() => { btnRescanPdfs.innerText = '🔄 Quét lại'; }, 800);
  });

  function renderPdfScanner() {
    pdfListContainer.innerHTML = '';
    if (scannedPdfs.length === 0) {
      pdfListContainer.innerHTML = `
        <div class="vault-empty-state">
          <p>Không tìm thấy file PDF nào trên trang này.</p>
          <p style="margin-top:4px;color:#94a3b8;">Thử mở trang tài liệu hoặc bài báo có chứa link PDF.</p>
        </div>
      `;
      btnDownloadAllPdfs.style.display = 'none';
      return;
    }

    btnDownloadAllPdfs.style.display = 'flex';
    btnDownloadAllPdfs.innerHTML = `<span>Tải toàn bộ (${scannedPdfs.length} file PDF)</span>`;

    scannedPdfs.forEach((pdf, index) => {
      const card = document.createElement('div');
      card.className = 'pdf-item';
      card.innerHTML = `
        <div class="pdf-item-title" title="${escapeHtml(pdf.title)}">${escapeHtml(pdf.title)}</div>
        <div class="pdf-item-url" title="${escapeHtml(pdf.url)}">${escapeHtml(pdf.url)}</div>
        <div class="pdf-item-actions">
          <button class="btn-mini btn-dl-single-pdf" data-url="${escapeHtml(pdf.url)}" data-filename="${escapeHtml(pdf.filename)}">📥 Tải về</button>
          <button class="btn-mini btn-copy-pdf-url" data-url="${escapeHtml(pdf.url)}">📋 Copy Link</button>
        </div>
      `;
      pdfListContainer.appendChild(card);
    });

    pdfListContainer.querySelectorAll('.btn-dl-single-pdf').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        const filename = btn.getAttribute('data-filename');
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_PDF_FILE',
          payload: { url, filename }
        });
        btn.innerText = '✓ Đang tải...';
        setTimeout(() => { btn.innerText = '📥 Tải về'; }, 1500);
      });
    });

    pdfListContainer.querySelectorAll('.btn-copy-pdf-url').forEach(btn => {
      btn.addEventListener('click', async () => {
        const url = btn.getAttribute('data-url');
        await navigator.clipboard.writeText(url);
        btn.innerText = '✓ Copied!';
        setTimeout(() => { btn.innerText = '📋 Copy Link'; }, 1500);
      });
    });
  }

  btnDownloadAllPdfs.addEventListener('click', () => {
    scannedPdfs.forEach(pdf => {
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_PDF_FILE',
        payload: { url: pdf.url, filename: pdf.filename }
      });
    });
    btnDownloadAllPdfs.innerHTML = `<span>✓ Đã gửi lệnh tải ${scannedPdfs.length} file!</span>`;
    setTimeout(() => {
      btnDownloadAllPdfs.innerHTML = `<span>Tải toàn bộ (${scannedPdfs.length} file PDF)</span>`;
    }, 2500);
  });

  // ================= ACTION: SAVE TO VAULT =================
  btnSaveVault.addEventListener('click', () => {
    if (!currentParsedData || !currentParsedData.markdown) return;

    const chosenTag = saveSubjectTag.value || '📚 Chung';
    const newArticle = {
      id: 'doc_' + Date.now(),
      title: currentParsedData.title || tab.title || 'Untitled',
      url: currentParsedData.url || tab.url,
      domain: elDomain.innerText,
      tag: chosenTag,
      date: new Date().toISOString().split('T')[0],
      wordCount: currentParsedData.wordCount || 0,
      readTimeMinutes: currentParsedData.readTimeMinutes || 1,
      markdown: currentParsedData.markdown,
      excerpt: currentParsedData.excerpt || ''
    };

    const existingIdx = vaultArticles.findIndex(a => a.url === newArticle.url);
    if (existingIdx !== -1) {
      vaultArticles[existingIdx] = newArticle;
    } else {
      vaultArticles.unshift(newArticle);
    }

    chrome.storage.local.set({ vaultArticles }, () => {
      updateVaultCounts();
      const origText = btnSaveVault.innerHTML;
      btnSaveVault.style.background = '#059669';
      btnSaveVault.innerHTML = `<span>✓ Saved to Vault!</span>`;
      setTimeout(() => {
        btnSaveVault.style.background = '';
        btnSaveVault.innerHTML = origText;
      }, 1800);
    });
  });

  // ================= ACTION: COPY FOR LLM =================
  btnCopy.addEventListener('click', async () => {
    if (!currentParsedData || !currentParsedData.markdown) return;

    try {
      const textToCopy = currentParsedData.promptWrapped || currentParsedData.markdown;
      await navigator.clipboard.writeText(textToCopy);

      const originalHTML = btnCopy.innerHTML;
      btnCopy.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      btnCopy.innerHTML = `<span>✓ Copied to Clipboard!</span>`;

      setTimeout(() => {
        btnCopy.style.background = '';
        btnCopy.innerHTML = originalHTML;
      }, 1800);
    } catch (err) {
      alert('Failed to copy to clipboard.');
    }
  });

  // ================= ACTION: DOWNLOAD .MD =================
  btnDownload.addEventListener('click', () => {
    if (!currentParsedData || !currentParsedData.markdown) return;

    const safeTitle = (currentParsedData.title || 'article')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_MARKDOWN',
      payload: {
        filename: `${safeTitle}.md`,
        content: currentParsedData.markdown
      }
    }, (res) => {
      if (res && res.success) {
        btnDownload.innerText = '✓ Downloaded!';
        setTimeout(() => {
          btnDownload.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download .md
          `;
        }, 1800);
      }
    });
  });

  // ================= ACTION: SELECT ELEMENT =================
  btnSelect.addEventListener('click', () => {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, { action: 'START_ELEMENT_SELECTOR' });
    window.close();
  });

  // ================= VAULT LIST RENDERING =================
  function renderVault() {
    vaultList.innerHTML = '';
    const query = (vaultSearch.value || '').toLowerCase().trim();

    const filtered = vaultArticles.filter(item => {
      const matchTag = (currentFilterTag === 'ALL' || item.tag === currentFilterTag);
      const matchQuery = !query ||
        (item.title && item.title.toLowerCase().includes(query)) ||
        (item.domain && item.domain.toLowerCase().includes(query)) ||
        (item.excerpt && item.excerpt.toLowerCase().includes(query));
      return matchTag && matchQuery;
    });

    if (filtered.length === 0) {
      vaultList.innerHTML = `
        <div class="vault-empty-state">
          <p>No saved articles found in this category.</p>
          <p style="margin-top:4px;color:#38bdf8;">Click "Save to Vault" in the Clipper tab to archive articles!</p>
        </div>
      `;
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'vault-item';
      card.innerHTML = `
        <div class="vault-item-header">
          <span class="vault-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
          <span class="vault-item-tag">${escapeHtml(item.tag || '📚')}</span>
        </div>
        <div class="vault-item-meta">
          <span>${escapeHtml(item.domain)} • ${item.date}</span>
          <span>${(item.wordCount || 0).toLocaleString()} words</span>
        </div>
        <div class="vault-item-actions">
          <button class="btn-mini btn-view-doc" data-id="${item.id}">👁️ View</button>
          <button class="btn-mini btn-copy-doc" data-id="${item.id}">📋 Copy LLM</button>
          <button class="btn-mini btn-dl-doc" data-id="${item.id}">📥 .md</button>
          <button class="btn-mini btn-mini-danger btn-del-doc" data-id="${item.id}">🗑️</button>
        </div>
      `;
      vaultList.appendChild(card);
    });

    // Card listeners
    vaultList.querySelectorAll('.btn-view-doc').forEach(b => {
      b.addEventListener('click', () => openReaderModal(b.getAttribute('data-id')));
    });

    vaultList.querySelectorAll('.btn-copy-doc').forEach(b => {
      b.addEventListener('click', async () => {
        const doc = vaultArticles.find(a => a.id === b.getAttribute('data-id'));
        if (doc && doc.markdown) {
          await navigator.clipboard.writeText(doc.markdown);
          b.innerText = '✓ Copied!';
          setTimeout(() => { b.innerText = '📋 Copy LLM'; }, 1500);
        }
      });
    });

    vaultList.querySelectorAll('.btn-dl-doc').forEach(b => {
      b.addEventListener('click', () => {
        const doc = vaultArticles.find(a => a.id === b.getAttribute('data-id'));
        if (doc && doc.markdown) {
          const safeName = (doc.title || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          chrome.runtime.sendMessage({
            action: 'DOWNLOAD_MARKDOWN',
            payload: { filename: `${safeName}.md`, content: doc.markdown }
          });
          b.innerText = '✓ Done!';
          setTimeout(() => { b.innerText = '📥 .md'; }, 1500);
        }
      });
    });

    vaultList.querySelectorAll('.btn-del-doc').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        vaultArticles = vaultArticles.filter(a => a.id !== id);
        chrome.storage.local.set({ vaultArticles }, () => {
          updateVaultCounts();
          renderVault();
        });
      });
    });
  }

  // Filter Chips Click
  tagFilterContainer.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      tagFilterContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilterTag = chip.getAttribute('data-tag');
      renderVault();
    });
  });

  // Search input
  vaultSearch.addEventListener('input', () => {
    renderVault();
  });

  // Export All as JSON Backup
  btnExportVault.addEventListener('click', () => {
    if (vaultArticles.length === 0) {
      alert('Vault is currently empty.');
      return;
    }
    const jsonStr = JSON.stringify(vaultArticles, null, 2);
    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_MARKDOWN',
      payload: {
        filename: `study_vault_backup_${new Date().toISOString().split('T')[0]}.json`,
        content: jsonStr
      }
    });
  });

  // Clear Vault
  btnClearVault.addEventListener('click', () => {
    if (vaultArticles.length === 0) return;
    if (confirm('Are you sure you want to clear all saved articles in your Vault?')) {
      vaultArticles = [];
      chrome.storage.local.set({ vaultArticles: [] }, () => {
        updateVaultCounts();
        renderVault();
      });
    }
  });

  // ================= READER MODAL =================
  function openReaderModal(id) {
    const doc = vaultArticles.find(a => a.id === id);
    if (!doc) return;
    activeModalArticle = doc;

    modalTitle.innerText = doc.title;
    modalTag.innerText = doc.tag;
    modalDate.innerText = doc.date;
    modalUrl.href = doc.url;
    modalBody.innerText = doc.markdown;
    readerModal.style.display = 'flex';
  }

  btnCloseModal.addEventListener('click', () => {
    readerModal.style.display = 'none';
  });

  modalBtnCopy.addEventListener('click', async () => {
    if (activeModalArticle && activeModalArticle.markdown) {
      await navigator.clipboard.writeText(activeModalArticle.markdown);
      modalBtnCopy.innerText = '✓ Copied!';
      setTimeout(() => { modalBtnCopy.innerText = '📋 Copy for LLM'; }, 1500);
    }
  });

  modalBtnDownload.addEventListener('click', () => {
    if (activeModalArticle && activeModalArticle.markdown) {
      const safeName = (activeModalArticle.title || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_MARKDOWN',
        payload: { filename: `${safeName}.md`, content: activeModalArticle.markdown }
      });
      modalBtnDownload.innerText = '✓ Done!';
      setTimeout(() => { modalBtnDownload.innerText = '📥 Download .md'; }, 1500);
    }
  });

  // Open Options
  btnOptions.addEventListener('click', (e) => {
    e.preventDefault();
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
