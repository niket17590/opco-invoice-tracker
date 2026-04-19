import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, StatusBadge, Spinner } from '../components/ui'
import PageShell from '../components/layout/PageShell'

const fmt  = n => `$${parseFloat(n||0).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmtD = d => d ? new Date(d).toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'}) : '—'
const FILTERS = ['all','draft','sent','paid']

export default function Invoices() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [updating, setUpdating] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('invoices').select('*, clients(name)')
      .eq('user_id', user.id).order('invoice_date', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  async function updateStatus(id, status) {
    setUpdating(id)
    await supabase.from('invoices').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setUpdating(null)
    load()
  }

  const visible = filter === 'all' ? invoices : invoices.filter(i => i.status === filter)

  return (
    <PageShell
      crumb="Rapidmatix" title="Invoices"
      actions={<Button variant="primary" onClick={() => navigate('/invoices/new')}>+ New Invoice</Button>}
    >
      {/* Filter tabs */}
      <div className="filter-tabs">
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
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{width:110}}>Invoice #</th>
                <th>Client</th>
                <th style={{width:88}}>Issued</th>
                <th style={{width:88}}>Due</th>
                <th className="tc-right" style={{width:100}}>Amount</th>
                <th className="tc-right" style={{width:72}}>Status</th>
                <th className="tc-right" style={{width:150}}>Actions</th>
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
                  <td className="fs-12">{fmtD(inv.due_date)}</td>
                  <td className="tc-amt">{fmt(inv.total)}</td>
                  <td className="tc-right"><StatusBadge status={inv.status} /></td>
                  <td className="tc-actions">
                    {inv.status === 'draft' && (
                      <Button variant="ghost" size="sm" disabled={updating === inv.id}
                        onClick={() => updateStatus(inv.id, 'sent')}>Mark Sent</Button>
                    )}
                    {inv.status === 'sent' && (
                      <Button variant="ghost" size="sm" disabled={updating === inv.id}
                        onClick={() => updateStatus(inv.id, 'paid')}>Mark Paid</Button>
                    )}
                    {' '}
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${inv.id}`)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  )
}
