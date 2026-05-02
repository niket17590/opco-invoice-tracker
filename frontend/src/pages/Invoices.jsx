import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, StatusBadge, Spinner } from '../components/ui'
import PageShell from '../components/layout/PageShell'

const fmt   = n => `$${parseFloat(n||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmtD  = d => d ? new Date(d+'T12:00:00').toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'}) : '—'
const toISO = d => d.toISOString().split('T')[0]
const FILTERS = ['all','draft','sent','paid']

export default function Invoices() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [invoices, setInvoices]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState('all')
  const [updating, setUpdating]       = useState(null)
  const [deleting, setDeleting]       = useState(null)

  // Mark Sent modal (capture due date)
  const [sentModal, setSentModal]     = useState(null)
  const [dueDate, setDueDate]         = useState('')
  const [savingSent, setSavingSent]   = useState(false)

  // Mark Paid modal (capture actual payment received date)
  const [paidModal, setPaidModal]     = useState(null)
  const [payDate, setPayDate]         = useState(toISO(new Date()))
  const [savingPaid, setSavingPaid]   = useState(false)

  // Delete modal
  const [deleteModal, setDeleteModal] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('invoices').select('*, clients(name)')
      .eq('user_id', user.id).order('invoice_date', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  // ── Mark Sent: set due_date = invoice_date + payment_terms_days ──
  function openMarkSent(inv) {
    // Default due date = invoice_date + client payment terms
    // We don't have payment_terms_days on the invoice row directly,
    // so default to invoice_date + 15 days; user can adjust
    const base = new Date(inv.invoice_date + 'T12:00:00')
    base.setDate(base.getDate() + 15)
    setSentModal(inv)
    setDueDate(toISO(base))
  }

  async function confirmMarkSent() {
    if (!sentModal) return
    setSavingSent(true)
    await supabase.from('invoices').update({
      status:     'sent',
      due_date:   dueDate,
      updated_at: new Date().toISOString(),
    }).eq('id', sentModal.id)
    setSavingSent(false)
    setSentModal(null)
    load()
  }

  // ── Mark Paid: overwrite due_date with actual payment received date ──
  function openMarkPaid(inv) {
    setPaidModal(inv)
    setPayDate(toISO(new Date()))
  }

  async function confirmMarkPaid() {
    if (!paidModal) return
    setSavingPaid(true)
    await supabase.from('invoices').update({
      status:     'paid',
      due_date:   payDate,   // now = actual payment received date
      updated_at: new Date().toISOString(),
    }).eq('id', paidModal.id)
    setSavingPaid(false)
    setPaidModal(null)
    load()
  }

  // ── Delete ──
  async function confirmDelete() {
    if (!deleteModal) return
    setDeleting(deleteModal.id)
    await supabase.from('invoice_lines').delete().eq('invoice_id', deleteModal.id)
    await supabase.from('invoices').delete().eq('id', deleteModal.id)
    setDeleting(null)
    setDeleteModal(null)
    load()
  }

  const visible = filter === 'all' ? invoices : invoices.filter(i => i.status === filter)

  return (
    <PageShell
      crumb="Rapidmatix" title="Invoices"
      actions={<Button variant="primary" onClick={() => navigate('/invoices/new')}>+ New Invoice</Button>}
    >
      <style>{RESPONSIVE_CSS}</style>

      {/* Filter tabs */}
      <div className="filter-tabs inv-filter-tabs">
        {FILTERS.map(f => (
          <button
            key={f}
            className={`filter-tab${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="filter-tab-count">
              {f === 'all' ? invoices.length : invoices.filter(i => i.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* ── Desktop table ── */}
          <div className="tbl-wrap inv-desktop-table">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{width:110}}>Invoice #</th>
                  <th>Client</th>
                  <th style={{width:96}}>Issued</th>
                  <th style={{width:116}}>Due / Paid Date</th>
                  <th className="tc-right" style={{width:100}}>Amount</th>
                  <th className="tc-right" style={{width:72}}>Status</th>
                  <th className="tc-right" style={{width:185}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan="7" className="empty-state">
                    {filter === 'all' ? 'No invoices yet.' : `No ${filter} invoices.`}
                  </td></tr>
                ) : visible.map(inv => (
                  <tr key={inv.id}>
                    <td className="tc-mono clickable" onClick={() => navigate(`/invoices/${inv.id}`)}>
                      {inv.invoice_number}
                    </td>
                    <td className="tc-bold clickable" onClick={() => navigate(`/invoices/${inv.id}`)}>
                      {inv.clients?.name || '—'}
                    </td>
                    <td className="fs-12">{fmtD(inv.invoice_date)}</td>
                    <td className="fs-12">
                      {inv.status === 'paid' && inv.due_date ? (
                        <span style={{color:'var(--green-text)',fontWeight:600}}>{fmtD(inv.due_date)}</span>
                      ) : inv.status === 'sent' && inv.due_date ? (
                        <span style={{color:'var(--amber)'}}>{fmtD(inv.due_date)}</span>
                      ) : (
                        <span style={{color:'var(--text-muted)'}}>—</span>
                      )}
                    </td>
                    <td className="tc-amt">{fmt(inv.total)}</td>
                    <td className="tc-right"><StatusBadge status={inv.status} /></td>
                    <td className="tc-actions" style={{display:'flex',gap:4,justifyContent:'flex-end',flexWrap:'wrap'}}>
                      {inv.status === 'draft' && (
                        <Button variant="ghost" size="sm" disabled={updating === inv.id}
                          onClick={() => openMarkSent(inv)}>Mark Sent</Button>
                      )}
                      {inv.status === 'sent' && (
                        <Button variant="primary" size="sm" disabled={updating === inv.id}
                          onClick={() => openMarkPaid(inv)}>Mark Paid</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${inv.id}`)}>View</Button>
                      <Button variant="danger" size="sm"
                        disabled={deleting === inv.id}
                        onClick={() => setDeleteModal(inv)}>
                        {deleting === inv.id ? '…' : 'Del'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Mobile card list ── */}
          <div className="inv-mobile-list">
            {visible.length === 0 ? (
              <div className="empty-state">
                {filter === 'all' ? 'No invoices yet.' : `No ${filter} invoices.`}
              </div>
            ) : visible.map(inv => (
              <div key={inv.id} className="inv-mobile-card">
                <div className="inv-mobile-card-top" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <div className="inv-mobile-card-left">
                    <div className="inv-mobile-num">{inv.invoice_number}</div>
                    <div className="inv-mobile-client">{inv.clients?.name || '—'}</div>
                    <div className="inv-mobile-date">
                      Issued {fmtD(inv.invoice_date)}
                      {inv.status === 'paid' && inv.due_date && (
                        <span style={{color:'var(--green-text)',marginLeft:6}}>· Paid {fmtD(inv.due_date)}</span>
                      )}
                      {inv.status === 'sent' && inv.due_date && (
                        <span style={{color:'var(--amber)',marginLeft:6}}>· Due {fmtD(inv.due_date)}</span>
                      )}
                    </div>
                  </div>
                  <div className="inv-mobile-card-right">
                    <div className="inv-mobile-amt">{fmt(inv.total)}</div>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
                <div className="inv-mobile-actions">
                  {inv.status === 'draft' && (
                    <Button variant="ghost" size="sm" disabled={updating === inv.id}
                      onClick={() => openMarkSent(inv)}>Mark Sent</Button>
                  )}
                  {inv.status === 'sent' && (
                    <Button variant="primary" size="sm" disabled={updating === inv.id}
                      onClick={() => openMarkPaid(inv)}>Mark Paid</Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${inv.id}`)}>View</Button>
                  <Button variant="danger" size="sm"
                    disabled={deleting === inv.id}
                    onClick={() => setDeleteModal(inv)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Mark Sent Modal ── */}
      {sentModal && (
        <div className="modal-overlay" onClick={() => setSentModal(null)}>
          <div className="modal" style={{maxWidth:400}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Mark as Sent</span>
              <button className="modal-close" onClick={() => setSentModal(null)}>✕</button>
            </div>

            <div style={{marginBottom:6}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',marginBottom:2}}>
                {sentModal.invoice_number}
              </div>
              <div style={{fontSize:12,color:'var(--text-muted)'}}>
                {sentModal.clients?.name} · {fmt(sentModal.total)}
              </div>
            </div>

            <div style={{height:1,background:'var(--border)',margin:'14px 0'}}/>

            <div className="field">
              <label className="field-label">Payment Due Date</label>
              <input
                type="date"
                className="fi"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                autoFocus
              />
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:5}}>
                The date by which payment is expected from your client.
              </div>
            </div>

            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setSentModal(null)}>Cancel</Button>
              <Button variant="primary" onClick={confirmMarkSent} disabled={savingSent || !dueDate}>
                {savingSent ? 'Saving…' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark Paid Modal ── */}
      {paidModal && (
        <div className="modal-overlay" onClick={() => setPaidModal(null)}>
          <div className="modal" style={{maxWidth:400}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Mark as Paid</span>
              <button className="modal-close" onClick={() => setPaidModal(null)}>✕</button>
            </div>

            <div style={{marginBottom:6}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',marginBottom:2}}>
                {paidModal.invoice_number}
              </div>
              <div style={{fontSize:12,color:'var(--text-muted)'}}>
                {paidModal.clients?.name} · {fmt(paidModal.total)}
              </div>
              {paidModal.due_date && (
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                  Was due: {fmtD(paidModal.due_date)}
                </div>
              )}
            </div>

            <div style={{height:1,background:'var(--border)',margin:'14px 0'}}/>

            <div className="field">
              <label className="field-label">Payment Received Date</label>
              <input
                type="date"
                className="fi"
                value={payDate}
                max={toISO(new Date())}
                onChange={e => setPayDate(e.target.value)}
                autoFocus
              />
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:5}}>
                The date the money actually arrived in your bank account.
              </div>
            </div>

            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setPaidModal(null)}>Cancel</Button>
              <Button variant="primary" onClick={confirmMarkPaid} disabled={savingPaid || !payDate}>
                {savingPaid ? 'Saving…' : 'Confirm Payment'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteModal && (
        <div className="modal-overlay" onClick={() => setDeleteModal(null)}>
          <div className="modal" style={{maxWidth:400}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title" style={{color:'var(--red-text)'}}>Delete Invoice</span>
              <button className="modal-close" onClick={() => setDeleteModal(null)}>✕</button>
            </div>
            <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:12}}>
              Are you sure you want to delete <strong>{deleteModal.invoice_number}</strong>?
            </p>
            <div style={{padding:'10px 14px',background:'var(--red-pale)',border:'1px solid var(--red-border)',borderRadius:'var(--radius-md)',fontSize:12,color:'var(--red-text)'}}>
              This permanently deletes the invoice and all billing lines. This cannot be undone.
            </div>
            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setDeleteModal(null)}>Cancel</Button>
              <Button variant="danger" onClick={confirmDelete} disabled={deleting === deleteModal.id}>
                {deleting === deleteModal.id ? 'Deleting…' : 'Yes, Delete Invoice'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}

const RESPONSIVE_CSS = `
  .inv-desktop-table { display: block; }
  .inv-mobile-list   { display: none; }

  @media (max-width: 700px) {
    .inv-desktop-table { display: none !important; }
    .inv-mobile-list   { display: flex; flex-direction: column; gap: 10px; }

    .inv-filter-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 2px; flex-wrap: nowrap; }
    .inv-filter-tabs .filter-tab { white-space: nowrap; flex-shrink: 0; }

    .inv-mobile-card {
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }
    .inv-mobile-card-top {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 14px 16px; cursor: pointer; gap: 12px;
    }
    .inv-mobile-card-top:active { background: var(--linen-mid); }
    .inv-mobile-card-left  { flex: 1; min-width: 0; }
    .inv-mobile-card-right { text-align: right; flex-shrink: 0; }
    .inv-mobile-num    { font-family: monospace; font-size: 11px; color: var(--text-muted); margin-bottom: 3px; }
    .inv-mobile-client { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .inv-mobile-date   { font-size: 11px; color: var(--text-muted); }
    .inv-mobile-amt    { font-family: 'Sora', sans-serif; font-size: 16px; font-weight: 700; color: var(--sage-dark); margin-bottom: 6px; font-variant-numeric: tabular-nums; }
    .inv-mobile-actions {
      display: flex; gap: 8px; padding: 10px 16px;
      border-top: 1px solid var(--border-light);
      background: var(--linen-mid); flex-wrap: wrap;
    }
  }
`
