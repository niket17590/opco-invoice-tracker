import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PageShell from '../components/layout/PageShell'
import { Button, Field, Spinner } from '../components/ui'

const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin

export default function Settings() {
  const { user } = useAuth()
  const [form, setForm]                   = useState({ company_name:'', hst_number:'', address:'', phone:'', email:'', invoice_prefix:'INV-', hst_rate:'13.00' })
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [saved, setSaved]                 = useState(false)
  const [error, setError]                 = useState(null)
  const [shareToken, setShareToken]       = useState(null)
  const [sharingEnabled, setSharingEnabled] = useState(false)
  const [sharedPages, setSharedPages]     = useState([])
  const [savingShare, setSavingShare]     = useState(false)
  const [copied, setCopied]               = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('settings').select('*').eq('user_id', user.id).single()
    if (data) {
      setForm({ company_name:data.company_name||'', hst_number:data.hst_number||'', address:data.address||'', phone:data.phone||'', email:data.email||'', invoice_prefix:data.invoice_prefix||'INV-', hst_rate:data.hst_rate?.toString()||'13.00' })
      setShareToken(data.share_token)
      setSharingEnabled(data.sharing_enabled||false)
      setSharedPages(data.shared_pages||[])
    }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true); setSaved(false); setError(null)
    const { error: e } = await supabase.from('settings').update({
      company_name:form.company_name, hst_number:form.hst_number, address:form.address,
      phone:form.phone, email:form.email, invoice_prefix:form.invoice_prefix,
      hst_rate:parseFloat(form.hst_rate)||13, updated_at:new Date().toISOString(),
    }).eq('user_id', user.id)
    setSaving(false)
    if (e) { setError(e.message); return }
    setSaved(true); setTimeout(()=>setSaved(false), 3000)
  }

  async function saveSharing(enabled, pages) {
    setSavingShare(true)
    await supabase.from('settings').update({ sharing_enabled:enabled, shared_pages:pages, updated_at:new Date().toISOString() }).eq('user_id', user.id)
    setSavingShare(false)
  }

  function toggleEnabled() { const n=!sharingEnabled; setSharingEnabled(n); saveSharing(n, sharedPages) }
  function togglePage(p) { const n=sharedPages.includes(p)?sharedPages.filter(x=>x!==p):[...sharedPages,p]; setSharedPages(n); saveSharing(sharingEnabled,n) }
  function copyLink() { navigator.clipboard.writeText(`${APP_URL}/share/${shareToken}`).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000) }) }

  const set = k => e => setForm(p=>({...p,[k]:e.target.value}))

  if (loading) return <PageShell crumb="Rapidmatix" title="Settings"><Spinner /></PageShell>

  return (
    <PageShell
      crumb="Rapidmatix" title="Settings"
      actions={
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
        </Button>
      }
    >
      {error && <div className="alert-error">{error}</div>}

      {/* Two-column outer grid */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, alignItems:'start'}}>

        {/* LEFT column */}
        <div style={{display:'flex', flexDirection:'column', gap:12}}>

          {/* Business Info */}
          <div className="settings-card" style={{margin:0}}>
            <div className="settings-card-title"><span>Business Information</span></div>
            <div className="grid-2">
              <Field label="Company name">
                <input className="fi" value={form.company_name} onChange={set('company_name')} />
              </Field>
              <Field label="HST number">
                <input className="fi" value={form.hst_number} onChange={set('hst_number')} />
              </Field>
              <Field label="Phone">
                <input className="fi" value={form.phone} onChange={set('phone')} />
              </Field>
              <Field label="Email">
                <input className="fi" type="email" value={form.email} onChange={set('email')} />
              </Field>
            </div>
            <Field label="Address">
              <input className="fi" value={form.address} onChange={set('address')} />
            </Field>
          </div>

          {/* Invoice Prefs */}
          <div className="settings-card" style={{margin:0}}>
            <div className="settings-card-title"><span>Invoice Preferences</span></div>
            <div className="grid-2">
              <Field label="Invoice prefix">
                <input className="fi" value={form.invoice_prefix} onChange={set('invoice_prefix')} />
              </Field>
              <Field label="HST rate (%)">
                <input className="fi" type="number" min="0" max="100" step="0.01" value={form.hst_rate} onChange={set('hst_rate')} />
              </Field>
            </div>
            <p className="text-muted fs-11">
              Numbers generate as <strong className="text-sage">{form.invoice_prefix||'INV-'}2026001</strong>
            </p>
          </div>

          {/* Account */}
          <div className="settings-card" style={{margin:0}}>
            <div className="settings-card-title"><span>Account</span></div>
            <p className="fs-13 text-muted">Signed in as <strong className="text-primary">{user?.email}</strong></p>
            <p className="fs-11 text-muted mt-4">Sign out via the sidebar avatar.</p>
          </div>
        </div>

        {/* RIGHT column */}
        <div style={{display:'flex', flexDirection:'column', gap:12}}>

          {/* Sharing */}
          <div className="settings-card" style={{margin:0}}>
            <div className="settings-card-title">
              <span>Sharing</span>
              <span className="settings-badge" style={{color:sharingEnabled?'var(--green-text)':'inherit',background:sharingEnabled?'var(--green-pale)':'var(--linen)',border:`1px solid ${sharingEnabled?'var(--green-border)':'var(--border)'}`}}>
                {sharingEnabled ? 'Active' : 'Off'}
              </span>
            </div>

            {/* Toggle row */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>Enable share link</div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:1}}>Anyone with the link can view selected pages</div>
              </div>
              <button onClick={toggleEnabled} disabled={savingShare} style={{width:40,height:22,borderRadius:11,border:'none',cursor:'pointer',background:sharingEnabled?'var(--sage-dark)':'var(--linen-dark)',position:'relative',transition:'background .2s',flexShrink:0}}>
                <div style={{position:'absolute',top:2,left:sharingEnabled?20:2,width:18,height:18,borderRadius:'50%',background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}} />
              </button>
            </div>

            {/* Page selection */}
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:8}}>Pages to share</div>
            <div style={{display:'flex',gap:8,marginBottom:14}}>
              {[{key:'dashboard',label:'Dashboard',desc:'Charts & stats'},{key:'invoices',label:'Invoices',desc:'Invoice history'}].map(p => {
                const on = sharedPages.includes(p.key)
                return (
                  <button key={p.key} onClick={()=>togglePage(p.key)} disabled={savingShare} style={{flex:1,padding:'10px 12px',borderRadius:8,cursor:'pointer',textAlign:'left',border:`2px solid ${on?'var(--sage-dark)':'var(--border)'}`,background:on?'var(--sage-pale)':'var(--white)',transition:'all .15s'}}>
                    <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
                      <div style={{width:14,height:14,borderRadius:3,border:`2px solid ${on?'var(--sage-dark)':'var(--linen-dark)'}`,background:on?'var(--sage-dark)':'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {on && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span style={{fontSize:12,fontWeight:600,color:on?'var(--sage-dark)':'var(--text-primary)'}}>{p.label}</span>
                    </div>
                    <div style={{fontSize:10,color:'var(--text-muted)',paddingLeft:21}}>{p.desc}</div>
                  </button>
                )
              })}
            </div>

            {/* Link */}
            {shareToken && (
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:6}}>Share link</div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <div style={{flex:1,padding:'7px 10px',background:'var(--linen-mid)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',fontSize:11,color:sharingEnabled?'var(--text-secondary)':'var(--text-muted)',fontFamily:'monospace',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
                    {APP_URL}/share/{shareToken}
                  </div>
                  <Button variant={copied?'primary':'ghost'} size="sm" onClick={copyLink} disabled={!sharingEnabled||sharedPages.length===0}>
                    {copied ? '✓ Copied' : 'Copy'}
                  </Button>
                </div>
                <p style={{fontSize:11,color:'var(--text-muted)',marginTop:5}}>
                  {!sharingEnabled ? 'Enable sharing to activate this link.' : sharedPages.length===0 ? 'Select at least one page.' : `Sharing ${sharedPages.join(' & ')} in read-only mode.`}
                </p>
              </div>
            )}
          </div>

          {/* Google Drive */}
          <div className="settings-card" style={{margin:0}}>
            <div className="settings-card-title"><span>Google Drive</span><span className="settings-badge">optional</span></div>
            <Field label="Drive folder ID">
              <input className="fi" value={''} disabled placeholder="Coming soon" />
            </Field>
            <p className="text-muted fs-11 mt-4">Find folder ID in Drive URL after <code>/folders/</code></p>
          </div>

        </div>
      </div>
    </PageShell>
  )
}
