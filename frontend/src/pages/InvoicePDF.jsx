/**
 * InvoicePDF.jsx
 * Exports: InvoicePreviewModal, generatePDF
 */

import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const fmtM = n => `$${parseFloat(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtD = d => {
  if (!d) return ''
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/* ══════════════════════════════════════════════════════════════
   INVOICE TEMPLATE — fills full A4 page elegantly
   ══════════════════════════════════════════════════════════════ */
export function InvoiceTemplate({ invoice, settings, client, lines }) {
  const sub     = lines.reduce((s, l) => s + (+l.hours * +l.hourly_rate), 0)
  const hstPct  = +(invoice?.hst_rate || settings?.hst_rate || 13)
  const hstAmt  = sub * hstPct / 100
  const total   = sub + hstAmt
  const totHrs  = lines.reduce((s, l) => s + +l.hours, 0)

  const companyName  = settings?.company_name  || 'RAPIDMATIX TECHNOLOGY SOLUTIONS LTD.'
  const hstNum       = settings?.hst_number    || ''
  const senderAddr   = settings?.address       || ''
  const senderPhone  = settings?.phone         || ''
  const contractor   = settings?.contractor_name || 'Niket Agrawal'

  const clientName    = client?.name             || ''
  const clientConsult = client?.consulting_client || ''  // e.g. "CIBC Financial Group"
  const clientAddr    = client?.address          || ''
  const clientPhone   = client?.phone            || ''
  const pmtDays       = client?.payment_terms_days || 15

  // Split sender address into lines
  const addrParts = senderAddr ? senderAddr.split(',').map(s => s.trim()).filter(Boolean) : []

  return (
    <div style={T.page}>

      {/* ════ HEADER BAND ════ */}
      <div style={T.headerBand}>
        {/* Left: Company name + tag */}
        <div style={T.headerLeft}>
          <div style={T.companyName}>{companyName}</div>
          {hstNum && <div style={T.hstBadge}>HST# {hstNum}</div>}
        </div>
        {/* Right: INVOICE label + number */}
        <div style={T.headerRight}>
          <div style={T.invoiceWord}>INVOICE</div>
          <div style={T.invoiceNum}>{invoice?.invoice_number}</div>
        </div>
      </div>

      {/* ════ TWO-COLUMN META ════ */}
      <div style={T.metaSection}>

        {/* Left col: FROM + BILL TO + CONSULTING CLIENT stacked */}
        <div style={T.metaLeft}>

          {/* FROM */}
          <div style={T.metaBlock}>
            <div style={T.metaBlockLabel}>FROM</div>
            <div style={T.metaBlockName}>{companyName}</div>
            {addrParts.map((p, i) => (
              <div key={i} style={T.metaBlockLine}>{p}</div>
            ))}
            {senderPhone && <div style={T.metaBlockLine}>{senderPhone}</div>}
          </div>

          {/* BILL TO */}
          <div style={{ ...T.metaBlock, marginTop: 22 }}>
            <div style={T.metaBlockLabel}>BILL TO</div>
            <div style={T.metaBlockName}>{clientName}</div>
            {clientAddr && clientAddr.split(',').map((part, i) => (
              <div key={i} style={T.metaBlockLine}>{part.trim()}</div>
            ))}
            {clientPhone && <div style={T.metaBlockLine}>{clientPhone}</div>}
          </div>

          {/* CONSULTING CLIENT — only shown if set */}
          {clientConsult && (
            <div style={{ ...T.metaBlock, marginTop: 22 }}>
              <div style={T.metaBlockLabel}>CONSULTING CLIENT</div>
              <div style={T.metaBlockName}>{clientConsult}</div>
            </div>
          )}
        </div>

        {/* Right col: invoice meta table */}
        <div style={T.metaRight}>
          <div style={T.metaTable}>
            {[
              ['Invoice Number',  invoice?.invoice_number],
              ['Date of Issue',   fmtD(invoice?.invoice_date)],
              ['Payment Terms',   `Net ${pmtDays} Days`],
              ['Contractor',      contractor],
            ].map(([k, v]) => (
              <div key={k} style={T.metaTableRow}>
                <span style={T.metaTableKey}>{k}</span>
                <span style={T.metaTableVal}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════ DIVIDER ════ */}
      <div style={T.divider} />

      {/* ════ BILLING TABLE ════ */}
      <div style={T.tableSection}>
        <div style={T.tableSectionLabel}>INVOICE DETAILS</div>
        <table style={T.table}>
          <thead>
            <tr>
              <th style={{ ...T.th, textAlign: 'left',   width: '46%' }}>
                Billing Period (as per timesheet)
              </th>
              <th style={{ ...T.th, textAlign: 'center', width: '15%' }}>Hours</th>
              <th style={{ ...T.th, textAlign: 'center', width: '20%' }}>Rate / hr</th>
              <th style={{ ...T.th, textAlign: 'right',  width: '19%' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={{ ...T.td, textAlign: 'left', background: i % 2 === 0 ? '#fff' : '#f7f5f0' }}>
                  Week: {fmtD(l.period_from)} to {fmtD(l.period_to)}
                </td>
                <td style={{ ...T.td, textAlign: 'center', background: i % 2 === 0 ? '#fff' : '#f7f5f0' }}>
                  {l.hours}
                </td>
                <td style={{ ...T.td, textAlign: 'center', background: i % 2 === 0 ? '#fff' : '#f7f5f0' }}>
                  {fmtM(l.hourly_rate)}
                </td>
                <td style={{ ...T.td, textAlign: 'right', background: i % 2 === 0 ? '#fff' : '#f7f5f0', fontWeight: 600 }}>
                  {fmtM(+l.hours * +l.hourly_rate)}
                </td>
              </tr>
            ))}
            {/* Empty rows to give table body some height if few lines */}
            {lines.length < 3 && Array(3 - lines.length).fill(0).map((_, i) => (
              <tr key={`empty-${i}`}>
                <td style={{ ...T.td, background: '#fff', color: 'transparent' }}>—</td>
                <td style={{ ...T.td, background: '#fff' }} />
                <td style={{ ...T.td, background: '#fff' }} />
                <td style={{ ...T.td, background: '#fff' }} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ════ TOTALS ════ */}
      <div style={T.totalsSection}>
        <div style={T.totalsTable}>

          <div style={T.totalsRow}>
            <span style={T.totalsLabel}>Billable Hours</span>
            <span style={T.totalsVal}>{totHrs} hrs</span>
          </div>

          <div style={T.totalsRow}>
            <span style={T.totalsLabel}>Subtotal</span>
            <span style={T.totalsVal}>{fmtM(sub)}</span>
          </div>

          <div style={T.totalsRow}>
            <span style={T.totalsLabel}>HST</span>
            <span style={T.totalsVal}>{hstPct}%</span>
          </div>

          <div style={T.totalsRow}>
            <span style={T.totalsLabel}>GST / HST Amt</span>
            <span style={T.totalsVal}>{fmtM(hstAmt)}</span>
          </div>

          <div style={T.totalsDivider} />

          <div style={T.grandRow}>
            <span style={T.grandLabel}>TOTAL DUE</span>
            <span style={T.grandVal}>{fmtM(total)}</span>
          </div>

        </div>
      </div>

      {/* ════ SPACER pushes footer to bottom ════ */}
      <div style={{ flex: 1 }} />

      {/* ════ FOOTER BAND ════ */}
      <div style={T.footerBand}>
        <div style={T.footerLeft}>
          <div style={T.footerLabel}>PAYMENT INSTRUCTIONS</div>
          <div style={T.footerText}>
            Please remit payment within {pmtDays} days of invoice date.
            {settings?.email ? ` Questions? Contact us at ${settings.email}.` : ''}
          </div>
        </div>
        <div style={T.footerRight}>
          <div style={T.footerLabel}>THANK YOU FOR YOUR BUSINESS</div>
          <div style={T.footerText}>{companyName}</div>
          {hstNum && <div style={T.footerText}>HST# {hstNum}</div>}
        </div>
      </div>

    </div>
  )
}

/* ── Full-page A4 styles ──────────────────────────────────── */
const SAGE   = '#2d5a45'
const SAGE2  = '#3d7a5e'
const BORDER = '#ddd8d0'
const LIGHT  = '#f5f2ec'

const T = {
  page: {
    width: 794,
    height: 1123,           // exact A4 @ 96dpi
    background: '#ffffff',
    fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    color: '#1a2e22',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },

  /* Header band */
  headerBand: {
    background: SAGE,
    padding: '28px 44px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerLeft: {},
  companyName: {
    fontFamily: "'Sora', 'Georgia', serif",
    fontSize: 22,
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '0.01em',
    lineHeight: 1.25,
  },
  hstBadge: {
    fontSize: 10,
    color: '#9fc8b0',
    marginTop: 6,
    letterSpacing: '0.06em',
  },
  headerRight: {
    textAlign: 'right',
  },
  invoiceWord: {
    fontSize: 10,
    fontWeight: 700,
    color: '#9fc8b0',
    letterSpacing: '0.28em',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  invoiceNum: {
    fontFamily: "'Sora', serif",
    fontSize: 15,
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '0.04em',
  },

  /* Meta section */
  metaSection: {
    display: 'flex',
    gap: 0,
    padding: '32px 44px 24px',
  },
  metaLeft: {
    flex: 1,
  },
  metaBlock: {},
  metaBlockLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: '#a89e90',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    marginBottom: 8,
    borderBottom: `1px solid ${BORDER}`,
    paddingBottom: 5,
  },
  metaBlockName: {
    fontSize: 13,
    fontWeight: 700,
    color: '#1a2e22',
    marginBottom: 3,
    lineHeight: 1.4,
  },
  metaBlockLine: {
    fontSize: 11,
    color: '#5a7a6a',
    lineHeight: 1.7,
  },

  metaRight: {
    flexShrink: 0,
    width: 260,
    marginLeft: 48,
  },
  metaTable: {
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    overflow: 'hidden',
  },
  metaTableRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '9px 14px',
    borderBottom: `1px solid ${BORDER}`,
    background: '#fff',
  },
  metaTableKey: {
    fontSize: 10,
    color: '#8a8070',
    fontWeight: 600,
    letterSpacing: '0.03em',
  },
  metaTableVal: {
    fontSize: 10,
    color: '#1a2e22',
    fontWeight: 700,
    textAlign: 'right',
  },

  divider: {
    height: 2,
    background: SAGE,
    margin: '0 44px 24px',
    borderRadius: 1,
  },

  /* Table */
  tableSection: {
    padding: '0 44px',
    marginBottom: 24,
  },
  tableSectionLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: '#a89e90',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    overflow: 'hidden',
  },
  th: {
    background: SAGE,
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    padding: '11px 14px',
    borderRight: '1px solid rgba(255,255,255,0.15)',
  },
  td: {
    fontSize: 12,
    color: '#2a3a2a',
    padding: '11px 14px',
    borderBottom: `1px solid ${BORDER}`,
    borderRight: `1px solid ${BORDER}`,
  },

  /* Totals */
  totalsSection: {
    padding: '0 44px',
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: 32,
  },
  totalsTable: {
    width: 300,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    overflow: 'hidden',
  },
  totalsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: `1px solid ${BORDER}`,
    background: '#fff',
  },
  totalsLabel: {
    fontSize: 11,
    color: '#6a7a6a',
    fontWeight: 500,
  },
  totalsVal: {
    fontSize: 12,
    color: '#1a2e22',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  totalsDivider: {
    height: 2,
    background: SAGE,
  },
  grandRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: SAGE,
  },
  grandLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#9fc8b0',
    letterSpacing: '0.12em',
  },
  grandVal: {
    fontSize: 18,
    fontWeight: 700,
    color: '#ffffff',
    fontVariantNumeric: 'tabular-nums',
    fontFamily: "'Sora', serif",
    letterSpacing: '-0.01em',
  },

  /* Footer band */
  footerBand: {
    background: LIGHT,
    borderTop: `2px solid ${SAGE}`,
    padding: '22px 44px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 32,
  },
  footerLeft: { flex: 1 },
  footerRight: { flexShrink: 0, textAlign: 'right' },
  footerLabel: {
    fontSize: 8,
    fontWeight: 700,
    color: SAGE,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  footerText: {
    fontSize: 10,
    color: '#5a7a6a',
    lineHeight: 1.6,
  },
}

/* ══════════════════════════════════════════════════════════════
   PDF GENERATION
   ══════════════════════════════════════════════════════════════ */
export async function generatePDF(templateRef, invoiceNumber) {
  const el = templateRef.current
  if (!el) return

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: 794,
    height: 1123,
  })

  const imgData = canvas.toDataURL('image/jpeg', 0.97)
  const pdf     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pdfW    = pdf.internal.pageSize.getWidth()   // 210mm
  const pdfH    = pdf.internal.pageSize.getHeight()  // 297mm

  pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH)
  pdf.save(`${invoiceNumber || 'invoice'}.pdf`)
}

/* ══════════════════════════════════════════════════════════════
   PREVIEW MODAL
   ══════════════════════════════════════════════════════════════ */
export function InvoicePreviewModal({ invoice, settings, client, lines, onClose }) {
  const templateRef        = useRef(null)
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try { await generatePDF(templateRef, invoice?.invoice_number) }
    finally { setDownloading(false) }
  }

  return (
    <div style={M.overlay} onClick={onClose}>
      {/* inject keyframe for spinner */}
      <style>{`@keyframes _spin { to { transform: rotate(360deg); } }`}</style>

      <div style={M.panel} onClick={e => e.stopPropagation()}>

        {/* Toolbar */}
        <div style={M.toolbar}>
          <div>
            <div style={M.toolbarTitle}>Invoice Preview</div>
            <div style={M.toolbarSub}>{invoice?.invoice_number} · Exactly as it will be saved to PDF</div>
          </div>
          <div style={M.toolbarActions}>
            <button
              style={{ ...M.dlBtn, opacity: downloading ? 0.75 : 1, cursor: downloading ? 'default' : 'pointer' }}
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <div style={M.spin} />
                  Generating…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M6.5 1v7.5M4 6l2.5 2.5L9 6M1.5 10.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Download PDF
                </>
              )}
            </button>
            <button style={M.closeBtn} onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {/* Preview scroll area */}
        <div style={M.scrollArea}>
          <div style={M.paper}>
            <div ref={templateRef}>
              <InvoiceTemplate
                invoice={invoice}
                settings={settings}
                client={client}
                lines={lines}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

const M = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(8,18,12,0.72)',
    backdropFilter: 'blur(5px)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    zIndex: 2000, overflowY: 'auto', padding: '20px 16px 40px',
  },
  panel: {
    width: '100%', maxWidth: 860,
    background: '#1a2e22',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 40px 100px rgba(0,0,0,0.5)',
    display: 'flex', flexDirection: 'column',
  },
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px',
    background: '#2d5a45',
    gap: 12, flexShrink: 0,
  },
  toolbarTitle: {
    fontFamily: "'Sora', sans-serif",
    fontSize: 14, fontWeight: 700, color: '#fff',
  },
  toolbarSub: {
    fontSize: 11, color: '#9fc8b0', marginTop: 2,
  },
  toolbarActions: {
    display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
  },
  dlBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    background: '#fff', color: '#2d5a45',
    border: 'none', borderRadius: 7,
    fontFamily: "'Inter', sans-serif",
    fontSize: 12, fontWeight: 700,
    padding: '8px 16px',
    transition: 'opacity 0.12s',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.12)', border: 'none',
    color: '#fff', width: 32, height: 32,
    borderRadius: 7, fontSize: 15,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  scrollArea: {
    padding: '28px 20px 36px',
    display: 'flex', justifyContent: 'center',
    background: '#111c14',
    overflowX: 'auto',
  },
  paper: {
    boxShadow: '0 4px 40px rgba(0,0,0,0.5)',
    flexShrink: 0, width: 794,
  },
  spin: {
    width: 12, height: 12,
    border: '2px solid rgba(45,90,69,0.3)',
    borderTopColor: '#2d5a45',
    borderRadius: '50%',
    animation: '_spin 0.7s linear infinite',
  },
}
