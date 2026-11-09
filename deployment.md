# Deployment: Google Sheets + Apps Script backend

This guide moves the app's data out of the browser's localStorage and into a Google Sheet, using a Google Apps Script web app as the API. At the end you will have:

- A Google Sheet with two tabs, `Payments` and `History`, holding all your data.
- An Apps Script **web app URL** that the React app calls to read and write that data.
- The React app hosted anywhere (Netlify, Vercel, GitHub Pages), with the same data on every device.

```
React app (browser) ──POST JSON──▶ Apps Script web app ──▶ Google Sheet
                    ◀──JSON──────                      ◀──
```

**Time needed:** about 30 minutes. **Cost:** free with a normal Google account.

---

## Contents

0. [Back up your current data](#0-back-up-your-current-data)
1. [Create the Google Sheet](#1-create-the-google-sheet)
2. [Add the Apps Script code](#2-add-the-apps-script-code)
3. [Run setup and get your API token](#3-run-setup-and-get-your-api-token)
4. [Deploy as a web app](#4-deploy-as-a-web-app)
5. [Test the API](#5-test-the-api)
6. [Connect the React app](#6-connect-the-react-app)
7. [Import your backed-up data](#7-import-your-backed-up-data)
8. [Host the React app](#8-host-the-react-app)
9. [Updating the Apps Script later](#9-updating-the-apps-script-later)
10. [Security notes](#10-security-notes)
11. [Troubleshooting](#11-troubleshooting)

---

## 0. Back up your current data

Once the app switches to Google Sheets it no longer reads localStorage, so save what you have first.

1. Run the app as it is now: `npm run dev`.
2. Click **Export** in the header. A file named `payment-reminder-backup-YYYY-MM-DD.json` downloads.
3. Keep that file; you will import it in [step 7](#7-import-your-backed-up-data).

---

## 1. Create the Google Sheet

1. Go to <https://sheets.google.com> and create a **blank spreadsheet**.
2. Rename it, for example **Payment Reminder DB**.
3. You don't need to create tabs or headers yourself; the `setup()` function in step 3 does that.

The sheet will end up with these columns:

| Tab | Columns |
|---|---|
| `Payments` | id, name, category, amount, dueDate, anchorDay, frequency, remindDays, notes, lastPaidOn, lastPaidAmount, createdAt |
| `History` | id, paymentId, name, category, amount, dueDate, paidOn |

> You can view and even edit data directly in the sheet. Keep dates as `YYYY-MM-DD` text and don't rename or reorder the header row.

---

## 2. Add the Apps Script code

1. In the spreadsheet, open **Extensions → Apps Script**. A new script project opens, bound to this sheet.
2. Rename the project (top left), for example **Payment Reminder API**.
3. Open **Project Settings** (gear icon, left sidebar):
   - Set **Time zone** to your zone, e.g. `(GMT+05:30) India Standard Time`.
   - Leave **"Enable Chrome V8 runtime"** checked (it is the default).
4. Go back to **Editor**, open `Code.gs`, delete everything in it, and paste the code below.
5. Click **Save** (💾 or `Ctrl+S`).

```javascript
/**
 * Payment Reminder API: Google Apps Script backend.
 * Every request is a POST with a text/plain JSON body:
 *   { "action": "...", "token": "...", "data": { ... } }
 * Every response is JSON: { "ok": true, "data": ... } or { "ok": false, "error": "..." }
 */

const SHEETS = {
  Payments: [
    'id', 'name', 'category', 'amount', 'dueDate', 'anchorDay', 'frequency',
    'remindDays', 'notes', 'lastPaidOn', 'lastPaidAmount', 'createdAt',
  ],
  History: ['id', 'paymentId', 'name', 'category', 'amount', 'dueDate', 'paidOn'],
};
const NUMBER_FIELDS = ['amount', 'anchorDay', 'remindDays', 'lastPaidAmount'];

/** Run once from the editor: creates the tabs, headers and the API token. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach((name) => {
    const headers = SHEETS[name];
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // Store everything as plain text so Sheets doesn't turn "2026-11-07" into a Date.
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  });
  const blank = ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 2 && blank.getLastRow() === 0) ss.deleteSheet(blank);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_TOKEN')) props.setProperty('API_TOKEN', Utilities.getUuid());
  Logger.log('API_TOKEN = ' + props.getProperty('API_TOKEN'));
}

/** Health check: open the web app URL in a browser to see this. */
function doGet() {
  return json_({ ok: true, data: 'Payment Reminder API is running' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!token || body.token !== token) throw new Error('Invalid token');

    if (body.action === 'getAll') {
      return json_({ ok: true, data: { payments: readAll_('Payments'), history: readAll_('History') } });
    }

    // Writes take a lock so two requests can't edit the sheet at the same time.
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const data = body.data || {};
      switch (body.action) {
        case 'upsertPayment':
          upsert_('Payments', data);
          break;
        case 'deletePayment':
          remove_('Payments', data.id);
          break;
        case 'markPaid':
          upsert_('History', data.history);
          if (data.payment) upsert_('Payments', data.payment);
          if (data.deletePaymentId) remove_('Payments', data.deletePaymentId);
          break;
        case 'deleteHistory':
          remove_('History', data.id);
          break;
        case 'importAll':
          replaceAll_('Payments', data.payments || []);
          replaceAll_('History', data.history || []);
          break;
        default:
          throw new Error('Unknown action: ' + body.action);
      }
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true, data: null });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/* ---------- helpers ---------- */

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run setup() first.');
  return sh;
}

function readAll_(name) {
  const sh = sheet_(name);
  const headers = SHEETS[name];
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh
    .getRange(2, 1, last - 1, headers.length)
    .getValues()
    .filter((row) => row[0] !== '')
    .map((row) => toObject_(headers, row));
}

function toObject_(headers, row) {
  const obj = {};
  headers.forEach((h, i) => {
    let v = row[i];
    // Safety net in case a date was typed by hand and Sheets converted it.
    if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (v === '') v = null;
    else if (NUMBER_FIELDS.indexOf(h) >= 0) v = Number(v);
    else v = String(v);
    obj[h] = v;
  });
  return obj;
}

function toRow_(headers, obj) {
  return headers.map((h) => (obj[h] == null ? '' : String(obj[h])));
}

function ensureRows_(sh, lastRowNeeded) {
  const max = sh.getMaxRows();
  if (lastRowNeeded > max) sh.insertRowsAfter(max, lastRowNeeded - max);
}

function rowIndex_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues().map((r) => String(r[0]));
  const i = ids.indexOf(String(id));
  return i < 0 ? -1 : i + 2;
}

function upsert_(name, obj) {
  if (!obj || !obj.id) throw new Error('Missing id');
  const sh = sheet_(name);
  const headers = SHEETS[name];
  let row = rowIndex_(sh, obj.id);
  if (row < 0) {
    row = sh.getLastRow() + 1;
    ensureRows_(sh, row);
  }
  sh.getRange(row, 1, 1, headers.length).setNumberFormat('@').setValues([toRow_(headers, obj)]);
}

function remove_(name, id) {
  const sh = sheet_(name);
  const row = rowIndex_(sh, id);
  if (row > 0) sh.deleteRow(row);
}

function replaceAll_(name, list) {
  const sh = sheet_(name);
  const headers = SHEETS[name];
  const last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, headers.length).clearContent();
  if (!list.length) return;
  ensureRows_(sh, list.length + 1);
  sh.getRange(2, 1, list.length, headers.length)
    .setNumberFormat('@')
    .setValues(list.map((o) => toRow_(headers, o)));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
```

### The API at a glance

| `action` | `data` | What it does |
|---|---|---|
| `getAll` | — | Returns `{ payments: [...], history: [...] }` |
| `upsertPayment` | a payment object | Adds the payment, or updates the row with the same `id` |
| `deletePayment` | `{ id }` | Deletes that payment row |
| `markPaid` | `{ history, payment, deletePaymentId }` | Adds the expense row; updates the payment's next due date (or deletes a one-time payment) |
| `deleteHistory` | `{ id }` | Deletes that expense row |
| `importAll` | `{ payments, history }` | Replaces all data in both tabs |

---

## 3. Run setup and get your API token

1. In the Apps Script editor, pick **`setup`** in the function dropdown on the toolbar and click **Run**.
2. Google asks for permission the first time:
   1. Click **Review permissions** and choose your Google account.
   2. You'll see **"Google hasn't verified this app"**. This is expected for your own scripts. Click **Advanced → Go to Payment Reminder API (unsafe)**.
   3. Click **Allow**. The script only gets access to this spreadsheet.
3. When it finishes, open the **Execution log** at the bottom. You'll see a line like:
   ```
   API_TOKEN = 3f2b9c1e-7a4d-4c55-9a0e-1b2c3d4e5f60
   ```
   **Copy this token.** The React app sends it with every request.
4. Switch to the spreadsheet tab: it now has `Payments` and `History` tabs with bold header rows.

> To see the token again later: **Project Settings → Script Properties → `API_TOKEN`**. To change it, edit the value there (then update the React app's `.env` file too).

---

## 4. Deploy as a web app

1. In the Apps Script editor click **Deploy → New deployment**.
2. Click the gear icon next to **Select type** and choose **Web app**.
3. Fill in:
   - **Description:** `v1`
   - **Execute as:** **Me (your email)**. The script reads and writes the sheet with your permissions.
   - **Who has access:** **Anyone**. This is required for the browser to call it without a Google login. The API token from step 3 is what protects your data.
4. Click **Deploy**, and authorize again if asked.
5. Copy the **Web app URL**. It looks like:
   ```
   https://script.google.com/macros/s/AKfycb.................../exec
   ```
   Use the URL ending in **`/exec`**, not `/dev`.

---

## 5. Test the API

**Health check:** paste the web app URL into a browser. You should see:

```json
{"ok":true,"data":"Payment Reminder API is running"}
```

**Read data with a token** (Git Bash or any terminal with `curl`):

```bash
curl -L \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"getAll","token":"YOUR_API_TOKEN"}' \
  "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
```

Expected: `{"ok":true,"data":{"payments":[],"history":[]}}`

- `-L` is required: Apps Script answers every request with a redirect to `script.googleusercontent.com`, and curl only follows it with `-L`.
- With a wrong token you get `{"ok":false,"error":"Invalid token"}`, which proves the token check works.

---

## 6. Connect the React app

The React app currently keeps data in localStorage ([src/storage.js](src/storage.js)). These changes make it load from and save to the Apps Script API instead. The rest of the app (components, Analysis, theme) stays as it is, because `useStore()` keeps the same functions.

### 6.1 Add environment variables

Create **`.env.local`** in the project root (next to `package.json`):

```bash
VITE_API_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
VITE_API_TOKEN=YOUR_API_TOKEN
```

Add it to **`.gitignore`** so it is never committed:

```gitignore
node_modules
dist
.env.local
```

Vite only exposes variables that start with `VITE_`, and only reads `.env` files when the dev server starts, so restart `npm run dev` after editing it.

### 6.2 Create `src/api.js`

```javascript
const API_URL = import.meta.env.VITE_API_URL
const API_TOKEN = import.meta.env.VITE_API_TOKEN

let queue = Promise.resolve()

async function post(action, data) {
  if (!API_URL) throw new Error('VITE_API_URL is not set (see deployment.md)')
  const res = await fetch(API_URL, {
    method: 'POST',
    // text/plain keeps this a "simple" request, so the browser skips the CORS
    // preflight (OPTIONS) that Apps Script cannot answer.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: API_TOKEN, data }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error)
  return json.data
}

// Requests run one at a time, in order, so a later change never reaches the
// sheet before an earlier one (e.g. "add payment" then "mark it paid").
export function api(action, data) {
  const run = queue.then(() => post(action, data))
  queue = run.catch(() => {})
  return run
}
```

> Do **not** set `Content-Type: application/json`. That triggers a CORS preflight request, which Apps Script cannot answer, and every call fails with a CORS error.

### 6.3 Replace `src/storage.js`

Replace the whole file with the version below. It keeps the same exports (`CATEGORIES`, `uid`, `formatAmount`, `useStore`) and the same `useStore()` functions, and adds `loading`, `error`, `clearError` and `reload`.

The screen updates immediately (optimistic update) and the change is saved to the sheet in the background. If a save fails, the error is shown and the data is reloaded from the sheet, so the screen never shows something the sheet doesn't have.

```javascript
import { useCallback, useEffect, useState } from 'react'
import { FREQUENCIES, addMonths, todayISO } from './dates'
import { api } from './api'

export const CATEGORIES = ['Utilities', 'Vehicle', 'Insurance', 'Loan / EMI', 'Subscription', 'Rent', 'Other']

export const uid = () => crypto.randomUUID()

export const formatAmount = (n) =>
  n == null || n === ''
    ? '—'
    : Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

const toAmount = (v) => (v === '' || v == null ? null : Number(v))

export function useStore() {
  const [payments, setPayments] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api('getAll')
      setPayments(data.payments)
      setHistory(data.history)
    } catch (err) {
      setError(`Could not load data from Google Sheets: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // The screen is already updated; save to the sheet, and resync if that fails.
  const sync = (action, data) =>
    api(action, data).catch((err) => {
      setError(`Save failed: ${err.message}. Data was reloaded from Google Sheets.`)
      reload()
    })

  // Returns the saved payment so callers can act on it (e.g. mark it paid).
  const savePayment = (p) => {
    const saved = p.id
      ? { ...p, anchorDay: Number(p.dueDate.slice(8, 10)) }
      : { ...p, anchorDay: Number(p.dueDate.slice(8, 10)), id: uid(), createdAt: todayISO() }
    setPayments((list) =>
      list.some((x) => x.id === saved.id)
        ? list.map((x) => (x.id === saved.id ? saved : x))
        : [...list, saved]
    )
    sync('upsertPayment', saved)
    return saved
  }

  const deletePayment = (id) => {
    setPayments((list) => list.filter((x) => x.id !== id))
    sync('deletePayment', { id })
  }

  // Logs the payment as an expense and rolls the due date forward
  // (or removes it, for one-time payments).
  const markPaid = (payment, amountPaid, paidOn) => {
    const entry = {
      id: uid(),
      paymentId: payment.id,
      name: payment.name,
      category: payment.category,
      amount: toAmount(amountPaid),
      dueDate: payment.dueDate,
      paidOn,
    }
    const once = payment.frequency === 'once'
    const updated = once
      ? null
      : {
          ...payment,
          dueDate: addMonths(payment.dueDate, FREQUENCIES[payment.frequency].months, payment.anchorDay),
          lastPaidOn: paidOn,
          lastPaidAmount: toAmount(amountPaid),
        }

    setHistory((h) => [entry, ...h])
    setPayments((list) =>
      once ? list.filter((x) => x.id !== payment.id) : list.map((x) => (x.id === payment.id ? updated : x))
    )
    sync('markPaid', { history: entry, payment: updated, deletePaymentId: once ? payment.id : null })
  }

  const deleteHistory = (id) => {
    setHistory((h) => h.filter((x) => x.id !== id))
    sync('deleteHistory', { id })
  }

  const exportData = () => JSON.stringify({ payments, history }, null, 2)

  const importData = (json) => {
    const data = JSON.parse(json)
    if (!Array.isArray(data.payments) || !Array.isArray(data.history)) {
      throw new Error('File must contain "payments" and "history" arrays')
    }
    setPayments(data.payments)
    setHistory(data.history)
    sync('importAll', data)
  }

  return {
    payments,
    history,
    loading,
    error,
    clearError: () => setError(''),
    reload,
    savePayment,
    deletePayment,
    markPaid,
    deleteHistory,
    exportData,
    importData,
  }
}
```

What changed compared with the localStorage version:

- No more `localStorage` and no sample payments; the sheet is the only source of data.
- `markPaid` computes the updated payment from the `payment` argument instead of inside the state updater, because the same object must also be sent to the API.

### 6.4 Show loading and errors in `src/App.jsx`

In [src/App.jsx](src/App.jsx), find this line just below `</header>`:

```jsx
{importError && <p className="error">{importError}</p>}
```

and add these lines right after it:

```jsx
{store.error && (
  <p className="error">
    {store.error}{' '}
    <button className="ghost small" onClick={store.clearError}>Dismiss</button>
  </p>
)}
{store.loading && <p className="muted">Loading from Google Sheets…</p>}
```

### 6.5 Run it

```bash
npm run dev
```

Open <http://localhost:5173>. After a second or two the (empty) list loads. Add a payment, then look at the spreadsheet: a new row appears in `Payments` within a few seconds.

---

## 7. Import your backed-up data

1. In the running app, click **Import** and choose the JSON file from [step 0](#0-back-up-your-current-data).
2. The app shows the data straight away and sends it to the sheet with `importAll`.
3. Check the spreadsheet: `Payments` and `History` should now hold your rows.

> `importAll` **replaces** everything in both tabs. Use it only for restoring a full backup.

---

## 8. Host the React app

`npm run build` creates a static site in `dist/`. Any static host works. In every option below, set the **same two environment variables** in the host's settings, because `.env.local` is not uploaded.

| Variable | Value |
|---|---|
| `VITE_API_URL` | your `/exec` web app URL |
| `VITE_API_TOKEN` | your API token |

### Option A: Netlify

1. Push the project to a GitHub repository (with `.env.local` ignored).
2. On <https://app.netlify.com>: **Add new site → Import an existing project → GitHub** and pick the repo.
3. Build command: `npm run build`; publish directory: `dist`.
4. **Site configuration → Environment variables**: add `VITE_API_URL` and `VITE_API_TOKEN`.
5. **Deploys → Trigger deploy**. Netlify gives you a URL like `https://your-site.netlify.app`.

### Option B: Vercel

1. On <https://vercel.com>: **Add New → Project** and import the GitHub repo.
2. Vercel detects Vite automatically (build `npm run build`, output `dist`).
3. Under **Environment Variables**, add `VITE_API_URL` and `VITE_API_TOKEN`, then click **Deploy**.

### Option C: GitHub Pages

1. In `vite.config.js`, set `base` to your repository name:
   ```javascript
   export default defineConfig({
     plugins: [react()],
     base: '/your-repo-name/',
   })
   ```
2. In the repo on GitHub: **Settings → Secrets and variables → Actions**, add the secrets `VITE_API_URL` and `VITE_API_TOKEN`.
3. **Settings → Pages → Source: GitHub Actions**.
4. Create `.github/workflows/deploy.yml`:
   ```yaml
   name: Deploy to GitHub Pages
   on:
     push:
       branches: [main]
   permissions:
     contents: read
     pages: write
     id-token: write
   jobs:
     deploy:
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 22
         - run: npm ci
         - run: npm run build
           env:
             VITE_API_URL: ${{ secrets.VITE_API_URL }}
             VITE_API_TOKEN: ${{ secrets.VITE_API_TOKEN }}
         - uses: actions/upload-pages-artifact@v3
           with:
             path: dist
         - id: deployment
           uses: actions/deploy-pages@v4
   ```
5. Push to `main`. The site appears at `https://your-username.github.io/your-repo-name/`.

> Changing an environment variable on any host only takes effect after the **next build**, because Vite bakes the values into the JavaScript at build time.

---

## 9. Updating the Apps Script later

If you edit `Code.gs`, saving alone does **not** update the live `/exec` URL. To publish the change **and keep the same URL**:

1. **Deploy → Manage deployments**.
2. Select your web app deployment and click the ✏️ **Edit** icon.
3. **Version → New version**, add a description, and click **Deploy**.

Don't use **Deploy → New deployment** for updates: it creates a *different* URL, and the React app would keep calling the old version.

---

## 10. Security notes

Read this before putting the app online.

- **The token is visible to anyone who opens your site.** Vite puts `VITE_API_TOKEN` into the JavaScript bundle, so anyone who loads the page can find it in the browser's developer tools. It stops random people who only know the `/exec` URL, but it is **not** a password for a public website.
- **Keep the site URL private**, or host it somewhere only you can reach, if your payment data is sensitive. On Netlify or Vercel you can put the site behind password protection (paid plans), or use Cloudflare Access in front of any static host.
- **If the token leaks:** change `API_TOKEN` in **Project Settings → Script Properties**, update the env var on your host, and rebuild. The old token stops working immediately.
- **"Execute as: Me"** means the script uses *your* access, but the code can only touch the spreadsheet it is bound to.
- **Don't commit `.env.local`.** Check `git status` before your first push.
- Google keeps **version history** of the sheet (**File → Version history**), so you can restore it after a mistake, including a wrong `importAll`.

---

## 11. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Browser console shows a **CORS error** | The request was sent as `application/json`. Use `Content-Type: text/plain;charset=utf-8` exactly as in `src/api.js`. Also check that **Who has access** is **Anyone**. |
| `Invalid token` | `.env.local` token doesn't match **Script Properties → API_TOKEN**. Fix it and **restart `npm run dev`** (or rebuild on your host). |
| `VITE_API_URL is not set` | `.env.local` is missing, misnamed, or the dev server wasn't restarted. On a host, the env var wasn't set before the build. |
| `Missing tab "Payments". Run setup() first.` | Run `setup()` from the editor (step 3), or check you didn't rename the tabs. |
| Response is an **HTML page** instead of JSON, or "Sorry, unable to open the file" | Wrong URL (use the `/exec` one), or the deployment's access isn't **Anyone**. |
| Code changes don't show up | You saved but didn't publish a new version. See [step 9](#9-updating-the-apps-script-later). |
| Dates show as `Mon Nov 09 2026 …` or the wrong day | A date was typed by hand into the sheet and Sheets converted it. The script converts it back on read; to avoid it, format the column as **Format → Number → Plain text** and type `2026-11-09`. |
| `Exception: Lock timeout` | Many saves at once. Retry; the lock waits up to 10 s. |
| Each action takes 1–3 seconds to reach the sheet | Normal for Apps Script. The UI updates instantly because changes are applied locally first. |
| Authorization screen keeps coming back | Run `setup()` again from the editor and complete **Advanced → Go to … (unsafe) → Allow**. |

### Quotas

Apps Script has daily usage limits (see <https://developers.google.com/apps-script/guides/services/quotas>). A personal payment tracker makes a handful of requests per day, far below them.
