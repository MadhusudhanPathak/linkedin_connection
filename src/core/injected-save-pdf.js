/**
 * LinkedIn Page Injected Script: Save to PDF automation
 * This script runs in the context of LinkedIn pages
 * IMPORTANT: Must be 100% self-contained - no external references
 */

/**
 * Utility sleep function for use in injected context
 * @param {number} ms - Milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Find the "More" button on LinkedIn profile
 * Searches for the button using multiple selectors and text matching
 * @returns {HTMLElement|null} The More button element
 */
function findMoreButton() {
  const selectors = ['button', '[role="button"]'];
  
  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector));
    for (const el of elements) {
      const text = (el.innerText || el.textContent || '').trim();
      const ariaLabel = (el.getAttribute('aria-label') || '').trim().toLowerCase();
      
      if (text === 'More' || 
          ariaLabel === 'more' || 
          ariaLabel === 'more actions' || 
          ariaLabel.startsWith('more actions for')) {
        return el;
      }
    }
  }
  
  return null;
}

/**
 * Find "Save to PDF" menu item in dropdown
 * @returns {HTMLElement|null} The Save to PDF element
 */
function findSaveToPdfItem() {
  const dropdownSelectors = [
    '.artdeco-dropdown__content-inner li',
    '.artdeco-dropdown__item',
    '.pvs-overflow-actions-dropdown__content li',
    '[role="menu"] [role="menuitem"]',
    '[role="listbox"] [role="option"]',
    'ul[role="menu"] li',
  ];

  // Try specific selectors first
  for (const selector of dropdownSelectors) {
    const items = Array.from(document.querySelectorAll(selector));
    for (const item of items) {
      const text = (item.innerText || item.textContent || '').trim();
      if (text.includes('Save to PDF')) {
        return item;
      }
    }
  }

  // Last-resort: search all visible elements with exact text
  const allElements = Array.from(document.querySelectorAll('span, li, div, button, a'));
  for (const el of allElements) {
    // Skip containers with many children
    if (el.children.length > 2) continue;
    // Skip hidden elements
    if (!el.offsetParent) continue;
    
    const text = (el.innerText || el.textContent || '').trim();
    if (text === 'Save to PDF') {
      return el;
    }
  }

  return null;
}

/**
 * Main function: Click More → Save to PDF
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
async function clickMoreThenSaveToPDF() {
  try {
    // Find and click More button
    const moreBtn = findMoreButton();
    if (!moreBtn) {
      return {
        success: false,
        reason: '"More" button not found on this profile. The profile layout may be different (e.g., your own profile, or a restricted account).',
      };
    }

    moreBtn.click();
    await sleep(300); // Wait for dropdown animation

    // Find and click Save to PDF
    const savePdfItem = findSaveToPdfItem();
    if (!savePdfItem) {
      return {
        success: false,
        reason: '"Save to PDF" not found in the More dropdown. LinkedIn may have changed their menu structure.',
      };
    }

    savePdfItem.click();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      reason: `Error: ${error.message || 'Unknown error'}`,
    };
  }
}

// Export for service worker to call
clickMoreThenSaveToPDF();
