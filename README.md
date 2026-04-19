# LinkedIn Profile PDF Downloader

A powerful, privacy-first chromium based plugin or browser extension for **Chrome, Edge, and Brave** that automates batch-downloading your LinkedIn connections' full profiles as PDFs.

**No external services. No tracking. No scraping. Just using the methods LinkedIn already provides. Your data stays with you.**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-stable-brightgreen)

---

## Features

### 🚀 Fast & Simple
- One-click batch download automation
- Configurable timing (3-15 seconds)
- Real-time progress monitoring

### 🔒 Privacy First
- 100% local processing
- No tracking or external servers
- Open source code

---

## Quick Start

1. Enable Developer Mode in your browser extensions page
2. Load the extension folder
3. Log in to LinkedIn
4. Upload your CSV file of profile URLs
5. Click Start and monitor progress

---

## Installation

### Step 1: Enable Developer Mode

**Chrome:** Open `chrome://extensions` → Toggle "Developer mode" (top-right)

**Edge:** Open `edge://extensions` → Toggle "Developer mode" (top-right)

**Brave:** Open `brave://extensions` → Toggle "Developer mode" (top-right)

### Step 2: Load the Extension

1. Click **Load unpacked**
2. Select the `linkedin_connection` folder
3. Click Open

The extension icon will appear in your toolbar.

---

## Usage

### 1. Log in to LinkedIn

Make sure you're fully logged in to LinkedIn before starting. The extension will stop if it detects you're not logged in.

### 2. Prepare your CSV

Create a CSV file with LinkedIn profile URLs. The extension automatically detects URLs containing `linkedin.com/in/` or `linkedin.com/pub/`.
The most suitable way is to visit https://www.linkedin.com/mypreferences/d/download-my-data portal and then get your full data from LinkedIn. It will take around 24 hours, and after extracting your full data you will find a lot of csv and important files. From there you can also use the `Connections.csv` file directly.

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

### 3. Configure and Start

1. Click the extension icon, Upload your CSV file
3. Adjust the wait time slider (default 5 seconds)
4. Read the complete Troubleshooting option below
5. Make sure the Pop-ups are enabled for LinkedIn
6. Click **Start Download**, leave the browser open

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

On my initial time I figured out that it takes different time in different browsers, Brave can do it in 4 seconds while Microsoft Edge takes 6 seconds. Also, the wait time also depends on the internet speed, jitters and pings. So, if all combined, the wait time can easily go till 10 seconds. Hence, I have given this slider to let user tune their system as per there setup.

The estimated completion time updates automatically based on your selection. It's basically the number of connections times the wait time and an additional 10 seconds for buffer. It's recommended to not use the whole browser while the process takes place because there's tab based automation and the plugin may get confused with your activity with its activity.

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
- Ensure that your session doesn't expire in middle

**Showing success but still no Downloads**
- Ensure that the Pop-up option is enabled for LinkedIn
- Ensure it's enabled for all the future instances
- Disable it after downloads finish

**No URLs found in CSV**
- Check that URLs contain `linkedin.com/in/` or `linkedin.com/pub/`
- Ensure URLs are properly formatted
- LinkedIn's generated `Connections.csv` is recommended

**Profiles being skipped**
- Some profiles may not have the "More" button (your own profile, restricted accounts)
- These are logged as failed but don't stop the process
- It's a rare case, but have to respect privacy boundaries

**Extension not appearing**
- Verify Developer Mode is enabled in browser extensions
- Check that the extension is loaded and enabled
- Reload and refresh the extension page

For anything else feel free to reach me out through email, madhu.sudhan.pathak.ais@gmail.com

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
