import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, Field, Spinner } from '../components/ui'
import PageShell from '../components/layout/PageShell'
import { InvoicePreviewModal } from './InvoicePDF'

const toISO  = d => d.toISOString().split('T')[0]
const fmtM   = n => `$${parseFloat(n||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmt2   = n => parseFloat(n||0).toFixed(2)

function workingDays(from, to) {
  let count = 0, d = new Date(from), end = new Date(to)
  while (d <= end) { const w = d.getDay(); if (w>=1&&w<=5) count++; d.setDate(d.getDate()+1) }
  return count
}
function makeRow(sunDate, rate) {
  const from = new Date(sunDate), to = new Date(sunDate)
  to.setDate(to.getDate() + 6)
  const hours = workingDays(from, to) * 8
  return { period_from: toISO(from), period_to: toISO(to), hours, hourly_rate: rate }
}
function nextSunday(d) {
  const r = new Date(d); r.setDate(r.getDate() + ((7 - r.getDay()) % 7 || 7)); return r
}

export default function NewInvoice() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const { id }     = useParams()

  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [clients, setClients]         = useState([])
  const [settings, setSettings]       = useState({})
  const [error, setError]             = useState(null)
  const [clientId, setClientId]       = useState('')
  const [invDate, setInvDate]         = useState(toISO(new Date()))
  const [invNum, setInvNum]           = useState('')
  const [lines, setLines]             = useState([])
  const [showPreview, setShowPreview] = useState(false)

  const client   = clients.find(c => c.id === clientId)
  const rate     = client?.hourly_rate || 0
  const pmtDays  = client?.payment_terms_days || 15
  const hstRate  = +(settings.hst_rate || 13)
  const subtotal = lines.reduce((s, l) => s + (+l.hours * +l.hourly_rate), 0)
  const hstAmt   = subtotal * hstRate / 100
  const total    = subtotal + hstAmt
  const totHours = lines.reduce((s, l) => s + +l.hours, 0)

  useEffect(() => { init() }, [])

  async function init() {
    const [{ data: cl }, { data: st }] = await Promise.all([
      supabase.from('clients').select('*').eq('user_id', user.id).eq('is_active', true).order('name'),
      supabase.from('settings').select('*').eq('user_id', user.id).single(),
    ])
    setClients(cl || []); setSettings(st || {})

    if (id) {
      const { data: inv } = await supabase.from('invoices')
        .select('*, invoice_lines(*)').eq('id', id).single()
      if (inv) {
        setClientId(inv.client_id); setInvDate(inv.invoice_date); setInvNum(inv.invoice_number)
        setLines(inv.invoice_lines?.sort((a,b) => a.sort_order - b.sort_order) || [])
      }
    } else {
      if (cl?.length) { setClientId(cl[0].id); await prefill(cl[0], user.id) }
      const yr = new Date().getFullYear()
      const { data: last } = await supabase.from('invoices').select('sequence_number')
        .eq('user_id', user.id).eq('invoice_year', yr)
        .order('sequence_number', { ascending: false }).limit(1)
      setInvNum(`${st?.invoice_prefix || 'INV-'}${yr}${String(((last?.[0]?.sequence_number||0)+1)).padStart(3,'0')}`)
    }
    setLoading(false)
  }

  async function prefill(cl, userId) {
    const { data: lastInv } = await supabase.from('invoices')
      .select('invoice_lines(period_to)').eq('user_id', userId).eq('client_id', cl.id)
      .order('invoice_date', { ascending: false }).limit(1)
    const lastLines = lastInv?.[0]?.invoice_lines
    let startSun
    if (lastLines?.length) {
      const lastTo = lastLines.reduce((m, l) => l.period_to > m ? l.period_to : m, '')
      startSun = nextSunday(new Date(lastTo))
    } else {
      startSun = new Date(); startSun.setDate(startSun.getDate() + ((7-startSun.getDay())%7||7))
    }
    const r = cl.hourly_rate || 0
    const w2 = new Date(startSun); w2.setDate(w2.getDate() + 7)
    setLines([makeRow(startSun, r), makeRow(w2, r)])
  }

  async function onClientChange(cid) {
    setClientId(cid)
    const cl = clients.find(c => c.id === cid)
    if (!cl) return
    if (!lines.length) { await prefill(cl, user.id) }
    else setLines(ls => ls.map(l => ({ ...l, hourly_rate: cl.hourly_rate })))
  }

  function updLine(idx, field, val) {
    setLines(ls => ls.map((l, i) => i !== idx ? l : { ...l, [field]: val }))
  }

  function addLine() {
    const last = lines[lines.length - 1]
    let sun = last ? new Date(last.period_to) : new Date()
    if (last) sun.setDate(sun.getDate() + 1)
    else sun.setDate(sun.getDate() + ((7-sun.getDay())%7||7))
    setLines(ls => [...ls, makeRow(sun, rate || 0)])
  }

  async function save(status) {
    if (!clientId) { setError('Please select a client.'); return }
    if (!lines.length) { setError('Add at least one billing line.'); return }
    setSaving(true); setError(null)
    const due = new Date(invDate); due.setDate(due.getDate() + pmtDays)
    const payload = {
      user_id: user.id, client_id: clientId, invoice_number: invNum,
      invoice_year: new Date(invDate).getFullYear(),
      sequence_number: parseInt(invNum.replace(/\D/g,'').slice(4)) || 1,
      invoice_date: invDate, due_date: toISO(due),
      subtotal, hst_rate: hstRate, hst_amount: hstAmt, total, total_hours: totHours,
      status, updated_at: new Date().toISOString(),
    }
    let invId = id
    if (id) {
      await supabase.from('invoices').update(payload).eq('id', id)
      await supabase.from('invoice_lines').delete().eq('invoice_id', id)
    } else {
      const { data, error: e } = await supabase.from('invoices').insert(payload).select().single()
      if (e) { setError(e.message); setSaving(false); return }
      invId = data.id
    }
    await supabase.from('invoice_lines').insert(
      lines.map((l, i) => ({
        invoice_id: invId, user_id: user.id,
        period_from: l.period_from, period_to: l.period_to,
        hours: +l.hours, hourly_rate: +l.hourly_rate, sort_order: i,
      }))
    )
    setSaving(false); navigate('/invoices')
  }

  if (loading) return <PageShell crumb="Rapidmatix" title="New Invoice"><Spinner /></PageShell>

  // Assembled invoice object for PDF template
  const invoiceData = {
    invoice_number: invNum,
    invoice_date: invDate,
    due_date: toISO(new Date(new Date(invDate).getTime() + pmtDays * 86400000)),
    hst_rate: hstRate,
  }

  return (
    <PageShell
      crumb="Rapidmatix" title={id ? invNum : 'New Invoice'}
      actions={
        <div className="flex gap-8">
          <Button
            variant="ghost"
            onClick={() => setShowPreview(true)}
            disabled={!clientId || !lines.length}
          >
            Preview PDF
          </Button>
          <Button variant="ghost" onClick={() => save('draft')} disabled={saving}>
            Save Draft
          </Button>
          <Button variant="primary" onClick={() => save('sent')} disabled={saving}>
            {saving ? 'Saving…' : 'Save & Mark Sent'}
          </Button>
        </div>
      }
    >
      {error && <div className="alert-error">{error}</div>}

      {/* Invoice details */}
      <div className="card">
        <div className="section-label">Invoice Details</div>
        <div className="grid-2">
          <Field label="Client">
            <div className="fi-select-wrap">
              <select className="fi" value={clientId} onChange={e => onClientChange(e.target.value)}>
                <option value="">Select client…</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.consulting_client ? ` — ${c.consulting_client}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Invoice date">
            <input type="date" className="fi" value={invDate} onChange={e => setInvDate(e.target.value)} />
          </Field>
          <Field label="Invoice number">
            <input className="fi" value={invNum} onChange={e => setInvNum(e.target.value)} />
          </Field>
          <Field label="Rate">
            <div className="fi-readonly">
              {rate ? `${fmtM(rate)} / hr` : '—'}
            </div>
          </Field>
        </div>
      </div>

      {/* Billing lines */}
      <div className="tbl-wrap">
        <table className="tbl">
          <colgroup>
            <col style={{width:'22%'}} /><col style={{width:'22%'}} />
            <col style={{width:'12%'}} /><col style={{width:'12%'}} />
            <col style={{width:'auto'}} /><col style={{width:'40px'}} />
          </colgroup>
          <thead>
            <tr>
              <th>From (Sun)</th><th>To (Sat)</th>
              <th className="tc-center">Hours</th>
              <th className="tc-center">Rate / hr</th>
              <th className="tc-right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td><input type="date" className="fi" value={l.period_from}
                  onChange={e => updLine(i,'period_from',e.target.value)} /></td>
                <td><input type="date" className="fi" value={l.period_to}
                  onChange={e => updLine(i,'period_to',e.target.value)} /></td>
                <td><input type="number" className="fi" value={l.hours} min="0" step="1"
                  onChange={e => updLine(i,'hours',e.target.value)} /></td>
                <td><input type="number" className="fi" value={l.hourly_rate} min="0" step="0.01"
                  onChange={e => updLine(i,'hourly_rate',e.target.value)} /></td>
                <td className="tc-amt">{fmtM(+l.hours * +l.hourly_rate)}</td>
                <td className="tc-center">
                  <button className="btn-icon danger"
                    onClick={() => setLines(ls => ls.filter((_,j) => j!==i))}
                    title="Remove">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="tbl-add-row">
          <Button variant="ghost" size="sm" onClick={addLine}>+ Add row</Button>
        </div>
      </div>

      {/* Totals */}
      <div className="card">
        <div className="totals-panel">
          <div className="totals-meta">
            <div>
              <div className="totals-stat-num">{fmt2(totHours)}</div>
              <div className="totals-stat-label">billable hours</div>
            </div>
            <div className="totals-meta-divider" />
            <div>
              <div className="totals-stat-num">{lines.length}</div>
              <div className="totals-stat-label">{lines.length === 1 ? 'period' : 'periods'}</div>
            </div>
          </div>
          <div className="totals-breakdown">
            <div className="totals-row">
              <span className="tl">Subtotal</span>
              <span className="tv">{fmtM(subtotal)}</span>
            </div>
            <div className="totals-row">
              <span className="tl">HST ({hstRate}%)</span>
              <span className="tv">{fmtM(hstAmt)}</span>
            </div>
            <div className="totals-divider" />
            <div className="totals-grand">
              <span className="tl">Total Due</span>
              <span className="tv">{fmtM(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* PDF Preview Modal */}
      {showPreview && (
        <InvoicePreviewModal
          invoice={invoiceData}
          settings={settings}
          client={client}
          lines={lines}
          onClose={() => setShowPreview(false)}
        />
      )}
    </PageShell>
  )
}
