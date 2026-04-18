# LinkedIn Profile PDF Downloader

A browser extension for **Microsoft Edge, Chrome, and Brave** that batch-downloads your LinkedIn connections' profiles as PDFs — exactly as if you clicked **More → Save to PDF** on each one yourself.

No external scripts, no servers, no Puppeteer. Runs entirely inside your browser.

---

## How It Works

1. You provide a CSV file containing LinkedIn profile URLs
2. The extension opens each profile in a background tab
3. It clicks **More → Save to PDF** automatically
4. It waits for the PDF to fully download before moving to the next profile
5. Tabs are closed automatically as it goes

Profiles are processed **one at a time**, in strict sequence. The next profile only starts after the previous download is confirmed complete on disk.

---

## Installation

### Step 1 — Enable Developer Mode

| Browser | URL to open |
|---|---|
| Edge | `edge://extensions` |
| Chrome | `chrome://extensions` |
| Brave | `brave://extensions` |

Toggle **Developer mode** on (top-right corner of the page).

### Step 2 — Load the Extension

1. Click **Load unpacked**
2. Select the `linkedin-pdf-downloader` folder (the unzipped folder, not the zip file)
3. The extension icon will appear in your browser toolbar

---

## Usage

### 1. Log in to LinkedIn first

Open LinkedIn in any tab and make sure you're fully logged in **before** launching the extension. The extension will hard-stop and show an error if it detects you're not logged in during processing.

### 2. Prepare your CSV

Create a `.csv` file with LinkedIn profile URLs. The extension auto-detects which column contains the URLs — extra columns, headers, and blank lines are all handled gracefully.

**Accepted URL formats:**
```
https://www.linkedin.com/in/janedoe
https://www.linkedin.com/in/john-smith-12345
www.linkedin.com/in/someone
```

**Example CSV with mixed columns — works fine:**
```
Name, Profile URL, Company
Jane Doe, https://www.linkedin.com/in/janedoe, Acme Corp
John Smith, https://www.linkedin.com/in/john-smith, Globex
```

### 3. Open the extension and start

1. Click the extension icon in your toolbar
2. Drag your CSV onto the upload area, or click to browse
3. Confirm the URL count and chunk info shown below the drop zone
4. Click **Start Download**

The upload area disappears once a run starts to keep the UI clean.

### 4. Monitor progress

- The **progress bar** and fraction counter show how far through the list you are
- The **chunk badge** shows which group of 50 you're on
- The **activity log** shows each profile as it completes or fails, newest at the top
- The **stats row** keeps a live count of Done / Failed / Remaining

### 5. Pause, Resume, or Stop at any time

| Button | Behaviour |
|---|---|
| **Pause** | Finishes the current profile, then holds. Click Resume to continue from where it left off. |
| **Resume** | Picks up from the next profile in the list. |
| **Stop** | Halts after the current profile. Resets the session — you'll need to re-upload the CSV to start again. |

---

## Timings

The extension is deliberately paced to behave like a human:

| Stage | Time |
|---|---|
| Page settle after load | 3.5 seconds |
| Dropdown animation wait | 1.2 seconds |
| Delay between profiles | 3 seconds (after download completes) |
| Max wait for download to start | 30 seconds |
| Max wait for download to finish | 60 seconds |

---

## Downloaded Files

PDFs are saved to your browser's default **Downloads folder**. Filenames are whatever LinkedIn generates — typically `FirstName LastName Profile.pdf`. If a file with the same name already exists, the browser appends a number automatically (e.g. `Jane Doe Profile (1).pdf`).

---

## Chunks

Profiles are processed in logical groups of 50. The extension displays which chunk it's on (e.g. "Chunk 2 / 6") and logs a message at each chunk boundary. There is no automatic pause between chunks — this is purely a progress display feature. If you want a break between chunks, use the **Pause** button.

---

## Error Handling

| Error | What happens |
|---|---|
| Not logged in to LinkedIn | Run halts immediately. Log in to LinkedIn and start a new run. |
| "More" button not found | Profile is skipped and logged as failed. This happens on your own profile, some restricted accounts, or pages LinkedIn has changed. |
| "Save to PDF" not found in dropdown | Profile is skipped and logged as failed. |
| Download doesn't start within 30s | Profile is skipped and logged as failed. |
| Download is interrupted | Profile is logged as failed. Run continues. |
| Tab load timeout (30s) | Profile is skipped and logged as failed. Run continues. |

Failed profiles are counted in the stats row but do not stop the run (unless the failure is a login issue).

---

## Troubleshooting

**"LinkedIn session not found" error even when logged in**
The extension checks multiple signals to confirm you're logged in. If this error appears, try: refresh your LinkedIn tab, wait a few seconds, then start the extension again.

**No URLs found in my CSV**
The extension looks for cells containing `linkedin.com/in/` or `linkedin.com/pub/`. Make sure your URLs include the domain and aren't truncated.

**PDFs are downloading but the run seems slow**
This is expected. Each profile waits for the download to complete before moving on, plus a 3-second pause between profiles. For 100 profiles, expect roughly 15–25 minutes depending on LinkedIn's PDF generation speed.

**"More" button not found on some profiles**
LinkedIn shows a different layout on your own profile and some restricted or premium profiles. These are skipped automatically and logged as failed.

**The extension icon is missing**
Go to your browser's extensions page, find LinkedIn PDF Downloader, and make sure it's enabled. If you recently reloaded it, check that Developer Mode is still on.

---

## Permissions Used

| Permission | Why it's needed |
|---|---|
| `tabs` | Open profile tabs in the background and close them after download |
| `scripting` | Inject scripts into LinkedIn pages to click buttons and read profile names |
| `downloads` | Detect when a download starts and wait for it to complete |
| `alarms` | Keep the background service worker alive during long runs |
| `storage` | Reserved for future use (e.g. persisting run state across sessions) |

The extension only accesses `https://www.linkedin.com/*` — no other sites.

---

## Limitations

- **Personal use only.** This extension is intended for downloading profiles of your own connections. Automated access may conflict with LinkedIn's Terms of Service. Use it responsibly and avoid running it on thousands of profiles in a single session.
- **One profile at a time.** There is no parallelism by design — running multiple tabs simultaneously would be more likely to trigger LinkedIn's rate limiting.
- **Requires an active LinkedIn session.** The extension does not handle login, credentials, or 2FA. You must be logged in before starting.
- **LinkedIn DOM changes may break button detection.** If LinkedIn redesigns their profile page, the "More" button or "Save to PDF" dropdown selectors may need updating. See `AGENT.md` for the full selector list.

---

## File Structure

```
linkedin-pdf-downloader/
├── manifest.json     # Extension config (Manifest V3)
├── background.js     # Service worker — all automation logic
├── popup.html        # Extension popup UI
├── popup.css         # Popup styles
├── popup.js          # Popup logic and CSV parser
├── README.md         # This file
├── AGENT.md          # Technical reference for AI coding agents
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

For a full technical reference — architecture, state shape, injected function documentation, selector lists, and what was tried and abandoned — see `AGENT.md`.
