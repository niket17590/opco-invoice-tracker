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
  const lifetimeRev   = allInvoices.reduce((s,i) => s + +i.subtotal, 0)
  const lifetimeHST   = allInvoices.filter(i=>i.status!=='draft').reduce((s,i)=>s+(+i.hst_amount),0)
  const lifetimeCount = allInvoices.length
  const paidInvoices  = allInvoices.filter(i=>i.status==='paid')
  const lifetimePaid  = paidInvoices.reduce((s,i)=>s+(+i.total),0)
  const avgInvoice    = lifetimeCount ? lifetimeRev / lifetimeCount : 0

  // ── Selected-year stats ──────────────────────────────────
  const yearInvoices   = allInvoices.filter(i => new Date(i.invoice_date+'T12:00:00').getFullYear() === selYear)
  const ytdRev         = yearInvoices.reduce((s,i)=>s+(+i.subtotal),0)
  const ytdHST         = yearInvoices.filter(i=>i.status!=='draft').reduce((s,i)=>s+(+i.hst_amount),0)
  const ytdPaid        = yearInvoices.filter(i=>i.status==='paid').reduce((s,i)=>s+(+i.total),0)
  const ytdOutstanding = yearInvoices.filter(i=>i.status==='sent').reduce((s,i)=>s+(+i.total),0)
  const ytdPaidCount   = yearInvoices.filter(i=>i.status==='paid').length

  // ── Monthly bars ─────────────────────────────────────────
  const monthly = Array(12).fill(0)
  yearInvoices.forEach(i => { monthly[new Date(i.invoice_date+'T12:00:00').getMonth()] += +i.subtotal })
  const maxBar  = Math.max(...monthly, 1)

  // ── Year list from data ──────────────────────────────────
  const years = [...new Set(allInvoices.map(i => new Date(i.invoice_date+'T12:00:00').getFullYear()))].sort((a,b)=>b-a)

  // ── Year-over-year ─────────────────────────────────────────
  // For the current year we only have partial data, so compare all years
  // on an equal footing: only count invoices up to today's month/day in each year.
  const now      = new Date()
  const todayMD  = now.getMonth() * 100 + now.getDate()  // e.g. 422 for Apr 22

  const yoyData = [...years].reverse().slice(-4).map(y => {
    const inv = allInvoices.filter(i => {
      const d = new Date(i.invoice_date + 'T12:00:00')
      if (d.getFullYear() !== y) return false
      // For past years, only count up to the same calendar point as today
      const md = d.getMonth() * 100 + d.getDate()
      return md <= todayMD
    })
    const isCurrent = y === curYear
    return {
      year: y,
      rev: inv.reduce((s,i) => s + +i.subtotal, 0),
      count: inv.length,
      isCurrent,
      label: isCurrent ? `${y} (to date)` : `${y} (Jan–${now.toLocaleString('en-CA',{month:'short'})} ${now.getDate()})`,
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
      paid: inv.filter(i=>i.status==='paid').reduce((s,i)=>s+(+i.total),0),
    }
  }).sort((a,b)=>b.rev-a.rev)
  const totalClientRev = clientBreakdown.reduce((s,c)=>s+c.rev,0) || 1

  // ── Growth callout (same-period comparison) ─────────────
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

  const S = styles

  return (
    <PageShell
      crumb="Rapidmatix" title="Dashboard"
      actions={<Button variant="primary" onClick={() => navigate('/invoices/new')}>+ New Invoice</Button>}
    >
      <style>{CSS}</style>

      {/* ── Lifetime KPIs ── */}
      <div style={S.ltGrid}>
        <div style={{...S.ltCard, ...S.ltHero}}>
          <div style={{...S.ltLabel, color:'#9fc8b0'}}>Lifetime Revenue</div>
          <div style={{...S.ltVal, color:'#fff'}}>{fmt(lifetimeRev)}</div>
          <div style={{...S.ltSub, color:'#9fc8b0'}}>{lifetimeCount} invoices total</div>
        </div>
        <div style={{...S.ltCard, '--accent':'#c07820'}}>
          <div style={S.ltLabel}>HST Collected</div>
          <div style={{...S.ltVal, color:'#c07820'}}>{fmt(lifetimeHST)}</div>
          <div style={S.ltSub}>all time · to remit to CRA</div>
        </div>
        <div style={{...S.ltCard, '--accent':'#2d5a45'}}>
          <div style={S.ltLabel}>Total Paid Out</div>
          <div style={{...S.ltVal, color:'#2d5a45'}}>{fmt(lifetimePaid)}</div>
          <div style={S.ltSub}>{paidInvoices.length} paid invoices</div>
        </div>
        <div style={{...S.ltCard, '--accent':'#7a6a5a'}}>
          <div style={S.ltLabel}>Avg Invoice Value</div>
          <div style={{...S.ltVal, color:'#5a4a3a'}}>{fmt(avgInvoice)}</div>
          <div style={S.ltSub}>before HST</div>
        </div>
      </div>

      {/* ── Chart + Year summary ── */}
      <div style={S.midGrid}>

        {/* Bar chart */}
        <div style={S.card}>
          <div style={S.chartTop}>
            <div>
              <div style={S.cardTitle}>Monthly Revenue — {selYear}</div>
              <div style={{fontSize:11,color:'#9a9080',marginTop:2}}>
                {selYear===curYear ? `YTD: ${fmt(ytdRev)}` : `Full year: ${fmt(ytdRev)}`}
              </div>
            </div>
            <div style={S.yearTabs}>
              {years.map(y => (
                <button key={y} style={{...S.yearTab, ...(selYear===y ? S.yearTabActive : {})}} onClick={() => switchYear(y)}>{y}</button>
              ))}
            </div>
          </div>

          <div style={S.barsWrap} key={animKey}>
            {monthly.map((val, i) => {
              const isActive = selYear===curYear && i===curMon
              const isFuture = selYear===curYear && i>curMon
              const h = Math.max(3, (val/maxBar)*72)
              return (
                <div key={i} style={S.barCol}>
                  <div style={{...S.barWrap}}>
                    <div
                      className="db-bar-anim"
                      style={{
                        ...S.bar,
                        height: `${h}px`,
                        background: isActive ? '#2d5a45' : isFuture ? '#e8e4dc' : '#9fc8b0',
                        animationDelay: `${i*30}ms`,
                      }}
                    />
                  </div>
                  <div style={S.barLbl}>{MONTHS[i]}</div>
                  {val > 0 && <div style={S.barAmt}>{fmtK(val)}</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Year summary */}
        <div style={S.card}>
          <div style={S.cardTitle}>{selYear} Summary</div>
          {[
            ['Invoices',       `${yearInvoices.length} total`, ''],
            ['Paid',           `${ytdPaidCount} invoices`,     ''],
            ['Net Revenue',    fmt(ytdRev),                    '#2d5a45'],
            [`HST (${hstRate}%)`, fmt(ytdHST),                '#c07820'],
            ['Outstanding',    fmt(ytdOutstanding),            ytdOutstanding>0?'#c07820':'#9a9080'],
            ['Collected',      fmt(ytdPaid),                   '#2d5a45'],
          ].map(([l,v,c]) => (
            <div key={l} style={S.hstRow}>
              <span style={S.hstLbl}>{l}</span>
              <span style={{...S.hstVal, ...(c?{color:c}:{})}}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Client breakdown + YoY ── */}
      <div style={S.bottomGrid}>

        <div style={S.card}>
          <div style={S.cardTitle}>Revenue by Client — All Time</div>
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
                {Math.round((cl.rev/totalClientRev)*100)}% of revenue · {fmt(cl.paid)} paid
              </div>
            </div>
          ))}
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>Year-over-Year</div>
          {yoyData.map((d, i) => (
            <div key={d.year} style={{display:'flex',alignItems:'center',gap:12,marginBottom: i<yoyData.length-1?14:0}}>
              <div style={{fontSize:11,fontWeight:700,color:d.isCurrent?'#2d5a45':'#9a9080',width:48,flexShrink:0}}>{d.year}</div>
              <div style={{flex:1,height:6,background:'#f0ece4',borderRadius:3,overflow:'hidden'}}>
                <div style={{
                  height:'100%', borderRadius:3,
                  width:`${(d.rev/maxYoy)*100}%`,
                  background: d.year===curYear ? '#2d5a45' : `rgba(45,90,69,${0.3+i*0.18})`,
                  transition:'width .6s cubic-bezier(.4,0,.2,1)',
                }} />
              </div>
              <div style={{fontSize:11,fontWeight:700,color:'#1a2e22',width:68,textAlign:'right',flexShrink:0,fontVariantNumeric:'tabular-nums'}}>{fmtK(d.rev)}</div>
              <div style={{fontSize:10,color:'#b0a898',width:28,textAlign:'right',flexShrink:0}}>{d.count}×</div>
            </div>
          ))}
          {growthEl}
        </div>
      </div>

      {/* ── Recent invoices ── */}
      <div style={{...S.card, padding:0, overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid #f0ece4'}}>
          <div style={S.cardTitle}>Recent Invoices</div>
          <button style={{fontSize:11,fontWeight:600,color:'#2d5a45',cursor:'pointer',border:'none',background:'none',padding:0}} onClick={() => navigate('/invoices')}>View all →</button>
        </div>
        <table className="tbl" style={{margin:0,border:'none',borderRadius:0}}>
          <thead>
            <tr>
              <th>Invoice #</th><th>Client</th><th>Issued</th>
              <th className="tc-right">Amount</th><th className="tc-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {allInvoices.length === 0 ? (
              <tr><td colSpan="5" className="empty-state">No invoices yet.</td></tr>
            ) : allInvoices.slice(0,6).map(inv => (
              <tr key={inv.id} className="clickable" onClick={() => navigate(`/invoices/${inv.id}`)}>
                <td className="tc-mono">{inv.invoice_number}</td>
                <td className="tc-bold">{inv.clients?.name||'—'}</td>
                <td>{fmtDFull(inv.invoice_date)}</td>
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

/* ── Layout constants ─────────────────────────────────────── */
const CARD = {
  background: '#fff',
  border: '1px solid #e8e4dc',
  borderRadius: 12,
  padding: '20px 22px',
}

const styles = {
  ltGrid: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:18 },
  ltCard: { ...CARD, position:'relative', overflow:'hidden' },
  ltHero: { background:'#2d5a45', border:'none' },
  ltLabel:{ fontSize:10, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'#9a9080', marginBottom:8 },
  ltVal:  { fontFamily:"'Sora',sans-serif", fontSize:24, fontWeight:800, color:'#1a2e22', lineHeight:1 },
  ltSub:  { fontSize:11, color:'#9a9080', marginTop:5 },

  midGrid:   { display:'grid', gridTemplateColumns:'1fr 280px', gap:16, marginBottom:18 },
  bottomGrid:{ display:'grid', gridTemplateColumns:'1fr 1fr',   gap:16, marginBottom:18 },

  card:     { ...CARD },
  cardTitle:{ fontFamily:"'Sora',sans-serif", fontSize:13, fontWeight:700, color:'#1a2e22', marginBottom:16 },

  chartTop: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:18 },
  yearTabs: { display:'flex', gap:3, background:'#f5f2ec', borderRadius:8, padding:3 },
  yearTab:  { fontSize:11, fontWeight:600, color:'#7a8070', padding:'4px 10px', borderRadius:6, border:'none', background:'none', cursor:'pointer' },
  yearTabActive: { background:'#fff', color:'#2d5a45', boxShadow:'0 1px 4px rgba(0,0,0,.08)' },

  barsWrap: { display:'flex', alignItems:'flex-end', gap:5, height:90 },
  barCol:   { flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 },
  barWrap:  { width:'100%', display:'flex', alignItems:'flex-end', height:72 },
  bar:      { width:'100%', borderRadius:'4px 4px 0 0', minHeight:3 },
  barLbl:   { fontSize:9, color:'#b0a898', fontWeight:600, letterSpacing:'.04em' },
  barAmt:   { fontSize:8, color:'#7a8070' },

  hstRow: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'1px solid #f0ece4' },
  hstLbl: { fontSize:11, color:'#7a8070' },
  hstVal: { fontSize:12, fontWeight:700, color:'#1a2e22', fontVariantNumeric:'tabular-nums' },
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@700;800&display=swap');
  @keyframes dbBarGrow { from { transform:scaleY(0); transform-origin:bottom } to { transform:scaleY(1); transform-origin:bottom } }
  .db-bar-anim { animation: dbBarGrow .35s cubic-bezier(.4,0,.2,1) both; }
`
