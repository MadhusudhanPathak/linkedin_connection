/**
 * LinkedIn PDF Downloader - Progress Monitor Script
 * Displays real-time progress in a separate persistent window
 * Allows user control even when popup is minimized
 * 
 * Features:
 * - Real-time progress bar and statistics
 * - Activity log with timestamps
 * - Process control buttons
 * - Status indicator
 */

import { CONSTANTS } from '../utils/constants.js';
import { $, addClass, removeClass, setVisible, clearChildren } from '../utils/helpers.js';
import { getState, pauseProcess, resumeProcess, stopProcess } from '../utils/message-handler.js';

// ─────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────

const statDone = $('stat-done');
const statFail = $('stat-fail');
const statRemain = $('stat-remain');
const progressBar = $('progress-bar');
const progressFrac = $('progress-frac');
const currentUrl = $('current-url');
const pauseBtn = $('pause-btn');
const resumeBtn = $('resume-btn');
const stopBtn = $('stop-btn');
const logSection = $('log-section');
const statusDot = $('status-dot');

// ─────────────────────────────────────────────
// LOCAL STATE
// ─────────────────────────────────────────────

let stats = { done: 0, fail: 0 };
let logCount = 0;

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
        addClass(statusDot, 'running');
        break;

      case CONSTANTS.MESSAGE_TYPES.RESULT: {
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

      case CONSTANTS.MESSAGE_TYPES.PAUSED:
        statusDot.className = 'status-dot paused';
        addClass(pauseBtn, 'hidden');
        removeClass(resumeBtn, 'hidden');
        addLog('info', '⏸️  Process paused');
        break;

      case CONSTANTS.MESSAGE_TYPES.RESUMED:
        statusDot.className = 'status-dot running';
        removeClass(pauseBtn, 'hidden');
        addClass(resumeBtn, 'hidden');
        addLog('info', '▶️  Process resumed');
        break;

      case CONSTANTS.MESSAGE_TYPES.DONE:
        statusDot.className = 'status-dot done';
        progressBar.style.width = '100%';
        addClass(pauseBtn, 'hidden');
        addClass(resumeBtn, 'hidden');
        stopBtn.textContent = 'Close';
        addLog('info', `✅ Process complete! ${stats.done} succeeded, ${stats.fail} failed`);
        break;

      case CONSTANTS.MESSAGE_TYPES.NOT_LOGGED_IN:
        statusDot.className = 'status-dot error';
        addLog('fail', '❌ Not logged in to LinkedIn. Please log in and try again.');
        break;
    }
  } catch (error) {
    console.error('[Progress Monitor] Error handling message:', error);
  }
});

// ─────────────────────────────────────────────
// PROCESS CONTROLS
// ─────────────────────────────────────────────

pauseBtn.addEventListener('click', async () => {
  try {
    await pauseProcess();
  } catch (error) {
    console.error('[Progress Monitor] Error pausing:', error);
  }
});

resumeBtn.addEventListener('click', async () => {
  try {
    await resumeProcess();
  } catch (error) {
    console.error('[Progress Monitor] Error resuming:', error);
  }
});

stopBtn.addEventListener('click', async () => {
  try {
    await stopProcess();
    setTimeout(() => window.close(), 500);
  } catch (error) {
    console.error('[Progress Monitor] Error stopping:', error);
    setTimeout(() => window.close(), 500);
  }
});

// ─────────────────────────────────────────────
// LOG MANAGEMENT
// ─────────────────────────────────────────────

/**
 * Add entry to activity log
 * @param {string} type - Log type: 'ok' | 'fail' | 'info'
 * @param {string} message - Log message
 */
function addLog(type, message) {
  logCount++;
  const logItem = document.createElement('div');
  logItem.className = `log-item ${type}`;
  
  const time = new Date().toLocaleTimeString();
  logItem.innerHTML = `<span class="log-time">${time}</span><span class="log-text">${message}</span>`;
  
  logSection.insertBefore(logItem, logSection.firstChild);

  // Keep only last 50 logs
  while (logSection.children.length > CONSTANTS.LOG_MAX_ITEMS) {
    logSection.removeChild(logSection.lastChild);
  }
}

// ─────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────

/**
 * Load initial state from background worker
 */
window.addEventListener('load', async () => {
  try {
    const state = await getState();
    
    if (state && state.urls && state.urls.length > 0) {
      statRemain.textContent = state.urls.length - state.currentIndex;
      
      if (state.isPaused) {
        addClass(pauseBtn, 'hidden');
        removeClass(resumeBtn, 'hidden');
        statusDot.className = 'status-dot paused';
      } else if (state.isRunning) {
        statusDot.className = 'status-dot running';
      }
    }
  } catch (error) {
    console.error('[Progress Monitor] Error loading state:', error);
  }
});

console.log('[Progress Monitor] LinkedIn PDF Downloader loaded');
