/**
 * Popup Script for Web to Clean Markdown & Study Archiver
 * Author: @devnhancook
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements - Header & Tabs
  const tabBtnClipper = document.getElementById('tab-btn-clipper');
  const tabBtnVault = document.getElementById('tab-btn-vault');
  const viewClipper = document.getElementById('view-clipper');
  const viewVault = document.getElementById('view-vault');
  const vaultCountBadge = document.getElementById('vault-count-badge');
  const statVaultTotal = document.getElementById('stat-vault-total');
  const btnOptions = document.getElementById('open-options');

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
  let savedUserOptions = {};
  let vaultArticles = [];
  let currentFilterTag = 'ALL';
  let activeModalArticle = null;

  // ================= TAB NAVIGATION =================
  tabBtnClipper.addEventListener('click', () => {
    tabBtnClipper.classList.add('active');
    tabBtnVault.classList.remove('active');
    viewClipper.classList.add('active');
    viewVault.classList.remove('active');
  });

  tabBtnVault.addEventListener('click', () => {
    tabBtnVault.classList.add('active');
    tabBtnClipper.classList.remove('active');
    viewVault.classList.add('active');
    viewClipper.classList.remove('active');
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

  // ================= CLIPPER: ACTIVE TAB PARSING =================
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

  try {
    const urlObj = new URL(tab.url);
    elDomain.innerText = urlObj.hostname.replace('www.', '');
  } catch (e) {
    elDomain.innerText = 'Webpage';
  }

  // Ensure content scripts are injected
  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      files: [
        'lib/Readability.js',
        'lib/turndown.js',
        'lib/turndown-plugin-gfm.js',
        'content/content.js'
      ]
    });
  } catch (err) {
    console.warn('Script injection warning:', err);
  }

  // Request Clean Markdown from Content Script
  chrome.tabs.sendMessage(activeTabId, { action: 'GET_CLEAN_MARKDOWN', options: savedUserOptions }, (response) => {
    if (chrome.runtime.lastError || !response) {
      elTitle.innerText = tab.title || 'Untitled Page';
      elPreview.innerText = 'Unable to parse page automatically. Use "Select Element" to choose content manually.';
      return;
    }

    currentParsedData = response;
    elTitle.innerText = response.title || tab.title;
    elReadTime.innerText = `${response.readTimeMinutes || 1} min read`;
    elWords.innerText = (response.wordCount || 0).toLocaleString();
    elTokens.innerText = `~${Math.round((response.wordCount || 0) * 1.35).toLocaleString()}`;
    elPreview.innerText = response.markdown.slice(0, 1500) + (response.markdown.length > 1500 ? '\n\n...[Preview Truncated]' : '');
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

    // Check if URL already in vault
    const existingIdx = vaultArticles.findIndex(a => a.url === newArticle.url);
    if (existingIdx !== -1) {
      vaultArticles[existingIdx] = newArticle; // Update existing
    } else {
      vaultArticles.unshift(newArticle); // Add to top
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
          <span>${item.wordCount.toLocaleString()} words</span>
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

    // Attach card event listeners
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
