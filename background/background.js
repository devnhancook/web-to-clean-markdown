/**
 * Background Service Worker for Web to Clean Markdown & Study Archiver
 * Author: @devnhancook
 */

// Handle keyboard shortcut command
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'clip-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url || tab.url.startsWith('chrome://')) return;

    try {
      await injectScriptsIfRequired(tab.id);
      chrome.tabs.sendMessage(tab.id, { action: 'CLIP_ACTIVE_PAGE' });
    } catch (err) {
      console.error('Failed to trigger clip from keyboard shortcut:', err);
    }
  }
});

// Handle messages from Popup or Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'DOWNLOAD_MARKDOWN') {
    handleDownloadMarkdown(message.payload, sendResponse);
    return true;
  }

  if (message.action === 'DOWNLOAD_PDF_FILE') {
    handleDownloadDirectUrl(message.payload, sendResponse);
    return true;
  }

  if (message.action === 'CLEAR_COOKIES_AND_RELOAD') {
    handleClearCookiesAndReload(message.domain, sendResponse);
    return true;
  }

  if (message.action === 'ENTRY_AUTO_RESET_REQUEST') {
    handleEntryAutoReset(message, sender, sendResponse);
    return true;
  }

  if (message.action === 'INCREMENT_CLIP_COUNTER') {
    incrementClipCounter(sendResponse);
    return true;
  }
});

/**
 * Trigger download of Markdown file
 */
function handleDownloadMarkdown({ filename, content }, sendResponse) {
  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const reader = new FileReader();

    reader.onload = function () {
      const dataUrl = reader.result;
      chrome.downloads.download(
        {
          url: dataUrl,
          filename: sanitizeFilename(filename || 'article.md'),
          saveAs: false
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true, downloadId });
          }
        }
      );
    };

    reader.readAsDataURL(blob);
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Download direct PDF url
 */
function handleDownloadDirectUrl({ url, filename }, sendResponse) {
  try {
    chrome.downloads.download(
      {
        url: url,
        filename: sanitizeFilename(filename || 'document.pdf'),
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId });
        }
      }
    );
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Remove all cookies whose domain includes the given substring.
 * Shared by the manual button flow and the entry auto-reset gatekeeper.
 * Returns the number of cookies removed.
 */
async function clearCookiesForDomain(domain) {
  const allCookies = await chrome.cookies.getAll({});
  let count = 0;
  for (const cookie of allCookies) {
    if (domain && cookie.domain.includes(domain)) {
      const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
      const protocol = cookie.secure ? 'https:' : 'http:';
      const url = `${protocol}//${cleanDomain}${cookie.path}`;
      await chrome.cookies.remove({ url: url, name: cookie.name, storeId: cookie.storeId });
      count++;
    }
  }
  return count;
}

/**
 * Clear site cookies and reload active tab
 */
async function handleClearCookiesAndReload(domain, sendResponse) {
  try {
    if (!isAllowedDocDomain(domain)) {
      sendResponse({ success: false, error: 'domain-not-allowed' });
      return;
    }
    const count = await clearCookiesForDomain(domain);
    sendResponse({ success: true, count });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

/**
 * CAP-3 gatekeeper: entry auto-reset, max ONE approval per tab per 30 minutes.
 * Keyed by the stable sender tab ID (never by page URL), so entry resets
 * cannot loop no matter how the page URL mutates across reloads.
 */
const ALLOWED_DOC_DOMAINS = ['studocu', 'scribd'];
const pendingEntryResets = new Set();

function isAllowedDocDomain(domain) {
  return ALLOWED_DOC_DOMAINS.includes(domain);
}

async function handleEntryAutoReset(message, sender, sendResponse) {
  const tabId = sender && sender.tab && sender.tab.id;
  if (tabId === undefined || !isAllowedDocDomain(message.domain)) {
    sendResponse({ reset: false });
    return;
  }
  if (pendingEntryResets.has(tabId)) {
    sendResponse({ reset: false, reason: 'in-flight' });
    return;
  }
  pendingEntryResets.add(tabId);
  try {
    const KEY = '__w2mEntryResets';
    const now = Date.now();
    const data = await chrome.storage.session.get([KEY]);
    const map = (data && data[KEY]) || {};
    // Sweep stale entries so the map can't leak and reused tab IDs aren't denied.
    for (const key of Object.keys(map)) {
      if (!map[key] || now - (map[key].ts || 0) >= 30 * 60 * 1000) delete map[key];
    }
    if (map[tabId] && map[tabId].count >= 1) {
      await chrome.storage.session.set({ [KEY]: map });
      sendResponse({ reset: false, reason: 'already-reset' });
      return;
    }
    // Reserve FIRST: if persisting fails, nothing was cleared yet, so a later
    // load retries instead of looping on an unrecorded clear.
    map[tabId] = { count: 1, ts: now };
    await chrome.storage.session.set({ [KEY]: map });
    let cleared = 0;
    try {
      cleared = await clearCookiesForDomain(message.domain);
    } catch (e) {
      // Roll the reservation back so a later load may retry the clear.
      delete map[tabId];
      try { await chrome.storage.session.set({ [KEY]: map }); } catch (ignored) {}
      sendResponse({ reset: false, error: e.message });
      return;
    }
    sendResponse({ reset: true, cleared });
  } catch (e) {
    sendResponse({ reset: false, error: e.message });
  } finally {
    pendingEntryResets.delete(tabId);
  }
}

// Drop per-tab counters when tabs close (backs the 30-minute sweep above).
if (chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.get(['__w2mEntryResets'], (data) => {
      const map = (data && data.__w2mEntryResets) || {};
      if (map[tabId] !== undefined) {
        delete map[tabId];
        chrome.storage.session.set({ __w2mEntryResets: map });
      }
    });
  });
}

/**
 * Increment clip count for milestone appreciation
 */
function incrementClipCounter(sendResponse) {
  chrome.storage.local.get(['clipCount'], (res) => {
    const newCount = (res.clipCount || 0) + 1;
    chrome.storage.local.set({ clipCount: newCount }, () => {
      sendResponse({ success: true, clipCount: newCount });
    });
  });
}

/**
 * Sanitize filename to avoid invalid OS characters
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .trim()
    .slice(0, 100);
}

/**
 * Helper to inject core parsing scripts dynamically if not yet injected
 */
async function injectScriptsIfRequired(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
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
    console.warn('Script injection notice:', err);
  }
}
