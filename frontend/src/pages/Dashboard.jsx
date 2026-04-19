import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, StatusBadge, Spinner } from '../components/ui'
import PageShell from '../components/layout/PageShell'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt    = n => `$${parseFloat(n||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmtD   = d => d ? new Date(d).toLocaleDateString('en-CA',{month:'short',day:'numeric'}) : '—'

export default function Dashboard() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [loading, setLoading]   = useState(true)
  const [invoices, setInvoices] = useState([])
  const [hstRate, setHstRate]   = useState(13)
  const year = new Date().getFullYear()

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: inv }, { data: st }] = await Promise.all([
      supabase.from('invoices')
        .select('*, clients(name)')
        .eq('user_id', user.id).eq('invoice_year', year)
        .order('invoice_date', { ascending: false }),
      supabase.from('settings').select('hst_rate').eq('user_id', user.id).single(),
    ])
    setInvoices(inv || [])
    if (st?.hst_rate) setHstRate(+st.hst_rate)
    setLoading(false)
  }

  if (loading) return <PageShell crumb="Rapidmatix" title="Dashboard"><Spinner /></PageShell>

  const paid    = invoices.filter(i => i.status === 'paid')
  const sent    = invoices.filter(i => i.status === 'sent')
  const ytd     = invoices.reduce((s, i) => s + +i.subtotal, 0)
  const hstColl = invoices.filter(i => i.status !== 'draft').reduce((s, i) => s + +i.hst_amount, 0)
  const outstanding = sent.reduce((s, i) => s + +i.total, 0)

  const monthly = Array(12).fill(0)
  invoices.forEach(i => { monthly[new Date(i.invoice_date).getMonth()] += +i.subtotal })
  const maxBar  = Math.max(...monthly, 1)
  const curMon  = new Date().getMonth()
  const recent  = invoices.slice(0, 5)

  return (
    <PageShell
      crumb="Rapidmatix" title="Dashboard"
      actions={<Button variant="primary" onClick={() => navigate('/invoices/new')}>+ New Invoice</Button>}
    >
      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card hero">
          <div className="kpi-label">YTD Revenue</div>
          <div className="kpi-value">{fmt(ytd)}</div>
          <div className="kpi-sub">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">HST Collected</div>
          <div className="kpi-value amber">{fmt(hstColl)}</div>
          <div className="kpi-sub">to remit to CRA</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Outstanding</div>
          <div className="kpi-value sage">{fmt(outstanding)}</div>
          <div className="kpi-sub">{sent.length} awaiting payment</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Paid</div>
          <div className="kpi-value green">{fmt(paid.reduce((s,i) => s + +i.total, 0))}</div>
          <div className="kpi-sub">{paid.length} invoices</div>
        </div>
      </div>

      {/* Chart + HST */}
      <div className="dash-mid">
        <div className="card">
          <div className="card-title">Monthly billings — {year}</div>
          <div className="bar-chart">
            {monthly.map((val, i) => (
              <div key={i} className="bar-col">
                <div
                  className={`bar-fill ${i === curMon ? 'current' : val > 0 ? 'done' : i > curMon ? 'future' : ''}`}
                  style={{ height: `${Math.max(4, (val / maxBar) * 72)}px` }}
                />
                <span className="bar-label">{MONTHS[i]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">HST Summary</div>
          {[
            ['Net invoiced',    fmt(ytd),             ''],
            [`HST @ ${hstRate}%`, fmt(hstColl),       ''],
            ['Total billed',   fmt(ytd + hstColl),    ''],
            ['Collected',      fmt(paid.reduce((s,i)=>s+(+i.hst_amount),0)), 'text-sage'],
            ['Pending',        fmt(sent.reduce((s,i)=>s+(+i.hst_amount),0)), 'amber'],
          ].map(([lbl, val, cls]) => (
            <div key={lbl} className="hst-row">
              <span className="hst-label">{lbl}</span>
              <span className={`hst-value ${cls}`}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent invoices */}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Invoice #</th><th>Client</th><th>Issued</th><th>Due</th>
              <th className="tc-right">Amount</th><th className="tc-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr><td colSpan="6" className="empty-state">No invoices yet — create your first one.</td></tr>
            ) : recent.map(inv => (
              <tr key={inv.id} className="clickable" onClick={() => navigate(`/invoices/${inv.id}`)}>
                <td className="tc-mono">{inv.invoice_number}</td>
                <td className="tc-bold">{inv.clients?.name || '—'}</td>
                <td>{fmtD(inv.invoice_date)}</td>
                <td>{fmtD(inv.due_date)}</td>
                <td className="tc-amt">{fmt(inv.total)}</td>
                <td className="tc-right"><StatusBadge status={inv.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
