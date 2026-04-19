/**
 * Utility functions for chrome.runtime messaging
 * Provides wrapper functions and broadcast helpers
 */

import { CONSTANTS } from './constants.js';

/**
 * Broadcast a message to all extensions (popup, progress monitor, etc.)
 * @param {object} message - Message object to broadcast
 */
export function broadcast(message) {
  if (!message || typeof message !== 'object') {
    console.warn('[Broadcast] Invalid message object:', message);
    return;
  }

  try {
    chrome.runtime.sendMessage(message).catch(() => {
      // Listeners may not be active - this is normal
    });
  } catch (error) {
    console.error('[Broadcast] Error sending message:', error);
  }
}

/**
 * Send a message to the background service worker
 * @param {object} message - Message to send
 * @returns {Promise<any>} Response from recipient
 */
export async function sendToBackground(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get current state from background service worker
 * @returns {Promise<object>} Current state object
 */
export async function getState() {
  try {
    return await sendToBackground({ type: CONSTANTS.MESSAGE_TYPES.GET_STATE });
  } catch (error) {
    console.error('[Message Handler] Failed to get state:', error);
    return null;
  }
}

/**
 * Start the download process
 * @param {string[]} urls - Profile URLs to process
 * @param {number} waitTime - Wait time in seconds between profiles
 * @returns {Promise<object>} Response object with ok status
 */
export async function startProcess(urls, waitTime) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('Invalid URLs provided');
  }
  if (typeof waitTime !== 'number' || waitTime < 3 || waitTime > 15) {
    throw new Error('Invalid wait time');
  }
  return sendToBackground({
    type: CONSTANTS.MESSAGE_TYPES.START,
    urls,
    waitTime,
  });
}

/**
 * Pause the download process
 * @returns {Promise<object>} Response object
 */
export async function pauseProcess() {
  return sendToBackground({ type: CONSTANTS.MESSAGE_TYPES.PAUSE });
}

/**
 * Resume the download process
 * @returns {Promise<object>} Response object
 */
export async function resumeProcess() {
  return sendToBackground({ type: CONSTANTS.MESSAGE_TYPES.RESUME });
}

/**
 * Stop the download process
 * @returns {Promise<object>} Response object
 */
export async function stopProcess() {
  return sendToBackground({ type: CONSTANTS.MESSAGE_TYPES.STOP });
}

export default {
  broadcast,
  sendToBackground,
  getState,
  startProcess,
  pauseProcess,
  resumeProcess,
  stopProcess,
};
