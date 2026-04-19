/**
 * LinkedIn PDF Downloader - Popup Script
 * Handles user interface, CSV upload, controls, and status display
 * 
 * Features:
 * - CSV file upload with drag & drop
 * - URL validation and parsing
 * - Wait time configuration
 * - Process control (start/pause/resume/stop)
 * - Real-time progress monitoring
 * - Activity logging
 */

import { CONSTANTS } from '../utils/constants.js';
import { parseCSV, isValidCsvFile } from '../utils/csv-parser.js';
import { $, addClass, removeClass, toggleClass, setVisible, clearChildren, formatTime, calculateEstimatedTime } from '../utils/helpers.js';
import { startProcess, pauseProcess, resumeProcess, stopProcess, getState } from '../utils/message-handler.js';

// ─────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────

// Upload section
const csvInput = $('csv-input');
const dropzone = $('dropzone');
const fileMeta = $('file-meta');
const fileNameLabel = $('file-name-label');
const urlCountPill = $('url-count-pill');
const alertBanner = $('alert-banner');
const alertText = $('alert-text');

// Slider section
const waitTimeSlider = $('wait-time-slider');
const sliderValue = $('slider-value');
const estimateSection = $('estimate-section');
const estimateValue = $('estimate-value');

// Progress section
const progressSection = $('progress-section');
const progressFrac = $('progress-frac');
const progressBar = $('progress-bar');
const currentUrl = $('current-url');
const statsRow = $('stats-row');
const statDone = $('stat-done');
const statFail = $('stat-fail');
const statRemain = $('stat-remain');

// Controls
const startBtn = $('start-btn');
const pauseBtn = $('pause-btn');
const resumeBtn = $('resume-btn');
const stopBtn = $('stop-btn');

// Log section
const logSection = $('log-section');
const logList = $('log-list');
const clearLogBtn = $('clear-log-btn');

// Status indicator
const statusDot = $('status-dot');

// ─────────────────────────────────────────────
// LOCAL STATE
// ─────────────────────────────────────────────

let parsedUrls = [];
let stats = { done: 0, fail: 0 };
let selectedWaitTime = CONSTANTS.SLIDER_DEFAULT_SECONDS;

// ─────────────────────────────────────────────
// FILE UPLOAD HANDLING
// ─────────────────────────────────────────────

/**
 * Drag and drop zone event handlers
 */
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  addClass(dropzone, 'drag-over');
});

dropzone.addEventListener('dragleave', () => {
  removeClass(dropzone, 'drag-over');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  removeClass(dropzone, 'drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

csvInput.addEventListener('change', () => {
  if (csvInput.files[0]) handleFile(csvInput.files[0]);
});

/**
 * Process uploaded file
 * @param {File} file - File to process
 */
function handleFile(file) {
  // Validate file
  if (!isValidCsvFile(file)) {
    showAlert('Please select a valid .csv file.', 'error');
    return;
  }

  // Read file
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const urls = parseCSV(e.target.result);
      
      if (urls.length === 0) {
        showAlert(CONSTANTS.ERRORS.INVALID_CSV, 'error');
        return;
      }

      parsedUrls = urls;
      hideAlert();

      // Update UI
      fileNameLabel.textContent = file.name;
      urlCountPill.textContent = `${urls.length} URL${urls.length !== 1 ? 's' : ''}`;
      setVisible(fileMeta, true);

      startBtn.disabled = false;
      
      // Show estimated time
      updateEstimatedTime();
      setVisible(estimateSection, true);
    } catch (error) {
      showAlert(`Error parsing file: ${error.message}`, 'error');
    }
  };

  reader.onerror = () => {
    showAlert('Error reading file. Please try again.', 'error');
  };

  reader.readAsText(file);
}

// ─────────────────────────────────────────────
// SLIDER & ESTIMATED TIME
// ─────────────────────────────────────────────

waitTimeSlider.addEventListener('input', (e) => {
  selectedWaitTime = parseInt(e.target.value, 10);
  sliderValue.textContent = `${selectedWaitTime}s`;
  updateEstimatedTime();
});

/**
 * Update and display estimated completion time
 */
function updateEstimatedTime() {
  if (parsedUrls.length === 0) return;
  estimateValue.textContent = calculateEstimatedTime(parsedUrls.length, selectedWaitTime);
}

// ─────────────────────────────────────────────
// PROCESS CONTROLS
// ─────────────────────────────────────────────

startBtn.addEventListener('click', async () => {
  if (parsedUrls.length === 0) return;

  try {
    stats = { done: 0, fail: 0 };
    resetUI();
    setRunningState('running');

    // Open progress monitor window
    chrome.tabs.create({
      url: chrome.runtime.getURL('progress.html'),
      active: true,
    });

    // Start processing
    const response = await startProcess(parsedUrls, selectedWaitTime);
    
    if (!response?.ok) {
      showAlert(response?.reason || 'Failed to start. Try again.', 'error');
      setRunningState('idle');
    }
  } catch (error) {
    showAlert(`Error: ${error.message}`, 'error');
    setRunningState('idle');
  }
});

pauseBtn.addEventListener('click', async () => {
  try {
    await pauseProcess();
    setRunningState('paused');
    setStatusDot('paused');
    addLog('pause', '— Paused —', 'Click Resume to continue');
  } catch (error) {
    showAlert(`Error pausing: ${error.message}`, 'error');
  }
});

resumeBtn.addEventListener('click', async () => {
  try {
    await resumeProcess();
    setRunningState('running');
    setStatusDot('running');
    addLog('resume', '— Resumed —', '');
  } catch (error) {
    showAlert(`Error resuming: ${error.message}`, 'error');
  }
});

stopBtn.addEventListener('click', async () => {
  try {
    await stopProcess();
    setRunningState('idle');
    setStatusDot('idle');
    addLog('stop', '— Stopped by user —', '');
  } catch (error) {
    showAlert(`Error stopping: ${error.message}`, 'error');
  }
});

clearLogBtn.addEventListener('click', () => {
  clearChildren(logList);
});

// ─────────────────────────────────────────────
// MESSAGE HANDLING
// ─────────────────────────────────────────────

/**
 * Listen for background worker broadcasts
 */
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;

  try {
    switch (msg.type) {
      case CONSTANTS.MESSAGE_TYPES.PROCESSING:
        progressFrac.textContent = `${msg.currentIndex + 1} / ${msg.total}`;
        progressBar.style.width = `${((msg.currentIndex + 1) / msg.total) * 100}%`;
        currentUrl.textContent = msg.url;
        statRemain.textContent = msg.total - msg.currentIndex - 1;
        break;

      case CONSTANTS.MESSAGE_TYPES.RESULT: {
        const { result } = msg;
        if (result.success) {
          stats.done++;
          statDone.textContent = stats.done;
          addLog('ok', result.name || result.url, '');
          setStatusDot('running');
        } else {
          stats.fail++;
          statFail.textContent = stats.fail;
          addLog('fail', result.url, result.reason || 'Unknown error');
          setStatusDot('error');
          setTimeout(() => setStatusDot('running'), 1000);
        }
        break;
      }

      case CONSTANTS.MESSAGE_TYPES.PAUSED:
        setRunningState('paused');
        setStatusDot('paused');
        currentUrl.textContent = '⏸ Paused — click Resume to continue';
        break;

      case CONSTANTS.MESSAGE_TYPES.RESUMED:
        setRunningState('running');
        setStatusDot('running');
        break;

      case CONSTANTS.MESSAGE_TYPES.NOT_LOGGED_IN:
        setRunningState('idle');
        setStatusDot('error');
        showAlert('LinkedIn session not found. Please log in to LinkedIn in this browser and try again.', 'error');
        addLog('fail', '— Processing halted —', 'Not logged in to LinkedIn');
        break;

      case CONSTANTS.MESSAGE_TYPES.DONE: {
        setRunningState('idle');
        setStatusDot('done');
        const elapsed = formatTime(msg.elapsed);
        addLog('done', `All done! ${stats.done} saved, ${stats.fail} failed`, `Took ${elapsed}`);
        progressBar.style.width = '100%';
        progressFrac.textContent = `${msg.results.length} / ${msg.results.length}`;
        currentUrl.textContent = '✅ Complete';
        statRemain.textContent = '0';
        break;
      }
    }
  } catch (error) {
    console.error('[Popup] Error handling message:', error);
  }
});

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────

/**
 * Reset UI to initial state
 */
function resetUI() {
  clearChildren(logList);
  statDone.textContent = '0';
  statFail.textContent = '0';
  statRemain.textContent = parsedUrls.length;
  progressBar.style.width = '0%';
  progressFrac.textContent = `0 / ${parsedUrls.length}`;
  currentUrl.textContent = '—';
  hideAlert();
}

/**
 * Set running state and update UI accordingly
 * @param {string} runState - 'idle' | 'running' | 'paused'
 */
function setRunningState(runState) {
  const running = runState === 'running';
  const paused = runState === 'paused';
  const idle = runState === 'idle';

  // Toggle section visibility
  setVisible($('upload-section'), idle);
  setVisible($('slider-section'), idle);
  setVisible(estimateSection, idle && parsedUrls.length > 0);

  // Toggle button visibility
  setVisible(startBtn, idle);
  setVisible(pauseBtn, running);
  setVisible(resumeBtn, paused);
  setVisible(stopBtn, !idle);

  // Toggle progress sections
  if (running || paused) {
    setVisible(progressSection, true);
    setVisible(statsRow, true);
    setVisible(logSection, true);
  }
}

/**
 * Set status indicator dot color
 * @param {string} state - 'idle' | 'running' | 'paused' | 'done' | 'error'
 */
function setStatusDot(state) {
  statusDot.className = 'status-dot';
  if (state !== 'idle') {
    addClass(statusDot, state);
  }
  
  const labels = {
    running: 'Running…',
    paused: 'Paused',
    done: 'Complete',
    error: 'Error',
    idle: 'Idle',
  };
  statusDot.title = labels[state] || 'Idle';
}

/**
 * Show error/warning banner
 * @param {string} text - Message text
 * @param {string} type - 'error' | 'warn'
 */
function showAlert(text, type = 'error') {
  alertText.textContent = text;
  alertBanner.className = `alert${type === 'warn' ? ' warn' : ''}`;
  setVisible(alertBanner, true);
}

/**
 * Hide alert banner
 */
function hideAlert() {
  setVisible(alertBanner, false);
}

/**
 * Add log entry
 * @param {string} type - Log type: 'ok' | 'fail' | 'pause' | 'resume' | 'stop' | 'done'
 * @param {string} title - Main message
 * @param {string} detail - Optional detail message
 */
function addLog(type, title, detail) {
  const item = document.createElement('li');
  item.className = `log-item ${type}`;
  
  const time = new Date().toLocaleTimeString();
  item.innerHTML = `<span class="log-time">${time}</span><span class="log-text">${title}</span>${detail ? `<span class="log-detail">${detail}</span>` : ''}`;
  
  logList.insertBefore(item, logList.firstChild);

  // Keep only last 50 logs
  while (logList.children.length > CONSTANTS.LOG_MAX_ITEMS) {
    logList.removeChild(logList.lastChild);
  }
}

// ─────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────

console.log('[Popup] LinkedIn PDF Downloader loaded');
