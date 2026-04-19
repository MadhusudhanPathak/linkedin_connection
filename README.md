# LinkedIn Connection PDF Downloader

A browser extension for **Microsoft Edge, Chrome, and Brave** that batch-downloads your LinkedIn connections' profiles as PDFs by automating the "More → Save to PDF" process.

No external scripts, no servers, no complex monitoring. Runs entirely inside your browser with a simple, fast workflow.

**GitHub Repository:** https://github.com/MadhusudhanPathak/linkedin_connection

---

## How It Works

1. Upload a CSV file containing LinkedIn profile URLs
2. Configure your preferred wait time between profiles (3-15 seconds)
3. Start the download process
4. The extension opens each profile in a new tab, clicks "More → Save to PDF", waits your specified time, then moves to the next profile
5. PDFs are automatically organized in a `LinkedIn_Connections` folder
6. Monitor progress in a dedicated progress window that stays visible

The process is streamlined for speed and reliability - no waiting for downloads to complete, just click and move forward.

---

## Installation

### Step 1: Enable Developer Mode

| Browser | URL to open |
|---|---|
| Edge | `edge://extensions` |
| Chrome | `chrome://extensions` |
| Brave | `brave://extensions` |

Toggle **Developer mode** on (top-right corner of the page).

### Step 2: Load the Extension

1. Click **Load unpacked**
2. Select the `linkedin_connection` folder
3. The extension icon will appear in your browser toolbar

---

## Usage

### 1. Log in to LinkedIn

Make sure you're fully logged in to LinkedIn before starting. The extension will stop if it detects you're not logged in.

### 2. Prepare your CSV

Create a CSV file with LinkedIn profile URLs. The extension automatically detects URLs containing `linkedin.com/in/` or `linkedin.com/pub/`.

**Accepted formats:**
```
https://www.linkedin.com/in/janedoe
https://www.linkedin.com/in/john-smith-12345
linkedin.com/in/someone
```

**Example CSV:**
```
Name, Profile URL, Company
Jane Doe, https://www.linkedin.com/in/janedoe, Acme Corp
John Smith, https://www.linkedin.com/in/john-smith, Globex
```

You can export your connections from LinkedIn at: https://www.linkedin.com/mypreferences/d/download-my-data

### 3. Configure and Start

1. Click the extension icon
2. Upload your CSV file
3. Adjust the wait time slider (3-15 seconds, default 5 seconds)
4. Review the estimated completion time
5. Click **Start Download**

A progress monitor window will open automatically and stay visible throughout the process.

### 4. Monitor Progress

- **Progress Monitor Window**: Shows real-time stats, progress bar, and activity log
- **Stats**: Done / Failed / Remaining counts
- **Current Activity**: Shows which profile is being processed
- **Log**: Color-coded activity feed with timestamps

The progress window stays open even if you minimize the extension popup.

### 5. Control the Process

| Button | Action |
|---|---|
| **Start** | Begin processing profiles |
| **Pause** | Pause after current profile completes |
| **Resume** | Continue from where you paused |
| **Stop** | Stop immediately and reset |

---

## Configuration

### Wait Time Slider

Adjust the delay between profiles using the slider above the Start button:
- **Range**: 3 to 15 seconds
- **Default**: 5 seconds
- **Purpose**: Allows LinkedIn's PDF generation to complete before moving to the next profile

The estimated completion time updates automatically based on your selection.

---

## Features

- **Simple & Fast**: No complex monitoring - just click "Save to PDF" and wait
- **Configurable Timing**: User-controlled wait times between profiles
- **Persistent Progress**: Dedicated monitor window that stays visible
- **Automatic Organization**: PDFs saved to `LinkedIn_Connections` folder
- **Real-time Updates**: Live progress tracking and activity logging
- **Error Handling**: Graceful handling of missing profiles or login issues
- **Resume/Pause**: Full control over the batch process

---

## Troubleshooting

**"Not logged in" error**
- Ensure you're logged in to LinkedIn before starting
- Refresh your LinkedIn tab if needed

**No URLs found in CSV**
- Check that URLs contain `linkedin.com/in/` or `linkedin.com/pub/`
- Ensure URLs are properly formatted

**Profiles being skipped**
- Some profiles may not have the "More" button (your own profile, restricted accounts)
- These are logged as failed but don't stop the process

**Extension not appearing**
- Verify Developer Mode is enabled in browser extensions
- Check that the extension is loaded and enabled

---

## Permissions

| Permission | Purpose |
|---|---|
| `tabs` | Open and manage profile tabs |
| `scripting` | Click buttons on LinkedIn pages |
| `downloads` | Organize PDFs into folders |
| `storage` | Save extension settings |
| `alarms` | Keep service worker active during long runs |

Only accesses `https://www.linkedin.com/*`.

---

## Limitations

- **Personal use only**: Intended for your own connections
- **Requires active LinkedIn session**: Must be logged in before starting
- **One profile at a time**: Sequential processing to avoid rate limiting
- **LinkedIn layout changes**: May require updates if LinkedIn changes their interface

---

## File Structure

```
linkedin_connection/
├── manifest.json     # Extension configuration
├── background.js     # Main automation logic
├── popup.html        # Extension popup interface
├── popup.css         # Popup styling
├── popup.js          # Popup controls and CSV parsing
├── progress.html     # Progress monitor window
├── progress.js       # Progress monitor logic
├── README.md         # This file
├── agent.md          # Technical documentation
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

For technical details, see `agent.md`.
