// ──────────────────────────────────────────────
//  LinkedIn PDF Downloader — Progress Monitor
// ──────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const statDone    = $('stat-done');
const statFail    = $('stat-fail');
const statRemain  = $('stat-remain');
const progressBar = $('progress-bar');
const progressFrac = $('progress-frac');
const currentUrl  = $('current-url');
const pauseBtn    = $('pause-btn');
const resumeBtn   = $('resume-btn');
const stopBtn     = $('stop-btn');
const logSection  = $('log-section');
const statusDot   = $('status-dot');

let stats = { done: 0, fail: 0 };
let logCount = 0;

// ── Listen for background updates ──────────────
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'PROCESSING':
      progressFrac.textContent = `${msg.currentIndex + 1} / ${msg.total}`;
      progressBar.style.width = `${((msg.currentIndex + 1) / msg.total) * 100}%`;
      currentUrl.textContent = msg.url;
      statRemain.textContent = msg.total - msg.currentIndex - 1;
      statusDot.className = 'status-dot running';
      break;

    case 'RESULT': {
      const { result } = msg;
      if (result.success) {
        stats.done++;
        statDone.textContent = stats.done;
        addLog('ok', `✓ ${result.name || result.url}`);
      } else {
        stats.fail++;
        statFail.textContent = stats.fail;
        addLog('fail', `✗ ${result.url}: ${result.reason || 'Unknown error'}`);
      }
      break;
    }

    case 'PAUSED':
      statusDot.className = 'status-dot paused';
      pauseBtn.classList.add('hidden');
      resumeBtn.classList.remove('hidden');
      addLog('info', '⏸️  Process paused');
      break;

    case 'RESUMED':
      statusDot.className = 'status-dot running';
      pauseBtn.classList.remove('hidden');
      resumeBtn.classList.add('hidden');
      addLog('info', '▶️  Process resumed');
      break;

    case 'DONE':
      statusDot.className = 'status-dot done';
      progressBar.style.width = '100%';
      pauseBtn.classList.add('hidden');
      resumeBtn.classList.add('hidden');
      stopBtn.textContent = 'Close';
      addLog('info', `✅ Process complete! ${stats.done} succeeded, ${stats.fail} failed`);
      break;

    case 'NOT_LOGGED_IN':
      statusDot.className = 'status-dot done';
      addLog('fail', '❌ Not logged in to LinkedIn. Please log in and try again.');
      break;
  }
});

// ── Button Controls ────────────────────────────
pauseBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'PAUSE' });
});

resumeBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESUME' });
});

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP' });
  setTimeout(() => window.close(), 500);
});

// ── Log Helper ─────────────────────────────────
function addLog(type, message) {
  logCount++;
  const logItem = document.createElement('div');
  logItem.className = `log-item ${type}`;
  logItem.textContent = message;
  logSection.insertBefore(logItem, logSection.firstChild);
  
  // Keep only last 50 logs
  while (logSection.children.length > 50) {
    logSection.removeChild(logSection.lastChild);
  }
}

// ── Get initial state ──────────────────────────
window.addEventListener('load', () => {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    if (state && state.urls && state.urls.length > 0) {
      statRemain.textContent = state.urls.length - state.currentIndex;
      if (state.isPaused) {
        pauseBtn.classList.add('hidden');
        resumeBtn.classList.remove('hidden');
        statusDot.className = 'status-dot paused';
      } else if (state.isRunning) {
        statusDot.className = 'status-dot running';
      }
    }
  });
});
