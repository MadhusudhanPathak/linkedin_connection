// ──────────────────────────────────────────────
//  LinkedIn PDF Downloader — Popup Script
// ──────────────────────────────────────────────

const CHUNK_SIZE = 50;

// ── DOM refs ──────────────────────────────────
const $ = (id) => document.getElementById(id);

const csvInput      = $('csv-input');
const dropzone      = $('dropzone');
const fileMeta      = $('file-meta');
const fileNameLabel = $('file-name-label');
const urlCountPill  = $('url-count-pill');
const chunkPill     = $('chunk-pill');
const alertBanner   = $('alert-banner');
const alertText     = $('alert-text');
const progressSect  = $('progress-section');
const chunkBadge    = $('chunk-badge');
const progressFrac  = $('progress-frac');
const progressBar   = $('progress-bar');
const currentUrl    = $('current-url');
const startBtn      = $('start-btn');
const pauseBtn      = $('pause-btn');
const resumeBtn     = $('resume-btn');
const stopBtn       = $('stop-btn');
const statsRow      = $('stats-row');
const statDone      = $('stat-done');
const statFail      = $('stat-fail');
const statRemain    = $('stat-remain');
const logSection    = $('log-section');
const logList       = $('log-list');
const clearLogBtn   = $('clear-log-btn');
const statusDot     = $('status-dot');

// ── State ──────────────────────────────────────
let parsedUrls = [];
let stats = { done: 0, fail: 0 };

// ── Drag & Drop ────────────────────────────────
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

csvInput.addEventListener('change', () => {
  if (csvInput.files[0]) handleFile(csvInput.files[0]);
});

// ── File Handling ──────────────────────────────
function handleFile(file) {
  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    showAlert('Please select a valid .csv file.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const urls = parseCSV(e.target.result);
    if (urls.length === 0) {
      showAlert('No valid LinkedIn profile URLs found in the CSV.', 'error');
      return;
    }

    parsedUrls = urls;
    hideAlert();

    // Update file meta UI
    fileNameLabel.textContent = file.name;
    urlCountPill.textContent  = `${urls.length} URL${urls.length !== 1 ? 's' : ''}`;
    const chunks = Math.ceil(urls.length / CHUNK_SIZE);
    chunkPill.textContent = `${chunks} chunk${chunks !== 1 ? 's' : ''}`;
    fileMeta.classList.remove('hidden');

    startBtn.disabled = false;
  };
  reader.readAsText(file);
}

// ── CSV Parser ─────────────────────────────────
// Finds all linkedin.com/in/ URLs in any column of a CSV.
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const urls  = [];

  // Detect if first row is a header (no linkedin.com URL in it)
  const isHeader = lines.length > 0 && !lines[0].includes('linkedin.com');
  const start = isHeader ? 1 : 0;

  for (let i = start; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.replace(/^["'\s]+|["'\s]+$/g, ''));
    for (const cell of cells) {
      if (cell.includes('linkedin.com/in/') || cell.includes('linkedin.com/pub/')) {
        let url = cell.trim();
        // Normalise: ensure https://
        if (!url.startsWith('http')) url = 'https://' + url;
        // Strip query params for a clean profile URL
        try {
          const u = new URL(url);
          url = u.origin + u.pathname;
        } catch {}
        if (!urls.includes(url)) urls.push(url);
        break; // only first matching cell per row
      }
    }
  }

  return urls;
}

// ── Controls ───────────────────────────────────
startBtn.addEventListener('click', () => {
  if (parsedUrls.length === 0) return;

  stats = { done: 0, fail: 0 };
  resetUI();
  setRunningState('running');

  chrome.runtime.sendMessage({ type: 'START', urls: parsedUrls }, (resp) => {
    if (!resp || !resp.ok) {
      showAlert(resp?.reason || 'Failed to start. Try again.', 'error');
      setRunningState('idle');
    }
  });
});

pauseBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'PAUSE' });
  setRunningState('paused');
  setDot('paused');
  addLog('pause', '— Paused —', 'Click Resume to continue');
});

resumeBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESUME' });
  setRunningState('running');
  setDot('running');
  addLog('resume', '— Resumed —', '');
});

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP' });
  setRunningState('idle');
  setDot('idle');
  addLog('stop', '— Stopped by user —', '');
});

clearLogBtn.addEventListener('click', () => {
  logList.innerHTML = '';
});

// ── Background Messages ────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {

    case 'PROCESSING': {
      const chunk  = Math.floor(msg.currentIndex / CHUNK_SIZE) + 1;
      const chunks = Math.ceil(msg.total / CHUNK_SIZE);
      chunkBadge.textContent   = `Chunk ${chunk} / ${chunks}`;
      progressFrac.textContent = `${msg.currentIndex + 1} / ${msg.total}`;
      progressBar.style.width  = `${((msg.currentIndex + 1) / msg.total) * 100}%`;
      currentUrl.textContent   = msg.url;
      statRemain.textContent   = msg.total - msg.currentIndex - 1;
      break;
    }

    case 'CHUNK_DONE':
      addLog('chunk', `Chunk ${msg.chunk} complete — ${msg.currentIndex} profiles processed`, '');
      break;

    case 'RESULT': {
      const { result } = msg;
      if (result.success) {
        stats.done++;
        statDone.textContent = stats.done;
        addLog('ok', result.name || result.url, '');
      } else {
        stats.fail++;
        statFail.textContent = stats.fail;
        addLog('fail', result.url, result.reason || 'Unknown error');
      }
      break;
    }

    case 'PAUSED':
      setRunningState('paused');
      setDot('paused');
      currentUrl.textContent = '⏸ Paused — click Resume to continue';
      break;

    case 'RESUMED':
      setRunningState('running');
      setDot('running');
      break;

    case 'NOT_LOGGED_IN':
      setRunningState('idle');
      setDot('error');
      showAlert('LinkedIn session not found. Please log in to LinkedIn in this browser and try again.', 'error');
      addLog('fail', '— Processing halted —', 'Not logged in to LinkedIn');
      break;

    case 'DONE': {
      setRunningState('idle');
      setDot('done');
      const elapsed = formatTime(msg.elapsed);
      addLog('done', `All done! ${stats.done} saved, ${stats.fail} failed`, `Took ${elapsed}`);
      progressBar.style.width  = '100%';
      progressFrac.textContent = `${msg.results.length} / ${msg.results.length}`;
      currentUrl.textContent   = '✅ Complete';
      statRemain.textContent   = '0';
      break;
    }
  }
});

// ── UI Helpers ─────────────────────────────────
function resetUI() {
  logList.innerHTML = '';
  statDone.textContent   = '0';
  statFail.textContent   = '0';
  statRemain.textContent = parsedUrls.length;
  progressBar.style.width  = '0%';
  progressFrac.textContent = `0 / ${parsedUrls.length}`;
  currentUrl.textContent = '—';
  const chunks = Math.ceil(parsedUrls.length / CHUNK_SIZE);
  chunkBadge.textContent = `Chunk 1 / ${chunks}`;
  hideAlert();
}

// state: 'idle' | 'running' | 'paused'
function setRunningState(runState) {
  const running = runState === 'running';
  const paused  = runState === 'paused';
  const idle    = runState === 'idle';

  // Hide the CSV upload area once a run starts
  $('upload-section').classList.toggle('hidden', !idle);

  startBtn.classList.toggle('hidden',  !idle);
  pauseBtn.classList.toggle('hidden',  !running);
  resumeBtn.classList.toggle('hidden', !paused);
  stopBtn.classList.toggle('hidden',   idle);

  if (running || paused) {
    progressSect.classList.remove('hidden');
    statsRow.classList.remove('hidden');
    logSection.classList.remove('hidden');
  }
}

function setDot(state) {
  statusDot.className = 'status-dot';
  if (state !== 'idle') statusDot.classList.add(state);
  const labels = { running: 'Running…', paused: 'Paused', done: 'Complete', error: 'Error', idle: 'Idle' };
  statusDot.title = labels[state] || 'Idle';
}

function showAlert(text, type = 'error') {
  alertText.textContent = text;
  alertBanner.className = `alert${type === 'warn' ? ' warn' : ''}`;
  alertBanner.classList.remove('hidden');
}

function hideAlert() {
  alertBanner.classList.add('hidden');
}

function addLog(type, primary, detail) {
  const icons = {
    ok:     '✅',
    fail:   '❌',
    chunk:  '📦',
    stop:   '⏹️',
    pause:  '⏸️',
    resume: '▶️',
    done:   '🎉'
  };

  const li = document.createElement('li');
  li.className = 'log-item';
  li.innerHTML = `
    <span class="log-icon">${icons[type] || 'ℹ️'}</span>
    <div>
      <div class="log-name">${escapeHtml(primary)}</div>
      ${detail ? `<div class="log-detail">${escapeHtml(detail)}</div>` : ''}
    </div>
  `;
  logList.prepend(li); // newest at top

  // Keep list from growing forever
  while (logList.children.length > 200) {
    logList.removeChild(logList.lastChild);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ── Sync with background on popup open ─────────
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
  if (!state || !state.isRunning) return;
  parsedUrls = state.urls;
  stats.done = state.results.filter(r => r.success).length;
  stats.fail = state.results.filter(r => !r.success).length;
  statDone.textContent   = stats.done;
  statFail.textContent   = stats.fail;
  statRemain.textContent = state.urls.length - state.currentIndex;

  progressSect.classList.remove('hidden');
  statsRow.classList.remove('hidden');
  logSection.classList.remove('hidden');

  if (state.isPaused) {
    setRunningState('paused');
    setDot('paused');
    currentUrl.textContent = '⏸ Paused — click Resume to continue';
  } else {
    setRunningState('running');
    setDot('running');
  }
});
