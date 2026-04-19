/**
 * Utility helper functions
 * Common utilities for timing, formatting, DOM manipulation
 */

/**
 * Delay execution by specified milliseconds
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export async function sleep(ms) {
  if (typeof ms !== 'number' || ms < 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format milliseconds into human-readable time string
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted time string (e.g., "2m 35s")
 */
export function formatTime(ms) {
  if (typeof ms !== 'number' || ms < 0) {
    return '0s';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${totalSeconds}s`;
}

/**
 * Format estimated completion time for display
 * @param {number} numUrls - Number of profiles to process
 * @param {number} waitTimeSeconds - Wait time per profile
 * @returns {string} Human-readable estimated time
 */
export function calculateEstimatedTime(numUrls, waitTimeSeconds) {
  if (typeof numUrls !== 'number' || typeof waitTimeSeconds !== 'number') {
    return '0s';
  }

  // Formula: (waitTime * numUrls) + buffer for page loads
  const estimatedSeconds = (waitTimeSeconds * numUrls) + 10;
  return formatTime(estimatedSeconds * 1000);
}

/**
 * Safe DOM element getter
 * @param {string} id - Element ID
 * @returns {HTMLElement|null} Element or null if not found
 */
export function $(id) {
  if (typeof id !== 'string') {
    console.warn('[DOM Helper] Invalid element ID:', id);
    return null;
  }
  return document.getElementById(id);
}

/**
 * Check if element exists in DOM
 * @param {string} id - Element ID
 * @returns {boolean}
 */
export function elementExists(id) {
  return $(id) !== null;
}

/**
 * Add a CSS class to an element
 * @param {HTMLElement} el - Element
 * @param {string} className - Class name to add
 */
export function addClass(el, className) {
  if (el && el.classList && className) {
    el.classList.add(className);
  }
}

/**
 * Remove a CSS class from an element
 * @param {HTMLElement} el - Element
 * @param {string} className - Class name to remove
 */
export function removeClass(el, className) {
  if (el && el.classList && className) {
    el.classList.remove(className);
  }
}

/**
 * Toggle a CSS class on an element
 * @param {HTMLElement} el - Element
 * @param {string} className - Class name to toggle
 * @param {boolean} [force] - Optional: force add (true) or remove (false)
 */
export function toggleClass(el, className, force) {
  if (el && el.classList && className) {
    if (force !== undefined) {
      el.classList.toggle(className, force);
    } else {
      el.classList.toggle(className);
    }
  }
}

/**
 * Set visibility of an element
 * @param {HTMLElement} el - Element
 * @param {boolean} visible - Show (true) or hide (false)
 */
export function setVisible(el, visible) {
  if (el) {
    toggleClass(el, 'hidden', !visible);
  }
}

/**
 * Clear all child elements
 * @param {HTMLElement} el - Parent element
 */
export function clearChildren(el) {
  if (el) {
    el.innerHTML = '';
  }
}

export default {
  sleep,
  formatTime,
  calculateEstimatedTime,
  $,
  elementExists,
  addClass,
  removeClass,
  toggleClass,
  setVisible,
  clearChildren,
};
