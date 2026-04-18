// ─────────────────────────────────────────────
//  LinkedIn PDF Downloader — Background Worker
//  Strategy: click More → Save to PDF on each profile,
//  intercept the download to rename it.
// ─────────────────────────────────────────────

const CHUNK_SIZE          = 50;
const DELAY_MS            = 3000;
const TAB_LOAD_TIMEOUT_MS = 30000;
const PAGE_SETTLE_MS      = 3500;   // time after load for LinkedIn JS to render
const DROPDOWN_SETTLE_MS  = 1500;   // time for More dropdown animation to open (increased)
const DOWNLOAD_START_MS   = 45000;  // max wait for download to begin after clicking (increased from 30s)
const DOWNLOAD_FINISH_MS  = 60000;  // max wait for download to complete

// ── State ──────────────────────────────────────
let state = {
  isRunning:    false,
  isPaused:     false,
  urls:         [],
  currentIndex: 0,
  results:      [],
  startTime:    null
};

// ── Keep service worker alive during a run ──────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive' && state.isRunning) {
    chrome.alarms.create('keepAlive', { when: Date.now() + 20000 });
  }
});

// ── Message Router ──────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {

    case 'START':
      if (state.isRunning) { sendResponse({ ok: false, reason: 'Already running' }); return true; }
      state = {
        isRunning:    true,
        isPaused:     false,
        urls:         msg.urls,
        currentIndex: 0,
        results:      [],
        startTime:    Date.now()
      };
      chrome.alarms.create('keepAlive', { when: Date.now() + 20000 });
      runNext();
      sendResponse({ ok: true });
      break;

    case 'PAUSE':
      state.isPaused = true;
      broadcast({ type: 'PAUSED', currentIndex: state.currentIndex, total: state.urls.length });
      sendResponse({ ok: true });
      break;

    case 'RESUME':
      if (!state.isRunning) { sendResponse({ ok: false, reason: 'Not running' }); return true; }
      state.isPaused = false;
      broadcast({ type: 'RESUMED' });
      runNext();
      sendResponse({ ok: true });
      break;

    case 'STOP':
      state.isRunning = false;
      state.isPaused  = false;
      chrome.alarms.clear('keepAlive');
      sendResponse({ ok: true });
      break;

    case 'GET_STATE':
      sendResponse({ ...state });
      break;

    default:
      sendResponse({ ok: false, reason: 'Unknown message type' });
  }

  return true;
});

// ── Main Loop ───────────────────────────────────
async function runNext() {
  if (!state.isRunning) return;
  if (state.isPaused)   return; // resume() will call runNext() again

  const { urls, currentIndex } = state;

  if (currentIndex >= urls.length) {
    state.isRunning = false;
    chrome.alarms.clear('keepAlive');
    broadcast({ type: 'DONE', results: state.results, elapsed: Date.now() - state.startTime });
    return;
  }

  // Chunk boundary notification
  if (currentIndex > 0 && currentIndex % CHUNK_SIZE === 0) {
    broadcast({ type: 'CHUNK_DONE', chunk: currentIndex / CHUNK_SIZE, currentIndex, total: urls.length });
  }

  const url = urls[currentIndex].trim();
  broadcast({ type: 'PROCESSING', url, currentIndex, total: urls.length });

  let result;
  try {
    result = await processProfile(url);
  } catch (err) {
    const reason = err.message || String(err);
    result = { url, success: false, reason };

    if (reason === 'NOT_LOGGED_IN') {
      state.isRunning = false;
      chrome.alarms.clear('keepAlive');
      broadcast({ type: 'NOT_LOGGED_IN' });
      return;
    }
  }

  state.results.push(result);
  broadcast({ type: 'RESULT', result, currentIndex, total: urls.length });
  state.currentIndex++;

  if (!state.isRunning) return;

  // If user paused between profiles, hold here — resume() will restart
  if (state.isPaused) return;

  setTimeout(runNext, DELAY_MS);
}

// ── Profile Processor ───────────────────────────
async function processProfile(url) {
  let tabId           = null;
  let createdListener = null;

  try {
    // 1. Open profile in a background tab
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;

    // 2. Wait for full page load + LinkedIn JS render time
    await waitForTabLoad(tabId);
    await sleep(PAGE_SETTLE_MS);

    // 3. Verify login
    const [{ result: pageInfo }] = await chrome.scripting.executeScript({
      target: { tabId },
      func:   scrapePageInfo
    });
    if (!pageInfo.isLoggedIn) throw new Error('NOT_LOGGED_IN');

    // 4. Arm onCreated listener BEFORE clicking so we catch the download ID
    //    the moment LinkedIn triggers it. No renaming — just track the ID.
    let capturedDownloadId = null;
    createdListener = (item) => {
      // If already captured, ignore subsequent downloads
      if (capturedDownloadId !== null) return;
      
      // Check for PDF using multiple methods to handle LinkedIn's various response formats
      const filename = (item.filename || '').toLowerCase();
      const mime = (item.mime || '').toLowerCase();
      
      // PDF detection: check MIME type, filename extension, or common patterns
      const isPdf =
        mime === 'application/pdf' ||
        mime.includes('pdf') ||
        filename.endsWith('.pdf') ||
        (filename.includes('profile') && filename.length > 0) ||
        filename.includes('linkedin');
      
      if (isPdf) {
        capturedDownloadId = item.id;
        chrome.downloads.onCreated.removeListener(createdListener);
        createdListener = null;
      }
    };
    chrome.downloads.onCreated.addListener(createdListener);

    // 5. Click More → Save to PDF
    const [{ result: clickResult }] = await chrome.scripting.executeScript({
      target: { tabId },
      func:   clickMoreThenSaveToPDF,
      args:   [DROPDOWN_SETTLE_MS]
    });
    if (!clickResult.success) throw new Error(clickResult.reason || 'Could not click Save to PDF');

    // 5b. Extra wait after the click to allow LinkedIn server to generate PDF
    await sleep(500);

    // 6. Wait for the download to begin (LinkedIn generates PDF server-side)
    await waitForCondition(
      () => capturedDownloadId !== null,
      DOWNLOAD_START_MS,
      'LinkedIn did not start a PDF download within 30s.'
    );

    // 7. Wait for download to finish writing to disk — THEN close the tab.
    //    This is what prevents the "move to next before download finished" bug.
    await waitForDownloadComplete(capturedDownloadId);

    return { url, success: true, name: pageInfo.name };

  } finally {
    // Always clean up listeners
    if (createdListener) {
      try { chrome.downloads.onCreated.removeListener(createdListener); } catch {}
    }
    // Tab is closed here — guaranteed to run after download completes (or on error)
    if (tabId !== null) {
      try { await chrome.tabs.remove(tabId); } catch {}
    }
  }
}

// ── Injected: Click More → Save to PDF ─────────
// IMPORTANT: This function is serialised & injected into the LinkedIn tab.
//            It must be 100% self-contained — no closures, no external refs.
async function clickMoreThenSaveToPDF(dropdownSettleMs) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── Locate the "More" button ────────────────
  // It's a <button> whose visible text is exactly "More".
  const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));

  const moreButton = allButtons.find((el) => {
    const txt   = (el.innerText   || el.textContent || '').trim();
    const label = (el.getAttribute('aria-label')    || '').trim().toLowerCase();
    return (
      txt   === 'More'                                    ||
      label === 'more'                                    ||
      label === 'more actions'                            ||
      label.startsWith('more actions for')
    );
  });

  if (!moreButton) {
    return { success: false, reason: '"More" button not found on this profile. The profile layout may be different (e.g. your own profile, or a restricted account).' };
  }

  moreButton.click();
  await sleep(dropdownSettleMs); // wait for dropdown animation

  // ── Locate "Save to PDF" in the open dropdown ─
  // Try progressively broader selectors.
  const dropdownSelectors = [
    '.artdeco-dropdown__content-inner li',       // standard artdeco dropdown items
    '.artdeco-dropdown__item',
    '.pvs-overflow-actions-dropdown__content li',// profile overflow menu
    '[role="menu"]   [role="menuitem"]',
    '[role="listbox"] [role="option"]',
    'ul[role="menu"] li',
  ];

  let savePdfEl = null;

  for (const sel of dropdownSelectors) {
    const items = Array.from(document.querySelectorAll(sel));
    savePdfEl = items.find((el) =>
      (el.innerText || el.textContent || '').trim().includes('Save to PDF')
    );
    if (savePdfEl) break;
  }

  // Last-resort: any visible element with "Save to PDF" text
  if (!savePdfEl) {
    const allEls = Array.from(document.querySelectorAll('span, li, div, button, a'));
    savePdfEl = allEls.find((el) => {
      if (el.children.length > 2) return false;  // skip parent containers
      if (!el.offsetParent)       return false;  // skip hidden
      const txt = (el.innerText || '').trim();
      return txt === 'Save to PDF';
    });
  }

  if (!savePdfEl) {
    return { success: false, reason: '"Save to PDF" not found in the More dropdown. LinkedIn may have changed their menu structure.' };
  }

  savePdfEl.click();
  await sleep(500); // Brief wait after clicking to ensure download triggers
  return { success: true };
}

// ── Injected: Login check + name scrape ─────────
function scrapePageInfo() {
  const href = window.location.href;

  const onAuthPage =
    href.includes('/login')      ||
    href.includes('/checkpoint') ||
    href.includes('/authwall')   ||
    href.includes('/signup')     ||
    href.includes('/uas/login');

  if (onAuthPage) return { isLoggedIn: false, name: '' };

  const signals = [
    () => !!document.querySelector('#global-nav'),
    () => !!document.querySelector('.global-nav'),
    () => !!document.querySelector('nav[aria-label="Global Navigation"]'),
    () => !!document.querySelector('.global-nav__me'),
    () => !!document.querySelector('.scaffold-layout'),
    () => !!document.querySelector('.application-outlet'),
    () => !!document.querySelector('[data-member-id]'),
    () => !!document.querySelector('.pvs-profile-actions'),
    () => document.cookie.split(';').some((c) => c.trim().startsWith('li_at=')),
    () => document.cookie.split(';').some((c) => c.trim().startsWith('JSESSIONID=')),
  ];

  let signalCount = 0;
  for (const check of signals) { try { if (check()) signalCount++; } catch {} }

  const isProfilePage  = href.includes('/in/') || href.includes('/pub/');
  const hasBodyContent = document.body && document.body.innerText.length > 500;
  const isLoggedIn     = signalCount >= 1 || (isProfilePage && hasBodyContent);

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
    if (el && el.innerText.trim().length > 1) { name = el.innerText.trim(); break; }
  }

  return { isLoggedIn, name };
}

// ── Tab Load Helper ─────────────────────────────
function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timed out'));
    }, TAB_LOAD_TIMEOUT_MS);

    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ── Download Complete Helper ────────────────────
function waitForDownloadComplete(downloadId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.downloads.onChanged.removeListener(listener);
      reject(new Error('Download timed out after 60 s'));
    }, DOWNLOAD_FINISH_MS);

    function listener(delta) {
      if (delta.id !== downloadId) return;
      if (delta.state?.current === 'complete') {
        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(listener);
        resolve();
      }
      if (delta.state?.current === 'interrupted') {
        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(listener);
        reject(new Error('Download was interrupted: ' + (delta.error?.current || 'unknown')));
      }
    }
    chrome.downloads.onChanged.addListener(listener);
  });
}

// ── Generic Poll-Until-True ─────────────────────
function waitForCondition(conditionFn, timeout, timeoutMsg) {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (conditionFn()) { clearInterval(interval); clearTimeout(timer); resolve(); }
    }, 300);
    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(timeoutMsg || 'Condition timed out'));
    }, timeout);
  });
}

// ── Utilities ───────────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function broadcast(msg) { chrome.runtime.sendMessage(msg).catch(() => {}); }
