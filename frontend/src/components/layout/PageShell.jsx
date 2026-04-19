import styles from './PageShell.module.css'

export default function PageShell({ crumb, title, actions, children }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.left}>
          <span className={styles.crumb}>{crumb}</span>
          <span className={styles.sep}>/</span>
          <span className={styles.title}>{title}</span>
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      <div className={styles.content}>
        {children}
      </div>
    </div>
  )
}
