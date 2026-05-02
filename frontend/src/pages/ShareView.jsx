import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt     = n => `$${parseFloat(n||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmtK    = n => { const v=parseFloat(n||0); return v>=1000?`$${(v/1000).toFixed(1)}k`:fmt(v) }
const fmtD    = d => d ? new Date(d+'T12:00:00').toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'}) : '—'
const fmtDISO = d => { if(!d) return ''; const dt=new Date(d+'T12:00:00'); return dt.toLocaleDateString('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}) }
const curYear = new Date().getFullYear()
const curMon  = new Date().getMonth()

// same effective date logic as main app
function effectiveDate(inv) {
  return (inv.status === 'paid' && inv.due_date) ? inv.due_date : inv.invoice_date
}

const PILL_STYLE = {
  paid:  {background:'#e8f5ec',color:'#2a7a48',border:'1px solid #b8ddc8'},
  sent:  {background:'#fef3e2',color:'#9a6010',border:'1px solid #f0d8a0'},
  draft: {background:'#f5f2ec',color:'#8a8070',border:'1px solid #e0dbd0'},
}

export default function ShareView() {
  const { token }                     = useParams()
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [settings, setSettings]       = useState(null)
  const [invoices, setInvoices]       = useState([])
  const [clients, setClients]         = useState([])
  const [sharedPages, setSharedPages] = useState([])
  const [tab, setTab]                 = useState(null)
  const [selectedInv, setSelectedInv] = useState(null)

  useEffect(() => { load() }, [token])

  async function load() {
    const { data: rows } = await supabase.rpc('get_user_by_share_token', { p_token: token })
    if (!rows?.length || !rows[0].sharing_enabled) {
      setError('This link is invalid or sharing has been disabled.')
      setLoading(false); return
    }
    const { user_id: uid, shared_pages: pages } = rows[0]
    setSharedPages(pages || [])
    setTab(pages?.[0] || 'dashboard')

    const [{ data: st }, { data: inv }, { data: cl }] = await Promise.all([
      supabase.from('settings').select('company_name,hst_number,hst_rate,address,phone,email,contractor_name').eq('user_id', uid).single(),
      supabase.from('invoices').select('*, clients(*), invoice_lines(*)').eq('user_id', uid).order('invoice_date', { ascending: false }),
      supabase.from('clients').select('id,name,hourly_rate').eq('user_id', uid),
    ])
    setSettings(st); setInvoices(inv||[]); setClients(cl||[])
    setLoading(false)
  }

  if (loading) return (
    <div style={S.centered}>
      <div style={S.spinner}/>
      <style>{`@keyframes _sv{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if (error) return (
    <div style={S.centered}>
      <style>{`@keyframes _sv{to{transform:rotate(360deg)}}`}</style>
      <div style={S.errorBox}>
        <div style={{fontSize:32,marginBottom:12}}>🔒</div>
        <div style={{fontWeight:700,color:'#1a2e22',marginBottom:6,fontFamily:"'Sora',sans-serif"}}>Link Unavailable</div>
        <div style={{fontSize:13,color:'#7a8070'}}>{error}</div>
      </div>
    </div>
  )

  if (selectedInv) return (
    <div style={S.page}>
      <style>{`@keyframes _sv{to{transform:rotate(360deg)}} ${GLOBAL_CSS}`}</style>
      <div style={S.topbar}>
        <div style={S.brand}>
          <div style={S.brandDot}>R</div>
          <span style={S.brandName}>{settings?.company_name || 'Rapidmatix'}</span>
          <span style={S.readOnly}>· Read Only</span>
        </div>
        <button onClick={() => setSelectedInv(null)} style={S.backBtn}>← Back</button>
      </div>
      <div style={S.content}>
        <SharedInvoiceDetail invoice={selectedInv} settings={settings}/>
      </div>
    </div>
  )

  return (
    <div style={S.page}>
      <style>{`@keyframes _sv{to{transform:rotate(360deg)}} @keyframes _svbar{from{transform:scaleY(0);transform-origin:bottom}to{transform:scaleY(1);transform-origin:bottom}} ._svbar{animation:_svbar .35s cubic-bezier(.4,0,.2,1) both} ${GLOBAL_CSS}`}</style>
      <div style={S.topbar}>
        <div style={S.brand}>
          <div style={S.brandDot}>R</div>
          <span style={S.brandName}>{settings?.company_name || 'Rapidmatix'}</span>
          <span style={S.readOnly}>· Read Only</span>
        </div>
        {sharedPages.length > 1 && (
          <div style={S.tabs}>
            {sharedPages.map(p => (
              <button key={p} style={{...S.tab,...(tab===p?S.tabActive:{})}} onClick={() => setTab(p)}>
                {p === 'dashboard' ? 'Dashboard' : 'Invoices'}
              </button>
            ))}
          </div>
        )}
        <div style={{fontSize:11,color:'#9fc8b0',opacity:.7,display:'none'}} className="sv-shared-label">Shared</div>
      </div>
      <div style={S.content}>
        {tab === 'dashboard' && <SharedDashboard invoices={invoices} clients={clients} settings={settings}/>}
        {tab === 'invoices'  && <SharedInvoices invoices={invoices} onSelect={inv => setSelectedInv(inv)}/>}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   INVOICE DETAIL
   ══════════════════════════════════════════════════════════════ */
function SharedInvoiceDetail({ invoice, settings }) {
  const templateRef = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const client = invoice.clients || {}
  const lines  = (invoice.invoice_lines || []).sort((a,b) => a.sort_order - b.sort_order)

  async function handleDownload() {
    setDownloading(true)
    try {
      const el = templateRef.current
      if (!el) return
      const canvas = await html2canvas(el, { scale:2, useCORS:true, backgroundColor:'#ffffff', logging:false, width:794, height:1123 })
      const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight())
      pdf.save(`${invoice.invoice_number}.pdf`)
    } finally { setDownloading(false) }
  }

  const sub    = lines.reduce((s,l) => s + (+l.hours * +l.hourly_rate), 0)
  const hstPct = +(invoice.hst_rate || settings?.hst_rate || 13)
  const hstAmt = sub * hstPct / 100
  const total  = sub + hstAmt
  const totHrs = lines.reduce((s,l) => s + +l.hours, 0)

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12}}>
        <div>
          <div style={{fontFamily:"'Sora',sans-serif",fontSize:18,fontWeight:700,color:'#1a2e22'}}>{invoice.invoice_number}</div>
          <div style={{fontSize:12,color:'#9a9080',marginTop:2}}>
            {fmtD(invoice.invoice_date)} ·{' '}
            <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:99,...(PILL_STYLE[invoice.status]||{})}}>
              <span style={{width:5,height:5,borderRadius:'50%',background:'currentColor',opacity:.8}}/>{invoice.status}
            </span>
          </div>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          style={{display:'inline-flex',alignItems:'center',gap:8,padding:'9px 18px',borderRadius:8,border:'none',cursor:downloading?'default':'pointer',background:'#2d5a45',color:'#fff',fontSize:13,fontWeight:600,opacity:downloading?.75:1,whiteSpace:'nowrap'}}
        >
          {downloading
            ? <><div style={{width:13,height:13,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'_sv .7s linear infinite'}}/> Generating…</>
            : <><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg> Download PDF</>}
        </button>
      </div>

      <div style={{background:'#111c14',borderRadius:12,padding:'20px',overflowX:'auto',display:'flex',justifyContent:'center'}}>
        <div style={{boxShadow:'0 4px 40px rgba(0,0,0,.5)',flexShrink:0,width:794}}>
          <div ref={templateRef}>
            <InvoiceTemplate invoice={invoice} settings={settings} client={client} lines={lines} sub={sub} hstPct={hstPct} hstAmt={hstAmt} total={total} totHrs={totHrs}/>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── PDF template (unchanged) ─────────────────────────────── */
function InvoiceTemplate({ invoice, settings, client, lines, sub, hstPct, hstAmt, total, totHrs }) {
  const companyName = settings?.company_name || 'RAPIDMATIX TECHNOLOGY SOLUTIONS LTD.'
  const hstNum      = settings?.hst_number   || ''
  const contractor  = settings?.contractor_name || 'Niket Agrawal'
  const senderAddr  = (settings?.address || '').split(',').map(s=>s.trim()).filter(Boolean)
  const pmtDays     = client?.payment_terms_days || 15
  const SAGE='#2d5a45', BORDER='#ddd8d0', LIGHT='#f5f2ec'
  return (
    <div style={{width:794,height:1123,background:'#fff',fontFamily:"'Inter','Helvetica Neue',Arial,sans-serif",color:'#1a2e22',display:'flex',flexDirection:'column',boxSizing:'border-box',overflow:'hidden'}}>
      <div style={{background:SAGE,padding:'28px 44px',display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
        <div>
          <div style={{fontFamily:"'Sora','Georgia',serif",fontSize:22,fontWeight:700,color:'#fff',letterSpacing:'.01em',lineHeight:1.25}}>{companyName}</div>
          {hstNum&&<div style={{fontSize:10,color:'#9fc8b0',marginTop:6,letterSpacing:'.06em'}}>HST# {hstNum}</div>}
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:10,fontWeight:700,color:'#9fc8b0',letterSpacing:'.28em',marginBottom:4}}>INVOICE</div>
          <div style={{fontFamily:"'Sora',serif",fontSize:15,fontWeight:700,color:'#fff',letterSpacing:'.04em'}}>{invoice.invoice_number}</div>
        </div>
      </div>
      <div style={{display:'flex',padding:'32px 44px 24px',gap:0}}>
        <div style={{flex:1}}>
          <div style={{marginBottom:22}}>
            <div style={{fontSize:9,fontWeight:700,color:'#a89e90',letterSpacing:'.18em',textTransform:'uppercase',borderBottom:`1px solid ${BORDER}`,paddingBottom:5,marginBottom:8}}>FROM</div>
            <div style={{fontSize:13,fontWeight:700,color:'#1a2e22',marginBottom:3}}>{companyName}</div>
            {senderAddr.map((p,i)=><div key={i} style={{fontSize:11,color:'#5a7a6a',lineHeight:1.7}}>{p}</div>)}
            {settings?.phone&&<div style={{fontSize:11,color:'#5a7a6a',lineHeight:1.7}}>{settings.phone}</div>}
          </div>
          <div style={{marginBottom:22}}>
            <div style={{fontSize:9,fontWeight:700,color:'#a89e90',letterSpacing:'.18em',textTransform:'uppercase',borderBottom:`1px solid ${BORDER}`,paddingBottom:5,marginBottom:8}}>BILL TO</div>
            <div style={{fontSize:13,fontWeight:700,color:'#1a2e22',marginBottom:3}}>{client.name}</div>
            {(client.address||'').split(',').map((p,i)=><div key={i} style={{fontSize:11,color:'#5a7a6a',lineHeight:1.7}}>{p.trim()}</div>)}
            {client.phone&&<div style={{fontSize:11,color:'#5a7a6a',lineHeight:1.7}}>{client.phone}</div>}
          </div>
          {client.consulting_client&&(
            <div>
              <div style={{fontSize:9,fontWeight:700,color:'#a89e90',letterSpacing:'.18em',textTransform:'uppercase',borderBottom:`1px solid ${BORDER}`,paddingBottom:5,marginBottom:8}}>CONSULTING CLIENT</div>
              <div style={{fontSize:13,fontWeight:700,color:'#1a2e22'}}>{client.consulting_client}</div>
            </div>
          )}
        </div>
        <div style={{flexShrink:0,width:260,marginLeft:48}}>
          <div style={{border:`1px solid ${BORDER}`,borderRadius:6,overflow:'hidden'}}>
            {[['Invoice Number',invoice.invoice_number],['Date of Issue',fmtDISO(invoice.invoice_date)],['Payment Terms',`Net ${pmtDays} Days`],['Contractor',contractor]].map(([k,v])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 14px',borderBottom:`1px solid ${BORDER}`,background:'#fff'}}>
                <span style={{fontSize:10,color:'#8a8070',fontWeight:600}}>{k}</span>
                <span style={{fontSize:10,color:'#1a2e22',fontWeight:700,textAlign:'right'}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{height:2,background:SAGE,margin:'0 44px 24px',borderRadius:1}}/>
      <div style={{padding:'0 44px',marginBottom:24}}>
        <div style={{fontSize:9,fontWeight:700,color:'#a89e90',letterSpacing:'.18em',textTransform:'uppercase',marginBottom:10}}>INVOICE DETAILS</div>
        <table style={{width:'100%',borderCollapse:'collapse',border:`1px solid ${BORDER}`,borderRadius:6,overflow:'hidden'}}>
          <thead><tr>{[['Billing Period (as per timesheet)','left','46%'],['Hours','center','15%'],['Rate / hr','center','20%'],['Amount','right','19%']].map(([h,a,w])=>(
            <th key={h} style={{background:SAGE,color:'#fff',fontSize:9,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',padding:'11px 14px',textAlign:a,width:w,borderRight:'1px solid rgba(255,255,255,.15)'}}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {lines.map((l,i)=>(
              <tr key={i}>
                <td style={{fontSize:12,color:'#2a3a2a',padding:'11px 14px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?'#fff':'#f7f5f0',textAlign:'left'}}>Week: {fmtDISO(l.period_from)} to {fmtDISO(l.period_to)}</td>
                <td style={{fontSize:12,color:'#2a3a2a',padding:'11px 14px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?'#fff':'#f7f5f0',textAlign:'center'}}>{l.hours}</td>
                <td style={{fontSize:12,color:'#2a3a2a',padding:'11px 14px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?'#fff':'#f7f5f0',textAlign:'center'}}>{fmt(l.hourly_rate)}</td>
                <td style={{fontSize:12,color:'#2a3a2a',padding:'11px 14px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?'#fff':'#f7f5f0',textAlign:'right',fontWeight:600}}>{fmt(+l.hours*+l.hourly_rate)}</td>
              </tr>
            ))}
            {lines.length<3&&Array(3-lines.length).fill(0).map((_,i)=>(<tr key={`e${i}`}><td style={{fontSize:12,padding:'11px 14px',borderBottom:`1px solid ${BORDER}`,background:'#fff',color:'transparent'}}>—</td><td style={{padding:'11px 14px',borderBottom:`1px solid ${BORDER}`,background:'#fff'}}/><td style={{padding:'11px 14px',borderBottom:`1px solid ${BORDER}`,background:'#fff'}}/><td style={{padding:'11px 14px',borderBottom:`1px solid ${BORDER}`,background:'#fff'}}/></tr>))}
          </tbody>
        </table>
      </div>
      <div style={{padding:'0 44px',display:'flex',justifyContent:'flex-end',marginBottom:32}}>
        <div style={{width:300,border:`1px solid ${BORDER}`,borderRadius:6,overflow:'hidden'}}>
          {[['Billable Hours',`${totHrs} hrs`],['Subtotal',fmt(sub)],['HST',`${hstPct}%`],['GST / HST Amt',fmt(hstAmt)]].map(([l,v])=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 16px',borderBottom:`1px solid ${BORDER}`,background:'#fff'}}>
              <span style={{fontSize:11,color:'#6a7a6a',fontWeight:500}}>{l}</span>
              <span style={{fontSize:12,color:'#1a2e22',fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{v}</span>
            </div>
          ))}
          <div style={{height:2,background:SAGE}}/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 16px',background:SAGE}}>
            <span style={{fontSize:11,fontWeight:700,color:'#9fc8b0',letterSpacing:'.12em'}}>TOTAL DUE</span>
            <span style={{fontFamily:"'Sora',serif",fontSize:18,fontWeight:700,color:'#fff',fontVariantNumeric:'tabular-nums'}}>{fmt(total)}</span>
          </div>
        </div>
      </div>
      <div style={{flex:1}}/>
      <div style={{background:LIGHT,borderTop:`2px solid ${SAGE}`,padding:'22px 44px',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:32}}>
        <div>
          <div style={{fontSize:8,fontWeight:700,color:SAGE,letterSpacing:'.18em',textTransform:'uppercase',marginBottom:6}}>PAYMENT INSTRUCTIONS</div>
          <div style={{fontSize:10,color:'#5a7a6a',lineHeight:1.6}}>Please remit payment within {pmtDays} days.{settings?.email?` Questions? Contact ${settings.email}`:''}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:8,fontWeight:700,color:SAGE,letterSpacing:'.18em',textTransform:'uppercase',marginBottom:6}}>THANK YOU FOR YOUR BUSINESS</div>
          <div style={{fontSize:10,color:'#5a7a6a',lineHeight:1.6}}>{companyName}</div>
          {hstNum&&<div style={{fontSize:10,color:'#5a7a6a'}}>HST# {hstNum}</div>}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SHARED INVOICES LIST
   ══════════════════════════════════════════════════════════════ */
function SharedInvoices({ invoices, onSelect }) {
  const [filter, setFilter] = useState('all')
  const visible = filter==='all' ? invoices : invoices.filter(i=>i.status===filter)

  return (
    <div>
      {/* Filter tabs */}
      <div style={{display:'flex',gap:2,borderBottom:'1px solid #e8e2d8',marginBottom:14,overflowX:'auto'}}>
        {['all','paid','sent','draft'].map(f=>(
          <button key={f} onClick={()=>setFilter(f)}
            style={{background:'none',border:'none',borderBottom:`2px solid ${filter===f?'#2d5a45':'transparent'}`,padding:'8px 14px',marginBottom:-1,cursor:'pointer',fontSize:13,fontWeight:500,fontFamily:'Inter,sans-serif',color:filter===f?'#2d5a45':'#9a9080',whiteSpace:'nowrap',flexShrink:0}}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
            <span style={{marginLeft:6,fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:99,background:filter===f?'#e8f5ec':'#f5f2ec',color:filter===f?'#2d5a45':'#9a9080'}}>
              {f==='all'?invoices.length:invoices.filter(i=>i.status===f).length}
            </span>
          </button>
        ))}
      </div>

      {/* Desktop grid header */}
      <div className="sv-inv-desktop">
        <div style={{background:'#fff',border:'1px solid #e8e2d8',borderRadius:12,overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'130px 1fr 110px 120px 80px 80px',gap:8,padding:'10px 18px',background:'#faf8f4',borderBottom:'1px solid #e8e2d8'}}>
            {[['Invoice #','left'],['Client','left'],['Issued','left'],['Amount','right'],['Status','right'],['','right']].map(([h,a])=>(
              <span key={h} style={{fontSize:10,fontWeight:700,color:'#a89e90',letterSpacing:'.1em',textTransform:'uppercase',textAlign:a}}>{h}</span>
            ))}
          </div>
          {visible.length===0
            ? <div style={{padding:'40px',textAlign:'center',color:'#9a9080',fontSize:13}}>No invoices.</div>
            : visible.map((inv,i)=>(
              <div key={inv.id}
                style={{display:'grid',gridTemplateColumns:'130px 1fr 110px 120px 80px 80px',gap:8,padding:'11px 18px',borderBottom:i<visible.length-1?'1px solid #f5f2ec':'none',alignItems:'center',cursor:'pointer'}}
                onClick={()=>onSelect(inv)}
                onMouseEnter={e=>e.currentTarget.style.background='#faf8f4'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}
              >
                <span style={{fontFamily:'monospace',fontSize:11,color:'#a89e90'}}>{inv.invoice_number}</span>
                <span style={{fontSize:13,fontWeight:600,color:'#1a2e22'}}>{inv.clients?.name||'—'}</span>
                <span style={{fontSize:12,color:'#7a8070'}}>{fmtD(inv.invoice_date)}</span>
                <span style={{textAlign:'right',fontFamily:"'Sora',sans-serif",fontWeight:700,color:'#2d5a45',fontVariantNumeric:'tabular-nums'}}>{fmt(inv.total)}</span>
                <span style={{textAlign:'right'}}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:99,...(PILL_STYLE[inv.status]||{})}}>
                    <span style={{width:5,height:5,borderRadius:'50%',background:'currentColor',opacity:.8}}/>{inv.status}
                  </span>
                </span>
                <span style={{textAlign:'right',fontSize:11,color:'#9fc8b0',fontWeight:600}}>View →</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* Mobile card list */}
      <div className="sv-inv-mobile">
        {visible.length===0
          ? <div style={{padding:'40px',textAlign:'center',color:'#9a9080',fontSize:13}}>No invoices.</div>
          : visible.map(inv=>(
            <div key={inv.id}
              style={{background:'#fff',border:'1px solid #e8e2d8',borderRadius:12,padding:'14px 16px',marginBottom:10,cursor:'pointer',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}
              onClick={()=>onSelect(inv)}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:'monospace',fontSize:10,color:'#a89e90',marginBottom:3}}>{inv.invoice_number}</div>
                <div style={{fontSize:14,fontWeight:600,color:'#1a2e22',marginBottom:2}}>{inv.clients?.name||'—'}</div>
                <div style={{fontSize:11,color:'#9a9080'}}>{fmtD(inv.invoice_date)}</div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontFamily:"'Sora',sans-serif",fontSize:15,fontWeight:700,color:'#2d5a45',marginBottom:6,fontVariantNumeric:'tabular-nums'}}>{fmt(inv.total)}</div>
                <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:99,...(PILL_STYLE[inv.status]||{})}}>
                  <span style={{width:5,height:5,borderRadius:'50%',background:'currentColor',opacity:.8}}/>{inv.status}
                </span>
              </div>
            </div>
          ))
        }
      </div>

      <div style={{marginTop:16,textAlign:'center',fontSize:11,color:'#c0b8ac'}}>
        Tap any invoice to view details and download PDF · Read-only shared view
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   SHARED DASHBOARD
   ══════════════════════════════════════════════════════════════ */
function SharedDashboard({ invoices, clients, settings }) {
  const [selYear, setSelYear] = useState(curYear)
  const [animKey, setAnimKey] = useState(0)
  const hstRate = +(settings?.hst_rate || 13)

  const lifetimeRev  = invoices.reduce((s,i)=>s+(+i.subtotal),0)
  const lifetimeHST  = invoices.filter(i=>i.status!=='draft').reduce((s,i)=>s+(+i.hst_amount),0)
  const paidInv      = invoices.filter(i=>i.status==='paid')
  const lifetimePaid = paidInv.reduce((s,i)=>s+(+i.total),0)
  const avgInvoice   = invoices.length ? lifetimeRev/invoices.length : 0

  const yearInv = invoices.filter(i => new Date(effectiveDate(i)+'T12:00:00').getFullYear() === selYear)
  const ytdRev  = yearInv.reduce((s,i)=>s+(+i.subtotal),0)
  const ytdHST  = yearInv.filter(i=>i.status!=='draft').reduce((s,i)=>s+(+i.hst_amount),0)
  const ytdCollected = yearInv.filter(i=>i.status==='paid').reduce((s,i)=>s+(+i.total),0)
  const ytdOut  = yearInv.filter(i=>i.status==='sent').reduce((s,i)=>s+(+i.total),0)
  const ytdPN   = yearInv.filter(i=>i.status==='paid').length

  const paidByMonth    = Array(12).fill(0)
  const pendingByMonth = Array(12).fill(0)
  yearInv.forEach(inv => {
    if (inv.status === 'paid') {
      paidByMonth[new Date((inv.due_date||inv.invoice_date)+'T12:00:00').getMonth()] += +inv.subtotal
    } else {
      pendingByMonth[new Date(inv.invoice_date+'T12:00:00').getMonth()] += +inv.subtotal
    }
  })
  const maxBar = Math.max(...paidByMonth.map((p,i)=>p+pendingByMonth[i]),1)

  const years = [...new Set(invoices.map(i=>new Date(effectiveDate(i)+'T12:00:00').getFullYear()))].sort((a,b)=>b-a)

  const now=new Date(), todayMD=now.getMonth()*100+now.getDate()
  const yoyData=[...years].reverse().slice(-4).map(y=>{
    const inv=invoices.filter(i=>{const d=new Date(effectiveDate(i)+'T12:00:00');return d.getFullYear()===y&&(d.getMonth()*100+d.getDate())<=todayMD})
    return{year:y,rev:inv.reduce((s,i)=>s+(+i.subtotal),0),paid:inv.filter(i=>i.status==='paid').reduce((s,i)=>s+(+i.subtotal),0),count:inv.length,isCur:y===curYear}
  })
  const maxYoy=Math.max(...yoyData.map(d=>d.rev),1)

  const clientBreak=clients.map(cl=>{
    const inv=invoices.filter(i=>i.client_id===cl.id)
    return{name:cl.name,rate:cl.hourly_rate,rev:inv.reduce((s,i)=>s+(+i.subtotal),0),count:inv.length}
  }).sort((a,b)=>b.rev-a.rev)
  const totalRev=clientBreak.reduce((s,c)=>s+c.rev,0)||1

  let growth=null
  if(yoyData.length>=2){
    const lat=yoyData[yoyData.length-1],prv=yoyData[yoyData.length-2]
    const pct=prv.rev>0?((lat.rev-prv.rev)/prv.rev*100):0,up=pct>=0
    const lbl=now.toLocaleDateString('en-CA',{month:'short',day:'numeric'})
    growth=(<div style={{marginTop:14,padding:'10px 14px',background:up?'#f0faf4':'#fdf5ec',borderRadius:8,border:`1px solid ${up?'#c8e6d4':'#f5d8a8'}`}}>
      <div style={{fontSize:10,fontWeight:700,color:up?'#2d5a45':'#c07820',marginBottom:2}}>{up?'▲':'▼'} {Math.abs(pct).toFixed(1)}% vs same period {prv.year}</div>
      <div style={{fontSize:11,color:'#7a8070'}}>{up?`+${fmt(lat.rev-prv.rev)} ahead`:`${fmt(prv.rev-lat.rev)} behind`} on {lbl} vs last year</div>
    </div>)
  }

  return (
    <div>
      {/* KPI grid */}
      <div className="sv-kpi-grid">
        {[
          {label:'Lifetime Revenue',val:fmt(lifetimeRev),color:'#fff',dark:true,sub:`${invoices.length} invoices`},
          {label:'HST Collected',val:fmt(lifetimeHST),color:'#c07820',sub:'all time'},
          {label:'Total Received',val:fmt(lifetimePaid),color:'#2d5a45',sub:`${paidInv.length} invoices · incl. HST`},
          {label:'Avg Invoice',val:fmt(avgInvoice),color:'#5a4a3a',sub:'before HST'},
        ].map((k,i)=>(
          <div key={i} style={{...C,...(k.dark?{background:'#2d5a45',border:'none'}:{})}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:k.dark?'#9fc8b0':'#9a9080',marginBottom:8}}>{k.label}</div>
            <div style={{fontFamily:"'Sora',sans-serif",fontSize:20,fontWeight:800,color:k.color,lineHeight:1}}>{k.val}</div>
            <div style={{fontSize:11,color:k.dark?'#9fc8b0':'#9a9080',marginTop:5}}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Chart + Summary */}
      <div className="sv-mid-grid">
        <div style={C}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,flexWrap:'wrap',gap:8}}>
            <div>
              <div style={{fontFamily:"'Sora',sans-serif",fontSize:13,fontWeight:700,color:'#1a2e22'}}>Monthly Revenue — {selYear}</div>
              <div style={{fontSize:11,color:'#9a9080',marginTop:2}}>{selYear===curYear?`YTD: ${fmt(ytdRev)}`:`Full year: ${fmt(ytdRev)}`}</div>
              <div style={{display:'flex',gap:12,marginTop:6}}>
                <div style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'#7a8070'}}><div style={{width:10,height:10,borderRadius:2,background:'#2d5a45'}}/>Received</div>
                <div style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'#7a8070'}}><div style={{width:10,height:10,borderRadius:2,background:'#c8e0d0'}}/>Pending</div>
              </div>
            </div>
            <div style={{display:'flex',gap:3,background:'#f5f2ec',borderRadius:8,padding:3,flexShrink:0}}>
              {years.map(y=>(
                <button key={y} onClick={()=>{setSelYear(y);setAnimKey(k=>k+1)}}
                  style={{fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:6,border:'none',cursor:'pointer',background:selYear===y?'#fff':'none',color:selYear===y?'#2d5a45':'#7a8070',boxShadow:selYear===y?'0 1px 4px rgba(0,0,0,.08)':'none'}}>{y}</button>
              ))}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'flex-end',gap:5,height:90}} key={animKey}>
            {paidByMonth.map((paidVal,i)=>{
              const pendVal=pendingByMonth[i]
              const totalH=Math.max((paidVal+pendVal)>0?3:0,((paidVal+pendVal)/maxBar)*72)
              const paidFrac=(paidVal+pendVal)>0?paidVal/(paidVal+pendVal):0
              const pH=totalH*paidFrac, peH=totalH-pH
              const isAct=selYear===curYear&&i===curMon
              return(
                <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                  <div style={{width:'100%',display:'flex',alignItems:'flex-end',height:72}}>
                    <div style={{width:'100%',display:'flex',flexDirection:'column',justifyContent:'flex-end',height:`${totalH}px`,opacity:isAct?1:.88}}>
                      {peH>0&&<div className="_svbar" style={{width:'100%',height:`${peH}px`,background:'#c8e0d0',animationDelay:`${i*28}ms`}}/>}
                      {pH>0&&<div className="_svbar" style={{width:'100%',height:`${pH}px`,background:isAct?'#1a3a2a':'#2d5a45',animationDelay:`${i*28}ms`}}/>}
                    </div>
                  </div>
                  <div style={{fontSize:9,color:'#b0a898',fontWeight:600}}>{MONTHS[i]}</div>
                  {(paidVal+pendVal)>0&&<div style={{fontSize:8,color:'#7a8070'}}>{fmtK(paidVal+pendVal)}</div>}
                </div>
              )
            })}
          </div>
        </div>

        <div style={C}>
          <div style={{fontFamily:"'Sora',sans-serif",fontSize:13,fontWeight:700,color:'#1a2e22',marginBottom:14}}>{selYear} Summary</div>
          {[['Invoices',`${yearInv.length} total`,''],['Paid',`${ytdPN} invoices`,''],['Net Revenue',fmt(ytdRev),'#2d5a45'],[`HST (${hstRate}%)`,fmt(ytdHST),'#c07820'],['Outstanding',fmt(ytdOut),ytdOut>0?'#c07820':'#9a9080'],['Collected',fmt(ytdCollected),'#2d5a45']].map(([l,v,c])=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f0ece4'}}>
              <span style={{fontSize:11,color:'#7a8070'}}>{l}</span>
              <span style={{fontSize:12,fontWeight:700,color:c||'#1a2e22',fontVariantNumeric:'tabular-nums'}}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Client breakdown + YoY */}
      <div className="sv-bottom-grid">
        <div style={C}>
          <div style={{fontFamily:"'Sora',sans-serif",fontSize:13,fontWeight:700,color:'#1a2e22',marginBottom:14}}>Revenue by Client</div>
          {clientBreak.map((cl,i)=>(
            <div key={cl.name} style={{marginBottom:i<clientBreak.length-1?16:0}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:5}}>
                <div><div style={{fontSize:12,fontWeight:700,color:'#1a2e22'}}>{cl.name}</div><div style={{fontSize:10,color:'#9a9080'}}>${cl.rate}/hr · {cl.count} invoice{cl.count!==1?'s':''}</div></div>
                <div style={{fontFamily:"'Sora',sans-serif",fontSize:14,fontWeight:800,color:'#2d5a45'}}>{fmt(cl.rev)}</div>
              </div>
              <div style={{height:5,background:'#f0ece4',borderRadius:3,overflow:'hidden',marginBottom:3}}>
                <div style={{height:'100%',borderRadius:3,background:i===0?'#2d5a45':'#9fc8b0',width:`${(cl.rev/totalRev)*100}%`}}/>
              </div>
              <div style={{fontSize:10,color:'#9a9080'}}>{Math.round((cl.rev/totalRev)*100)}% of total</div>
            </div>
          ))}
        </div>

        <div style={C}>
          <div style={{fontFamily:"'Sora',sans-serif",fontSize:13,fontWeight:700,color:'#1a2e22',marginBottom:14}}>Year-over-Year</div>
          {yoyData.map((d,i)=>(
            <div key={d.year} style={{display:'flex',alignItems:'center',gap:10,marginBottom:i<yoyData.length-1?12:0}}>
              <div style={{fontSize:11,fontWeight:700,color:d.isCur?'#2d5a45':'#9a9080',width:40,flexShrink:0}}>{d.year}</div>
              <div style={{flex:1,height:8,background:'#f0ece4',borderRadius:3,overflow:'hidden',display:'flex'}}>
                <div style={{height:'100%',width:`${(d.paid/maxYoy)*100}%`,background:d.isCur?'#2d5a45':`rgba(45,90,69,${0.3+i*0.18})`}}/>
                <div style={{height:'100%',width:`${((d.rev-d.paid)/maxYoy)*100}%`,background:'#c8e0d0'}}/>
              </div>
              <div style={{fontSize:11,fontWeight:700,color:'#1a2e22',width:60,textAlign:'right',flexShrink:0,fontVariantNumeric:'tabular-nums'}}>{fmtK(d.rev)}</div>
              <div style={{fontSize:10,color:'#b0a898',width:24,textAlign:'right',flexShrink:0}}>{d.count}×</div>
            </div>
          ))}
          {growth}
        </div>
      </div>
    </div>
  )
}

const C = {background:'#fff',border:'1px solid #e8e2d8',borderRadius:12,padding:'20px 22px',marginBottom:14}

const S = {
  page:    {minHeight:'100dvh',background:'#f0ece4',fontFamily:'Inter,sans-serif'},
  centered:{minHeight:'100dvh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'},
  spinner: {width:28,height:28,border:'2px solid #e8e2d8',borderTopColor:'#2d5a45',borderRadius:'50%',animation:'_sv .7s linear infinite'},
  errorBox:{background:'#fff',border:'1px solid #e8e2d8',borderRadius:12,padding:'32px 40px',textAlign:'center',maxWidth:360,margin:'0 16px'},
  topbar:  {background:'#2d5a45',padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'},
  brand:   {display:'flex',alignItems:'center',gap:10},
  brandDot:{width:32,height:32,background:'rgba(255,255,255,.15)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Sora',sans-serif",fontSize:14,fontWeight:700,color:'#fff',flexShrink:0},
  brandName:{fontFamily:"'Sora',sans-serif",fontSize:14,fontWeight:700,color:'#fff'},
  readOnly:{fontSize:11,color:'#9fc8b0'},
  tabs:    {display:'flex',gap:3,background:'rgba(255,255,255,.12)',borderRadius:8,padding:3},
  tab:     {fontSize:12,fontWeight:600,color:'rgba(255,255,255,.6)',padding:'5px 14px',borderRadius:6,border:'none',background:'none',cursor:'pointer'},
  tabActive:{background:'rgba(255,255,255,.2)',color:'#fff'},
  backBtn: {display:'inline-flex',alignItems:'center',gap:6,fontSize:12,fontWeight:600,color:'#9fc8b0',background:'rgba(255,255,255,.1)',border:'none',borderRadius:6,padding:'6px 12px',cursor:'pointer',whiteSpace:'nowrap'},
  content: {maxWidth:1100,margin:'0 auto',padding:'20px 16px 48px'},
}

const GLOBAL_CSS = `
  .sv-kpi-grid    { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:14px; }
  .sv-mid-grid    { display:grid; grid-template-columns:1fr 260px; gap:14px; }
  .sv-bottom-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:0; }
  .sv-inv-desktop { display:block; }
  .sv-inv-mobile  { display:none; }

  @media (max-width: 900px) {
    .sv-mid-grid    { grid-template-columns:1fr; }
    .sv-bottom-grid { grid-template-columns:1fr; }
  }
  @media (max-width: 600px) {
    .sv-kpi-grid   { grid-template-columns:1fr 1fr; gap:10px; }
    .sv-inv-desktop { display:none; }
    .sv-inv-mobile  { display:block; }
  }
  @media (max-width: 380px) {
    .sv-kpi-grid { grid-template-columns:1fr; }
  }
`
