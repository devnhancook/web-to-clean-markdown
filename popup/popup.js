/**
 * Popup Script for Web to Clean Markdown for LLM
 * Author: @devnhancook
 */

document.addEventListener('DOMContentLoaded', async () => {
  const elTitle = document.getElementById('article-title');
  const elDomain = document.getElementById('domain-badge');
  const elReadTime = document.getElementById('read-time-badge');
  const elWords = document.getElementById('stat-words');
  const elTokens = document.getElementById('stat-tokens');
  const elClips = document.getElementById('stat-clips');
  const elPreview = document.getElementById('markdown-preview');
  const elMilestone = document.getElementById('milestone-box');

  const btnCopy = document.getElementById('btn-copy-llm');
  const btnDownload = document.getElementById('btn-download-md');
  const btnSelect = document.getElementById('btn-select-element');
  const btnOptions = document.getElementById('open-options');

  let currentParsedData = null;
  let activeTabId = null;

  // Load Saved Clip Count
  chrome.storage.local.get(['clipCount', 'userOptions'], (res) => {
    const count = res.clipCount || 0;
    elClips.innerText = count;
    if (count >= 10) {
      elMilestone.style.display = 'flex';
    }
  });

  // Query Active Tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    elTitle.innerText = 'Cannot clip browser system page. Open any public website.';
    btnCopy.disabled = true;
    btnDownload.disabled = true;
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
  chrome.tabs.sendMessage(activeTabId, { action: 'GET_CLEAN_MARKDOWN' }, (response) => {
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
    elPreview.innerText = response.markdown.slice(0, 2000) + (response.markdown.length > 2000 ? '\n\n...[Preview Truncated]' : '');
  });

  // Action: Copy for LLM
  btnCopy.addEventListener('click', async () => {
    if (!currentParsedData || !currentParsedData.markdown) return;

    try {
      await navigator.clipboard.writeText(currentParsedData.markdown);

      // Increment Counter
      chrome.runtime.sendMessage({ action: 'INCREMENT_CLIP_COUNTER' }, (res) => {
        if (res && res.clipCount) {
          elClips.innerText = res.clipCount;
          if (res.clipCount >= 10) elMilestone.style.display = 'flex';
        }
      });

      // Visual Feedback
      const originalHTML = btnCopy.innerHTML;
      btnCopy.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      btnCopy.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Copied to Clipboard!</span>
        <span class="btn-subtext">Ready to paste into ChatGPT / Claude</span>
      `;

      setTimeout(() => {
        btnCopy.style.background = '';
        btnCopy.innerHTML = originalHTML;
      }, 2000);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      alert('Failed to copy to clipboard.');
    }
  });

  // Action: Download .md
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download .md
          `;
        }, 2000);
      }
    });
  });

  // Action: Select Element (Interactive Mode)
  btnSelect.addEventListener('click', () => {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, { action: 'START_ELEMENT_SELECTOR' });
    window.close(); // Close popup so user can click on the webpage
  });

  // Open Options Page
  btnOptions.addEventListener('click', (e) => {
    e.preventDefault();
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });
});
