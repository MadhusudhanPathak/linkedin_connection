/**
 * CSV Parser for LinkedIn profile URLs
 * Robust parsing with validation and normalization
 */

import { CONSTANTS } from './constants.js';

/**
 * Parse CSV file content and extract LinkedIn profile URLs
 * @param {string} csvText - Raw CSV file content
 * @returns {string[]} Array of validated and normalized LinkedIn profile URLs
 * @throws {Error} If no valid URLs are found
 */
export function parseCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    return [];
  }

  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  // Detect if first row is a header (doesn't contain a LinkedIn URL)
  const isHeader = lines[0] && !lines[0].includes('linkedin.com');
  const startIdx = isHeader ? 1 : 0;

  const urls = [];
  const seenUrls = new Set();

  for (let i = startIdx; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    for (const cell of cells) {
      const url = normalizeUrl(cell);
      if (url && !seenUrls.has(url)) {
        urls.push(url);
        seenUrls.add(url);
      }
    }
  }

  return urls;
}

/**
 * Parse a single CSV row with proper quote and escape handling
 * @param {string} row - CSV row string
 * @returns {string[]} Array of cell values
 */
function parseCsvRow(row) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    const nextChar = row[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

/**
 * Normalize and validate a LinkedIn profile URL
 * @param {string} urlStr - Raw URL string
 * @returns {string|null} Normalized URL or null if invalid
 */
function normalizeUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    return null;
  }

  // Remove leading/trailing quotes and whitespace
  let url = urlStr.replace(/^["'\s]+|["'\s]+$/g, '').trim();

  if (!url) {
    return null;
  }

  // Check for LinkedIn profile patterns
  const isLinkedInProfile = CONSTANTS.PROFILE_PATTERNS.some(pattern => url.includes(pattern));
  if (!isLinkedInProfile) {
    return null;
  }

  // Ensure https://
  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }

  // Remove trailing slashes and query params - just protocol + domain + path
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch {
    // Invalid URL format
    return null;
  }
}

/**
 * Validate that file is a CSV file
 * @param {File} file - File object
 * @returns {boolean} True if valid CSV file
 */
export function isValidCsvFile(file) {
  if (!file) return false;
  return file.name.endsWith('.csv') || file.type === 'text/csv';
}

export default { parseCSV, isValidCsvFile };
