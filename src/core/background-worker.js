/**
 * LinkedIn PDF Downloader - Background Service Worker
 * Manages the core automation logic and inter-component communication
 * 
 * Architecture:
 * - Handles all communication with popup and progress monitor
 * - Manages profile processing queue and state
 * - Orchestrates tab lifecycle and script injection
 * - Manages download folder redirect
 */

import { CONSTANTS } from '../utils/constants.js';
import { sleep, formatTime } from '../utils/helpers.js';
import { broadcast } from '../utils/message-handler.js';

// ─────────────────────────────────────────────
// STATE MANAGEMENT
// ─────────────────────────────────────────────

/**
 * Application state object
 * @typedef {Object} AppState
 * @property {boolean} isRunning - Whether processing is active
 * @property {boolean} isPaused - Whether processing is paused
 * @property {string[]} urls - Profile URLs to process
 * @property {number} currentIndex - Current position in queue
 * @property {Object[]} results - Array of {url, success, name?, reason?}
 * @property {number} startTime - Timestamp when processing started
 * @property {number} waitTime - Milliseconds to wait after each profile
 */
let state = {
  isRunning: false,
  isPaused: false,
  urls: [],
  currentIndex: 0,
  results: [],
  startTime: null,
  waitTime: CONSTANTS.SLIDER_DEFAULT_SECONDS * 1000,
};

// ─────────────────────────────────────────────
// DOWNLOAD FOLDER REDIRECT
// ─────────────────────────────────────────────

/**
 * Redirect all PDF downloads to LinkedIn_Connections folder
 * Chrome API: chrome.downloads.onDeterminingFilename
 */
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  const filename = (downloadItem.filename || '').toLowerCase();
  const isMimePdf = downloadItem.mime === CONSTANTS.PDF_MIME_TYPE;
  
  // Only redirect PDF files
  if (!filename.endsWith('.pdf') && !isMimePdf) {
    return;
  }

  try {
    const baseName = downloadItem.filename.split(/[\\/]/).pop();
    if (baseName) {
      suggest({
        filename: `${CONSTANTS.DOWNLOAD_FOLDER}/${baseName}`,
        conflictAction: 'uniquify',
      });
    }
  } catch (error) {
    console.error('[Download Manager] Error handling download:', error);
  }
});

// ─────────────────────────────────────────────
// SERVICE WORKER KEEP-ALIVE
// ─────────────────────────────────────────────

/**
 * Keep service worker alive during processing by creating periodic alarms
 * Chrome alarms keep service worker from being suspended
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive' && state.isRunning) {
    chrome.alarms.create('keepAlive', { when: Date.now() + CONSTANTS.KEEP_ALIVE_INTERVAL_MS });
  }
});

/**
 * Start keep-alive alarm
 */
function startKeepAlive() {
  chrome.alarms.create('keepAlive', { when: Date.now() + CONSTANTS.KEEP_ALIVE_INTERVAL_MS });
}

/**
 * Stop keep-alive alarm
 */
function stopKeepAlive() {
  chrome.alarms.clear('keepAlive');
}

// ─────────────────────────────────────────────
// MESSAGE ROUTING
// ─────────────────────────────────────────────

/**
 * Main message router - handles all inter-component communication
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  try {
    if (!msg || !msg.type) {
      sendResponse({ ok: false, reason: 'Invalid message' });
      return true;
    }

    switch (msg.type) {
      case CONSTANTS.MESSAGE_TYPES.START:
        handleStart(msg, sendResponse);
        break;

      case CONSTANTS.MESSAGE_TYPES.PAUSE:
        handlePause(sendResponse);
        break;

      case CONSTANTS.MESSAGE_TYPES.RESUME:
        handleResume(sendResponse);
        break;

      case CONSTANTS.MESSAGE_TYPES.STOP:
        handleStop(sendResponse);
        break;

      case CONSTANTS.MESSAGE_TYPES.GET_STATE:
        sendResponse({ ...state });
        break;

      default:
        console.warn(`[Message Router] Unknown message type: ${msg.type}`);
        sendResponse({ ok: false, reason: CONSTANTS.ERRORS.UNKNOWN_MESSAGE_TYPE });
    }
  } catch (error) {
    console.error('[Message Router] Error handling message:', error);
    sendResponse({ ok: false, reason: error.message });
  }

  return true; // Keep channel open for async response
});

/**
 * Handle START command
 */
function handleStart(msg, sendResponse) {
  if (state.isRunning) {
    sendResponse({ ok: false, reason: CONSTANTS.ERRORS.ALREADY_RUNNING });
    return;
  }

  // Validate input
  if (!Array.isArray(msg.urls) || msg.urls.length === 0) {
    sendResponse({ ok: false, reason: 'No URLs provided' });
    return;
  }

  if (typeof msg.waitTime !== 'number' || msg.waitTime < 1) {
    sendResponse({ ok: false, reason: 'Invalid wait time' });
    return;
  }

  // Initialize state
  state = {
    isRunning: true,
    isPaused: false,
    urls: msg.urls,
    currentIndex: 0,
    results: [],
    startTime: Date.now(),
    waitTime: msg.waitTime * 1000, // Convert seconds to ms
  };

  startKeepAlive();
  sendResponse({ ok: true });
  
  // Start processing asynchronously
  runNext();
}

/**
 * Handle PAUSE command
 */
function handlePause(sendResponse) {
  state.isPaused = true;
  broadcast({
    type: CONSTANTS.MESSAGE_TYPES.PAUSED,
    currentIndex: state.currentIndex,
    total: state.urls.length,
  });
  sendResponse({ ok: true });
}

/**
 * Handle RESUME command
 */
function handleResume(sendResponse) {
  if (!state.isRunning) {
    sendResponse({ ok: false, reason: CONSTANTS.ERRORS.NOT_RUNNING });
    return;
  }

  state.isPaused = false;
  broadcast({ type: CONSTANTS.MESSAGE_TYPES.RESUMED });
  sendResponse({ ok: true });

  // Continue processing
  runNext();
}

/**
 * Handle STOP command
 */
function handleStop(sendResponse) {
  state.isRunning = false;
  state.isPaused = false;
  stopKeepAlive();
  sendResponse({ ok: true });
}

// ─────────────────────────────────────────────
// MAIN PROCESSING LOOP
// ─────────────────────────────────────────────

/**
 * Main processing loop - processes one profile per call
 * Continues recursively until all profiles processed or stopped
 */
async function runNext() {
  // Stop if not running
  if (!state.isRunning) {
    return;
  }

  // Pause: hold here until resumed
  if (state.isPaused) {
    return;
  }

  // Check if we've processed all profiles
  if (state.currentIndex >= state.urls.length) {
    completeProcessing();
    return;
  }

  const url = state.urls[state.currentIndex].trim();

  // Notify listeners of current processing
  broadcast({
    type: CONSTANTS.MESSAGE_TYPES.PROCESSING,
    url,
    currentIndex: state.currentIndex,
    total: state.urls.length,
  });

  // Process the profile
  let result;
  try {
    result = await processProfile(url);
  } catch (error) {
    const reason = error.message || String(error);
    result = { url, success: false, reason };

    // If not logged in, stop the entire process
    if (reason === CONSTANTS.ERRORS.NOT_LOGGED_IN) {
      state.isRunning = false;
      stopKeepAlive();
      broadcast({ type: CONSTANTS.MESSAGE_TYPES.NOT_LOGGED_IN });
      return;
    }
  }

  // Store result and notify listeners
  state.results.push(result);
  broadcast({
    type: CONSTANTS.MESSAGE_TYPES.RESULT,
    result,
    currentIndex: state.currentIndex,
    total: state.urls.length,
  });

  state.currentIndex++;

  // Continue if not stopped during processing
  if (!state.isRunning) {
    return;
  }

  // If paused, don't continue
  if (state.isPaused) {
    return;
  }

  // Process next profile
  runNext();
}

/**
 * Finalize processing and broadcast completion
 */
function completeProcessing() {
  state.isRunning = false;
  stopKeepAlive();

  const elapsed = Date.now() - state.startTime;
  broadcast({
    type: CONSTANTS.MESSAGE_TYPES.DONE,
    results: state.results,
    elapsed,
  });
}

// ─────────────────────────────────────────────
// PROFILE PROCESSING
// ─────────────────────────────────────────────

/**
 * Process a single LinkedIn profile
 * @param {string} url - LinkedIn profile URL
 * @returns {Promise<{url: string, success: boolean, name?: string, reason?: string}>}
 */
async function processProfile(url) {
  let tabId = null;

  try {
    // 1. Open profile in background tab
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;

    // 2. Wait for page to fully load
    await waitForTabLoad(tabId);
    await sleep(CONSTANTS.PAGE_SETTLE_MS);

    // 3. Verify user is logged in and get profile name
    const pageInfo = await executeScript(tabId, getScriptFunction('scrapePageInfo'));
    
    if (!pageInfo.isLoggedIn) {
      throw new Error(CONSTANTS.ERRORS.NOT_LOGGED_IN);
    }

    // 4. Click More → Save to PDF
    const clickResult = await executeScript(tabId, getScriptFunction('clickMoreThenSaveToPDF'));
    
    if (!clickResult.success) {
      throw new Error(clickResult.reason || 'Failed to save PDF');
    }

    // 5. Wait user-configured time for download to process
    await sleep(state.waitTime);

    // Success!
    return { url, success: true, name: pageInfo.name };

  } finally {
    // Always close the tab
    if (tabId !== null) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // Tab already closed
      }
    }
  }
}

// ─────────────────────────────────────────────
// SCRIPT INJECTION & EXECUTION
// ─────────────────────────────────────────────

/**
 * Get the injected script function by name
 * @param {string} scriptName - Name of injected script function
 * @returns {Function} Script function
 */
function getScriptFunction(scriptName) {
  const scripts = {
    scrapePageInfo: scrapePageInfo,
    clickMoreThenSaveToPDF: clickMoreThenSaveToPDF,
  };
  return scripts[scriptName];
}

/**
 * Execute script in tab context and get result
 * @param {number} tabId - Chrome tab ID
 * @param {Function} func - Function to inject
 * @returns {Promise<any>} Function return value
 */
async function executeScript(tabId, func) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func,
    });
    return result;
  } catch (error) {
    console.error(`[Script Executor] Error executing script: ${error.message}`);
    throw new Error(`Script execution failed: ${error.message}`);
  }
}

/**
 * Wait for a tab to finish loading
 * @param {number} tabId - Chrome tab ID
 * @returns {Promise<void>} Resolves when tab is loaded
 * @throws {Error} If timeout exceeded
 */
async function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Tab load timeout after ${CONSTANTS.TAB_LOAD_TIMEOUT_MS}ms`));
    }, CONSTANTS.TAB_LOAD_TIMEOUT_MS);

    const checkTab = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkTab, 100);
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };

    checkTab();
  });
}

// ─────────────────────────────────────────────
// INJECTED SCRIPTS (Embedded here for simplicity)
// ─────────────────────────────────────────────

/**
 * Scrape page info: check login status and extract profile name
 * IMPORTANT: This function is serialized and injected into LinkedIn tab
 * Must be 100% self-contained
 */
function scrapePageInfo() {
  // Check if on authentication page
  const href = window.location.href;
  const authPagePatterns = ['/login', '/checkpoint', '/authwall', '/signup', '/uas/login'];
  const onAuthPage = authPagePatterns.some(pattern => href.includes(pattern));

  if (onAuthPage) {
    return { isLoggedIn: false, name: '' };
  }

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
    } catch {}
  }

  const isProfilePage = href.includes('/in/') || href.includes('/pub/');
  const hasBodyContent = document.body && document.body.innerText.length > 500;
  const isLoggedIn = signalCount >= 1 || (isProfilePage && hasBodyContent);

  // Extract name
  const nameSelectors = [
    'h1.text-heading-xlarge',
    '.pv-text-details__left-panel h1',
    '.artdeco-entity-lockup__title h1',
    '.ph5 h1',
    'section.artdeco-card h1',
    'main h1',
    'h1',
  ];

  let name = '';
  for (const sel of nameSelectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 1) {
      name = el.innerText.trim();
      break;
    }
  }

  return { isLoggedIn, name };
}

/**
 * Click More → Save to PDF button
 * IMPORTANT: This function is serialized and injected into LinkedIn tab
 * Must be 100% self-contained
 */
async function clickMoreThenSaveToPDF() {
  const sleep = (ms) => new Promise(r => setTimeout(r, Math.max(0, ms)));

  // Find More button
  const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
  const moreButton = allButtons.find(el => {
    const txt = (el.innerText || el.textContent || '').trim();
    const label = (el.getAttribute('aria-label') || '').trim().toLowerCase();
    return txt === 'More' || label === 'more' || label === 'more actions' || label.startsWith('more actions for');
  });

  if (!moreButton) {
    return {
      success: false,
      reason: '"More" button not found on this profile. The profile layout may be different (e.g., your own profile, or a restricted account).',
    };
  }

  moreButton.click();
  await sleep(CONSTANTS.CLICK_WAIT_MS);

  // Find Save to PDF in dropdown
  const dropdownSelectors = [
    '.artdeco-dropdown__content-inner li',
    '.artdeco-dropdown__item',
    '.pvs-overflow-actions-dropdown__content li',
    '[role="menu"] [role="menuitem"]',
    '[role="listbox"] [role="option"]',
    'ul[role="menu"] li',
  ];

  let savePdfEl = null;
  for (const sel of dropdownSelectors) {
    const items = Array.from(document.querySelectorAll(sel));
    savePdfEl = items.find(el => (el.innerText || el.textContent || '').trim().includes('Save to PDF'));
    if (savePdfEl) break;
  }

  if (!savePdfEl) {
    const allEls = Array.from(document.querySelectorAll('span, li, div, button, a'));
    savePdfEl = allEls.find(el => {
      if (el.children.length > 2) return false;
      if (!el.offsetParent) return false;
      return (el.innerText || '').trim() === 'Save to PDF';
    });
  }

  if (!savePdfEl) {
    return {
      success: false,
      reason: '"Save to PDF" not found in the More dropdown. LinkedIn may have changed their menu structure.',
    };
  }

  savePdfEl.click();
  return { success: true };
}

// ─────────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────────

console.log('[Background Worker] LinkedIn PDF Downloader initialized');
