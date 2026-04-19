import styles from './ui.module.css'

/* ── BUTTON ────────────────────────────────────────────── */
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

/* ── CARD ──────────────────────────────────────────────── */
export function Card({ children, className = '' }) {
  return <div className={`${styles.card} ${className}`}>{children}</div>
}

/* ── STATUS BADGE ──────────────────────────────────────── */
export function StatusBadge({ status }) {
  return <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>{status}</span>
}

/* ── SPINNER ───────────────────────────────────────────── */
export function Spinner() {
  return (
    <div className={styles.spinnerWrap}>
      <div className={styles.spinner} />
    </div>
  )
}

/* ── SECTION HEADER ────────────────────────────────────── */
export function SectionHeader({ children }) {
  return <div className={styles.sectionHeader}>{children}</div>
}
