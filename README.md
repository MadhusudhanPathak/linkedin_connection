# LinkedIn Profile PDF Downloader
### A Chrome / Brave Browser Extension

Batch-downloads LinkedIn connection profiles as PDFs from a CSV list of profile URLs.

---

## ✅ Features
- Upload a CSV with LinkedIn profile URLs (one per row)
- Processes in **chunks of 50** with a **3-second delay** between each profile
- Generates PDFs using Chrome's built-in rendering (no print dialog)
- Names each PDF after the connection's name: `LinkedIn_Jane_Doe.pdf`
- Live progress bar, per-chunk tracking, and activity log
- Hard-stops if LinkedIn session is not found — no silent failures

---

## 📦 Installation

### Step 1 — Enable Developer Mode
1. Open **Brave** or **Chrome**
2. Navigate to `brave://extensions` or `chrome://extensions`
3. Toggle **"Developer mode"** ON (top-right corner)

### Step 2 — Load the Extension
1. Click **"Load unpacked"**
2. Select the **`linkedin-pdf-downloader`** folder (this folder)
3. The extension icon will appear in your toolbar

---

## 🚀 How to Use

### 1. Log In to LinkedIn
Open LinkedIn in any tab and make sure you're fully logged in **before** starting the extension.

### 2. Prepare Your CSV
Create a `.csv` file with LinkedIn profile URLs. The extension auto-detects which column contains the URLs. Accepted formats:

```
https://www.linkedin.com/in/janedoe
https://www.linkedin.com/in/john-smith-12345
```

Or with a header row and extra columns:
```
Name, Profile URL, Company
Jane Doe, https://www.linkedin.com/in/janedoe, Acme Corp
```

### 3. Start the Extension
1. Click the extension icon in your toolbar
2. Drop your CSV file onto the upload area (or click to browse)
3. Confirm the URL count and chunk info
4. Click **"Start Download"**

### 4. Watch It Run
- Each profile opens in a background tab, is rendered, saved as PDF, and the tab is closed
- A 3-second delay is added between each profile
- PDFs are saved to your browser's default **Downloads** folder
- You can click **Stop** at any time to halt processing

---

## ⚠️ Important Notes

### Yellow Debugger Banner
When processing, you'll see a yellow bar at the top of each tab:
> *"Debugging tools are attached to this tab"*

This is **normal and expected** — it's how the extension generates PDFs without a print dialog. It disappears when the tab closes.

### LinkedIn Session Required
The extension checks for an active LinkedIn login before processing each profile. If you're not logged in, it will stop and display an error.

### LinkedIn Terms of Service
This tool is intended for **personal use only** — downloading profiles of your own connections. Automated access may conflict with LinkedIn's ToS. Use responsibly and avoid running on thousands of profiles in short periods.

### PDF Downloads
PDFs are saved with the filename `LinkedIn_<Name>.pdf` to your browser's default Downloads folder. If a file with the same name exists, a number is appended automatically (e.g., `LinkedIn_Jane_Doe (1).pdf`).

---

## 🗂️ File Structure

```
linkedin-pdf-downloader/
├── manifest.json     # Extension config (MV3)
├── background.js     # Service worker — processing engine
├── popup.html        # Extension popup UI
├── popup.css         # Popup styles
├── popup.js          # Popup logic + CSV parser
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## 🛠️ Troubleshooting

| Issue | Fix |
|---|---|
| "Not logged in" error | Log into LinkedIn in the browser first |
| PDF is blank / empty | LinkedIn may have blocked the render — try again |
| Tab opens and stays open | Close manually; the extension may have crashed — reload it |
| No URLs found in CSV | Ensure URLs contain `linkedin.com/in/` |
| Extension not showing | Ensure Developer Mode is on and the folder is loaded correctly |
