import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, StatusBadge, Spinner } from '../components/ui'
import PageShell from '../components/layout/PageShell'

const fmt = n => `$${parseFloat(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const FILTERS = ['all', 'draft', 'sent', 'paid']

export default function Invoices() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [updating, setUpdating] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select(`*, clients(name)`)
      .eq('user_id', user.id)
      .order('invoice_date', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  async function updateStatus(id, status) {
    setUpdating(id)
    await supabase.from('invoices').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setUpdating(null)
    load()
  }

  const visible = filter === 'all' ? invoices : invoices.filter(i => i.status === filter)

  return (
    <PageShell
      crumb="Rapidmatix"
      title="Invoices"
      actions={<Button variant="primary" onClick={() => navigate('/invoices/new')}>+ New Invoice</Button>}
    >
      {/* Filter tabs */}
      <div style={s.tabs}>
        {FILTERS.map(f => (
          <button
            key={f}
            style={{ ...s.tab, ...(filter === f ? s.tabActive : {}) }}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span style={{ ...s.tabCount, background: filter === f ? 'var(--sage-pale)' : 'var(--linen)' }}>
              {f === 'all' ? invoices.length : invoices.filter(i => i.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          {filter === 'all' ? 'No invoices yet.' : `No ${filter} invoices.`}
        </div>
      ) : (
        <div style={s.table}>
          <div style={s.tHead}>
            <span style={s.th}>Invoice #</span>
            <span style={s.th}>Client</span>
            <span style={s.th}>Issued</span>
            <span style={s.th}>Due</span>
            <span style={{ ...s.th, textAlign: 'right' }}>Amount</span>
            <span style={{ ...s.th, textAlign: 'right' }}>Status</span>
            <span style={{ ...s.th, textAlign: 'right' }}>Actions</span>
          </div>

          {visible.map(inv => (
            <div key={inv.id} style={s.tRow}>
              <span
                style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => navigate(`/invoices/${inv.id}`)}
              >
                {inv.invoice_number}
              </span>
              <span
                style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer' }}
                onClick={() => navigate(`/invoices/${inv.id}`)}
              >
                {inv.clients?.name || '—'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(inv.invoice_date)}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(inv.due_date)}</span>
              <span style={{ textAlign: 'right', fontFamily: 'Sora, sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--sage-dark)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(inv.total)}
              </span>
              <span style={{ textAlign: 'right' }}>
                <StatusBadge status={inv.status} />
              </span>
              <span style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                {inv.status === 'draft' && (
                  <Button variant="ghost" size="sm" disabled={updating === inv.id} onClick={() => updateStatus(inv.id, 'sent')}>
                    Mark Sent
                  </Button>
                )}
                {inv.status === 'sent' && (
                  <Button variant="ghost" size="sm" disabled={updating === inv.id} onClick={() => updateStatus(inv.id, 'paid')}>
                    Mark Paid
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  View
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}

const s = {
  tabs: { display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 },
  tab: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'none', border: 'none', padding: '8px 14px',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    color: 'var(--text-muted)', borderBottom: '2px solid transparent',
    marginBottom: -1, transition: 'all 0.12s', fontFamily: 'Inter, sans-serif',
    borderRadius: '6px 6px 0 0',
  },
  tabActive: { color: 'var(--sage-dark)', borderBottomColor: 'var(--sage-dark)' },
  tabCount: { fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, color: 'var(--text-muted)' },
  table: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' },
  tHead: { display: 'grid', gridTemplateColumns: '112px 1fr 90px 90px 110px 80px 160px', gap: 8, padding: '10px 16px', background: 'var(--linen-mid)', borderBottom: '1px solid var(--border)' },
  th: { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' },
  tRow: {
    display: 'grid', gridTemplateColumns: '112px 1fr 90px 90px 110px 80px 160px', gap: 8,
    padding: '12px 16px', borderBottom: '1px solid var(--border-light)', alignItems: 'center',
  },
}
