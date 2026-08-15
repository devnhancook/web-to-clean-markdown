/**
 * Content Script for Web to Clean Markdown for LLM
 * Author: @devnhancook
 */

(function () {
  if (window.__w2m_content_script_initialized__) return;
  window.__w2m_content_script_initialized__ = true;

  let activeSelectorOverlay = null;
  let hoveredElement = null;

  // Initialize Turndown Service with GFM rules
  function createTurndownService(options = {}) {
    if (typeof TurndownService === 'undefined') {
      console.error('TurndownService is not loaded.');
      return null;
    }

    const turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      ...options
    });

    // Add GFM (tables, task lists, strikethrough)
    if (typeof turndownPluginGfm !== 'undefined' && turndownPluginGfm.gfm) {
      turndownService.use(turndownPluginGfm.gfm);
    }

    // Custom rule: strip useless tags
    turndownService.remove(['script', 'style', 'noscript', 'iframe', 'svg', 'button', 'form']);

    return turndownService;
  }

  /**
   * Parse active page using Readability and Turndown
   */
  function extractPageContent(options = {}) {
    const docClone = document.cloneNode(true);

    // Run Mozilla Readability
    let article = null;
    if (typeof Readability !== 'undefined') {
      try {
        const reader = new Readability(docClone);
        article = reader.parse();
      } catch (e) {
        console.warn('Readability parse error, falling back to body:', e);
      }
    }

    // Extract Metadata
    const title = (article && article.title) || document.title || 'Untitled Article';
    const author = (article && article.byline) || getMetaTag(['author', 'article:author', 'twitter:creator']) || '';
    const siteName = (article && article.siteName) || getMetaTag(['og:site_name', 'application-name']) || window.location.hostname;
    const url = window.location.href;
    const today = new Date().toISOString().split('T')[0];
    const excerpt = (article && article.excerpt) || getMetaTag(['description', 'og:description']) || '';

    // Convert HTML to Markdown
    const contentHtml = (article && article.content) || document.body.innerHTML;
    const turndownService = createTurndownService();
    const markdownBody = turndownService ? turndownService.turndown(contentHtml) : contentHtml;

    // Calculate word count and estimated reading time
    const words = markdownBody.trim().split(/\s+/).filter(Boolean).length;
    const readTimeMinutes = Math.max(1, Math.ceil(words / 200));

    // Construct YAML Frontmatter
    let frontmatter = `---\n`;
    frontmatter += `title: "${title.replace(/"/g, '\\"')}"\n`;
    frontmatter += `source_url: "${url}"\n`;
    if (author) frontmatter += `author: "${author.replace(/"/g, '\\"')}"\n`;
    if (siteName) frontmatter += `site_name: "${siteName.replace(/"/g, '\\"')}"\n`;
    frontmatter += `clipped_at: ${today}\n`;
    frontmatter += `word_count: ${words}\n`;
    frontmatter += `estimated_read_time: "${readTimeMinutes} min"\n`;
    frontmatter += `---\n\n`;

    let finalMarkdown = frontmatter + markdownBody;

    // Optional Watermark
    if (options.includeWatermark !== false) {
      finalMarkdown += `\n\n---\n*Clipped with [Web to Clean Markdown for LLM](https://github.com/devnhancook/web-to-clean-markdown) by @devnhancook*`;
    }

    return {
      title,
      author,
      siteName,
      url,
      excerpt,
      wordCount: words,
      readTimeMinutes,
      markdown: finalMarkdown,
      rawMarkdown: markdownBody
    };
  }

  /**
   * Helper to retrieve meta tag content by priority names
   */
  function getMetaTag(names) {
    for (const name of names) {
      const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      if (el && el.getAttribute('content')) {
        return el.getAttribute('content').trim();
      }
    }
    return '';
  }

  /**
   * Interactive Visual Element Selector (Shadow DOM encapsulated)
   */
  function startElementSelector() {
    stopElementSelector(); // Clean previous if any

    const host = document.createElement('div');
    host.id = 'w2m-selector-root';
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.width = '100vw';
    host.style.height = '100vh';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '2147483647';

    const shadow = host.attachShadow({ mode: 'open' });
    const highlightBox = document.createElement('div');
    highlightBox.id = 'w2m-highlight-box';
    highlightBox.style.cssText = `
      position: absolute;
      border: 2px solid #3b82f6;
      background: rgba(59, 130, 246, 0.15);
      border-radius: 4px;
      pointer-events: none;
      transition: all 0.08s ease;
      display: none;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8), 0 4px 14px rgba(59, 130, 246, 0.4);
    `;

    const banner = document.createElement('div');
    banner.style.cssText = `
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: #1e293b;
      color: #f8fafc;
      padding: 8px 16px;
      border-radius: 9999px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px solid rgba(255,255,255,0.1);
    `;
    banner.innerHTML = `
      <span>🎯 <strong>Click on any container</strong> to clip into Markdown</span>
      <button id="btn-cancel-sel" style="background:#ef4444;color:#fff;border:none;padding:3px 10px;border-radius:12px;cursor:pointer;font-size:12px;font-weight:600;">Cancel (ESC)</button>
    `;

    shadow.appendChild(highlightBox);
    shadow.appendChild(banner);
    document.documentElement.appendChild(host);
    activeSelectorOverlay = host;

    // Events
    function onMouseMove(e) {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (!target || target === host || host.contains(target)) return;

      hoveredElement = target;
      const rect = target.getBoundingClientRect();
      highlightBox.style.display = 'block';
      highlightBox.style.top = `${rect.top + window.scrollY}px`;
      highlightBox.style.left = `${rect.left + window.scrollX}px`;
      highlightBox.style.width = `${rect.width}px`;
      highlightBox.style.height = `${rect.height}px`;
    }

    function onClick(e) {
      e.preventDefault();
      e.stopPropagation();

      if (hoveredElement) {
        const turndownService = createTurndownService();
        const snippetMarkdown = turndownService ? turndownService.turndown(hoveredElement.outerHTML) : hoveredElement.innerText;

        stopElementSelector();
        showToast('Snippet clipped to Markdown!');

        // Send back to popup or background
        chrome.runtime.sendMessage({
          action: 'ELEMENT_CLIPPED',
          payload: {
            markdown: snippetMarkdown,
            url: window.location.href,
            title: document.title
          }
        });
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        stopElementSelector();
      }
    }

    shadow.getElementById('btn-cancel-sel').addEventListener('click', stopElementSelector);
    document.addEventListener('mousemove', onMouseMove, { capture: true });
    document.addEventListener('click', onClick, { capture: true });
    document.addEventListener('keydown', onKeyDown, { capture: true });

    activeSelectorOverlay._cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove, { capture: true });
      document.removeEventListener('click', onClick, { capture: true });
      document.removeEventListener('keydown', onKeyDown, { capture: true });
      if (host.parentNode) host.parentNode.removeChild(host);
      activeSelectorOverlay = null;
      hoveredElement = null;
    };
  }

  function stopElementSelector() {
    if (activeSelectorOverlay && typeof activeSelectorOverlay._cleanup === 'function') {
      activeSelectorOverlay._cleanup();
    }
  }

  /**
   * Non-intrusive on-page toast notification
   */
  function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #0f172a;
      color: #38bdf8;
      padding: 10px 18px;
      border-radius: 8px;
      font-family: sans-serif;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      z-index: 2147483647;
      border: 1px solid #38bdf8;
      animation: fadeInOut 2.5s forwards;
    `;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2500);
  }

  // Runtime Message Listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_CLEAN_MARKDOWN') {
      const data = extractPageContent(request.options || {});
      sendResponse(data);
      return true;
    }

    if (request.action === 'START_ELEMENT_SELECTOR') {
      startElementSelector();
      sendResponse({ status: 'SELECTOR_STARTED' });
      return true;
    }

    if (request.action === 'STOP_ELEMENT_SELECTOR') {
      stopElementSelector();
      sendResponse({ status: 'SELECTOR_STOPPED' });
      return true;
    }
  });
})();
