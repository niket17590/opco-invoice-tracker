import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PageShell from '../components/layout/PageShell'
import { Button } from '../components/ui'

export default function Settings() {
  const { user } = useAuth()
  const [form, setForm] = useState({
    company_name: '',
    hst_number: '',
    address: '',
    phone: '',
    email: '',
    invoice_prefix: 'INV-',
    hst_rate: '13.00',
    drive_folder_id: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('settings').select('*').eq('user_id', user.id).single()
    if (data) {
      setForm({
        company_name:   data.company_name || '',
        hst_number:     data.hst_number || '',
        address:        data.address || '',
        phone:          data.phone || '',
        email:          data.email || '',
        invoice_prefix: data.invoice_prefix || 'INV-',
        hst_rate:       data.hst_rate?.toString() || '13.00',
        drive_folder_id: data.drive_folder_id || '',
      })
    }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true); setSaved(false); setError(null)
    const { error: e } = await supabase.from('settings').update({
      company_name:   form.company_name,
      hst_number:     form.hst_number,
      address:        form.address,
      phone:          form.phone,
      email:          form.email,
      invoice_prefix: form.invoice_prefix,
      hst_rate:       parseFloat(form.hst_rate) || 13,
      drive_folder_id: form.drive_folder_id || null,
      updated_at:     new Date().toISOString(),
    }).eq('user_id', user.id)
    setSaving(false)
    if (e) { setError(e.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  if (loading) {
    return (
      <PageShell crumb="Rapidmatix" title="Settings">
        <div className="spinnerWrap"><div className="spinner" /></div>
      </PageShell>
    )
  }

  return (
    <PageShell
      crumb="Rapidmatix"
      title="Settings"
      actions={
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </Button>
      }
    >
      {error && <div style={s.errBox}>{error}</div>}

      {/* ── Business Information ── */}
      <Section title="Business Information">
        <div style={s.g2}>
          <Field label="Company name">
            <input className="fi" value={form.company_name} onChange={set('company_name')} />
          </Field>
          <Field label="HST number">
            <input className="fi" value={form.hst_number} onChange={set('hst_number')} />
          </Field>
          <Field label="Phone">
            <input className="fi" value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="Email">
            <input className="fi" value={form.email} onChange={set('email')} type="email" />
          </Field>
        </div>
        <Field label="Address">
          <input className="fi" value={form.address} onChange={set('address')} />
        </Field>
      </Section>

      {/* ── Invoice Preferences ── */}
      <Section title="Invoice Preferences">
        <div style={s.g2}>
          <Field label="Invoice prefix">
            <input className="fi" value={form.invoice_prefix} onChange={set('invoice_prefix')} style={{ maxWidth: 140 }} />
          </Field>
          <Field label="Default HST rate (%)">
            <input className="fi" value={form.hst_rate} onChange={set('hst_rate')} type="number" min="0" max="100" step="0.01" style={{ maxWidth: 140 }} />
          </Field>
        </div>
        <p style={s.hint}>
          Invoice numbers generate as <strong style={{ color: 'var(--sage-dark)' }}>{form.invoice_prefix || 'INV-'}2026001</strong>, auto-incremented per year.
        </p>
      </Section>

      {/* ── Google Drive ── */}
      <Section title="Google Drive" badge="optional">
        <div style={s.g2}>
          <Field label="Drive folder ID">
            <input className="fi" value={form.drive_folder_id} onChange={set('drive_folder_id')} />
          </Field>
          <Field label="Connection">
            <Button variant="ghost" disabled style={{ width: 'fit-content' }}>Coming soon</Button>
          </Field>
        </div>
        <p style={s.hint}>
          Find your folder ID by opening the Drive folder — it's the last segment of the URL after <code style={{ fontSize: 11 }}>/folders/</code>
        </p>
      </Section>

      {/* ── Account ── */}
      <Section title="Account">
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Signed in as <strong style={{ color: 'var(--text-primary)' }}>{user?.email}</strong>
        </p>
        <p style={{ ...s.hint, marginTop: 6 }}>
          This app is restricted to your account. Sign out via the avatar button in the sidebar.
        </p>
      </Section>
    </PageShell>
  )
}

function Section({ title, badge, children }) {
  return (
    <div style={{
      background: 'var(--white)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '20px 22px',
      marginBottom: 14, boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border-light)' }}>
        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        {badge && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, background: 'var(--linen)', padding: '2px 8px', borderRadius: 99, border: '1px solid var(--border)' }}>{badge}</span>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const s = {
  errBox: {
    background: 'var(--red-pale)', border: '1px solid #f5c0bc',
    borderRadius: 8, padding: '10px 14px', fontSize: 13,
    color: 'var(--red-text)', marginBottom: 16,
  },
  g2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
}
