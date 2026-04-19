import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import styles from './Layout.module.css'

const NAV = [
  {
    to: '/dashboard', label: 'Dashboard',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>,
  },
  {
    to: '/invoices', label: 'Invoices',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="1" width="12" height="14" rx="1.5"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="8" y2="11"/></svg>,
  },
  {
    to: '/invoices/new', label: 'New Invoice',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8" cy="8" r="6.5"/><line x1="8" y1="5" x2="8" y2="11"/><line x1="5" y1="8" x2="11" y2="8"/></svg>,
  },
  {
    to: '/clients', label: 'Clients',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" strokeLinecap="round"/></svg>,
  },
  {
    to: '/settings', label: 'Settings',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" strokeLinecap="round"/></svg>,
  },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const avatarUrl = user?.user_metadata?.avatar_url
  const fullName  = user?.user_metadata?.full_name || user?.email || ''
  const initials  = fullName.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'NA'
  const email     = user?.email || ''

  return (
    <div className={styles.shell}>
      {/* ── Sidebar ── */}
      <aside
        className={`${styles.sidebar} ${expanded ? styles.expanded : ''}`}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        {/* Logo */}
        <div className={styles.logo}>
          <div className={styles.logoMark}>R</div>
          <span className={styles.logoText}>Rapidmatix</span>
        </div>

        {/* Nav items */}
        <nav className={styles.nav}>
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              end={item.to === '/invoices'}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom — avatar + sign out */}
        <div className={styles.bottom}>
          <div className={styles.userRow}>
            <div className={styles.avatarWrap}>
              {avatarUrl
                ? <img src={avatarUrl} alt={fullName} className={styles.avatarImg} referrerPolicy="no-referrer" />
                : <div className={styles.avatarInitials}>{initials}</div>
              }
            </div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{fullName || 'Account'}</div>
              <div className={styles.userEmail}>{email}</div>
            </div>
          </div>
          <button className={styles.signOutBtn} onClick={handleSignOut} title="Sign out">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="15" height="15">
              <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" strokeLinecap="round"/>
              <path d="M11 11l3-3-3-3" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="14" y1="8" x2="6" y2="8" strokeLinecap="round"/>
            </svg>
            <span className={styles.signOutLabel}>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
