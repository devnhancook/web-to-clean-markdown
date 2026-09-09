---
project_name: 'web-to-clean-markdown'
user_name: 'Nhan'
date: '2026-09-09'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow', 'dont_miss']
status: 'complete'
rule_count: 32
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- Chrome Extension **Manifest V3**, vanilla JS (ES6+). No framework, no bundler, no `package.json`, no test/linter config. Extension loads unpacked directly.
- Vendored libs in `lib/` (loaded via manifest `content_scripts` order, never via `import`): Mozilla Readability, Turndown, turndown-plugin-gfm.
- `chrome.storage.local` keys: `vaultArticles`, `userOptions`, `clipCount`.
- Message actions are UPPER_SNAKE strings (`GET_CLEAN_MARKDOWN`, `SCAN_PDF_LINKS`, `DOWNLOAD_MARKDOWN`, `STUDOCU_EXTRACT_MARKDOWN`, …). Every async `sendResponse` path must `return true`.
- One-time init guards per content script: `window.__w2m_content_script_initialized__`, `window.__pdf_scanner_initialized__`, `window.__studocu_engine_initialized__` — never re-run init logic without checking.
- **Browser support: Chrome + Edge only (Chromium MV3).** No Firefox/Safari target — Chromium-only APIs are allowed (`chrome.scripting.executeScript` with `func:`, `chrome.cookies`, `chrome.downloads`, `chrome.commands`). Do NOT add `browser.*` polyfills or cross-browser shims.

## Critical Implementation Rules

### Language-Specific Rules (vanilla JS, no bundler)

- No `import`/`require` in content scripts — every file is an IIFE global; load order is decided by the manifest. Always guard shared globals (`typeof TurndownService === 'undefined'`) before use.
- Every async `sendResponse` path in a message listener must `return true`; otherwise the reply is silently dropped.
- `navigator.clipboard.writeText` requires a user gesture — any flow that closes the popup before copying must have a fallback (toast), never fail silently.
- Engine logic (unblur / print / extract) lives ONLY in content scripts; popup/background call it via messages. No duplicated engine functions across files.
- No `alert`/`confirm` in main flows — target pages may block them and freeze the whole flow; use extension UI instead.

### Framework-Specific Rules (Chrome MV3)

- Content-script CSS must never restyle the host page globally — page-altering rules (e.g. hiding `body > *`) may only be injected at event time via `chrome.scripting.insertCSS`, never declared in the manifest for all pages.
- The service worker has no DOM — `background.js` does office work only (downloads, storage, cookies); anything touching page DOM must be delegated to a content script via messaging.
- Lazy-loaded doc pages must be fully harvested before unblur/print/extract — always run the auto-scroll harvester (`forceLazyLoadAllPages`) first; never build the viewer from whatever happens to be loaded.

### Testing Rules (no automated tests — manual QA checklist)

- Before every release, hand-test 3 page types: normal article (clip), Studocu/Scribd doc (unblur + extract), page with PDF links (scanner). One failure blocks release.
- Test logged-out / incognito too — paywall and blur behavior differ completely from logged-in state.
- Never change print CSS without a real print-to-PDF check — blank-page bugs only show at print time, never in code.

### Code Quality & Style Rules

- One file, one job, stated in the first-line comment — if a file does something outside its job, move that code instead of piling on.
- Functions longer than ~50 lines must be split — `popup.js` (843 lines) is existing debt; split incrementally on every touch.
- Comments only where tricky, explaining WHY — workarounds (unblur, scaling, print CSS) must explain themselves; ordinary code needs none.
- Keep a message-flow diagram — popup ↔ background ↔ content scripts and which action goes where; check it before adding new message actions.
- READMEs in 3 languages: VN/CN are short user guides, EN is the full reference — usage instructions must never contradict each other.
- Delete dead code instead of keeping it — unreferenced functions (verify by project-wide search) get removed, never commented out.

### Development Workflow Rules

- One branch per fix; `main` must always be shippable — merge only after ticking the 3-page QA checklist. Keep at least 2 live branches, no heavier flow needed.
- Commits state the exact symptom plus a `Tested:` trailer — keep the `fix(scope): …` style and record what was manually verified.
- Every release bumps the version in `manifest.json` — Chrome will not deliver updates otherwise.
- Never rename storage keys without a migration — renaming `vaultArticles`, `userOptions` or `clipCount` wipes users' saved articles.

### Critical Don't-Miss Rules

- NEVER let extension CSS touch the host page body globally — the Studocu white-screen lesson; print styles inject only at print time.
- A blind selector must scream, never stay silent — Studocu/Scribd change class names often; if no pages are found, say so with recovery steps instead of a blank page.
- One engine, no photocopies — unblur/print/extract logic exists in exactly one place (content script).
- Check hostname before touching DOM — content scripts run on `<all_urls>`; never manipulate out-of-scope pages.
- Known limitation (belongs in code comments, not rules): server-side blur cannot be undone client-side — harvest the text layer instead of trying to deblur images.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-09-09
