import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { user, isOwner, signInWithGoogle } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user && isOwner) navigate('/dashboard', { replace: true })
  }, [user, isOwner, navigate])

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.logo}>R</div>
        <h1 style={styles.title}>Rapidmatix</h1>
        <p style={styles.sub}>Invoice Suite</p>
        <button style={styles.btn} onClick={signInWithGoogle}>
          <GoogleIcon />
          Sign in with Google
        </button>
        <p style={styles.note}>Access restricted to authorised accounts only.</p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M15.68 8.18c0-.57-.05-1.11-.14-1.64H8v3.1h4.3a3.67 3.67 0 0 1-1.6 2.41v2h2.58c1.51-1.39 2.4-3.44 2.4-5.87Z" fill="#4285F4"/>
      <path d="M8 16c2.16 0 3.97-.72 5.29-1.94l-2.58-2a4.8 4.8 0 0 1-2.71.75c-2.08 0-3.85-1.4-4.48-3.29H.86v2.06A8 8 0 0 0 8 16Z" fill="#34A853"/>
      <path d="M3.52 9.52A4.8 4.8 0 0 1 3.27 8c0-.53.09-1.04.25-1.52V4.42H.86A8 8 0 0 0 0 8c0 1.29.31 2.51.86 3.58l2.66-2.06Z" fill="#FBBC05"/>
      <path d="M8 3.18c1.17 0 2.22.4 3.05 1.2l2.28-2.28A8 8 0 0 0 8 0 8 8 0 0 0 .86 4.42l2.66 2.06C4.15 4.59 5.92 3.18 8 3.18Z" fill="#EA4335"/>
    </svg>
  )
}

const styles = {
  wrap: {
    minHeight: '100vh',
    background: 'var(--linen)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, sans-serif',
  },
  card: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '48px 40px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    width: 340,
    boxShadow: '0 4px 24px rgba(45,90,69,0.08)',
  },
  logo: {
    width: 48,
    height: 48,
    background: 'var(--sage-dark)',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Sora, sans-serif',
    fontSize: 20,
    fontWeight: 700,
    color: '#fff',
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Sora, sans-serif',
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.02em',
  },
  sub: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginBottom: 24,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#fff',
    border: '1.5px solid var(--border)',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    width: '100%',
    justifyContent: 'center',
    fontFamily: 'Inter, sans-serif',
    transition: 'background 0.12s',
  },
  note: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 16,
    textAlign: 'center',
  },
}
