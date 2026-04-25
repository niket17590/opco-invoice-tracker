/**
 * drive.js
 * Google Drive OAuth + file upload utility
 *
 * Flow:
 *   1. connectDrive()      → opens Google popup, gets auth code
 *   2. exchangeCode()      → trades code for access + refresh token
 *   3. saveRefreshToken()  → persists refresh token to Supabase settings
 *   4. getAccessToken()    → uses refresh token to get fresh access token
 *   5. uploadToDrive()     → uploads PDF blob to user's Drive folder
 */

const SCOPES = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

/* ── Read env vars ────────────────────────────────────────── */
const CLIENT_ID     = import.meta.env.VITE_GOOGLE_CLIENT_ID
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET
const REDIRECT_URI  = `${window.location.origin}/auth/drive/callback`

/* ══════════════════════════════════════════════════════════
   STEP 1 — Open Google OAuth popup and get auth code
   ══════════════════════════════════════════════════════════ */
export function connectDrive() {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      client_id:     CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      response_type: 'code',
      scope:         SCOPES,
      access_type:   'offline',   // gets refresh token
      prompt:        'consent',   // force consent screen so refresh token is always returned
    })

    const url    = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
    const width  = 500, height = 600
    const left   = window.screenX + (window.outerWidth  - width)  / 2
    const top    = window.screenY + (window.outerHeight - height) / 2
    const popup  = window.open(url, 'connectDrive', `width=${width},height=${height},left=${left},top=${top}`)

    if (!popup) { reject(new Error('Popup blocked. Please allow popups for this site.')); return }

    // Listen for the auth code coming back via postMessage from the callback page
    function onMessage(e) {
      if (e.origin !== window.location.origin) return
      if (e.data?.type !== 'DRIVE_AUTH_CODE') return
      window.removeEventListener('message', onMessage)
      popup.close()
      if (e.data.error) { reject(new Error(e.data.error)); return }
      resolve(e.data.code)
    }

    window.addEventListener('message', onMessage)

    // Safety timeout — if user closes popup without completing
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer)
        window.removeEventListener('message', onMessage)
        reject(new Error('cancelled'))
      }
    }, 500)
  })
}

/* ══════════════════════════════════════════════════════════
   STEP 2 — Exchange auth code for tokens
   ══════════════════════════════════════════════════════════ */
export async function exchangeCodeForTokens(code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)
  return data // { access_token, refresh_token, expires_in, ... }
}

/* ══════════════════════════════════════════════════════════
   STEP 3 — Get a fresh access token using stored refresh token
   ══════════════════════════════════════════════════════════ */
export async function getAccessToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)
  return data.access_token
}

/* ══════════════════════════════════════════════════════════
   STEP 4 — Upload PDF blob to Google Drive folder
   ══════════════════════════════════════════════════════════ */
export async function uploadToDrive({ accessToken, fileName, pdfBlob, folderId }) {
  // Multipart upload: metadata + file content in one request
  const metadata = JSON.stringify({
    name:    fileName,
    mimeType:'application/pdf',
    parents: folderId ? [folderId] : [],
  })

  const form = new FormData()
  form.append('metadata', new Blob([metadata], { type: 'application/json' }))
  form.append('file',     new Blob([pdfBlob],  { type: 'application/pdf' }))

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body:    form,
    }
  )

  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Upload failed')
  return data // { id, name, webViewLink }
}

/* ══════════════════════════════════════════════════════════
   COMBINED — Full connect flow (code → tokens → return)
   Called from Settings after user clicks Connect Drive
   ══════════════════════════════════════════════════════════ */
export async function runDriveConnect() {
  const code   = await connectDrive()              // popup → auth code
  const tokens = await exchangeCodeForTokens(code) // code → tokens
  return tokens // caller saves refresh_token to DB
}

/* ══════════════════════════════════════════════════════════
   COMBINED — Full upload flow
   Called from invoice page when user clicks Save to Drive
   ══════════════════════════════════════════════════════════ */
export async function driveUpload({ refreshToken, folderId, fileName, pdfBlob }) {
  const accessToken = await getAccessToken(refreshToken)
  return uploadToDrive({ accessToken, fileName, pdfBlob, folderId })
}
