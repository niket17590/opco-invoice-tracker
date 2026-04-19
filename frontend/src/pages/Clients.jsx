import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PageShell from '../components/layout/PageShell'
import { Button } from '../components/ui'

const EMPTY = {
  name: '',
  address: '',
  phone: '',
  email: '',
  consulting_client: '',
  payment_terms_days: 15,
  hourly_rate: '',
}

export default function Clients() {
  const { user } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('clients').select('*')
      .eq('user_id', user.id).eq('is_active', true)
      .order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  function openAdd() {
    setEditId(null); setForm(EMPTY); setError(null); setShowModal(true)
  }

  function openEdit(c) {
    setEditId(c.id)
    setForm({
      name: c.name,
      address: c.address,
      phone: c.phone,
      email: c.email,
      consulting_client: c.consulting_client,
      payment_terms_days: c.payment_terms_days,
      hourly_rate: c.hourly_rate,
    })
    setError(null)
    setShowModal(true)
  }

  function close() {
    setShowModal(false); setEditId(null); setForm(EMPTY); setError(null)
  }

  async function save() {
    if (!form.name.trim()) { setError('Client name is required.'); return }
    if (!form.hourly_rate || isNaN(+form.hourly_rate)) { setError('Hourly rate is required.'); return }
    setSaving(true); setError(null)
    const payload = {
      ...form,
      hourly_rate: +form.hourly_rate,
      payment_terms_days: +form.payment_terms_days,
      user_id: user.id,
    }
    const { error: e } = editId
      ? await supabase.from('clients').update(payload).eq('id', editId)
      : await supabase.from('clients').insert(payload)
    setSaving(false)
    if (e) { setError(e.message); return }
    close(); load()
  }

  async function deactivate(id) {
    if (!confirm('Remove this client? Existing invoices are kept.')) return
    await supabase.from('clients').update({ is_active: false }).eq('id', id)
    load()
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <PageShell
      crumb="Rapidmatix"
      title="Clients"
      actions={<Button variant="primary" onClick={openAdd}>+ Add Client</Button>}
    >
      {loading ? (
        <div className="spinnerWrap"><div className="spinner" /></div>
      ) : clients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          No clients yet. Add your first client to start creating invoices.
        </div>
      ) : clients.map(c => (
        <div key={c.id} style={s.row}>
          <div style={s.left}>
            <div style={s.av}>{initials(c.name)}</div>
            <div>
              <div style={s.name}>{c.name}</div>
              {c.address && <div style={s.meta}>{c.address}</div>}
              <div style={s.meta}>
                {c.consulting_client && (
                  <span>Consulting: <strong style={{ color: 'var(--text-secondary)' }}>{c.consulting_client}</strong> · </span>
                )}
                Net {c.payment_terms_days} days
                {c.phone && ` · ${c.phone}`}
              </div>
            </div>
          </div>
          <div style={s.right}>
            <div style={s.rate}>${parseFloat(c.hourly_rate).toFixed(2)}</div>
            <div style={s.rateLabel}>per hour</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>Edit</Button>
              <Button variant="danger" size="sm" onClick={() => deactivate(c.id)}>Remove</Button>
            </div>
          </div>
        </div>
      ))}

      {showModal && (
        <div style={s.overlay} onClick={close}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.mHead}>
              <span style={s.mTitle}>{editId ? 'Edit Client' : 'New Client'}</span>
              <button style={s.xBtn} onClick={close}>✕</button>
            </div>

            <div style={s.g2}>
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

            <div style={s.g2}>
              <Field label="Phone">
                <input className="fi" value={form.phone} onChange={set('phone')} />
              </Field>
              <Field label="Email">
                <input className="fi" value={form.email} onChange={set('email')} type="email" />
              </Field>
            </div>

            <div style={s.g2}>
              <Field label="Hourly rate ($) *">
                <input className="fi" value={form.hourly_rate} onChange={set('hourly_rate')} type="number" min="0" step="0.01" />
              </Field>
              <Field label="Payment terms (days)">
                <input className="fi" value={form.payment_terms_days} onChange={set('payment_terms_days')} type="number" min="1" />
              </Field>
            </div>

            {error && <div style={s.errBox}>{error}</div>}

            <div style={s.mFoot}>
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

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const s = {
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--white)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '18px 22px',
    marginBottom: 10, gap: 16,
    boxShadow: 'var(--shadow-sm)',
  },
  left: { display: 'flex', alignItems: 'center', gap: 16, flex: 1 },
  av: {
    width: 44, height: 44, borderRadius: 10,
    background: 'var(--sage-pale)', border: '1.5px solid var(--green-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 15, fontWeight: 700, color: 'var(--sage-dark)',
    fontFamily: 'Sora, sans-serif', flexShrink: 0,
  },
  name: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 },
  meta: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.6 },
  right: { textAlign: 'right', flexShrink: 0 },
  rate: {
    fontFamily: 'Sora, sans-serif', fontSize: 22, fontWeight: 700,
    color: 'var(--sage-dark)', letterSpacing: '-0.02em',
  },
  rateLabel: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2 },
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(26,46,34,0.38)',
    backdropFilter: 'blur(3px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'var(--white)', borderRadius: 14, padding: '28px 32px',
    width: '100%', maxWidth: 560,
    boxShadow: '0 24px 64px rgba(26,46,34,0.18)',
    border: '1px solid var(--border)',
  },
  mHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  mTitle: { fontFamily: 'Sora, sans-serif', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' },
  xBtn: {
    background: 'none', border: 'none', width: 32, height: 32,
    borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, color: 'var(--text-muted)', cursor: 'pointer',
  },
  g2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  errBox: {
    background: 'var(--red-pale)', border: '1px solid #f5c0bc',
    borderRadius: 8, padding: '10px 14px', fontSize: 13,
    color: 'var(--red-text)', marginBottom: 16,
  },
  mFoot: {
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    marginTop: 20, paddingTop: 18,
    borderTop: '1px solid var(--border-light)',
  },
}
