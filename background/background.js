/**
 * Background Service Worker for Web to Clean Markdown for LLM
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
    return true; // Keep message channel open for async response
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
    .slice(0, 100) + '.md';
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
        'content/content.js'
      ]
    });
  } catch (err) {
    console.warn('Script injection notice:', err);
  }
}
