// ─────────────────────────────────────────────
//  LinkedIn PDF Downloader — Background Worker
// ─────────────────────────────────────────────

const CHUNK_SIZE = 50;
const DELAY_MS   = 3000;
const TAB_LOAD_TIMEOUT_MS = 30000;
const POST_LOAD_WAIT_MS   = 3500; // wait for LinkedIn's dynamic content to settle (Edge needs a bit more)

// ── State ──────────────────────────────────────
let state = {
  isRunning:    false,
  isPaused:     false,
  urls:         [],
  currentIndex: 0,
  results:      [],
  startTime:    null
};

// ── Keep-alive via alarms ───────────────────────
// MV3 service workers are killed after ~30s of inactivity.
// We create a recurring alarm to prevent that during a run.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive' && state.isRunning) {
    chrome.alarms.create('keepAlive', { when: Date.now() + 20000 });
  }
});

// ── Message Router ──────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {

    case 'START':
      if (state.isRunning) { sendResponse({ ok: false, reason: 'Already running' }); return; }
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

  return true; // keep sendResponse channel open
});

// ── Main Loop ───────────────────────────────────
async function runNext() {
  if (!state.isRunning) return;

  const { urls, currentIndex } = state;

  if (currentIndex >= urls.length) {
    state.isRunning = false;
    chrome.alarms.clear('keepAlive');
    broadcast({ type: 'DONE', results: state.results, elapsed: Date.now() - state.startTime });
    return;
  }

  // ── Chunk boundary pause ──────────────────────
  if (currentIndex > 0 && currentIndex % CHUNK_SIZE === 0) {
    const chunk = currentIndex / CHUNK_SIZE;
    broadcast({ type: 'CHUNK_DONE', chunk, currentIndex, total: urls.length });
    // No extra pause beyond the per-profile delay — chunk info is just cosmetic.
  }

  const url = urls[currentIndex].trim();
  broadcast({ type: 'PROCESSING', url, currentIndex, total: urls.length });

  let result;
  try {
    result = await processProfile(url);
  } catch (err) {
    const reason = err.message || String(err);
    result = { url, success: false, reason };

    // Hard stop: if user isn't logged in, halt everything
    if (reason === 'NOT_LOGGED_IN') {
      state.isRunning = false;
      chrome.alarms.clear('keepAlive');
      broadcast({ type: 'NOT_LOGGED_IN', currentIndex, total: urls.length });
      return;
    }
  }

  state.results.push(result);
  broadcast({ type: 'RESULT', result, currentIndex, total: urls.length });

  state.currentIndex++;

  // Wait 3 s between profiles then continue
  if (state.isRunning) {
    setTimeout(runNext, DELAY_MS);
  }
}

// ── Profile Processor ───────────────────────────
async function processProfile(url) {
  let tabId;

  try {
    // 1. Open tab (background, not focused)
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;

    // 2. Wait for full load
    await waitForTabLoad(tabId);

    // 3. Extra settle time (LinkedIn is heavily JS-rendered)
    await sleep(POST_LOAD_WAIT_MS);

    // 4. Check login + scrape name via injected script
    const [{ result: pageInfo }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: scrapePageInfo
    });

    if (!pageInfo.isLoggedIn) {
      throw new Error('NOT_LOGGED_IN');
    }

    const name = sanitizeFilename(pageInfo.name || 'Unknown_Profile');

    // 5. Generate PDF via Chrome DevTools Protocol
    const base64Pdf = await printToPDF(tabId);

    // 6. Download to user's default downloads folder
    const filename = `LinkedIn_${name}.pdf`;
    await downloadBase64PDF(base64Pdf, filename);

    return { url, success: true, name: pageInfo.name, filename };

  } finally {
    if (tabId != null) {
      try { await chrome.tabs.remove(tabId); } catch {}
    }
  }
}

// ── Tab Load Helper ─────────────────────────────
function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('Tab load timed out')); },
      TAB_LOAD_TIMEOUT_MS
    );

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

// ── Page Info Scraper (runs inside the tab) ─────
// This function is serialised and injected — no closure variables allowed.
function scrapePageInfo() {
  const href = window.location.href;

  // ── Hard auth-wall check ─────────────────────
  // If LinkedIn redirected us to a login/auth page, we're definitely logged out.
  const onAuthPage = href.includes('/login') ||
                     href.includes('/checkpoint') ||
                     href.includes('/authwall') ||
                     href.includes('/signup') ||
                     href.includes('/uas/login');

  if (onAuthPage) {
    return { isLoggedIn: false, name: '', reason: 'auth_redirect' };
  }

  // ── Multi-signal login detection ─────────────
  // LinkedIn changes class names frequently. We cast a wide net across
  // every known signal rather than relying on a single selector.

  const signals = [
    // Global nav container (present since 2019, still present 2025)
    () => !!document.querySelector('#global-nav'),
    () => !!document.querySelector('.global-nav'),
    // Top nav authenticated elements
    () => !!document.querySelector('nav[aria-label="Global Navigation"]'),
    // "Me" dropdown — class name varies across LinkedIn versions
    () => !!document.querySelector('.global-nav__me'),
    () => !!document.querySelector('[data-control-name="identity_welcome_message"]'),
    () => !!document.querySelector('[data-control-name="nav.settings"]'),
    // Profile photo thumbnail in nav (only rendered when logged in)
    () => !!document.querySelector('.global-nav__me-photo'),
    () => !!document.querySelector('.nav-settings__profile-photo'),
    // Scaffold layout only exists on authenticated pages
    () => !!document.querySelector('.scaffold-layout'),
    () => !!document.querySelector('.application-outlet'),
    // "Start a post" button on feed / profile
    () => !!document.querySelector('[data-control-name="share.sharebox_focus_trigger"]'),
    // Authenticated cookie: li_at is LinkedIn's session token
    () => document.cookie.split(';').some(c => c.trim().startsWith('li_at=')),
    // JSESSIONID is also set on authenticated sessions
    () => document.cookie.split(';').some(c => c.trim().startsWith('JSESSIONID=')),
    // The main feed or profile content wrapper
    () => !!document.querySelector('.feed-container-theme'),
    () => !!document.querySelector('.profile-detail'),
    // Any element with LinkedIn's authenticated data attribute
    () => !!document.querySelector('[data-member-id]'),
    // "Add to profile" / connection buttons only appear when logged in
    () => !!document.querySelector('.pvs-profile-actions'),
    () => !!document.querySelector('.pv-top-card--list'),
  ];

  // Require at least 1 positive signal — if LinkedIn is loaded (not an auth page)
  // and any logged-in indicator is present, treat as logged in.
  let signalCount = 0;
  for (const check of signals) {
    try { if (check()) signalCount++; } catch {}
  }

  // Also accept if we're on a /in/ profile URL with page content
  // (LinkedIn sometimes loads profile even before full nav renders)
  const isProfilePage = href.includes('/in/') || href.includes('/pub/');
  const hasBodyContent = document.body && document.body.innerText.length > 500;
  const urlSignal = isProfilePage && hasBodyContent;

  const isLoggedIn = signalCount >= 1 || urlSignal;

  // ── Name extraction ──────────────────────────
  const nameSelectors = [
    'h1.text-heading-xlarge',                      // current LinkedIn (2024–25)
    '.pv-text-details__left-panel h1',             // older layout
    '.artdeco-entity-lockup__title h1',
    '.ph5 h1',                                     // profile header container
    'section.artdeco-card h1',
    '.profile-info-subheader h1',
    'main h1',                                     // broad fallback
    'h1',                                          // last resort
  ];

  let name = '';
  for (const sel of nameSelectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 1) {
      name = el.innerText.trim();
      break;
    }
  }

  return { isLoggedIn, name, signalCount, urlSignal };
}

// ── CDP PDF Generation ──────────────────────────
function printToPDF(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        return reject(new Error(`Debugger attach failed: ${chrome.runtime.lastError.message}`));
      }

      chrome.debugger.sendCommand(
        { tabId },
        'Page.printToPDF',
        {
          printBackground:      true,
          preferCSSPageSize:    false,
          paperWidth:           8.27,   // A4 in inches
          paperHeight:          11.69,
          marginTop:            0.39,
          marginBottom:         0.39,
          marginLeft:           0.39,
          marginRight:          0.39,
          scale:                0.9
        },
        (result) => {
          // Always detach, even on error
          chrome.debugger.detach({ tabId }, () => {});

          if (chrome.runtime.lastError) {
            return reject(new Error(`printToPDF failed: ${chrome.runtime.lastError.message}`));
          }
          if (!result || !result.data) {
            return reject(new Error('printToPDF returned empty data'));
          }
          resolve(result.data); // base64-encoded PDF
        }
      );
    });
  });
}

// ── Download PDF from base64 ────────────────────
function downloadBase64PDF(base64Data, filename) {
  return new Promise((resolve, reject) => {
    // chrome.downloads supports data: URLs directly
    const dataUrl = `data:application/pdf;base64,${base64Data}`;

    chrome.downloads.download(
      { url: dataUrl, filename, saveAs: false, conflictAction: 'uniquify' },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(`Download failed: ${chrome.runtime.lastError.message}`));
        }
        resolve(downloadId);
      }
    );
  });
}

// ── Utilities ───────────────────────────────────
function sanitizeFilename(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, '')   // strip illegal chars
    .replace(/\s+/g, '_')            // spaces → underscores
    .substring(0, 100);              // max length guard
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup may be closed — that's fine, ignore the error
  });
}
