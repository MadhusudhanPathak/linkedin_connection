# AGENT.md — LinkedIn Connection PDF Downloader (Browser Extension)

## Project Overview

A **Manifest V3 browser extension** for Chromium-based browsers (Edge, Chrome, Brave) that batch-downloads LinkedIn connection profiles as PDFs. It automates the "More → Save to PDF" process with a streamlined, fast workflow.

No complex monitoring, no waiting for downloads to complete - just click and move forward. Includes a persistent progress monitor window.

**GitHub Repository:** https://github.com/MadhusudhanPathak/linkedin_connection

---

## File Structure

```
linkedin_connection/
├── manifest.json      # MV3 extension config
├── background.js      # Service worker — main automation logic
├── popup.html         # Extension popup UI
├── popup.css          # Popup styles
├── popup.js           # Popup logic, CSV parsing, UI controls
├── progress.html      # Persistent progress monitor window
├── progress.js        # Progress monitor logic and real-time updates
├── README.md          # User documentation
├── agent.md           # This technical reference
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## Architecture

### Communication Pattern
```
popup.js  ──[chrome.runtime.sendMessage]──►  background.js
background.js  ──[chrome.runtime.sendMessage (broadcast)]──►  popup.js, progress.js
progress.js  ──[chrome.runtime.sendMessage]──►  background.js
```

Popup sends commands: `START`, `PAUSE`, `RESUME`, `STOP`, `GET_STATE`.
Background broadcasts events: `PROCESSING`, `RESULT`, `PAUSED`, `RESUMED`, `NOT_LOGGED_IN`, `DONE`.
Progress monitor listens for broadcasts and sends control commands.

### Processing Flow (per profile)
```
Open background tab
  → waitForTabLoad (onUpdated event, 30s timeout)
  → executeScript: checkLoginAndGetName()  (login check + name scrape)
  → executeScript: clickSaveToPDF()  (click More → Save to PDF)
  → wait user-specified time (3-15 seconds)
  → chrome.tabs.remove(tabId)
  → runNext()
```

**Simplified approach:** No download monitoring - just click "Save to PDF" and wait the user-configured time before moving to the next profile.

---

## Key Design Decisions

### Simplified Processing
Removed complex download detection and waiting logic. The extension now trusts that LinkedIn's PDF generation will complete within the user-specified wait time. This eliminates false positives and stuck states while maintaining reliability.

### User-Configurable Timing
Wait time between profiles is now user-controlled via a slider (3-15 seconds, default 5s). This allows users to adjust based on their internet speed and LinkedIn's responsiveness.

### Persistent Progress Monitor
A dedicated progress window opens in a new tab and stays visible throughout the process, solving the issue where progress disappeared when the popup was minimized.

### Automatic Folder Organization
PDFs are automatically redirected to a `LinkedIn_Connections` subfolder using `chrome.downloads.onDeterminingFilename`.

### MV3 Service Worker Keep-Alive
`chrome.alarms` fires every 20s during processing to prevent the service worker from being killed.

---

## State Object (background.js)

```js
state = {
  isRunning:    Boolean,   // true while processing is active
  isPaused:     Boolean,   // true when user has paused
  urls:         String[],  // profile URLs from CSV
  currentIndex: Number,    // next URL to process
  results:      Array,     // { url, success, name?, reason? } per profile
  startTime:    Number,    // Date.now() at START
  waitTime:     Number,    // user-selected wait time in ms
}
```

---

## Constants (background.js)

| Constant | Value | Purpose |
|---|---|---|
| `TAB_LOAD_TIMEOUT_MS` | 30000 | Max ms to wait for tab load |
| `DEFAULT_WAIT_TIME_MS` | 5000 | Default wait time (5 seconds) |
| `MIN_WAIT_TIME_MS` | 3000 | Minimum slider value (3 seconds) |
| `MAX_WAIT_TIME_MS` | 15000 | Maximum slider value (15 seconds) |

---

## Injected Functions

### `checkLoginAndGetName()`
Checks login state and extracts the profile name.

Returns: `{ isLoggedIn: Boolean, name: String }`

Login signals (any 1 = logged in):
- `#global-nav`, `.global-nav`, `nav[aria-label="Global Navigation"]`
- `.global-nav__me`, `.scaffold-layout`, `.application-outlet`
- `[data-member-id]`, `.pvs-profile-actions`
- Cookie `li_at=`, Cookie `JSESSIONID=`
- Fallback: URL contains `/in/` AND `body.innerText.length > 500`

Name selectors tried in order:
- `h1.text-heading-xlarge`
- `.pv-text-details__left-panel h1`
- `.artdeco-entity-lockup__title h1`
- `.ph5 h1`
- `section.artdeco-card h1`
- `main h1`
- `h1` (fallback)

### `clickSaveToPDF()`
Finds and clicks the "More" button, then "Save to PDF" in the dropdown.

Returns: `{ success: Boolean, reason?: String }`

More button: `button` or `[role="button"]` with `innerText === 'More'` or appropriate aria-label.

Save to PDF detection:
1. `.artdeco-dropdown__content-inner li`
2. `.artdeco-dropdown__item`
3. `.pvs-overflow-actions-dropdown__content li`
4. `[role="menu"] [role="menuitem"]`
5. `[role="listbox"] [role="option"]`
6. `ul[role="menu"] li`
7. Any element with `innerText === 'Save to PDF'`

---

## Popup UI

### Sections
- **Header** — title and status
- **Upload section** — CSV drag-and-drop/file picker (hidden during processing)
- **Wait Time Slider** — 3-15 second range with live estimate update
- **Time Estimate** — calculated completion time
- **Progress section** — progress bar and current status (shown during processing)
- **Controls** — Start/Pause/Resume/Stop buttons
- **Stats** — Done/Failed/Remaining counts
- **Log** — activity feed (shown during processing)

### Button States
| State | Start | Pause | Resume | Stop |
|---|---|---|---|---|
| idle | ✅ | hidden | hidden | hidden |
| running | hidden | ✅ | hidden | ✅ |
| paused | hidden | hidden | ✅ | ✅ |

### CSV Parsing
Scans all cells for `linkedin.com/in/` or `linkedin.com/pub/`. Auto-detects headers, deduplicates, normalizes URLs.

---

## Progress Monitor Window

### Features
- **Real-time Stats**: Done/Failed/Remaining counts
- **Progress Bar**: Visual completion indicator
- **Current Activity**: Shows active profile being processed
- **Activity Log**: Color-coded entries with timestamps
- **Control Buttons**: Pause/Resume/Stop functionality
- **Persistent**: Stays open in separate tab, doesn't disappear when popup is minimized

### Communication
Listens for `chrome.runtime.onMessage` broadcasts from background.js and updates UI accordingly. Sends control commands back to background.js.

---

## Permissions

```json
["tabs", "downloads", "scripting", "storage", "alarms"]
```

Host permissions: `https://www.linkedin.com/*`

---

## Error Handling

| Error | Behavior |
|---|---|
| Not logged in | Process halts immediately |
| "More" button not found | Profile skipped, logged as failed |
| "Save to PDF" not found | Profile skipped, logged as failed |
| Tab load timeout | Profile skipped, logged as failed |

Failed profiles don't stop the batch process.

---

## Implementation Notes

### Folder Organization
Uses `chrome.downloads.onDeterminingFilename` to redirect PDFs to `LinkedIn_Connections/` subfolder.

### Timing Calculation
Estimated time = (waitTime × profileCount) + 10 seconds overhead.

### State Persistence
Basic state maintained in memory; no cross-session persistence yet.

### Browser Compatibility
Works in all Chromium-based browsers supporting Manifest V3.

---

## Evolution from Previous Version

| Previous Approach | Current Approach | Reason |
|---|---|---|
| Complex download monitoring | Simple click-and-wait | Eliminated false stuck states |
| Fixed 3s wait time | User-configurable 3-15s | Better user control |
| Popup-only progress | Persistent monitor window | Progress stays visible |
| Chunk-based display | Continuous processing | Simplified logic |
| Download completion wait | Trust user timing | Faster, more reliable |

---

## Potential Future Enhancements

- **Resume across sessions** — persist state to chrome.storage
- **Export results** — CSV download of success/failure log
- **Rate limit detection** — auto-pause on LinkedIn blocks
- **Advanced error recovery** — retry failed profiles
- **Custom filename patterns** — user-defined PDF naming

---

## Key Design Decisions

### Why `onCreated` not `onDeterminingFilename`
`onDeterminingFilename` was originally used for renaming downloads — that feature was removed. Now `onCreated` is used solely to capture the download ID so `waitForDownloadComplete` can track it. No filename manipulation happens.

### Why injected functions must be self-contained
`chrome.scripting.executeScript({ func })` serialises the function to a string and re-evaluates it in the page context. Closures do not cross. Any helper needed inside an injected function (e.g. `sleep`) must be re-declared inside that function.

### MV3 Service Worker Keep-Alive
MV3 service workers are killed after ~30s of inactivity. A `chrome.alarms` alarm fires every 20s while `state.isRunning` is true, which wakes the service worker and re-schedules itself. Cleared on STOP or DONE.

### Login Detection (multi-signal)
`scrapePageInfo()` checks 10 independent DOM/cookie signals rather than one selector, because LinkedIn frequently renames CSS classes. Requires only 1 signal to pass. Falls back to: if URL contains `/in/` and body text > 500 chars, treat as logged in.

### Pause/Resume
Pause sets `state.isPaused = true`. `runNext()` returns early if paused without scheduling the next iteration. `RESUME` message sets `isPaused = false` and calls `runNext()` directly to restart. Pause only takes effect between profiles — a profile in-flight runs to completion.

---

## State Object (background.js)

```js
state = {
  isRunning:    Boolean,   // true while loop is active
  isPaused:     Boolean,   // true when user has paused
  urls:         String[],  // full list of profile URLs from CSV
  currentIndex: Number,    // next URL to process
  results:      Array,     // { url, success, name?, reason? } per profile
  startTime:    Number,    // Date.now() at START
}
```

---

## Constants (background.js)

| Constant | Value | Purpose |
|---|---|---|
| `CHUNK_SIZE` | 50 | Profiles per chunk (cosmetic — no actual pause between chunks) |
| `DELAY_MS` | 3000 | ms to wait between profiles |
| `TAB_LOAD_TIMEOUT_MS` | 30000 | Max ms to wait for tab `status === 'complete'` |
| `PAGE_SETTLE_MS` | 3500 | ms after load before injecting scripts (LinkedIn JS render) |
| `DROPDOWN_SETTLE_MS` | 1200 | ms after clicking More before looking for Save to PDF |
| `DOWNLOAD_START_MS` | 30000 | Max ms to wait for `onCreated` to fire after clicking |
| `DOWNLOAD_FINISH_MS` | 60000 | Max ms to wait for download `state === 'complete'` |

---

## Injected Functions

Two functions are injected into LinkedIn tabs via `chrome.scripting.executeScript`. Both must be completely self-contained.

### `scrapePageInfo()`
Checks login state and extracts the connection's name from the profile page.

Returns: `{ isLoggedIn: Boolean, name: String }`

Login signals checked (any 1 = logged in):
- `#global-nav`, `.global-nav`, `nav[aria-label="Global Navigation"]`
- `.global-nav__me`, `.scaffold-layout`, `.application-outlet`
- `[data-member-id]`, `.pvs-profile-actions`
- Cookie `li_at=`, Cookie `JSESSIONID=`
- Fallback: URL contains `/in/` AND `body.innerText.length > 500`

Name selectors tried in order:
- `h1.text-heading-xlarge` (current LinkedIn 2024–25)
- `.pv-text-details__left-panel h1`
- `.artdeco-entity-lockup__title h1`
- `.ph5 h1`
- `section.artdeco-card h1`
- `main h1`
- `h1` (last resort)

### `clickMoreThenSaveToPDF(dropdownSettleMs)`
Async. Finds and clicks More, waits `dropdownSettleMs`, then finds and clicks Save to PDF.

Returns: `{ success: Boolean, reason?: String }`

More button detection: `button` or `[role="button"]` where `innerText === 'More'` OR `aria-label` is `"more"` / `"more actions"` / starts with `"more actions for"`.

Save to PDF detection (tried in order):
1. `.artdeco-dropdown__content-inner li`
2. `.artdeco-dropdown__item`
3. `.pvs-overflow-actions-dropdown__content li`
4. `[role="menu"] [role="menuitem"]`
5. `[role="listbox"] [role="option"]`
6. `ul[role="menu"] li`
7. Fallback: any visible `span, li, div, button, a` with `innerText === 'Save to PDF'`

---

## Popup UI

### Sections
- **Header** — logo, title, status dot (idle/running/paused/done/error)
- **Upload section** — CSV drag-and-drop or file picker. Hidden once a run starts, shown again on Stop.
- **Alert banner** — shown for errors (not logged in, bad CSV, etc.)
- **Progress section** — chunk badge, fraction counter, progress bar, current URL being processed
- **Controls** — Start / Pause / Resume / Stop (mutually exclusive visibility by run state)
- **Stats row** — Done / Failed / Remaining counts
- **Log** — activity log, newest at top, max 200 entries

### Button State Matrix
| Run State | Start | Pause | Resume | Stop |
|---|---|---|---|---|
| idle | ✅ shown | hidden | hidden | hidden |
| running | hidden | ✅ shown | hidden | ✅ shown |
| paused | hidden | hidden | ✅ shown | ✅ shown |

### CSV Parsing
`parseCSV()` in popup.js scans every cell of every row for strings containing `linkedin.com/in/` or `linkedin.com/pub/`. Auto-detects and skips header rows. Deduplicates. Normalises to `https://` scheme and strips query params.

---

## Permissions

```json
["tabs", "downloads", "scripting", "storage", "alarms"]
```

Host permissions: `https://www.linkedin.com/*`

No `debugger` permission — an earlier CDP-based approach was abandoned in favour of real button clicking.

---

## Known Behaviours & Constraints

- **Processes strictly one profile at a time.** Next profile only starts after the current download is fully complete on disk.
- **Hard stop on `NOT_LOGGED_IN`.** If LinkedIn redirects to any auth page during processing, the entire run halts immediately. The user must log in and start a new run.
- **Profiles without a More button are skipped with an error.** This happens for your own profile, some restricted accounts, or profiles where LinkedIn has changed the layout.
- **Chunk size is cosmetic.** Every 50 profiles, a `CHUNK_DONE` event is broadcast for display purposes only — there is no actual pause or behaviour change at chunk boundaries.
- **No download renaming.** LinkedIn's own filename is used as-is (typically `FirstName LastName Profile.pdf`). Renaming logic was deliberately removed.
- **Popup sync on reopen.** If the popup is closed and reopened mid-run, it sends `GET_STATE` and restores the correct button state (running or paused).

---

## What Has Been Tried and Abandoned

| Approach | Why abandoned |
|---|---|
| **CDP `Page.printToPDF`** (via `debugger` permission) | Generated different PDFs than LinkedIn's own Save to PDF. Showed intrusive "Debugging tools attached" banner on every tab. |
| **`onDeterminingFilename` for renaming** | Caused download errors in Edge. Feature was removed per user request — LinkedIn's native filename is acceptable. |
| **Single CSS selector for login detection** (`.global-nav__me`) | LinkedIn changed their DOM; selector stopped existing. Replaced with multi-signal approach. |

---

## Potential Next Steps (not yet implemented)

- **Download renaming** — intercept via `onCreated`, then use `chrome.downloads.search` + `chrome.fileSystem` or post-process. Was removed but could be re-added cleanly.
- **Export results log** — let user download a CSV of successful/failed profiles after a run.
- **Resume from last position** — persist `currentIndex` to `chrome.storage.local` so a run can survive a browser restart.
- **Rate-limit detection** — detect LinkedIn's "429 Too Many Requests" or soft-block pages and auto-pause.
- **Per-chunk pause** — actually pause between chunks (currently chunk boundary is cosmetic only).
- **Show downloaded filename** — use `chrome.downloads.search({ id })` after download completes to surface the real filename in the log.
