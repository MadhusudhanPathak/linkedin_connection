"""# Architecture & Design Documentation

## Project Overview

**LinkedIn Connection PDF Downloader** is a Manifest V3 browser extension for Chromium-based browsers (Chrome, Edge, Brave) that automates batch-downloading LinkedIn profile PDFs using the "More → Save to PDF" feature.

### Core Philosophy
- **Simplicity**: Minimal dependencies, straightforward automation logic
- **Robustness**: Comprehensive error handling and fallback mechanisms
- **User Control**: Configurable timing, real-time progress monitoring, pause/resume capability
- **No External Services**: 100% local processing, runs entirely in browser

---

## Directory Structure

```
linkedin_connection/
├── src/
│   ├── core/
│   │   ├── background-worker.js      # Service Worker - main automation engine
│   │   ├── injected-page-info.js     # Content injection for login/name scraping
│   │   └── injected-save-pdf.js      # Content injection for PDF save automation
│   ├── ui/
│   │   ├── popup-script.js           # Popup UI logic and controls
│   │   └── progress-script.js        # Progress monitor window logic
│   └── utils/
│       ├── constants.js              # Global constants and configuration
│       ├── csv-parser.js             # CSV parsing with validation
│       ├── helpers.js                # Common utility functions
│       └── message-handler.js        # Chrome messaging utilities
├── styles/
│   ├── shared.css                    # Base styles, colors, utilities
│   ├── popup.css                     # Popup window styles
│   └── progress.css                  # Progress monitor styles
├── docs/
│   └── ARCHITECTURE.md               # This file
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── popup.html                        # Popup UI markup
├── progress.html                     # Progress monitor markup
├── manifest.json                     # Manifest V3 configuration
├── README.md                         # User documentation
├── AGENT.md                          # Technical reference
└── LICENSE                           # MIT License
```

### Directory Rationale

**src/core/** - Business logic for automation
- Contains the service worker (background-worker.js)
- Houses injection scripts that run in LinkedIn tab context
- Separated for clarity: this is the "brains" of the extension

**src/ui/** - User interface logic
- Popup script handles the extension popup window
- Progress script handles the separate progress monitor window
- Separated from core logic for maintainability

**src/utils/** - Shared utilities and helpers
- Constants centralize all magic numbers and configuration
- CSV parser handles file parsing with robust validation
- Message handler wraps Chrome messaging API
- Helpers provide common DOM and utility functions

**styles/** - Separated CSS for maintainability
- shared.css has all common styles, colors, and variables
- popup.css extends shared with popup-specific styles
- progress.css extends shared with monitor-specific styles
- Follows DRY principle, easier to theme

**docs/** - Documentation
- ARCHITECTURE.md explains system design
- Can be extended with implementation guides, FAQs, etc.

---

## Communication Architecture

### Inter-Component Messaging

The extension uses Chrome's `runtime.onMessage` API for all inter-component communication:

```
┌─────────────────────────────────────────────────────────┐
│          Service Worker (Background)                    │
│  - Manages state                                        │
│  - Orchestrates profile processing                      │
│  - Injects scripts into LinkedIn tabs                   │
└────────────────┬────────────────────────────────────┬───┘
                 │                                    │
          [BROADCAST]                          [RESPONSE]
                 │                                    │
         ┌───────▼──────────┐              ┌─────────▼────────┐
         │  Popup Window    │              │ Progress Monitor │
         │  - CSV upload    │              │ - Real-time view │
         │  - Controls      │              │ - Activity log   │
         │  - Stats display │              │ - Controls       │
         └──────────────────┘              └──────────────────┘
```

### Message Types

**Commands** (Popup/Progress → Background):
- `START` - Begin processing with URLs and wait time
- `PAUSE` - Pause after current profile
- `RESUME` - Continue from pause
- `STOP` - Stop immediately
- `GET_STATE` - Fetch current state

**Broadcasts** (Background → All):
- `PROCESSING` - Currently processing profile #X
- `RESULT` - Profile processed (success or failure)
- `PAUSED` - Process paused
- `RESUMED` - Process resumed
- `NOT_LOGGED_IN` - User not logged in to LinkedIn
- `DONE` - All profiles processed

### Why Broadcast Pattern?

The extension uses broadcasts rather than direct replies because:
1. Progress monitor may not be open when popup starts
2. Multiple components need same status updates simultaneously
3. Decouples components - popup and monitor are independent
4. Simplifies state management

---

## Processing Pipeline

### Per-Profile Flow

```
1. Open Profile Tab
   └─ chrome.tabs.create({ url, active: false })

2. Wait for Tab Load
   └─ Monitor tab.status === 'complete' with timeout

3. Verify Login & Get Name
   └─ Inject scrapePageInfo() script
   └─ Returns { isLoggedIn, name }

4. Click More → Save to PDF
   └─ Inject clickMoreThenSaveToPDF() script
   └─ Returns { success, reason? }

5. Wait User-Configured Time
   └─ sleep(waitTime) - gives browser time to process download

6. Close Tab
   └─ chrome.tabs.remove(tabId)

7. Record Result
   └─ Store { url, success, name?, reason? }

8. Move to Next Profile
   └─ runNext() recursively processes queue
```

### State Machine

```
IDLE
  ↓ (START command)
RUNNING
  ├─ (process profiles one by one)
  ├─ (PAUSE command) → PAUSED
  ├─ (STOP command) → IDLE
  └─ (all done) → IDLE

PAUSED
  ├─ (RESUME command) → RUNNING
  └─ (STOP command) → IDLE
```

---

## Error Handling Strategy

### Graceful Degradation

1. **Login Check Fails** → Stop entire process immediately
   - User must log in first
   - Broadcast `NOT_LOGGED_IN` event

2. **Tab Load Timeout** → Record as failed, continue
   - LinkedIn profile took too long to load
   - Move to next profile

3. **More Button Not Found** → Record as failed, continue
   - Profile layout different (own profile, restricted access)
   - Try other profiles

4. **Save to PDF Not Found** → Record as failed, continue
   - LinkedIn menu structure changed
   - Move to next profile

5. **Download Folder Redirect Fails** → Still processes PDF
   - PDF saved to default location
   - Not critical to overall process

### Input Validation

**CSV Parser:**
- Validates file type (.csv)
- Detects and skips header rows
- Only extracts linkedin.com/in/ or linkedin.com/pub/ URLs
- Removes duplicates
- Normalizes URLs (adds https://, strips query params)

**Message Validator:**
- Checks message type exists
- Validates URL array
- Validates wait time (3-15 seconds)

---

## Key Design Decisions

### 1. No Download Monitoring

The extension doesn't wait for downloads to complete. Instead:
- Clicks "Save to PDF"
- Waits user-configured time
- Moves to next profile

**Why:** Simpler, fewer false positives, users control the timing

### 2. Service Worker Keep-Alive

Uses `chrome.alarms` to keep service worker alive during processing:
- Creates alarm every 20 seconds while running
- Prevents MV3 service worker suspension
- Alarm clears when processing completes

### 3. Separate Progress Monitor

Opens progress in separate browser tab instead of popup:
- Stays visible even if popup minimized
- Users can work on other tabs
- Cleaner than modal/overlay approach

### 4. Injected Scripts Self-Contained

Content injection scripts are 100% self-contained:
- No closures or external references
- No await/async (return result synchronously)
- Serializable with `chrome.scripting.executeScript()`

### 5. Modular File Organization

- Separates concerns (core, ui, utils)
- Makes testing easier (if needed)
- Easier to maintain and extend
- Clear responsibility boundaries

---

## Extensibility Points

### Adding New Features

**New CSV Column Handling:**
- Modify `parseCSV()` in `src/utils/csv-parser.js`
- Keep LinkedIn URL extraction logic

**New Profile Info Scraping:**
- Add new signals to `scrapePageInfo()` in `src/core/background-worker.js`
- Return additional fields in result object

**New Browser Support:**
- Update `manifest.json` host_permissions
- Adjust selector logic if LinkedIn DOM differs

**Download Folder Customization:**
- Modify `chrome.downloads.onDeterminingFilename` listener
- User could save with profile name instead of LinkedIn_Connections/

---

## Performance Considerations

### Timing Defaults

- **Tab load timeout:** 30 seconds (catch stalled loads)
- **Click wait:** 300ms (dropdown animation)
- **Page settle:** 1000ms (page content stabilization)
- **Keep-alive interval:** 20 seconds (MV3 requirement)
- **User wait time:** 3-15 seconds (configurable)

### Memory Usage

- Tabs closed immediately after processing (not held in memory)
- Results array grows linearly with profile count
- Log limited to last 50 items (UI only)
- Service worker has minimal footprint

### Network Efficiency

- Only processes profiles you specify
- No prefetching or background sync
- One tab open at a time
- Downloads parallelized by browser (not our concern)

---

## Testing Strategy

### Manual Testing Checklist

- [ ] Upload CSV with various URL formats
- [ ] Start with small batch (3-5 profiles)
- [ ] Test pause/resume during processing
- [ ] Test stop at various stages
- [ ] Test logout and relogin
- [ ] Verify PDFs in LinkedIn_Connections folder
- [ ] Check browser console for errors

### Error Cases to Test

- [ ] Not logged in to LinkedIn
- [ ] CSV with no valid URLs
- [ ] Mixed valid/invalid URLs
- [ ] Restricted/private profiles
- [ ] Own profile (no More button)
- [ ] Slow internet connection
- [ ] Tab closed manually during processing

---

## Security & Privacy

### What This Extension Does

- ✅ Runs entirely locally - no data sent anywhere
- ✅ No tracking or telemetry
- ✅ No external API calls
- ✅ No server communication
- ✅ Only accesses LinkedIn.com

### What This Extension Doesn't Do

- ❌ Store your LinkedIn credentials
- ❌ Send URLs to external servers
- ❌ Collect browsing data
- ❌ Modify other websites
- ❌ Request personal information beyond what's visible on LinkedIn

### Permissions Explained

- **tabs** - Open/close profile tabs
- **scripting** - Inject scripts to click buttons and verify login
- **downloads** - Redirect PDFs to specific folder
- **storage** - Could be used for settings (currently not used)
- **alarms** - Keep service worker alive
- **https://www.linkedin.com/*** - Access LinkedIn profiles only

---

## Browser Compatibility

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome | ✅ Full Support | MV3 native |
| Edge | ✅ Full Support | MV3 native |
| Brave | ✅ Full Support | MV3 native |
| Firefox | ❌ Not Supported | Manifest V3 not yet implemented |
| Safari | ❌ Not Supported | Extension model differs |

---

## Maintenance Notes

### When LinkedIn Changes Their UI

If "More" button or "Save to PDF" option is no longer found:

1. Open LinkedIn in browser
2. Inspect the page to find new selectors
3. Update selector arrays in `clickMoreThenSaveToPDF()` function
4. Test with 1-2 profiles
5. Update version in manifest.json

### When LinkedIn Changes Profile Page Structure

If profile names aren't extracted correctly:

1. Inspect profile page HTML
2. Find new name element selector
3. Add to `nameSelectors` array in `scrapePageInfo()` function
4. Test extraction

### Updating Documentation

- **README.md** - User-facing installation and usage
- **AGENT.md** - Technical reference
- **docs/ARCHITECTURE.md** - System design and internals

---

## Future Enhancement Ideas

- [ ] Batch multiple extensions running in parallel (for speed)
- [ ] Retry failed downloads automatically
- [ ] Custom naming scheme for PDFs
- [ ] Schedule downloads for specific times
- [ ] Integration with cloud storage (Google Drive, OneDrive)
- [ ] Support for exporting connections list
- [ ] Connection filtering by keyword/company
- [ ] Manifest V2 fallback for older browsers

