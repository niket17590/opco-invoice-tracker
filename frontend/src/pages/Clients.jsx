import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PageShell from '../components/layout/PageShell'
import { Button, Field } from '../components/ui'

const EMPTY = { name:'', address:'', phone:'', email:'', consulting_client:'', payment_terms_days:15, hourly_rate:'' }
const initials = n => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
const fmt2 = n => parseFloat(n||0).toFixed(2)

export default function Clients() {
  const { user } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShow]  = useState(false)
  const [editId, setEditId]   = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*')
      .eq('user_id', user.id).eq('is_active', true)
      .order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  function openAdd()   { setEditId(null); setForm(EMPTY); setError(null); setShow(true) }
  function openEdit(c) {
    setEditId(c.id)
    setForm({ name:c.name, address:c.address, phone:c.phone, email:c.email, consulting_client:c.consulting_client, payment_terms_days:c.payment_terms_days, hourly_rate:c.hourly_rate })
    setError(null); setShow(true)
  }
  function close() { setShow(false); setEditId(null); setForm(EMPTY); setError(null) }

  async function save() {
    if (!form.name.trim())                        { setError('Client name is required.'); return }
    if (!form.hourly_rate||isNaN(+form.hourly_rate)) { setError('Hourly rate is required.'); return }
    setSaving(true); setError(null)
    const payload = { ...form, hourly_rate:+form.hourly_rate, payment_terms_days:+form.payment_terms_days, user_id:user.id }
    const { error:e } = editId
      ? await supabase.from('clients').update(payload).eq('id', editId)
      : await supabase.from('clients').insert(payload)
    setSaving(false)
    if (e) { setError(e.message); return }
    close(); load()
  }

  async function deactivate(id) {
    if (!confirm('Remove this client? Existing invoices are kept.')) return
    await supabase.from('clients').update({ is_active:false }).eq('id', id)
    load()
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <PageShell
      crumb="Rapidmatix" title="Clients"
      actions={<Button variant="primary" onClick={openAdd}>+ Add Client</Button>}
    >
      <style>{RESPONSIVE_CSS}</style>

      {loading
        ? <div className="spinner-wrap"><div className="spinner"/></div>
        : clients.length === 0
          ? <div className="empty-state">No clients yet. Add your first client to start creating invoices.</div>
          : clients.map(c => (
            <div key={c.id} className="client-card cl-card-responsive">
              <div className="client-card-left">
                <div className="client-avatar">{initials(c.name)}</div>
                <div style={{minWidth:0}}>
                  <div className="client-name">{c.name}</div>
                  {c.address && <div className="client-meta">{c.address}</div>}
                  <div className="client-meta">
                    {c.consulting_client && <><strong>{c.consulting_client}</strong> · </>}
                    Net {c.payment_terms_days} days
                    {c.phone && ` · ${c.phone}`}
                  </div>
                </div>
              </div>
              <div className="client-card-right cl-card-right-responsive">
                <div className="client-rate">${fmt2(c.hourly_rate)}</div>
                <div className="client-rate-label">per hour</div>
                <div className="flex gap-8 mt-8" style={{justifyContent:'flex-end'}}>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => deactivate(c.id)}>Remove</Button>
                </div>
              </div>
            </div>
          ))
      }

      {showModal && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal cl-modal-responsive" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editId ? 'Edit Client' : 'New Client'}</span>
              <button className="modal-close" onClick={close}>✕</button>
            </div>

            <div className="grid-2">
              <Field label="Client name *">
                <input className="fi" value={form.name} onChange={set('name')} autoFocus />
              </Field>
              <Field label="Consulting client">
                <input className="fi" value={form.consulting_client} onChange={set('consulting_client')} />
              </Field>
            </div>

            <Field label="Address">
              <input className="fi" value={form.address} onChange={set('address')} />
            </Field>

            <div className="grid-2">
              <Field label="Phone">
                <input className="fi" value={form.phone} onChange={set('phone')} />
              </Field>
              <Field label="Email">
                <input className="fi" type="email" value={form.email} onChange={set('email')} />
              </Field>
            </div>

            <div className="grid-2">
              <Field label="Hourly rate ($) *">
                <input className="fi" type="number" min="0" step="0.01" value={form.hourly_rate} onChange={set('hourly_rate')} />
              </Field>
              <Field label="Payment terms (days)">
                <input className="fi" type="number" min="1" value={form.payment_terms_days} onChange={set('payment_terms_days')} />
              </Field>
            </div>

            {error && <div className="alert-error">{error}</div>}

            <div className="modal-footer">
              <Button variant="ghost" onClick={close}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Client'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}

const RESPONSIVE_CSS = `
  @media (max-width: 600px) {
    /* Stack client card vertically */
    .cl-card-responsive {
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 12px !important;
    }
    .cl-card-right-responsive {
      text-align: left !important;
      width: 100%;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      flex-wrap: wrap;
      gap: 8px;
    }
    .cl-card-right-responsive .client-rate-label { margin-top: 0 !important; }

    /* Modal full-screen on mobile */
    .cl-modal-responsive {
      position: fixed !important;
      inset: 0 !important;
      max-width: 100% !important;
      width: 100% !important;
      border-radius: 0 !important;
      margin: 0 !important;
      overflow-y: auto !important;
      max-height: 100dvh !important;
    }

    /* Grid inside modal stacks */
    .cl-modal-responsive .grid-2 {
      grid-template-columns: 1fr !important;
    }
  }
`
