import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, StatusBadge, Spinner } from '../components/ui'
import PageShell from '../components/layout/PageShell'

const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt     = n => `$${parseFloat(n||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmtK    = n => { const v = parseFloat(n||0); return v >= 1000 ? `$${(v/1000).toFixed(1)}k` : fmt(v) }
const fmtDFull= d => d ? new Date(d+'T12:00:00').toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'}) : '—'
const curYear = new Date().getFullYear()
const curMon  = new Date().getMonth()

// For paid invoices: use due_date as payment_received_date
// For other invoices: use invoice_date
function getEffectiveDate(inv) {
  if (inv.status === 'paid' && inv.due_date) return inv.due_date
  return inv.invoice_date
}
function getEffectiveYear(inv) {
  return new Date(getEffectiveDate(inv) + 'T12:00:00').getFullYear()
}
function getEffectiveMonth(inv) {
  return new Date(getEffectiveDate(inv) + 'T12:00:00').getMonth()
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading]         = useState(true)
  const [allInvoices, setAllInvoices] = useState([])
  const [clients, setClients]         = useState([])
  const [hstRate, setHstRate]         = useState(13)
  const [selYear, setSelYear]         = useState(curYear)
  const [animKey, setAnimKey]         = useState(0)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: inv }, { data: cl }, { data: st }] = await Promise.all([
      supabase.from('invoices')
        .select('*, clients(name)')
        .eq('user_id', user.id)
        .order('invoice_date', { ascending: false }),
      supabase.from('clients').select('id, name, hourly_rate').eq('user_id', user.id),
      supabase.from('settings').select('hst_rate').eq('user_id', user.id).single(),
    ])
    setAllInvoices(inv || [])
    setClients(cl || [])
    if (st?.hst_rate) setHstRate(+st.hst_rate)
    setLoading(false)
  }

  if (loading) return <PageShell crumb="Rapidmatix" title="Dashboard"><Spinner /></PageShell>

  // ── All-time stats ───────────────────────────────────────
  // Revenue = subtotal (before HST) across all invoices
  const lifetimeRev   = allInvoices.reduce((s,i) => s + +i.subtotal, 0)
  // HST collected = only from non-draft invoices
  const lifetimeHST   = allInvoices.filter(i=>i.status!=='draft').reduce((s,i)=>s+(+i.hst_amount),0)
  const lifetimeCount = allInvoices.length
  const paidInvoices  = allInvoices.filter(i=>i.status==='paid')
  // FIXED: "Collected" = sum of total (subtotal + HST) for paid invoices
  const lifetimePaid  = paidInvoices.reduce((s,i)=>s+(+i.total),0)
  const avgInvoice    = lifetimeCount ? lifetimeRev / lifetimeCount : 0

  // ── Selected-year stats ──────────────────────────────────
  // For paid invoices: year is determined by payment_received_date (due_date)
  // For others: by invoice_date
  const yearInvoices   = allInvoices.filter(i => getEffectiveYear(i) === selYear)
  const ytdRev         = yearInvoices.reduce((s,i)=>s+(+i.subtotal),0)
  const ytdHST         = yearInvoices.filter(i=>i.status!=='draft').reduce((s,i)=>s+(+i.hst_amount),0)
  // FIXED: Collected = total (with HST) for paid invoices in this year
  const ytdCollected   = yearInvoices.filter(i=>i.status==='paid').reduce((s,i)=>s+(+i.total),0)
  const ytdOutstanding = yearInvoices.filter(i=>i.status==='sent').reduce((s,i)=>s+(+i.total),0)
  const ytdPaidCount   = yearInvoices.filter(i=>i.status==='paid').length

  // ── Stacked monthly bars ─────────────────────────────────
  // paidByMonth: indexed by effective month of paid invoices (payment_received_date)
  // outstandingByMonth: indexed by invoice_date month for sent invoices
  const paidByMonth        = Array(12).fill(0)
  const outstandingByMonth = Array(12).fill(0)

  yearInvoices.forEach(inv => {
    if (inv.status === 'paid') {
      paidByMonth[getEffectiveMonth(inv)] += +inv.subtotal
    } else if (inv.status === 'sent') {
      outstandingByMonth[new Date(inv.invoice_date+'T12:00:00').getMonth()] += +inv.subtotal
    } else if (inv.status === 'draft') {
      outstandingByMonth[new Date(inv.invoice_date+'T12:00:00').getMonth()] += +inv.subtotal
    }
  })

  const maxBar = Math.max(...paidByMonth.map((p,i) => p + outstandingByMonth[i]), 1)

  // ── Year list from data (using effective date) ───────────
  const years = [...new Set(allInvoices.map(i => getEffectiveYear(i)))].sort((a,b)=>b-a)

  // ── Year-over-year (same-period fair comparison) ─────────
  const now     = new Date()
  const todayMD = now.getMonth() * 100 + now.getDate()

  const yoyData = [...years].reverse().slice(-4).map(y => {
    const inv = allInvoices.filter(i => {
      const effYear = getEffectiveYear(i)
      if (effYear !== y) return false
      const d  = new Date(getEffectiveDate(i) + 'T12:00:00')
      const md = d.getMonth() * 100 + d.getDate()
      return md <= todayMD
    })
    return {
      year: y,
      rev:   inv.reduce((s,i) => s + +i.subtotal, 0),
      paid:  inv.filter(i=>i.status==='paid').reduce((s,i)=>s+(+i.subtotal),0),
      count: inv.length,
      isCurrent: y === curYear,
    }
  })
  const maxYoy = Math.max(...yoyData.map(d=>d.rev), 1)

  // ── Client breakdown ─────────────────────────────────────
  const clientBreakdown = clients.map(cl => {
    const inv = allInvoices.filter(i => i.client_id === cl.id)
    return {
      name: cl.name, rate: cl.hourly_rate,
      rev:  inv.reduce((s,i)=>s+(+i.subtotal),0),
      count: inv.length,
      // FIXED: paid = sum of total (with HST) for paid invoices
      paid: inv.filter(i=>i.status==='paid').reduce((s,i)=>s+(+i.total),0),
    }
  }).sort((a,b)=>b.rev-a.rev)
  const totalClientRev = clientBreakdown.reduce((s,c)=>s+c.rev,0) || 1

  // ── Growth callout ────────────────────────────────────────
  let growthEl = null
  if (yoyData.length >= 2) {
    const latest = yoyData[yoyData.length-1]
    const prev   = yoyData[yoyData.length-2]
    const pct    = prev.rev > 0 ? ((latest.rev - prev.rev) / prev.rev * 100) : 0
    const up     = pct >= 0
    const todayLabel = now.toLocaleDateString('en-CA',{month:'short',day:'numeric'})
    growthEl = (
      <div style={{marginTop:16,padding:'11px 14px',background:up?'#f0faf4':'#fdf5ec',borderRadius:8,border:`1px solid ${up?'#c8e6d4':'#f5d8a8'}`}}>
        <div style={{fontSize:10,fontWeight:700,color:up?'#2d5a45':'#c07820',letterSpacing:'.06em',marginBottom:2}}>
          {up?'▲':'▼'} {Math.abs(pct).toFixed(1)}% vs same period {prev.year}
        </div>
        <div style={{fontSize:11,color:'#7a8070'}}>
          {up
            ? `+${fmt(latest.rev-prev.rev)} ahead of where you were on ${todayLabel} last year`
            : `${fmt(prev.rev-latest.rev)} behind where you were on ${todayLabel} last year`}
        </div>
      </div>
    )
  }

  function switchYear(y) { setSelYear(y); setAnimKey(k=>k+1) }

  return (
    <PageShell
      crumb="Rapidmatix" title="Dashboard"
      actions={<Button variant="primary" onClick={() => navigate('/invoices/new')}>+ New Invoice</Button>}
    >
      <style>{CSS}</style>

      {/* ── Lifetime KPIs ── */}
      <div className="db-kpi-grid">
        <div className="db-kpi-card db-kpi-hero">
          <div className="db-kpi-label" style={{color:'#9fc8b0'}}>Lifetime Revenue</div>
          <div className="db-kpi-val" style={{color:'#fff'}}>{fmt(lifetimeRev)}</div>
          <div className="db-kpi-sub" style={{color:'#9fc8b0'}}>{lifetimeCount} invoices total</div>
        </div>
        <div className="db-kpi-card">
          <div className="db-kpi-label">HST Collected</div>
          <div className="db-kpi-val" style={{color:'#c07820'}}>{fmt(lifetimeHST)}</div>
          <div className="db-kpi-sub">all time · to remit to CRA</div>
        </div>
        <div className="db-kpi-card">
          <div className="db-kpi-label">Total Paid (incl. HST)</div>
          <div className="db-kpi-val" style={{color:'#2d5a45'}}>{fmt(lifetimePaid)}</div>
          <div className="db-kpi-sub">{paidInvoices.length} paid invoices</div>
        </div>
        <div className="db-kpi-card">
          <div className="db-kpi-label">Avg Invoice Value</div>
          <div className="db-kpi-val" style={{color:'#5a4a3a'}}>{fmt(avgInvoice)}</div>
          <div className="db-kpi-sub">before HST</div>
        </div>
      </div>

      {/* ── Chart + Year summary ── */}
      <div className="db-mid-grid">

        {/* Stacked bar chart */}
        <div className="db-card">
          <div className="db-chart-top">
            <div>
              <div className="db-card-title">Monthly Revenue — {selYear}</div>
              <div style={{fontSize:11,color:'#9a9080',marginTop:2}}>
                {selYear===curYear ? `YTD: ${fmt(ytdRev)}` : `Full year: ${fmt(ytdRev)}`}
              </div>
              {/* Legend */}
              <div style={{display:'flex',gap:12,marginTop:6}}>
                <div style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'#7a8070'}}>
                  <div style={{width:10,height:10,borderRadius:2,background:'#2d5a45',flexShrink:0}}/>
                  Paid (by receipt date)
                </div>
                <div style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'#7a8070'}}>
                  <div style={{width:10,height:10,borderRadius:2,background:'#c8e0d0',flexShrink:0}}/>
                  Sent / Draft
                </div>
              </div>
            </div>
            <div className="db-year-tabs">
              {years.map(y => (
                <button key={y} className={`db-year-tab${selYear===y?' active':''}`} onClick={() => switchYear(y)}>{y}</button>
              ))}
            </div>
          </div>

          <div className="db-bars-wrap" key={animKey}>
            {paidByMonth.map((paidVal, i) => {
              const outVal  = outstandingByMonth[i]
              const total   = paidVal + outVal
              const isActive= selYear===curYear && i===curMon
              const paidH   = Math.max(0, (paidVal/maxBar)*72)
              const outH    = Math.max(0, (outVal/maxBar)*72)
              const totalH  = Math.max(total > 0 ? 3 : 0, paidH + outH)

              return (
                <div key={i} className="db-bar-col">
                  <div className="db-bar-stack-wrap">
                    {/* Stacked bar: outstanding on top, paid on bottom */}
                    <div className="db-bar-stack" style={{height:`${totalH}px`, opacity: isActive ? 1 : 0.85}}>
                      {outH > 0 && (
                        <div
                          className="db-bar-segment db-bar-anim"
                          style={{
                            height:`${outH}px`,
                            background: '#c8e0d0',
                            animationDelay:`${i*30}ms`,
                          }}
                        />
                      )}
                      {paidH > 0 && (
                        <div
                          className="db-bar-segment db-bar-anim"
                          style={{
                            height:`${paidH}px`,
                            background: isActive ? '#1a3a2a' : '#2d5a45',
                            animationDelay:`${i*30}ms`,
                          }}
                        />
                      )}
                      {total === 0 && (
                        <div style={{height:3,background:'#e8e4dc',borderRadius:'2px 2px 0 0'}}/>
                      )}
                    </div>
                  </div>
                  <div className="db-bar-lbl">{MONTHS[i]}</div>
                  {total > 0 && <div className="db-bar-amt">{fmtK(total)}</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Year summary */}
        <div className="db-card">
          <div className="db-card-title">{selYear} Summary</div>
          {[
            ['Invoices',              `${yearInvoices.length} total`,  ''],
            ['Paid',                  `${ytdPaidCount} invoices`,      ''],
            ['Net Revenue',           fmt(ytdRev),                     '#2d5a45'],
            [`HST (${hstRate}%)`,     fmt(ytdHST),                     '#c07820'],
            ['Outstanding (incl. HST)', fmt(ytdOutstanding),           ytdOutstanding>0?'#c07820':'#9a9080'],
            ['Collected (incl. HST)', fmt(ytdCollected),               '#2d5a45'],
          ].map(([l,v,c]) => (
            <div key={l} className="db-hst-row">
              <span className="db-hst-lbl">{l}</span>
              <span className="db-hst-val" style={c?{color:c}:{}}>{v}</span>
            </div>
          ))}
          <div style={{marginTop:10,padding:'8px 10px',background:'var(--linen-mid)',borderRadius:6,fontSize:10,color:'var(--text-muted)',lineHeight:1.5}}>
            Collected = payments actually received (by bank date). Outstanding = invoices awaiting payment.
          </div>
        </div>
      </div>

      {/* ── Client breakdown + YoY ── */}
      <div className="db-bottom-grid">

        <div className="db-card">
          <div className="db-card-title">Revenue by Client — All Time</div>
          {clientBreakdown.map((cl, i) => (
            <div key={cl.name} style={{marginBottom: i < clientBreakdown.length-1 ? 18 : 0}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:5}}>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:'#1a2e22'}}>{cl.name}</div>
                  <div style={{fontSize:10,color:'#9a9080',marginTop:1}}>${cl.rate}/hr · {cl.count} invoice{cl.count!==1?'s':''}</div>
                </div>
                <div style={{fontFamily:"'Sora',sans-serif",fontSize:14,fontWeight:800,color:'#2d5a45'}}>{fmt(cl.rev)}</div>
              </div>
              <div style={{height:5,background:'#f0ece4',borderRadius:3,overflow:'hidden',marginBottom:4}}>
                <div style={{height:'100%',borderRadius:3,background: i===0?'#2d5a45':'#9fc8b0',width:`${(cl.rev/totalClientRev)*100}%`,transition:'width .6s cubic-bezier(.4,0,.2,1)'}} />
              </div>
              <div style={{fontSize:10,color:'#9a9080'}}>
                {Math.round((cl.rev/totalClientRev)*100)}% of revenue · {fmt(cl.paid)} collected
              </div>
            </div>
          ))}
        </div>

        <div className="db-card">
          <div className="db-card-title">Year-over-Year</div>
          {yoyData.map((d, i) => (
            <div key={d.year} style={{display:'flex',alignItems:'center',gap:12,marginBottom: i<yoyData.length-1?14:0}}>
              <div style={{fontSize:11,fontWeight:700,color:d.isCurrent?'#2d5a45':'#9a9080',width:48,flexShrink:0}}>{d.year}</div>
              <div style={{flex:1,height:10,background:'#f0ece4',borderRadius:3,overflow:'hidden',display:'flex'}}>
                {/* Stacked: paid (dark) + outstanding (light) */}
                <div style={{
                  height:'100%',
                  width:`${(d.paid/maxYoy)*100}%`,
                  background: d.isCurrent ? '#2d5a45' : `rgba(45,90,69,${0.3+i*0.18})`,
                  transition:'width .6s cubic-bezier(.4,0,.2,1)',
                }}/>
                <div style={{
                  height:'100%',
                  width:`${((d.rev-d.paid)/maxYoy)*100}%`,
                  background: '#c8e0d0',
                  transition:'width .6s cubic-bezier(.4,0,.2,1)',
                }}/>
              </div>
              <div style={{fontSize:11,fontWeight:700,color:'#1a2e22',width:68,textAlign:'right',flexShrink:0,fontVariantNumeric:'tabular-nums'}}>{fmtK(d.rev)}</div>
              <div style={{fontSize:10,color:'#b0a898',width:28,textAlign:'right',flexShrink:0}}>{d.count}×</div>
            </div>
          ))}
          {growthEl}
        </div>
      </div>

      {/* ── Recent invoices ── */}
      <div className="db-card" style={{padding:0,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid #f0ece4',flexWrap:'wrap',gap:8}}>
          <div className="db-card-title" style={{margin:0}}>Recent Invoices</div>
          <button style={{fontSize:11,fontWeight:600,color:'#2d5a45',cursor:'pointer',border:'none',background:'none',padding:0}} onClick={() => navigate('/invoices')}>View all →</button>
        </div>

        {/* Desktop table */}
        <div className="db-recent-desktop">
          <table className="tbl" style={{margin:0,border:'none',borderRadius:0}}>
            <thead>
              <tr>
                <th>Invoice #</th><th>Client</th><th>Issued</th><th>Pay Date</th>
                <th className="tc-right">Amount</th><th className="tc-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {allInvoices.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No invoices yet.</td></tr>
              ) : allInvoices.slice(0,6).map(inv => (
                <tr key={inv.id} className="clickable" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <td className="tc-mono">{inv.invoice_number}</td>
                  <td className="tc-bold">{inv.clients?.name||'—'}</td>
                  <td className="fs-12">{fmtDFull(inv.invoice_date)}</td>
                  <td className="fs-12">
                    {inv.status === 'paid' && inv.due_date
                      ? <span style={{color:'var(--green-text)',fontWeight:600}}>{fmtDFull(inv.due_date)}</span>
                      : <span style={{color:'var(--text-muted)'}}>—</span>}
                  </td>
                  <td className="tc-amt">{fmt(inv.total)}</td>
                  <td className="tc-right"><StatusBadge status={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile recent list */}
        <div className="db-recent-mobile">
          {allInvoices.slice(0,5).map(inv => (
            <div key={inv.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid #f5f2ec',cursor:'pointer',gap:12}} onClick={() => navigate(`/invoices/${inv.id}`)}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:'#1a2e22',marginBottom:2}}>{inv.clients?.name||'—'}</div>
                <div style={{fontSize:10,color:'#9a9080',fontFamily:'monospace'}}>{inv.invoice_number} · {fmtDFull(inv.invoice_date)}</div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontFamily:"'Sora',sans-serif",fontSize:13,fontWeight:700,color:'#2d5a45',marginBottom:4}}>{fmt(inv.total)}</div>
                <StatusBadge status={inv.status}/>
              </div>
            </div>
          ))}
        </div>
      </div>

    </PageShell>
  )
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@700;800&display=swap');

  @keyframes dbBarGrow {
    from { transform: scaleY(0); transform-origin: bottom; }
    to   { transform: scaleY(1); transform-origin: bottom; }
  }
  .db-bar-anim { animation: dbBarGrow .35s cubic-bezier(.4,0,.2,1) both; }

  /* KPI grid */
  .db-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 18px;
  }
  .db-kpi-card {
    background: #fff;
    border: 1px solid #e8e4dc;
    border-radius: 12px;
    padding: 14px 16px;
  }
  .db-kpi-card.db-kpi-hero { background: #2d5a45; border: none; }
  .db-kpi-label { font-size:10px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#9a9080; margin-bottom:8px; }
  .db-kpi-val   { font-family:"'Sora',sans-serif"; font-size:22px; font-weight:800; color:#1a2e22; line-height:1; }
  .db-kpi-sub   { font-size:11px; color:#9a9080; margin-top:5px; }

  /* Mid/bottom layout */
  .db-mid-grid    { display:grid; grid-template-columns:1fr 280px; gap:16px; margin-bottom:18px; }
  .db-bottom-grid { display:grid; grid-template-columns:1fr 1fr;   gap:16px; margin-bottom:18px; }
  .db-card { background:#fff; border:1px solid #e8e4dc; border-radius:12px; padding:20px 22px; }
  .db-card-title { font-family:"'Sora',sans-serif"; font-size:13px; font-weight:700; color:#1a2e22; margin-bottom:16px; }

  /* Chart */
  .db-chart-top { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:18px; gap:12px; flex-wrap:wrap; }
  .db-year-tabs { display:flex; gap:3; background:#f5f2ec; border-radius:8px; padding:3px; flex-shrink:0; }
  .db-year-tab  { font-size:11px; font-weight:600; color:#7a8070; padding:4px 10px; border-radius:6px; border:none; background:none; cursor:pointer; }
  .db-year-tab.active { background:#fff; color:#2d5a45; box-shadow:0 1px 4px rgba(0,0,0,.08); }

  /* Stacked bar */
  .db-bars-wrap { display:flex; align-items:flex-end; gap:5px; height:90px; }
  .db-bar-col   { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; }
  .db-bar-stack-wrap { width:100%; display:flex; align-items:flex-end; height:72px; }
  .db-bar-stack { width:100%; display:flex; flex-direction:column; justify-content:flex-end; }
  .db-bar-segment { width:100%; }
  .db-bar-segment:first-child { border-radius:3px 3px 0 0; }
  .db-bar-lbl { font-size:9px; color:#b0a898; font-weight:600; letter-spacing:.04em; }
  .db-bar-amt { font-size:8px; color:#7a8070; }

  /* Summary rows */
  .db-hst-row { display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid #f0ece4; }
  .db-hst-lbl { font-size:11px; color:#7a8070; }
  .db-hst-val { font-size:12px; font-weight:700; color:#1a2e22; font-variant-numeric:tabular-nums; }

  /* Recent table vs mobile */
  .db-recent-desktop { display:block; }
  .db-recent-mobile  { display:none; }

  /* ── RESPONSIVE ─────────────────────────────────────── */
  @media (max-width: 900px) {
    .db-mid-grid    { grid-template-columns: 1fr; }
    .db-bottom-grid { grid-template-columns: 1fr; }
  }

  @media (max-width: 600px) {
    .db-kpi-grid { grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:14px; }
    .db-kpi-val  { font-size:17px; }
    .db-card     { padding:14px 16px; }
    .db-recent-desktop { display:none; }
    .db-recent-mobile  { display:block; }
    .db-bars-wrap { gap:3px; }
    .db-bar-lbl   { font-size:8px; }
    .db-bar-amt   { display:none; }
  }

  @media (max-width: 380px) {
    .db-kpi-grid { grid-template-columns: 1fr; }
  }
`
