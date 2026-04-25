/**
 * DriveCallback.jsx
 * Mounted at /auth/drive/callback
 * Google redirects here after user approves Drive access.
 * This page grabs the auth code from the URL and sends it
 * back to the opener window via postMessage, then closes.
 */
import { useEffect } from 'react'

export default function DriveCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    const error  = params.get('error')

    if (window.opener) {
      window.opener.postMessage(
        { type: 'DRIVE_AUTH_CODE', code, error },
        window.location.origin
      )
    }
    // Close the popup — opener will handle the rest
    window.close()
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f0ece4',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36, border: '2px solid #e8e2d8',
          borderTopColor: '#2d5a45', borderRadius: '50%',
          animation: 'spin .7s linear infinite', margin: '0 auto 12px',
        }} />
        <p style={{ color: '#9a9080', fontSize: 13 }}>Connecting to Drive…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
