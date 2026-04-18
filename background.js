// ─────────────────────────────────────────────
//  LinkedIn PDF Downloader — Background Worker
//  Ultra-simple strategy: click More → Save to PDF, then move to next.
// ─────────────────────────────────────────────

const TAB_LOAD_TIMEOUT_MS = 30000;  // max wait for tab to load

// ── State ──────────────────────────────────────
let state = {
  isRunning:    false,
  isPaused:     false,
  urls:         [],
  currentIndex: 0,
  results:      [],
  startTime:    null,
  waitTime:     3000  // wait time in milliseconds (default 3s)
};

// ── Download Folder Redirect ───────────────────
// Redirect all PDFs to LinkedIn_Connections subfolder
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  const filename = (downloadItem.filename || '').toLowerCase();
  if (filename.endsWith('.pdf') || downloadItem.mime === 'application/pdf') {
    const baseName = downloadItem.filename.split(/[\\/]/).pop();
    suggest({
      filename: 'LinkedIn_Connections/' + baseName,
      conflictAction: 'uniquify'
    });
  }
});

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
        startTime:    Date.now(),
        waitTime:     (msg.waitTime || 3) * 1000  // convert seconds to milliseconds
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

  // Move to next profile immediately (wait already happened after Save to PDF click)
  runNext();
}

// ── Profile Processor ───────────────────────────
async function processProfile(url) {
  let tabId = null;

  try {
    // 1. Open profile in a background tab
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;

    // 2. Wait for page to fully load
    await waitForTabLoad(tabId);
    await sleep(1000); // Brief pause for page to settle

    // 3. Verify login
    const [{ result: pageInfo }] = await chrome.scripting.executeScript({
      target: { tabId },
      func:   scrapePageInfo
    });
    if (!pageInfo.isLoggedIn) throw new Error('NOT_LOGGED_IN');

    // 4. Click More → Save to PDF
    const [{ result: clickResult }] = await chrome.scripting.executeScript({
      target: { tabId },
      func:   clickMoreThenSaveToPDF
    });
    if (!clickResult.success) throw new Error(clickResult.reason || 'Could not click Save to PDF');

    // Wait for user-specified time to allow download to start and process
    await sleep(state.waitTime);

    // That's it! Browser will handle the download in the background.
    // Move to next profile immediately.
    return { url, success: true, name: pageInfo.name };

  } finally {
    // Close tab immediately
    if (tabId !== null) {
      try { await chrome.tabs.remove(tabId); } catch {}
    }
  }
}

// ── Injected: Click More → Save to PDF ─────────
// IMPORTANT: This function is serialised & injected into the LinkedIn tab.
//            It must be 100% self-contained — no closures, no external refs.
async function clickMoreThenSaveToPDF() {
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
  await sleep(300); // minimal wait for dropdown to render

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

// ── Utilities ───────────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function broadcast(msg) { chrome.runtime.sendMessage(msg).catch(() => {}); }
