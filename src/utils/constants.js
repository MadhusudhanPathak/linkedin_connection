/**
 * Global constants for the LinkedIn PDF Downloader extension
 * Centralized configuration and magic numbers
 */

export const CONSTANTS = {
  // Timing (milliseconds)
  TAB_LOAD_TIMEOUT_MS: 30000,
  CLICK_WAIT_MS: 300,
  PAGE_SETTLE_MS: 1000,
  KEEP_ALIVE_INTERVAL_MS: 20000,
  SLIDER_MIN_SECONDS: 3,
  SLIDER_MAX_SECONDS: 15,
  SLIDER_DEFAULT_SECONDS: 5,
  LOG_MAX_ITEMS: 50,
  
  // URLs and patterns
  LINKEDIN_DOMAIN: 'linkedin.com',
  PROFILE_PATTERNS: ['linkedin.com/in/', 'linkedin.com/pub/'],
  AUTH_PAGE_PATTERNS: ['/login', '/checkpoint', '/authwall', '/signup', '/uas/login'],
  
  // Download folder
  DOWNLOAD_FOLDER: 'LinkedIn_Connections',
  PDF_MIME_TYPE: 'application/pdf',
  
  // Message types
  MESSAGE_TYPES: {
    START: 'START',
    PAUSE: 'PAUSE',
    RESUME: 'RESUME',
    STOP: 'STOP',
    GET_STATE: 'GET_STATE',
    PROCESSING: 'PROCESSING',
    RESULT: 'RESULT',
    PAUSED: 'PAUSED',
    RESUMED: 'RESUMED',
    NOT_LOGGED_IN: 'NOT_LOGGED_IN',
    DONE: 'DONE',
  },
  
  // Error messages
  ERRORS: {
    ALREADY_RUNNING: 'Already running',
    NOT_RUNNING: 'Not running',
    NOT_LOGGED_IN: 'NOT_LOGGED_IN',
    MORE_BUTTON_NOT_FOUND: '"More" button not found on this profile. The profile layout may be different (e.g., your own profile, or a restricted account).',
    SAVE_PDF_NOT_FOUND: '"Save to PDF" not found in the More dropdown. LinkedIn may have changed their menu structure.',
    UNKNOWN_MESSAGE_TYPE: 'Unknown message type',
    INVALID_CSV: 'No valid LinkedIn profile URLs found in the CSV.',
  },
};

export default CONSTANTS;
