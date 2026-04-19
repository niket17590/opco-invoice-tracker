import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, StatusBadge, Spinner } from '../components/ui'
import PageShell from '../components/layout/PageShell'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt = n => `$${parseFloat(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState([])
  const [hstRate, setHstRate] = useState(13)
  const year = new Date().getFullYear()

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: inv }, { data: settings }] = await Promise.all([
      supabase.from('invoices').select('*').eq('user_id', user.id).eq('invoice_year', year).order('invoice_date', { ascending: false }),
      supabase.from('settings').select('hst_rate').eq('user_id', user.id).single(),
    ])
    setInvoices(inv || [])
    if (settings?.hst_rate) setHstRate(+settings.hst_rate)
    setLoading(false)
  }

  if (loading) return <PageShell crumb="Rapidmatix" title="Dashboard"><Spinner /></PageShell>

  // ── Computed stats ──
  const paid     = invoices.filter(i => i.status === 'paid')
  const sent     = invoices.filter(i => i.status === 'sent')
  const ytd      = invoices.reduce((sum, i) => sum + +i.subtotal, 0)
  const hstColl  = invoices.filter(i => i.status !== 'draft').reduce((sum, i) => sum + +i.hst_amount, 0)
  const outstanding = sent.reduce((sum, i) => sum + +i.total, 0)

  // Monthly subtotals
  const monthly = Array(12).fill(0)
  invoices.forEach(i => {
    const m = new Date(i.invoice_date).getMonth()
    monthly[m] += +i.subtotal
  })
  const maxBar = Math.max(...monthly, 1)
  const curMonth = new Date().getMonth()

  const recent = invoices.slice(0, 5)

  return (
    <PageShell
      crumb="Rapidmatix"
      title="Dashboard"
      actions={<Button variant="primary" onClick={() => navigate('/invoices/new')}>+ New Invoice</Button>}
    >
      {/* KPI strip */}
      <div style={s.kpiRow}>
        <KPI label="YTD Revenue" value={fmt(ytd)} sub={`${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`} hero />
        <KPI label="HST Collected" value={fmt(hstColl)} sub="to remit to CRA" accent="amber" />
        <KPI label="Outstanding" value={fmt(outstanding)} sub={`${sent.length} awaiting payment`} />
        <KPI label="Paid" value={fmt(paid.reduce((s, i) => s + +i.total, 0))} sub={`${paid.length} invoices`} accent="green" />
      </div>

      {/* Chart + HST */}
      <div style={s.mid}>
        <div style={s.card}>
          <div style={s.cardHd}>Monthly billings — {year}</div>
          <div style={s.bars}>
            {monthly.map((val, i) => (
              <div key={i} style={s.bGroup}>
                <div style={{
                  ...s.bar,
                  height: `${Math.max(4, (val / maxBar) * 80)}px`,
                  background: i === curMonth
                    ? 'var(--sage-dark)'
                    : val > 0 ? 'var(--sage-light)' : 'var(--linen-dark)',
                  opacity: i > curMonth && val === 0 ? 0.4 : 1,
                }} />
                <span style={s.bLabel}>{MONTHS[i]}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardHd}>HST Summary</div>
          {[
            ['Net invoiced', fmt(ytd)],
            [`HST @ ${hstRate}%`, fmt(hstColl)],
            ['Total billed', fmt(ytd + hstColl)],
            ['Collected (paid)', fmt(paid.reduce((s,i) => s + +i.hst_amount, 0)), 'var(--green-text)'],
            ['Pending', fmt(sent.reduce((s,i) => s + +i.hst_amount, 0)), 'var(--amber)'],
          ].map(([label, val, color]) => (
            <div key={label} style={s.hRow}>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: color || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent invoices */}
      <div style={s.card}>
        <div style={{ ...s.cardHd, marginBottom: 12 }}>Recent invoices</div>
        {recent.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
            No invoices yet — create your first one.
          </p>
        ) : (
          <>
            <div style={s.tHead}>
              {['Invoice #','Client','Issued','Due','Amount','Status'].map(h => (
                <span key={h} style={{ ...s.th, textAlign: h === 'Amount' || h === 'Status' ? 'right' : 'left' }}>{h}</span>
              ))}
            </div>
            {recent.map(inv => (
              <div key={inv.id} style={s.tRow} onClick={() => navigate(`/invoices/${inv.id}`)}>
                <span style={{ ...s.tc, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{inv.invoice_number}</span>
                <span style={{ ...s.tc, fontWeight: 500, color: 'var(--text-primary)' }}>{inv.client_name || '—'}</span>
                <span style={s.tc}>{fmtDate(inv.invoice_date)}</span>
                <span style={s.tc}>{fmtDate(inv.due_date)}</span>
                <span style={{ ...s.tc, textAlign: 'right', fontWeight: 600, color: 'var(--sage-dark)', fontFamily: 'Sora, sans-serif', fontVariantNumeric: 'tabular-nums' }}>{fmt(inv.total)}</span>
                <span style={{ textAlign: 'right' }}><StatusBadge status={inv.status} /></span>
              </div>
            ))}
          </>
        )}
      </div>
    </PageShell>
  )
}

function KPI({ label, value, sub, hero, accent }) {
  const bg = hero ? 'var(--sage-dark)' : 'var(--white)'
  const valColor = hero ? '#fff'
    : accent === 'amber' ? 'var(--amber)'
    : accent === 'green' ? 'var(--green-text)'
    : 'var(--text-primary)'
  const labelColor = hero ? 'var(--sage-light)' : 'var(--text-muted)'
  const subColor = hero ? '#9fc8b0' : 'var(--text-muted)'
  return (
    <div style={{ background: bg, border: `1px solid ${hero ? 'var(--sage-dark)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', padding: '16px 18px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: labelColor, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'Sora, sans-serif', fontSize: 22, fontWeight: 700, color: valColor, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: subColor, marginTop: 5 }}>{sub}</div>
    </div>
  )
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

const s = {
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 },
  mid: { display: 'grid', gridTemplateColumns: '1fr 256px', gap: 12, marginBottom: 12 },
  card: { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', boxShadow: 'var(--shadow-sm)' },
  cardHd: { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 },
  bars: { display: 'flex', alignItems: 'flex-end', gap: 5, height: 88 },
  bGroup: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 },
  bar: { width: '100%', borderRadius: '3px 3px 0 0', transition: 'height 0.2s' },
  bLabel: { fontSize: 9, color: 'var(--text-muted)', fontWeight: 500 },
  hRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border-light)' },
  tHead: { display: 'grid', gridTemplateColumns: '110px 1fr 72px 72px 100px 72px', gap: 8, padding: '0 4px 8px', borderBottom: '1px solid var(--border)' },
  th: { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' },
  tRow: { display: 'grid', gridTemplateColumns: '110px 1fr 72px 72px 100px 72px', gap: 8, padding: '10px 4px', borderBottom: '1px solid var(--border-light)', alignItems: 'center', cursor: 'pointer', borderRadius: 6, transition: 'background 0.1s' },
  tc: { fontSize: 12, color: 'var(--text-secondary)' },
}
