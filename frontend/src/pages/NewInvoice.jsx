import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, Spinner } from '../components/ui'
import PageShell from '../components/layout/PageShell'

/* ── Helpers ───────────────────────────────────────────────── */
const toISO = d => d.toISOString().split('T')[0]
const fmtMoney = n => `$${parseFloat(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmt2 = n => parseFloat(n || 0).toFixed(2)

function workingDays(from, to) {
  let count = 0, d = new Date(from)
  const end = new Date(to)
  while (d <= end) { const wd = d.getDay(); if (wd >= 1 && wd <= 5) count++; d.setDate(d.getDate() + 1) }
  return count
}

function makeWeekRow(sunDate, rate) {
  const from = new Date(sunDate)
  const to = new Date(sunDate); to.setDate(to.getDate() + 6)
  const hours = workingDays(from, to) * 8
  return { period_from: toISO(from), period_to: toISO(to), hours, hourly_rate: rate }
}

function nextSunday(d) {
  const r = new Date(d); r.setDate(r.getDate() + ((7 - r.getDay()) % 7 || 7)); return r
}

/* ── Component ─────────────────────────────────────────────── */
export default function NewInvoice() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { id } = useParams()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clients, setClients] = useState([])
  const [settings, setSettings] = useState({})
  const [error, setError] = useState(null)

  const [clientId, setClientId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(toISO(new Date()))
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [lines, setLines] = useState([])

  const client = clients.find(c => c.id === clientId)
  const rate = client?.hourly_rate || 0
  const paymentDays = client?.payment_terms_days || 15
  const hstRate = +(settings.hst_rate || 13)
  const subtotal = lines.reduce((s, l) => s + +l.hours * +l.hourly_rate, 0)
  const hstAmount = subtotal * hstRate / 100
  const total = subtotal + hstAmount
  const totalHours = lines.reduce((s, l) => s + +l.hours, 0)

  useEffect(() => { init() }, [])

  async function init() {
    const [{ data: cl }, { data: st }] = await Promise.all([
      supabase.from('clients').select('*').eq('user_id', user.id).eq('is_active', true).order('name'),
      supabase.from('settings').select('*').eq('user_id', user.id).single(),
    ])
    setClients(cl || [])
    setSettings(st || {})

    if (id) {
      const { data: inv } = await supabase
        .from('invoices').select('*, invoice_lines(*)').eq('id', id).single()
      if (inv) {
        setClientId(inv.client_id); setInvoiceDate(inv.invoice_date)
        setInvoiceNumber(inv.invoice_number)
        setLines(inv.invoice_lines?.sort((a, b) => a.sort_order - b.sort_order) || [])
      }
    } else {
      if (cl?.length) { setClientId(cl[0].id); await prefillWeeks(cl[0], user.id, st) }
      const yr = new Date().getFullYear()
      const { data: last } = await supabase.from('invoices').select('sequence_number')
        .eq('user_id', user.id).eq('invoice_year', yr).order('sequence_number', { ascending: false }).limit(1)
      const nextSeq = ((last?.[0]?.sequence_number || 0) + 1)
      setInvoiceNumber(`${st?.invoice_prefix || 'INV-'}${yr}${String(nextSeq).padStart(3, '0')}`)
    }
    setLoading(false)
  }

  async function prefillWeeks(cl, userId, st) {
    const { data: lastInv } = await supabase.from('invoices')
      .select('invoice_lines(period_to)').eq('user_id', userId).eq('client_id', cl.id)
      .order('invoice_date', { ascending: false }).limit(1)
    let startSun
    const lastLines = lastInv?.[0]?.invoice_lines
    if (lastLines?.length) {
      const lastTo = lastLines.reduce((max, l) => l.period_to > max ? l.period_to : max, '')
      startSun = nextSunday(new Date(lastTo))
    } else {
      startSun = new Date()
      startSun.setDate(startSun.getDate() + ((7 - startSun.getDay()) % 7 || 7))
    }
    const r = cl.hourly_rate || 0
    const w1 = makeWeekRow(startSun, r)
    const w2Sun = new Date(startSun); w2Sun.setDate(w2Sun.getDate() + 7)
    setLines([w1, makeWeekRow(w2Sun, r)])
  }

  async function handleClientChange(cid) {
    setClientId(cid)
    const cl = clients.find(c => c.id === cid)
    if (!cl) return
    if (!lines.length) { await prefillWeeks(cl, user.id, settings) }
    else setLines(ls => ls.map(l => ({ ...l, hourly_rate: cl.hourly_rate })))
  }

  function updateLine(idx, field, val) {
    setLines(ls => ls.map((l, i) => i !== idx ? l : { ...l, [field]: val }))
  }

  function addLine() {
    const last = lines[lines.length - 1]
    let startSun = last ? new Date(last.period_to) : new Date()
    if (last) startSun.setDate(startSun.getDate() + 1)
    else startSun.setDate(startSun.getDate() + ((7 - startSun.getDay()) % 7 || 7))
    setLines(ls => [...ls, makeWeekRow(startSun, rate || 0)])
  }

  function removeLine(idx) { setLines(ls => ls.filter((_, i) => i !== idx)) }

  async function handleSave(newStatus) {
    if (!clientId) { setError('Please select a client.'); return }
    if (!lines.length) { setError('Add at least one billing line.'); return }
    setSaving(true); setError(null)
    const dueDate = new Date(invoiceDate); dueDate.setDate(dueDate.getDate() + paymentDays)
    const invPayload = {
      user_id: user.id, client_id: clientId, invoice_number: invoiceNumber,
      invoice_year: new Date(invoiceDate).getFullYear(),
      sequence_number: parseInt(invoiceNumber.replace(/\D/g, '').slice(4)) || 1,
      invoice_date: invoiceDate, due_date: toISO(dueDate),
      subtotal, hst_rate: hstRate, hst_amount: hstAmount, total, total_hours: totalHours,
      status: newStatus, updated_at: new Date().toISOString(),
    }
    let invId = id
    if (id) {
      await supabase.from('invoices').update(invPayload).eq('id', id)
      await supabase.from('invoice_lines').delete().eq('invoice_id', id)
    } else {
      const { data, error: e } = await supabase.from('invoices').insert(invPayload).select().single()
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

  if (loading) return (
    <PageShell crumb="Rapidmatix" title={id ? 'Edit Invoice' : 'New Invoice'}>
      <Spinner />
    </PageShell>
  )

  return (
    <PageShell
      crumb="Rapidmatix"
      title={id ? invoiceNumber : 'New Invoice'}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => handleSave('draft')} disabled={saving}>
            Save Draft
          </Button>
          <Button variant="primary" onClick={() => handleSave('sent')} disabled={saving}>
            {saving ? 'Saving…' : 'Save & Mark Sent'}
          </Button>
        </div>
      }
    >
      {/* Scoped styles for this page */}
      <style>{css}</style>

      {error && <div style={s.err}>{error}</div>}

      {/* ── Invoice Details ── */}
      <div style={s.card}>
        <div style={s.sectionLabel}>Invoice Details</div>
        <div style={s.grid2}>
          <Field label="Client">
            <div style={s.selectWrap}>
              <select className="fi inv-select" value={clientId}
                onChange={e => handleClientChange(e.target.value)}>
                <option value="">Select client…</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.consulting_client ? ` — ${c.consulting_client}` : ''}
                  </option>
                ))}
              </select>
              <svg style={s.selectChevron} viewBox="0 0 10 6" fill="none">
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </Field>

          <Field label="Invoice date">
            <input type="date" className="inv-date" value={invoiceDate}
              onChange={e => setInvoiceDate(e.target.value)} />
          </Field>

          <Field label="Invoice number">
            <input className="fi" value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)} />
          </Field>

          <Field label="Rate">
            <div style={s.readonlyField}>
              {rate ? <><strong style={{ color: 'var(--sage-dark)', fontFamily: 'Sora, sans-serif' }}>{fmtMoney(rate)}</strong> / hr</> : '—'}
            </div>
          </Field>
        </div>
      </div>

      {/* ── Billing lines ── */}
      <div style={s.tableCard}>
        <table style={s.table}>
          <colgroup>
            <col style={{ width: '23%' }} />
            <col style={{ width: '23%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={s.th}>From (Sun)</th>
              <th style={s.th}>To (Sat)</th>
              <th style={{ ...s.th, textAlign: 'center' }}>Hours</th>
              <th style={{ ...s.th, textAlign: 'center' }}>Rate / hr</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Amount</th>
              <th style={s.th} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} style={s.trow} className="inv-row">
                <td style={s.td}>
                  <input type="date" className="inv-date" value={l.period_from}
                    onChange={e => updateLine(i, 'period_from', e.target.value)} />
                </td>
                <td style={s.td}>
                  <input type="date" className="inv-date" value={l.period_to}
                    onChange={e => updateLine(i, 'period_to', e.target.value)} />
                </td>
                <td style={s.td}>
                  <input type="number" className="inv-num" value={l.hours}
                    min="0" step="1" onChange={e => updateLine(i, 'hours', e.target.value)} />
                </td>
                <td style={s.td}>
                  <input type="number" className="inv-num" value={l.hourly_rate}
                    min="0" step="0.01" onChange={e => updateLine(i, 'hourly_rate', e.target.value)} />
                </td>
                <td style={{ ...s.td, textAlign: 'right' }}>
                  <span style={s.amt}>{fmtMoney(+l.hours * +l.hourly_rate)}</span>
                </td>
                <td style={{ ...s.td, textAlign: 'center' }}>
                  <button className="inv-remove" onClick={() => removeLine(i)} title="Remove">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={s.addRowWrap}>
          <Button variant="ghost" size="sm" onClick={addLine}>+ Add row</Button>
        </div>
      </div>

      {/* ── Totals ── */}
      <div style={s.totalsCard}>
        <div style={s.totalsInner}>

          {/* Left side — summary stats */}
          <div style={s.totalsMeta}>
            <div>
              <div style={s.bigNum}>{fmt2(totalHours)}</div>
              <div style={s.bigNumLabel}>billable hours</div>
            </div>
            <div style={s.metaDivider} />
            <div>
              <div style={s.bigNum}>{lines.length}</div>
              <div style={s.bigNumLabel}>{lines.length === 1 ? 'period' : 'periods'}</div>
            </div>
          </div>

          {/* Right side — subtotal / hst / total */}
          <div style={s.totalsBreakdown}>
            <div style={s.totalsRow}>
              <span style={s.totalsLabel}>Subtotal</span>
              <span style={s.totalsVal}>{fmtMoney(subtotal)}</span>
            </div>
            <div style={s.totalsRow}>
              <span style={s.totalsLabel}>HST ({hstRate}%)</span>
              <span style={s.totalsVal}>{fmtMoney(hstAmount)}</span>
            </div>
            <div style={s.totalsDivider} />
            <div style={s.totalsGrand}>
              <span style={s.grandLabel}>Total Due</span>
              <span style={s.grandVal}>{fmtMoney(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
      <label style={{
        fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
        letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

/* ── Scoped CSS injected into page ── */
const css = `
  /* Date input — consistent with fi but with subtle calendar icon */
  .inv-date {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 9px 12px;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    color: var(--text-primary);
    outline: none;
    width: 100%;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
    letter-spacing: 0.01em;
    -webkit-appearance: none;
    appearance: none;
    box-sizing: border-box;
  }
  .inv-date:focus {
    border-color: var(--sage-dark);
    box-shadow: 0 0 0 3px rgba(45,90,69,0.1);
  }
  .inv-date::-webkit-calendar-picker-indicator {
    opacity: 0.35;
    cursor: pointer;
    filter: invert(30%) sepia(20%) saturate(500%) hue-rotate(100deg);
  }
  .inv-date::-webkit-datetime-edit { padding: 0; }
  .inv-date::-webkit-datetime-edit-fields-wrapper { padding: 0; }

  /* Number input — center aligned, no spinners */
  .inv-num {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 9px 12px;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    color: var(--text-primary);
    outline: none;
    width: 100%;
    text-align: center;
    transition: border-color 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
    -moz-appearance: textfield;
  }
  .inv-num:focus {
    border-color: var(--sage-dark);
    box-shadow: 0 0 0 3px rgba(45,90,69,0.1);
  }
  .inv-num::-webkit-inner-spin-button,
  .inv-num::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

  /* Hide native select arrow */
  .inv-select { -webkit-appearance: none; appearance: none; padding-right: 36px !important; }

  /* Row remove button — fade in on row hover */
  .inv-remove {
    background: none; border: none; width: 28px; height: 28px;
    border-radius: 6px; display: flex; align-items: center; justify-content: center;
    font-size: 18px; color: var(--text-muted); cursor: pointer; line-height: 1;
    margin: 0 auto; opacity: 0; transition: opacity 0.12s, color 0.12s;
  }
  .inv-row:hover .inv-remove { opacity: 1; }
  .inv-remove:hover { color: var(--red-text); }

  /* Row hover bg */
  .inv-row:hover { background: var(--linen-mid); }
`

/* ── Styles ── */
const s = {
  err: {
    background: 'var(--red-pale)', border: '1px solid #f5c0bc',
    borderRadius: 8, padding: '10px 14px', fontSize: 13,
    color: 'var(--red-text)', marginBottom: 16,
  },

  /* Details card */
  card: {
    background: 'var(--white)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '22px 24px',
    marginBottom: 12, boxShadow: 'var(--shadow-sm)',
  },
  sectionLabel: {
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    letterSpacing: '0.12em', textTransform: 'uppercase',
    marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--border-light)',
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' },
  selectWrap: { position: 'relative' },
  selectChevron: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    width: 10, height: 6, color: 'var(--text-muted)', pointerEvents: 'none',
  },
  readonlyField: {
    background: 'var(--linen-mid)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', padding: '9px 12px',
    fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif',
  },

  /* Table */
  tableCard: {
    background: 'var(--white)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', overflow: 'hidden',
    marginBottom: 12, boxShadow: 'var(--shadow-sm)',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    letterSpacing: '0.1em', textTransform: 'uppercase',
    padding: '12px 16px', background: 'var(--linen-mid)',
    borderBottom: '1px solid var(--border)', textAlign: 'left',
  },
  trow: { borderBottom: '1px solid var(--border-light)', transition: 'background 0.1s' },
  td: { padding: '10px 16px', verticalAlign: 'middle' },
  amt: {
    fontFamily: 'Sora, sans-serif', fontSize: 15, fontWeight: 700,
    color: 'var(--sage-dark)', fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.01em',
  },
  addRowWrap: { padding: '12px 16px', borderTop: '1px solid var(--border-light)' },

  /* Totals */
  totalsCard: {
    background: 'var(--white)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '22px 24px',
    boxShadow: 'var(--shadow-sm)',
  },
  totalsInner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32 },
  totalsMeta: { display: 'flex', alignItems: 'center', gap: 24 },
  bigNum: {
    fontFamily: 'Sora, sans-serif', fontSize: 28, fontWeight: 700,
    color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.1,
  },
  bigNumLabel: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 },
  metaDivider: { width: 1, height: 40, background: 'var(--border)' },
  totalsBreakdown: { display: 'flex', flexDirection: 'column', gap: 7, minWidth: 300 },
  totalsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  totalsLabel: { fontSize: 13, color: 'var(--text-muted)' },
  totalsVal: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' },
  totalsDivider: { height: 1, background: 'var(--border)', margin: '4px 0' },
  totalsGrand: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  grandLabel: { fontFamily: 'Sora, sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' },
  grandVal: {
    fontFamily: 'Sora, sans-serif', fontSize: 24, fontWeight: 700,
    color: 'var(--sage-dark)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
  },
}
