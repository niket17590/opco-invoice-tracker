import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const fmt = n => `$${parseFloat(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function ShareView() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [settings, setSettings] = useState(null)

  useEffect(() => { load() }, [token])

  async function load() {
    // Look up user from share token
    const { data: tokenData } = await supabase
      .rpc('get_user_by_share_token', { p_token: token })

    if (!tokenData?.length || !tokenData[0].sharing_enabled) {
      setError('This link is not active or has been disabled.')
      setLoading(false)
      return
    }

    const userId = tokenData[0].user_id

    const [{ data: st }, { data: inv }] = await Promise.all([
      supabase.from('settings').select('company_name,hst_number,address,email,phone').eq('user_id', userId).single(),
      supabase.from('invoices').select('*').eq('user_id', userId).order('invoice_date', { ascending: false }),
    ])

    setSettings(st)
    setInvoices(inv || [])
    setLoading(false)
  }

  if (loading) return (
    <div style={s.center}>
      <div style={s.spinner} />
    </div>
  )

  if (error) return (
    <div style={s.center}>
      <div style={s.errorBox}>{error}</div>
    </div>
  )

  const ytd = invoices.reduce((sum, i) => sum + +i.subtotal, 0)
  const outstanding = invoices.filter(i => i.status === 'sent').reduce((sum, i) => sum + +i.total, 0)

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.logo}>R</div>
          </div>
          <div>
            <h1 style={s.company}>{settings?.company_name || 'Invoice Summary'}</h1>
            {settings?.hst_number && <p style={s.meta}>HST# {settings.hst_number}</p>}
            {settings?.address && <p style={s.meta}>{settings.address}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={s.meta}>Shared invoice summary</p>
            <p style={s.meta}>{new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long' })}</p>
          </div>
        </div>

        {/* KPIs */}
        <div style={s.kpiRow}>
          <div style={s.kpi}>
            <div style={s.kpiLabel}>Total Invoiced</div>
            <div style={s.kpiVal}>{fmt(ytd)}</div>
          </div>
          <div style={s.kpi}>
            <div style={s.kpiLabel}>Outstanding</div>
            <div style={{ ...s.kpiVal, color: '#b06820' }}>{fmt(outstanding)}</div>
          </div>
          <div style={s.kpi}>
            <div style={s.kpiLabel}>Invoices</div>
            <div style={s.kpiVal}>{invoices.length}</div>
          </div>
          <div style={s.kpi}>
            <div style={s.kpiLabel}>Paid</div>
            <div style={{ ...s.kpiVal, color: '#2a7a48' }}>
              {fmt(invoices.filter(i => i.status === 'paid').reduce((s, i) => s + +i.total, 0))}
            </div>
          </div>
        </div>

        {/* Invoice table */}
        <div style={s.card}>
          <div style={s.cardTitle}>Invoice History</div>
          <div style={s.tHead}>
            <span style={s.th}>Invoice #</span>
            <span style={s.th}>Date</span>
            <span style={s.th}>Due</span>
            <span style={{ ...s.th, textAlign: 'right' }}>Amount</span>
            <span style={{ ...s.th, textAlign: 'right' }}>Status</span>
          </div>
          {invoices.map(inv => (
            <div key={inv.id} style={s.tRow}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#a89e90' }}>{inv.invoice_number}</span>
              <span style={{ fontSize: 12, color: '#5a7a6a' }}>{fmtDate(inv.invoice_date)}</span>
              <span style={{ fontSize: 12, color: '#5a7a6a' }}>{fmtDate(inv.due_date)}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, color: '#2d5a45', fontVariantNumeric: 'tabular-nums' }}>{fmt(inv.total)}</span>
              <span style={{ textAlign: 'right' }}>
                <span style={{ ...s.pill, ...(s[`pill_${inv.status}`] || {}) }}>{inv.status}</span>
              </span>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#c0b8ac', marginTop: 32 }}>
          This is a read-only shared view. For queries, contact the invoice issuer directly.
        </p>
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f0ece4', fontFamily: 'Inter, sans-serif' },
  container: { maxWidth: 800, margin: '0 auto', padding: '40px 24px' },
  center: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' },
  spinner: { width: 32, height: 32, border: '2px solid #e8e2d8', borderTopColor: '#2d5a45', borderRadius: '50%', animation: 'spin 0.7s linear infinite' },
  errorBox: { background: '#fdecea', border: '1px solid #f5c0bc', borderRadius: 10, padding: '16px 24px', color: '#c0392b', fontSize: 14 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, background: '#fff', border: '1px solid #e8e2d8', borderRadius: 12, padding: '24px 28px', marginBottom: 16, boxShadow: '0 1px 3px rgba(45,90,69,0.06)' },
  logo: { width: 48, height: 48, background: '#2d5a45', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Sora, sans-serif', fontSize: 20, fontWeight: 700, color: '#fff' },
  company: { fontFamily: 'Sora, sans-serif', fontSize: 18, fontWeight: 700, color: '#1a2e22', marginBottom: 4 },
  meta: { fontSize: 12, color: '#a89e90', lineHeight: 1.6 },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 },
  kpi: { background: '#fff', border: '1px solid #e8e2d8', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 3px rgba(45,90,69,0.06)' },
  kpiLabel: { fontSize: 10, fontWeight: 600, color: '#a89e90', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 },
  kpiVal: { fontFamily: 'Sora, sans-serif', fontSize: 20, fontWeight: 700, color: '#1a2e22', letterSpacing: '-0.02em' },
  card: { background: '#fff', border: '1px solid #e8e2d8', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(45,90,69,0.06)' },
  cardTitle: { fontSize: 10, fontWeight: 600, color: '#a89e90', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 20px', borderBottom: '1px solid #f0ece4' },
  tHead: { display: 'grid', gridTemplateColumns: '120px 1fr 1fr 120px 80px', gap: 8, padding: '8px 20px', background: '#faf8f4', borderBottom: '1px solid #e8e2d8' },
  th: { fontSize: 10, fontWeight: 600, color: '#a89e90', letterSpacing: '0.08em', textTransform: 'uppercase' },
  tRow: { display: 'grid', gridTemplateColumns: '120px 1fr 1fr 120px 80px', gap: 8, padding: '11px 20px', borderBottom: '1px solid #f5f2ec', alignItems: 'center' },
  pill: { display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 99 },
  pill_paid: { background: '#e8f5ec', color: '#2a7a48', border: '1px solid #b8ddc8' },
  pill_sent: { background: '#fef3e2', color: '#9a6010', border: '1px solid #f0d8a0' },
  pill_draft: { background: '#f5f2ec', color: '#8a8070', border: '1px solid #e0dbd0' },
}
