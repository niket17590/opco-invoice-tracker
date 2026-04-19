import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PageShell from '../components/layout/PageShell'
import { Button, Field, SettingsCard, Spinner } from '../components/ui'

const DEFAULTS = {
  company_name:'', hst_number:'', address:'', phone:'', email:'',
  invoice_prefix:'INV-', hst_rate:'13.00', drive_folder_id:'',
}

export default function Settings() {
  const { user } = useAuth()
  const [form, setForm]     = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('settings').select('*').eq('user_id', user.id).single()
    if (data) setForm({
      company_name:    data.company_name    || '',
      hst_number:      data.hst_number      || '',
      address:         data.address         || '',
      phone:           data.phone           || '',
      email:           data.email           || '',
      invoice_prefix:  data.invoice_prefix  || 'INV-',
      hst_rate:        data.hst_rate?.toString() || '13.00',
      drive_folder_id: data.drive_folder_id || '',
    })
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true); setSaved(false); setError(null)
    const { error: e } = await supabase.from('settings').update({
      company_name:    form.company_name,
      hst_number:      form.hst_number,
      address:         form.address,
      phone:           form.phone,
      email:           form.email,
      invoice_prefix:  form.invoice_prefix,
      hst_rate:        parseFloat(form.hst_rate) || 13,
      drive_folder_id: form.drive_folder_id || null,
      updated_at:      new Date().toISOString(),
    }).eq('user_id', user.id)
    setSaving(false)
    if (e) { setError(e.message); return }
    setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  if (loading) return <PageShell crumb="Rapidmatix" title="Settings"><Spinner /></PageShell>

  return (
    <PageShell
      crumb="Rapidmatix" title="Settings"
      actions={
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </Button>
      }
    >
      {error && <div className="alert-error">{error}</div>}

      <SettingsCard title="Business Information">
        <div className="grid-2">
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
            <input className="fi" type="email" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Address" span2>
            <input className="fi" value={form.address} onChange={set('address')} />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="Invoice Preferences">
        <div className="grid-2">
          <Field label="Invoice prefix">
            <input className="fi" value={form.invoice_prefix} onChange={set('invoice_prefix')}
              style={{maxWidth:140}} />
          </Field>
          <Field label="Default HST rate (%)">
            <input className="fi" type="number" min="0" max="100" step="0.01"
              value={form.hst_rate} onChange={set('hst_rate')} style={{maxWidth:140}} />
          </Field>
        </div>
        <p className="text-muted fs-11">
          Invoice numbers generate as <strong className="text-sage">{form.invoice_prefix||'INV-'}2026001</strong>, auto-incremented per year.
        </p>
      </SettingsCard>

      <SettingsCard title="Google Drive" badge="optional">
        <div className="grid-2">
          <Field label="Drive folder ID">
            <input className="fi" value={form.drive_folder_id} onChange={set('drive_folder_id')} />
          </Field>
          <Field label="Connection">
            <Button variant="ghost" disabled>Coming soon</Button>
          </Field>
        </div>
        <p className="text-muted fs-11 mt-4">
          Find your folder ID in the Drive URL after <code>/folders/</code>
        </p>
      </SettingsCard>

      <SettingsCard title="Account">
        <p className="fs-13 text-muted">
          Signed in as <strong className="text-primary">{user?.email}</strong>
        </p>
        <p className="fs-11 text-muted mt-4">
          This app is restricted to your account. Sign out via the avatar button in the sidebar.
        </p>
      </SettingsCard>
    </PageShell>
  )
}
