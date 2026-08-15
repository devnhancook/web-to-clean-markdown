/**
 * Options Script for Web to Clean Markdown for LLM
 */

document.addEventListener('DOMContentLoaded', () => {
  const optFrontmatter = document.getElementById('opt-frontmatter');
  const optWatermark = document.getElementById('opt-watermark');
  const optPromptFormat = document.getElementById('opt-prompt-format');
  const btnSave = document.getElementById('btn-save');
  const saveStatus = document.getElementById('save-status');

  // Load saved options
  chrome.storage.local.get(['userOptions'], (res) => {
    const opts = res.userOptions || {};
    optFrontmatter.checked = opts.frontmatter !== false;
    optWatermark.checked = opts.watermark !== false;
    optPromptFormat.value = opts.promptFormat || 'raw';
  });

  // Save options
  btnSave.addEventListener('click', () => {
    const userOptions = {
      frontmatter: optFrontmatter.checked,
      watermark: optWatermark.checked,
      promptFormat: optPromptFormat.value
    };

    chrome.storage.local.set({ userOptions }, () => {
      saveStatus.innerText = '✓ Settings saved successfully!';
      setTimeout(() => {
        saveStatus.innerText = '';
      }, 2500);
    });
  });
});
