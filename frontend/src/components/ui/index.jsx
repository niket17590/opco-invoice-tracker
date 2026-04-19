import styles from './ui.module.css'

/* ── BUTTON ─────────────────────────────────────────────────── */
export function Button({ variant = 'primary', size = 'md', onClick, disabled, children, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${styles.btn} ${styles[variant]} ${styles[`size_${size}`]}`}
    >
      {children}
    </button>
  )
}

/* ── CARD ────────────────────────────────────────────────────── */
export function Card({ children, className = '' }) {
  return <div className={`card ${className}`}>{children}</div>
}

/* ── STATUS BADGE ────────────────────────────────────────────── */
export function StatusBadge({ status }) {
  return <span className={`pill pill-${status}`}>{status}</span>
}

/* ── SPINNER ─────────────────────────────────────────────────── */
export function Spinner() {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
    </div>
  )
}

/* ── FIELD — shared label+input pair used on every form page ─── */
export function Field({ label, children, span2 = false }) {
  return (
    <div className="field" style={span2 ? { gridColumn: 'span 2' } : undefined}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}

/* ── SETTINGS SECTION CARD ───────────────────────────────────── */
export function SettingsCard({ title, badge, children }) {
  return (
    <div className="settings-card">
      <div className="settings-card-title">
        <span>{title}</span>
        {badge && <span className="settings-badge">{badge}</span>}
      </div>
      {children}
    </div>
  )
}

/* ── SECTION HEADER ─────────────────────────────────────────── */
export function SectionHeader({ children }) {
  return <div className="section-label">{children}</div>
}
