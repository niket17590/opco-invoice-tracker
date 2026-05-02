import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, Field, Spinner } from '../components/ui'
import PageShell from '../components/layout/PageShell'
import { InvoicePreviewModal } from './InvoicePDF'
import { driveUpload, getAccessToken } from '../lib/drive'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const toISO  = d => d.toISOString().split('T')[0]
const fmtM   = n => `$${parseFloat(n||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmt2   = n => parseFloat(n||0).toFixed(2)
const fmtD   = d => d ? new Date(d+'T12:00:00').toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'}) : '—'
const fmtDT  = d => d ? new Date(d).toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}) : null

function workingDays(from, to) {
  let count=0, d=new Date(from), end=new Date(to)
  while(d<=end){const w=d.getDay();if(w>=1&&w<=5)count++;d.setDate(d.getDate()+1)}
  return count
}
function makeRow(sunDate, rate) {
  const from=new Date(sunDate), to=new Date(sunDate)
  to.setDate(to.getDate()+6)
  return { period_from:toISO(from), period_to:toISO(to), hours:workingDays(from,to)*8, hourly_rate:rate }
}
function nextSunday(d) {
  const r=new Date(d); r.setDate(r.getDate()+((7-r.getDay())%7||7)); return r
}

const PILL = {
  paid:  {background:'#e8f5ec',color:'#2a7a48',border:'1px solid #b8ddc8'},
  sent:  {background:'#fef3e2',color:'#9a6010',border:'1px solid #f0d8a0'},
  draft: {background:'#f5f2ec',color:'#8a8070',border:'1px solid #e0dbd0'},
}

export default function NewInvoice() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const { id }     = useParams()
  const isNew      = !id

  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [editMode, setEditMode]           = useState(isNew)
  const [clients, setClients]             = useState([])
  const [settings, setSettings]           = useState({})
  const [error, setError]                 = useState(null)
  const [clientId, setClientId]           = useState('')
  const [invDate, setInvDate]             = useState(toISO(new Date()))
  const [invNum, setInvNum]               = useState('')
  const [lines, setLines]                 = useState([])
  const [invStatus, setInvStatus]         = useState('draft')
  const [paymentDate, setPaymentDate]     = useState('') // due_date reused as payment_received_date
  const [savingPayDate, setSavingPayDate] = useState(false)
  const [driveFileId, setDriveFileId]     = useState(null)
  const [driveFileUrl, setDriveFileUrl]   = useState(null)
  const [driveUploadedAt, setDriveUploadedAt] = useState(null)
  const [showPreview, setShowPreview]     = useState(false)
  const [savingToDrive, setSavingToDrive] = useState(false)
  const [driveSuccess, setDriveSuccess]   = useState(null)
  const [driveError, setDriveError]       = useState(null)
  const [showReupload, setShowReupload]   = useState(false)
  const [deleteModal, setDeleteModal]     = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const hiddenTemplateRef = useRef(null)

  const client   = clients.find(c => c.id === clientId)
  const rate     = client?.hourly_rate || 0
  const pmtDays  = client?.payment_terms_days || 15
  const hstRate  = +(settings.hst_rate || 13)
  const subtotal = lines.reduce((s,l) => s + (+l.hours * +l.hourly_rate), 0)
  const hstAmt   = subtotal * hstRate / 100
  const total    = subtotal + hstAmt
  const totHours = lines.reduce((s,l) => s + +l.hours, 0)

  useEffect(() => { init() }, [])

  async function init() {
    const [{ data: cl }, { data: st }] = await Promise.all([
      supabase.from('clients').select('*').eq('user_id', user.id).eq('is_active', true).order('name'),
      supabase.from('settings').select('*').eq('user_id', user.id).single(),
    ])
    setClients(cl||[]); setSettings(st||{})

    if (id) {
      const { data: inv } = await supabase.from('invoices').select('*, invoice_lines(*)').eq('id', id).single()
      if (inv) {
        setClientId(inv.client_id); setInvDate(inv.invoice_date); setInvNum(inv.invoice_number)
        setInvStatus(inv.status)
        setLines(inv.invoice_lines?.sort((a,b)=>a.sort_order-b.sort_order)||[])
        setDriveFileId(inv.drive_file_id||null)
        setDriveFileUrl(inv.drive_file_url||null)
        setDriveUploadedAt(inv.drive_uploaded_at||null)
        // due_date = payment_received_date when paid
        setPaymentDate(inv.due_date || '')
      }
    } else {
      if (cl?.length) { setClientId(cl[0].id); await prefill(cl[0], user.id) }
      const yr=new Date().getFullYear()
      const { data: last } = await supabase.from('invoices').select('sequence_number')
        .eq('user_id', user.id).eq('invoice_year', yr)
        .order('sequence_number', {ascending:false}).limit(1)
      setInvNum(`${st?.invoice_prefix||'INV-'}${yr}${String(((last?.[0]?.sequence_number||0)+1)).padStart(3,'0')}`)
    }
    setLoading(false)
  }

  async function prefill(cl, userId) {
    const { data: lastInv } = await supabase.from('invoices')
      .select('invoice_lines(period_to)').eq('user_id', userId).eq('client_id', cl.id)
      .order('invoice_date', {ascending:false}).limit(1)
    const lastLines=lastInv?.[0]?.invoice_lines
    let startSun
    if (lastLines?.length) { const lastTo=lastLines.reduce((m,l)=>l.period_to>m?l.period_to:m,''); startSun=nextSunday(new Date(lastTo)) }
    else { startSun=new Date(); startSun.setDate(startSun.getDate()+((7-startSun.getDay())%7||7)) }
    const r=cl.hourly_rate||0, w2=new Date(startSun); w2.setDate(w2.getDate()+7)
    setLines([makeRow(startSun,r), makeRow(w2,r)])
  }

  async function onClientChange(cid) {
    setClientId(cid)
    const cl=clients.find(c=>c.id===cid); if(!cl) return
    if (!lines.length) { await prefill(cl, user.id) }
    else setLines(ls=>ls.map(l=>({...l, hourly_rate:cl.hourly_rate})))
  }

  function updLine(idx, field, val) { setLines(ls=>ls.map((l,i)=>i!==idx?l:{...l,[field]:val})) }
  function addLine() {
    const last=lines[lines.length-1]
    let sun=last?new Date(last.period_to):new Date()
    if(last) sun.setDate(sun.getDate()+1); else sun.setDate(sun.getDate()+((7-sun.getDay())%7||7))
    setLines(ls=>[...ls, makeRow(sun, rate||0)])
  }

  async function save(status) {
    if (!clientId) { setError('Please select a client.'); return }
    if (!lines.length) { setError('Add at least one billing line.'); return }
    setSaving(true); setError(null)

    // due_date = payment date if paid, else calculate from terms
    const dueDate = status === 'paid' && paymentDate
      ? paymentDate
      : toISO(new Date(new Date(invDate).getTime() + pmtDays * 86400000))

    const payload={
      user_id:user.id, client_id:clientId, invoice_number:invNum,
      invoice_year:new Date(invDate).getFullYear(),
      sequence_number:parseInt(invNum.replace(/\D/g,'').slice(4))||1,
      invoice_date:invDate, due_date:dueDate,
      subtotal, hst_rate:hstRate, hst_amount:hstAmt, total, total_hours:totHours,
      status, updated_at:new Date().toISOString(),
    }
    let invId=id
    if (id) {
      await supabase.from('invoices').update(payload).eq('id', id)
      await supabase.from('invoice_lines').delete().eq('invoice_id', id)
    } else {
      const { data, error:e }=await supabase.from('invoices').insert(payload).select().single()
      if(e){setError(e.message);setSaving(false);return}
      invId=data.id
    }
    await supabase.from('invoice_lines').insert(
      lines.map((l,i)=>({invoice_id:invId, user_id:user.id, period_from:l.period_from, period_to:l.period_to, hours:+l.hours, hourly_rate:+l.hourly_rate, sort_order:i}))
    )
    setSaving(false)

    if (id) {
      setInvStatus(status)
      setEditMode(false)
      if (driveFileId) setShowReupload(true)
    } else {
      navigate('/invoices')
    }
  }

  // Save payment date change in-place (from view mode)
  async function savePaymentDate(newDate) {
    setSavingPayDate(true)
    await supabase.from('invoices').update({
      due_date: newDate,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setPaymentDate(newDate)
    setSavingPayDate(false)
  }

  async function handleDeleteInvoice() {
    setDeleting(true)
    await supabase.from('invoice_lines').delete().eq('invoice_id', id)
    await supabase.from('invoices').delete().eq('id', id)
    navigate('/invoices', { replace: true })
  }

  async function handleSaveToDrive(overrideFileId = null) {
    if (!settings.drive_refresh_token) { setDriveError('Drive not connected. Go to Settings.'); return }
    if (!settings.drive_folder_id)     { setDriveError('No Drive folder set. Go to Settings.'); return }
    if (!clientId || !lines.length)    { setDriveError('Complete the invoice first.'); return }

    setSavingToDrive(true); setDriveError(null); setDriveSuccess(null); setShowReupload(false)
    try {
      const el = hiddenTemplateRef.current
      if (!el) throw new Error('Template not ready')
      const canvas = await html2canvas(el, { scale:2, useCORS:true, backgroundColor:'#ffffff', logging:false, width:794, height:1123 })
      const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight())
      const pdfBlob = pdf.output('arraybuffer')

      if (overrideFileId) {
        try {
          const accessToken = await getAccessToken(settings.drive_refresh_token)
          await fetch(`https://www.googleapis.com/drive/v3/files/${overrideFileId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          })
        } catch(e) { /* ignore */ }
      }

      const result = await driveUpload({
        refreshToken: settings.drive_refresh_token,
        folderId:     settings.drive_folder_id,
        fileName:     `${invNum}.pdf`,
        pdfBlob,
      })

      const now = new Date().toISOString()
      if (id) {
        await supabase.from('invoices').update({
          drive_file_id:    result.id,
          drive_file_url:   result.webViewLink,
          drive_uploaded_at:now,
        }).eq('id', id)
        setDriveFileId(result.id)
        setDriveFileUrl(result.webViewLink)
        setDriveUploadedAt(now)
      }
      setDriveSuccess(result.webViewLink)
    } catch(e) {
      if (e.message?.includes('invalid_grant')) {
        await supabase.from('settings').update({ drive_connected:false, drive_refresh_token:null }).eq('user_id', user.id)
        setDriveError('Drive connection expired. Please reconnect in Settings.')
      } else {
        setDriveError(e.message || 'Upload failed')
      }
    } finally {
      setSavingToDrive(false)
    }
  }

  if (loading) return <PageShell crumb="Rapidmatix" title="Invoice"><Spinner /></PageShell>

  const invoiceData = {
    invoice_number:invNum, invoice_date:invDate,
    due_date: paymentDate || toISO(new Date(new Date(invDate).getTime()+pmtDays*86400000)),
    hst_rate:hstRate,
  }
  const driveReady = settings.drive_connected && settings.drive_folder_id && clientId && lines.length > 0

  /* ══════════════════════════════════════════════════════
     VIEW MODE
     ══════════════════════════════════════════════════════ */
  if (!editMode && id) {
    return (
      <PageShell
        crumb="Rapidmatix" title={invNum}
        actions={
          <div className="ni-toolbar-actions">
            {/* Save to Drive */}
            <button
              onClick={() => handleSaveToDrive(driveFileId||null)}
              disabled={savingToDrive || !driveReady}
              title={!settings.drive_connected?'Connect Drive in Settings':!settings.drive_folder_id?'Set folder in Settings':''}
              style={{display:'inline-flex',alignItems:'center',gap:7,padding:'7px 14px',borderRadius:8,border:'1.5px solid var(--border)',background:'var(--white)',cursor:(!driveReady||savingToDrive)?'default':'pointer',fontSize:12,fontWeight:600,fontFamily:'Inter,sans-serif',color:driveReady?'var(--text-primary)':'var(--text-muted)',opacity:driveReady?1:.55,transition:'all .12s',whiteSpace:'nowrap'}}
              onMouseEnter={e=>{ if(driveReady&&!savingToDrive){e.currentTarget.style.borderColor='var(--sage-dark)';e.currentTarget.style.background='var(--sage-pale)'}}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--white)'}}
            >
              {savingToDrive?(
                <><div style={{width:13,height:13,border:'2px solid var(--linen-dark)',borderTopColor:'var(--sage-dark)',borderRadius:'50%',animation:'spin .7s linear infinite'}}/> Uploading…</>
              ):(
                <><svg width="14" height="14" viewBox="0 0 87.3 78" fill="none"><path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="M43.65 25L29.9 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9.06 9.06 0 000 53h27.5z" fill="#00ac47"/><path d="M60 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.5c1.6 0 3.15-.45 4.5-1.2L60 53z" fill="#2684fc"/></svg>
                {driveFileId ? 'Re-upload' : 'Save to Drive'}</>
              )}
            </button>
            <Button variant="ghost" onClick={() => setShowPreview(true)}>Preview PDF</Button>
            <Button variant="primary" onClick={() => { setEditMode(true); setShowReupload(false) }}>Edit Invoice</Button>
            <Button variant="danger" onClick={() => setDeleteModal(true)}>Delete</Button>
          </div>
        }
      >
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          .ni-toolbar-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
          .ni-meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 24px; }
          .ni-meta-item { padding:10px 0; border-bottom:1px solid var(--border-light); }
          .ni-meta-label { font-size:10px; font-weight:700; color:var(--text-muted); letter-spacing:.1em; text-transform:uppercase; margin-bottom:4px; }
          .ni-meta-val { font-size:13px; color:var(--text-primary); font-weight:500; }
          .ni-lines-wrap { overflow-x:auto; }
          @media(max-width:640px){
            .ni-meta-grid { grid-template-columns:1fr; }
            .ni-toolbar-actions { gap:6px; }
            .ni-toolbar-actions button, .ni-toolbar-actions a { font-size:11px; padding:6px 10px; }
          }
        `}</style>

        {driveError   && <div className="alert-error">{driveError}</div>}
        {driveSuccess  && (
          <div className="alert-success" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span>✓ Saved to Google Drive</span>
            <a href={driveSuccess} target="_blank" rel="noopener noreferrer" style={{fontSize:12,fontWeight:600,color:'var(--green-text)'}}>Open →</a>
          </div>
        )}

        {/* Invoice summary card */}
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,flexWrap:'wrap',gap:8}}>
            <div>
              <div style={{fontFamily:"'Sora',sans-serif",fontSize:20,fontWeight:700,color:'var(--text-primary)',marginBottom:4}}>{invNum}</div>
              <div style={{fontSize:13,color:'var(--text-muted)'}}>{client?.name || '—'}{client?.consulting_client ? ` · ${client.consulting_client}` : ''}</div>
            </div>
            <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:99,...(PILL[invStatus]||{})}}>
              <span style={{width:5,height:5,borderRadius:'50%',background:'currentColor',opacity:.8}}/>
              {invStatus}
            </span>
          </div>

          <div className="ni-meta-grid">
            {[
              ['Invoice Date', fmtD(invDate)],
              ['Invoice Number', invNum],
              ['Rate', rate ? `${fmtM(rate)} / hr` : '—'],
              ['Payment Terms', `Net ${pmtDays} days`],
            ].map(([l,v]) => (
              <div key={l} className="ni-meta-item">
                <div className="ni-meta-label">{l}</div>
                <div className="ni-meta-val">{v}</div>
              </div>
            ))}
          </div>

          {/* Payment Received Date — editable in view mode when paid */}
          {invStatus === 'paid' && (
            <div style={{marginTop:16,padding:'12px 16px',background:'var(--green-pale)',border:'1px solid var(--green-border)',borderRadius:'var(--radius-md)'}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--green-text)',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:8}}>
                Payment Received Date
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                <input
                  type="date"
                  className="fi"
                  value={paymentDate}
                  max={toISO(new Date())}
                  onChange={e => setPaymentDate(e.target.value)}
                  style={{maxWidth:180,flex:'0 0 auto'}}
                />
                <Button variant="ghost" size="sm"
                  disabled={savingPayDate || !paymentDate}
                  onClick={() => savePaymentDate(paymentDate)}>
                  {savingPayDate ? 'Saving…' : 'Update'}
                </Button>
                <span style={{fontSize:11,color:'var(--green-text)'}}>Date money arrived in your bank account</span>
              </div>
            </div>
          )}

          {/* Drive status */}
          {driveFileId && (
            <div style={{marginTop:16,padding:'10px 14px',background:'#f0faf4',border:'1px solid #c8e6d4',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <svg width="14" height="14" viewBox="0 0 87.3 78" fill="none"><path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="M43.65 25L29.9 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9.06 9.06 0 000 53h27.5z" fill="#00ac47"/><path d="M60 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.5c1.6 0 3.15-.45 4.5-1.2L60 53z" fill="#2684fc"/></svg>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:'#2a7a48'}}>Saved to Google Drive</div>
                  {driveUploadedAt && <div style={{fontSize:11,color:'var(--text-muted)'}}>Uploaded {fmtDT(driveUploadedAt)}</div>}
                </div>
              </div>
              <a href={driveFileUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:11,fontWeight:600,color:'#2a7a48',textDecoration:'none'}}>Open →</a>
            </div>
          )}
        </div>

        {/* Billing lines (read-only) */}
        <div className="tbl-wrap ni-lines-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Billing Period</th>
                <th className="tc-center">Hours</th>
                <th className="tc-center">Rate / hr</th>
                <th className="tc-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l,i) => (
                <tr key={i}>
                  <td>Week: {fmtD(l.period_from)} to {fmtD(l.period_to)}</td>
                  <td className="tc-center">{l.hours}</td>
                  <td className="tc-center">{fmtM(l.hourly_rate)}</td>
                  <td className="tc-amt">{fmtM(+l.hours * +l.hourly_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals (read-only) */}
        <div className="card">
          <div className="totals-panel" style={{flexWrap:'wrap',gap:16}}>
            <div className="totals-meta">
              <div><div className="totals-stat-num">{fmt2(totHours)}</div><div className="totals-stat-label">billable hours</div></div>
              <div className="totals-meta-divider"/>
              <div><div className="totals-stat-num">{lines.length}</div><div className="totals-stat-label">{lines.length===1?'period':'periods'}</div></div>
            </div>
            <div className="totals-breakdown">
              <div className="totals-row"><span className="tl">Subtotal</span><span className="tv">{fmtM(subtotal)}</span></div>
              <div className="totals-row"><span className="tl">HST ({hstRate}%)</span><span className="tv">{fmtM(hstAmt)}</span></div>
              <div className="totals-divider"/>
              <div className="totals-grand"><span className="tl">Total Due</span><span className="tv">{fmtM(total)}</span></div>
            </div>
          </div>
        </div>

        {/* Hidden template for Drive upload */}
        {driveReady && (
          <div style={{position:'fixed',left:'-9999px',top:0,pointerEvents:'none',opacity:0}}>
            <div ref={hiddenTemplateRef}>
              <DriveTemplate invoice={invoiceData} settings={settings} client={client} lines={lines} subtotal={subtotal} hstAmt={hstAmt} total={total} totHours={totHours} hstRate={hstRate}/>
            </div>
          </div>
        )}

        {showPreview && <InvoicePreviewModal invoice={invoiceData} settings={settings} client={client} lines={lines} onClose={()=>setShowPreview(false)}/>}

        {/* Delete modal */}
        {deleteModal && (
          <div className="modal-overlay" onClick={() => setDeleteModal(false)}>
            <div className="modal" style={{maxWidth:400}} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title" style={{color:'var(--red-text)'}}>Delete Invoice</span>
                <button className="modal-close" onClick={() => setDeleteModal(false)}>✕</button>
              </div>
              <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:12}}>
                Are you sure you want to delete <strong>{invNum}</strong>?
              </p>
              <div style={{padding:'10px 14px',background:'var(--red-pale)',border:'1px solid var(--red-border)',borderRadius:'var(--radius-md)',fontSize:12,color:'var(--red-text)'}}>
                This permanently deletes the invoice and all billing lines. This cannot be undone.
              </div>
              <div className="modal-footer">
                <Button variant="ghost" onClick={() => setDeleteModal(false)}>Cancel</Button>
                <Button variant="danger" onClick={handleDeleteInvoice} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Yes, Delete Invoice'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </PageShell>
    )
  }

  /* ══════════════════════════════════════════════════════
     EDIT / NEW MODE
     ══════════════════════════════════════════════════════ */
  return (
    <PageShell
      crumb="Rapidmatix" title={isNew ? 'New Invoice' : `Edit · ${invNum}`}
      actions={
        <div className="ni-toolbar-actions">
          {!isNew && <Button variant="ghost" onClick={() => { setEditMode(false); setError(null) }}>Cancel</Button>}
          <Button variant="ghost" onClick={() => setShowPreview(true)} disabled={!clientId||!lines.length}>Preview PDF</Button>
          <Button variant="ghost" onClick={() => save('draft')} disabled={saving}>Save Draft</Button>
          <Button variant="primary" onClick={() => save('sent')} disabled={saving}>{saving?'Saving…':'Save & Mark Sent'}</Button>
        </div>
      }
    >
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .ni-toolbar-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .ni-lines-wrap { overflow-x:auto; }
        @media(max-width:640px){
          .ni-toolbar-actions { gap:6px; }
          .ni-toolbar-actions button { font-size:11px; padding:6px 10px; }
        }
      `}</style>

      {error && <div className="alert-error">{error}</div>}

      {showReupload && (
        <div style={{padding:'12px 16px',background:'#fef3e2',border:'1px solid #f0d8a0',borderRadius:8,marginBottom:12,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:'#9a6010'}}>Invoice updated</div>
            <div style={{fontSize:11,color:'#7a6040',marginTop:2}}>This invoice was previously saved to Drive. Re-upload to replace the old PDF.</div>
          </div>
          <div className="flex gap-8">
            <Button variant="ghost" size="sm" onClick={() => setShowReupload(false)}>Dismiss</Button>
            <button
              onClick={() => handleSaveToDrive(driveFileId)}
              disabled={savingToDrive}
              style={{display:'inline-flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:7,border:'none',background:'#c07820',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}
            >
              {savingToDrive?'Uploading…':'Re-upload to Drive'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-label">Invoice Details</div>
        <div className="grid-2">
          <Field label="Client">
            <div className="fi-select-wrap">
              <select className="fi" value={clientId} onChange={e=>onClientChange(e.target.value)}>
                <option value="">Select client…</option>
                {clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.consulting_client?` — ${c.consulting_client}`:''}</option>)}
              </select>
            </div>
          </Field>
          <Field label="Invoice date"><input type="date" className="fi" value={invDate} onChange={e=>setInvDate(e.target.value)}/></Field>
          <Field label="Invoice number"><input className="fi" value={invNum} onChange={e=>setInvNum(e.target.value)}/></Field>
          <Field label="Rate"><div className="fi-readonly">{rate?`${fmtM(rate)} / hr`:'—'}</div></Field>
        </div>
      </div>

      <div className="tbl-wrap ni-lines-wrap">
        <table className="tbl">
          <colgroup>
            <col style={{width:'22%'}}/><col style={{width:'22%'}}/>
            <col style={{width:'12%'}}/><col style={{width:'12%'}}/>
            <col style={{width:'auto'}}/><col style={{width:'40px'}}/>
          </colgroup>
          <thead>
            <tr>
              <th>From (Sun)</th><th>To (Sat)</th>
              <th className="tc-center">Hours</th><th className="tc-center">Rate / hr</th>
              <th className="tc-right">Amount</th><th/>
            </tr>
          </thead>
          <tbody>
            {lines.map((l,i)=>(
              <tr key={i}>
                <td><input type="date" className="fi" value={l.period_from} onChange={e=>updLine(i,'period_from',e.target.value)}/></td>
                <td><input type="date" className="fi" value={l.period_to}   onChange={e=>updLine(i,'period_to',e.target.value)}/></td>
                <td><input type="number" className="fi" value={l.hours} min="0" step="1" onChange={e=>updLine(i,'hours',e.target.value)}/></td>
                <td><input type="number" className="fi" value={l.hourly_rate} min="0" step="0.01" onChange={e=>updLine(i,'hourly_rate',e.target.value)}/></td>
                <td className="tc-amt">{fmtM(+l.hours * +l.hourly_rate)}</td>
                <td className="tc-center"><button style={{background:'none',border:'none',color:'var(--red-text)',fontSize:16,cursor:'pointer',lineHeight:1,padding:'0 4px'}} onClick={()=>setLines(ls=>ls.filter((_,j)=>j!==i))} title="Remove">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="tbl-add-row"><Button variant="ghost" size="sm" onClick={addLine}>+ Add row</Button></div>
      </div>

      <div className="card">
        <div className="totals-panel" style={{flexWrap:'wrap',gap:16}}>
          <div className="totals-meta">
            <div><div className="totals-stat-num">{fmt2(totHours)}</div><div className="totals-stat-label">billable hours</div></div>
            <div className="totals-meta-divider"/>
            <div><div className="totals-stat-num">{lines.length}</div><div className="totals-stat-label">{lines.length===1?'period':'periods'}</div></div>
          </div>
          <div className="totals-breakdown">
            <div className="totals-row"><span className="tl">Subtotal</span><span className="tv">{fmtM(subtotal)}</span></div>
            <div className="totals-row"><span className="tl">HST ({hstRate}%)</span><span className="tv">{fmtM(hstAmt)}</span></div>
            <div className="totals-divider"/>
            <div className="totals-grand"><span className="tl">Total Due</span><span className="tv">{fmtM(total)}</span></div>
          </div>
        </div>
      </div>

      {clientId && lines.length > 0 && (
        <div style={{position:'fixed',left:'-9999px',top:0,pointerEvents:'none',opacity:0}}>
          <div ref={hiddenTemplateRef}>
            <DriveTemplate invoice={invoiceData} settings={settings} client={client} lines={lines} subtotal={subtotal} hstAmt={hstAmt} total={total} totHours={totHours} hstRate={hstRate}/>
          </div>
        </div>
      )}

      {showPreview && <InvoicePreviewModal invoice={invoiceData} settings={settings} client={client} lines={lines} onClose={()=>setShowPreview(false)}/>}
    </PageShell>
  )
}

/* ── Minimal template for Drive PDF rendering ─────────────── */
function DriveTemplate({ invoice, settings, client, lines, subtotal, hstAmt, total, totHours, hstRate }) {
  const fmtM = n => `$${parseFloat(n||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const fmtD = d => { if(!d) return ''; return new Date(d+'T12:00:00').toLocaleDateString('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}) }
  const SAGE='#2d5a45', BORDER='#ddd8d0'
  const companyName=settings?.company_name||'RAPIDMATIX TECHNOLOGY SOLUTIONS LTD.'
  const hstNum=settings?.hst_number||''
  const contractor=settings?.contractor_name||'Niket Agrawal'
  const addrParts=(settings?.address||'').split(',').map(s=>s.trim()).filter(Boolean)
  const pmtDays=client?.payment_terms_days||15

  return (
    <div style={{width:794,height:1123,background:'#fff',fontFamily:"'Inter','Helvetica Neue',Arial,sans-serif",color:'#1a2e22',display:'flex',flexDirection:'column',boxSizing:'border-box',overflow:'hidden'}}>
      <div style={{background:SAGE,padding:'28px 44px',display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
        <div>
          <div style={{fontFamily:"'Sora','Georgia',serif",fontSize:22,fontWeight:700,color:'#fff',lineHeight:1.25}}>{companyName}</div>
          {hstNum&&<div style={{fontSize:10,color:'#9fc8b0',marginTop:6}}>HST# {hstNum}</div>}
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:10,fontWeight:700,color:'#9fc8b0',letterSpacing:'.28em',marginBottom:4}}>INVOICE</div>
          <div style={{fontFamily:"'Sora',serif",fontSize:15,fontWeight:700,color:'#fff'}}>{invoice.invoice_number}</div>
        </div>
      </div>
      <div style={{display:'flex',padding:'28px 44px 20px',gap:0}}>
        <div style={{flex:1}}>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:9,fontWeight:700,color:'#a89e90',letterSpacing:'.18em',textTransform:'uppercase',borderBottom:`1px solid ${BORDER}`,paddingBottom:5,marginBottom:8}}>FROM</div>
            <div style={{fontSize:12,fontWeight:700,color:'#1a2e22',marginBottom:3}}>{companyName}</div>
            {addrParts.map((p,i)=><div key={i} style={{fontSize:11,color:'#5a7a6a',lineHeight:1.7}}>{p}</div>)}
          </div>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:9,fontWeight:700,color:'#a89e90',letterSpacing:'.18em',textTransform:'uppercase',borderBottom:`1px solid ${BORDER}`,paddingBottom:5,marginBottom:8}}>BILL TO</div>
            <div style={{fontSize:12,fontWeight:700,color:'#1a2e22',marginBottom:3}}>{client?.name}</div>
            {(client?.address||'').split(',').map((p,i)=><div key={i} style={{fontSize:11,color:'#5a7a6a',lineHeight:1.7}}>{p.trim()}</div>)}
          </div>
          {client?.consulting_client&&(
            <div>
              <div style={{fontSize:9,fontWeight:700,color:'#a89e90',letterSpacing:'.18em',textTransform:'uppercase',borderBottom:`1px solid ${BORDER}`,paddingBottom:5,marginBottom:8}}>CONSULTING CLIENT</div>
              <div style={{fontSize:12,fontWeight:700,color:'#1a2e22'}}>{client.consulting_client}</div>
            </div>
          )}
        </div>
        <div style={{flexShrink:0,width:250,marginLeft:40}}>
          <div style={{border:`1px solid ${BORDER}`,borderRadius:6,overflow:'hidden'}}>
            {[['Invoice Number',invoice.invoice_number],['Date of Issue',fmtD(invoice.invoice_date)],['Payment Terms',`Net ${pmtDays} Days`],['Contractor',contractor]].map(([k,v])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',borderBottom:`1px solid ${BORDER}`,background:'#fff'}}>
                <span style={{fontSize:10,color:'#8a8070',fontWeight:600}}>{k}</span>
                <span style={{fontSize:10,color:'#1a2e22',fontWeight:700}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{height:2,background:SAGE,margin:'0 44px 20px',borderRadius:1}}/>
      <div style={{padding:'0 44px',marginBottom:20}}>
        <div style={{fontSize:9,fontWeight:700,color:'#a89e90',letterSpacing:'.18em',textTransform:'uppercase',marginBottom:10}}>INVOICE DETAILS</div>
        <table style={{width:'100%',borderCollapse:'collapse',border:`1px solid ${BORDER}`,borderRadius:6,overflow:'hidden'}}>
          <thead><tr>{[['Billing Period (as per timesheet)','left','46%'],['Hours','center','15%'],['Rate / hr','center','20%'],['Amount','right','19%']].map(([h,a,w])=>(
            <th key={h} style={{background:SAGE,color:'#fff',fontSize:9,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',padding:'10px 12px',textAlign:a,width:w}}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {lines.map((l,i)=>(
              <tr key={i}>
                <td style={{fontSize:11,padding:'10px 12px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?'#fff':'#f7f5f0'}}>Week: {fmtD(l.period_from)} to {fmtD(l.period_to)}</td>
                <td style={{fontSize:11,padding:'10px 12px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?'#fff':'#f7f5f0',textAlign:'center'}}>{l.hours}</td>
                <td style={{fontSize:11,padding:'10px 12px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?'#fff':'#f7f5f0',textAlign:'center'}}>{fmtM(l.hourly_rate)}</td>
                <td style={{fontSize:11,padding:'10px 12px',borderBottom:`1px solid ${BORDER}`,background:i%2===0?'#fff':'#f7f5f0',textAlign:'right',fontWeight:600}}>{fmtM(+l.hours*+l.hourly_rate)}</td>
              </tr>
            ))}
            {lines.length<3&&Array(3-lines.length).fill(0).map((_,i)=>(<tr key={`e${i}`}><td style={{padding:'10px 12px',borderBottom:`1px solid ${BORDER}`,color:'transparent'}}>—</td><td style={{padding:'10px 12px',borderBottom:`1px solid ${BORDER}`}}/><td style={{padding:'10px 12px',borderBottom:`1px solid ${BORDER}`}}/><td style={{padding:'10px 12px',borderBottom:`1px solid ${BORDER}`}}/></tr>))}
          </tbody>
        </table>
      </div>
      <div style={{padding:'0 44px',display:'flex',justifyContent:'flex-end',marginBottom:28}}>
        <div style={{width:290,border:`1px solid ${BORDER}`,borderRadius:6,overflow:'hidden'}}>
          {[['Billable Hours',`${totHours} hrs`],['Subtotal',fmtM(subtotal)],['HST',`${hstRate}%`],['GST / HST Amt',fmtM(hstAmt)]].map(([l,v])=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'9px 14px',borderBottom:`1px solid ${BORDER}`,background:'#fff'}}>
              <span style={{fontSize:11,color:'#6a7a6a'}}>{l}</span>
              <span style={{fontSize:11,color:'#1a2e22',fontWeight:600}}>{v}</span>
            </div>
          ))}
          <div style={{height:2,background:SAGE}}/>
          <div style={{display:'flex',justifyContent:'space-between',padding:'13px 14px',background:SAGE}}>
            <span style={{fontSize:11,fontWeight:700,color:'#9fc8b0',letterSpacing:'.1em'}}>TOTAL DUE</span>
            <span style={{fontFamily:"'Sora',serif",fontSize:17,fontWeight:700,color:'#fff'}}>{fmtM(total)}</span>
          </div>
        </div>
      </div>
      <div style={{flex:1}}/>
      <div style={{background:'#f5f2ec',borderTop:`2px solid ${SAGE}`,padding:'20px 44px',display:'flex',justifyContent:'space-between',gap:24}}>
        <div>
          <div style={{fontSize:8,fontWeight:700,color:SAGE,letterSpacing:'.18em',textTransform:'uppercase',marginBottom:5}}>PAYMENT INSTRUCTIONS</div>
          <div style={{fontSize:10,color:'#5a7a6a',lineHeight:1.6}}>Please remit within {pmtDays} days.{settings?.email?` Contact ${settings.email}`:''}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:8,fontWeight:700,color:SAGE,letterSpacing:'.18em',textTransform:'uppercase',marginBottom:5}}>THANK YOU FOR YOUR BUSINESS</div>
          <div style={{fontSize:10,color:'#5a7a6a'}}>{companyName}</div>
          {hstNum&&<div style={{fontSize:10,color:'#5a7a6a'}}>HST# {hstNum}</div>}
        </div>
      </div>
    </div>
  )
}
