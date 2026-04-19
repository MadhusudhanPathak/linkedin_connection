/**
 * LinkedIn Page Injected Script: Page info scraping (login check + name)
 * This script runs in the context of LinkedIn pages
 * IMPORTANT: Must be 100% self-contained - no external references
 */

/**
 * Check if user is on an authentication page
 * @returns {boolean} True if on auth/login page
 */
function isAuthPage() {
  const href = window.location.href;
  const authPatterns = ['/login', '/checkpoint', '/authwall', '/signup', '/uas/login'];
  return authPatterns.some(pattern => href.includes(pattern));
}

/**
 * Check login status using multiple signals
 * @returns {boolean} True if user appears to be logged in
 */
function checkIsLoggedIn() {
  if (isAuthPage()) return false;

  // Multiple signals to verify login
  const signals = [
    () => !!document.querySelector('#global-nav'),
    () => !!document.querySelector('.global-nav'),
    () => !!document.querySelector('nav[aria-label="Global Navigation"]'),
    () => !!document.querySelector('.global-nav__me'),
    () => !!document.querySelector('.scaffold-layout'),
    () => !!document.querySelector('.application-outlet'),
    () => !!document.querySelector('[data-member-id]'),
    () => !!document.querySelector('.pvs-profile-actions'),
    () => document.cookie.includes('li_at='),
    () => document.cookie.includes('JSESSIONID='),
  ];

  let signalCount = 0;
  for (const check of signals) {
    try {
      if (check()) signalCount++;
    } catch {
      // Ignore errors from individual checks
    }
  }

  // If we have at least one signal, user is logged in
  if (signalCount >= 1) return true;

  // Additional check: if it's a profile page with substantial content
  const href = window.location.href;
  const isProfilePage = href.includes('/in/') || href.includes('/pub/');
  const hasBodyContent = document.body && document.body.innerText.length > 500;
  
  return isProfilePage && hasBodyContent;
}

/**
 * Extract profile name from page
 * @returns {string} Profile name or empty string
 */
function extractProfileName() {
  const selectors = [
    'h1.text-heading-xlarge',
    '.pv-text-details__left-panel h1',
    '.artdeco-entity-lockup__title h1',
    '.ph5 h1',
    'section.artdeco-card h1',
    'main h1',
    'h1',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const name = (el.innerText || el.textContent || '').trim();
      if (name.length > 1) {
        return name;
      }
    }
  }

  return '';
}

/**
 * Main function: Get page info (login status + name)
 * @returns {{isLoggedIn: boolean, name: string}}
 */
function scrapePageInfo() {
  return {
    isLoggedIn: checkIsLoggedIn(),
    name: extractProfileName(),
  };
}

// Export result for service worker
scrapePageInfo();
