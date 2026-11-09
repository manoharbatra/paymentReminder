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
