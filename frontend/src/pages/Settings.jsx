import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PageShell from '../components/layout/PageShell'
import { Button, Field, Spinner } from '../components/ui'
import { runDriveConnect, getAccessToken } from '../lib/drive'

const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin

export default function Settings() {
  const { user } = useAuth()
  const [form, setForm]                     = useState({ company_name:'', hst_number:'', address:'', phone:'', email:'', invoice_prefix:'INV-', hst_rate:'13.00' })
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [saved, setSaved]                   = useState(false)
  const [error, setError]                   = useState(null)
  const [shareToken, setShareToken]         = useState(null)
  const [sharingEnabled, setSharingEnabled] = useState(false)
  const [sharedPages, setSharedPages]       = useState([])
  const [savingShare, setSavingShare]       = useState(false)
  const [copied, setCopied]                 = useState(false)
  // Drive
  const [driveConnected, setDriveConnected]       = useState(false)
  const [driveEmail, setDriveEmail]               = useState(null)
  const [driveFolderId, setDriveFolderId]         = useState('')
  const [connectingDrive, setConnectingDrive]     = useState(false)
  const [driveError, setDriveError]               = useState(null)
  const [disconnecting, setDisconnecting]         = useState(false)
  const [pickingFolder, setPickingFolder]         = useState(false)
  const [folderName, setFolderName]               = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('settings').select('*').eq('user_id', user.id).single()
    if (data) {
      setForm({ company_name:data.company_name||'', hst_number:data.hst_number||'', address:data.address||'', phone:data.phone||'', email:data.email||'', invoice_prefix:data.invoice_prefix||'INV-', hst_rate:data.hst_rate?.toString()||'13.00' })
      setShareToken(data.share_token)
      setSharingEnabled(data.sharing_enabled||false)
      setSharedPages(data.shared_pages||[])
      setDriveConnected(data.drive_connected||false)
      setDriveEmail(data.drive_connected_email||null)
      setDriveFolderId(data.drive_folder_id||'')
      setFolderName(data.drive_folder_name||'')
    }
    setLoading(false)
  }

  async function openFolderPicker() {
    if (!driveConnected) return
    setPickingFolder(true)
    try {
      // Get fresh access token using stored refresh token
      const { data: st } = await supabase.from('settings').select('drive_refresh_token').eq('user_id', user.id).single()
      if (!st?.drive_refresh_token) { setDriveError('Drive not connected properly. Please reconnect.'); return }
      const accessToken = await getAccessToken(st.drive_refresh_token)

      // Load Google Picker API script if not already loaded
      if (!window.google?.picker) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://apis.google.com/js/api.js'
          s.onload = resolve; s.onerror = reject
          document.head.appendChild(s)
        })
        await new Promise(resolve => window.gapi.load('picker', resolve))
      }

      // Build folder-only picker
      const picker = new window.google.picker.PickerBuilder()
        .addView(new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
          .setSelectFolderEnabled(true)
          .setMimeTypes('application/vnd.google-apps.folder'))
        .setOAuthToken(accessToken)
        .setDeveloperKey(import.meta.env.VITE_GOOGLE_API_KEY)
        .setCallback(async (data) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const folder = data.docs[0]
            const fid  = folder.id
            const name = folder.name
            setDriveFolderId(fid)
            setFolderName(name)
            // Save immediately
            await supabase.from('settings').update({
              drive_folder_id:   fid,
              drive_folder_name: name,
              updated_at:        new Date().toISOString(),
            }).eq('user_id', user.id)
          }
        })
        .build()
      picker.setVisible(true)
    } catch(e) {
      setDriveError('Could not open folder picker: ' + e.message)
    } finally {
      setPickingFolder(false)
    }
  }

  async function handleSave() {
    setSaving(true); setSaved(false); setError(null)
    const { error: e } = await supabase.from('settings').update({
      company_name:form.company_name, hst_number:form.hst_number, address:form.address,
      phone:form.phone, email:form.email, invoice_prefix:form.invoice_prefix,
      hst_rate:parseFloat(form.hst_rate)||13,
      drive_folder_id: driveFolderId || null,
      updated_at:new Date().toISOString(),
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

  async function handleConnectDrive() {
    setConnectingDrive(true); setDriveError(null)
    try {
      const tokens = await runDriveConnect()
      // Get the user's Google email from the token info
      const infoRes = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      })
      const info = await infoRes.json()

      await supabase.from('settings').update({
        drive_refresh_token:   tokens.refresh_token,
        drive_connected:       true,
        drive_connected_email: info.email || null,
        updated_at:            new Date().toISOString(),
      }).eq('user_id', user.id)

      setDriveConnected(true)
      setDriveEmail(info.email || null)
    } catch (e) {
      if (e.message !== 'cancelled') setDriveError(e.message)
    } finally {
      setConnectingDrive(false)
    }
  }

  async function handleDisconnectDrive() {
    setDisconnecting(true)
    await supabase.from('settings').update({
      drive_refresh_token:   null,
      drive_connected:       false,
      drive_connected_email: null,
      updated_at:            new Date().toISOString(),
    }).eq('user_id', user.id)
    setDriveConnected(false)
    setDriveEmail(null)
    setDisconnecting(false)
  }

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

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, alignItems:'start'}}>

        {/* LEFT */}
        <div style={{display:'flex', flexDirection:'column', gap:12}}>

          <div className="settings-card" style={{margin:0}}>
            <div className="settings-card-title"><span>Business Information</span></div>
            <div className="grid-2">
              <Field label="Company name"><input className="fi" value={form.company_name} onChange={set('company_name')} /></Field>
              <Field label="HST number"><input className="fi" value={form.hst_number} onChange={set('hst_number')} /></Field>
              <Field label="Phone"><input className="fi" value={form.phone} onChange={set('phone')} /></Field>
              <Field label="Email"><input className="fi" type="email" value={form.email} onChange={set('email')} /></Field>
            </div>
            <Field label="Address"><input className="fi" value={form.address} onChange={set('address')} /></Field>
          </div>

          <div className="settings-card" style={{margin:0}}>
            <div className="settings-card-title"><span>Invoice Preferences</span></div>
            <div className="grid-2">
              <Field label="Invoice prefix"><input className="fi" value={form.invoice_prefix} onChange={set('invoice_prefix')} /></Field>
              <Field label="HST rate (%)"><input className="fi" type="number" min="0" max="100" step="0.01" value={form.hst_rate} onChange={set('hst_rate')} /></Field>
            </div>
            <p className="text-muted fs-11">Numbers generate as <strong className="text-sage">{form.invoice_prefix||'INV-'}2026001</strong></p>
          </div>

          <div className="settings-card" style={{margin:0}}>
            <div className="settings-card-title"><span>Account</span></div>
            <p className="fs-13 text-muted">Signed in as <strong className="text-primary">{user?.email}</strong></p>
            <p className="fs-11 text-muted mt-4">Sign out via the sidebar avatar.</p>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{display:'flex', flexDirection:'column', gap:12}}>

          {/* Sharing */}
          <div className="settings-card" style={{margin:0}}>
            <div className="settings-card-title">
              <span>Sharing</span>
              <span className="settings-badge" style={{color:sharingEnabled?'var(--green-text)':'inherit',background:sharingEnabled?'var(--green-pale)':'var(--linen)',border:`1px solid ${sharingEnabled?'var(--green-border)':'var(--border)'}`}}>
                {sharingEnabled ? 'Active' : 'Off'}
              </span>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>Enable share link</div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:1}}>Anyone with the link can view selected pages</div>
              </div>
              <button onClick={toggleEnabled} disabled={savingShare} style={{width:40,height:22,borderRadius:11,border:'none',cursor:'pointer',background:sharingEnabled?'var(--sage-dark)':'var(--linen-dark)',position:'relative',transition:'background .2s',flexShrink:0}}>
                <div style={{position:'absolute',top:2,left:sharingEnabled?20:2,width:18,height:18,borderRadius:'50%',background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
              </button>
            </div>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:8}}>Pages to share</div>
            <div style={{display:'flex',gap:8,marginBottom:14}}>
              {[{key:'dashboard',label:'Dashboard',desc:'Charts & stats'},{key:'invoices',label:'Invoices',desc:'Invoice history'}].map(p=>{
                const on=sharedPages.includes(p.key)
                return (
                  <button key={p.key} onClick={()=>togglePage(p.key)} disabled={savingShare} style={{flex:1,padding:'10px 12px',borderRadius:8,cursor:'pointer',textAlign:'left',border:`2px solid ${on?'var(--sage-dark)':'var(--border)'}`,background:on?'var(--sage-pale)':'var(--white)',transition:'all .15s'}}>
                    <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
                      <div style={{width:14,height:14,borderRadius:3,border:`2px solid ${on?'var(--sage-dark)':'var(--linen-dark)'}`,background:on?'var(--sage-dark)':'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {on&&<svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span style={{fontSize:12,fontWeight:600,color:on?'var(--sage-dark)':'var(--text-primary)'}}>{p.label}</span>
                    </div>
                    <div style={{fontSize:10,color:'var(--text-muted)',paddingLeft:21}}>{p.desc}</div>
                  </button>
                )
              })}
            </div>
            {shareToken && (
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:6}}>Share link</div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <div style={{flex:1,padding:'7px 10px',background:'var(--linen-mid)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)',fontSize:11,color:sharingEnabled?'var(--text-secondary)':'var(--text-muted)',fontFamily:'monospace',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
                    {APP_URL}/share/{shareToken}
                  </div>
                  <Button variant={copied?'primary':'ghost'} size="sm" onClick={copyLink} disabled={!sharingEnabled||sharedPages.length===0}>
                    {copied?'✓ Copied':'Copy'}
                  </Button>
                </div>
                <p style={{fontSize:11,color:'var(--text-muted)',marginTop:5}}>
                  {!sharingEnabled?'Enable sharing to activate this link.':sharedPages.length===0?'Select at least one page.':`Sharing ${sharedPages.join(' & ')} in read-only mode.`}
                </p>
              </div>
            )}
          </div>

          {/* Google Drive */}
          <div className="settings-card" style={{margin:0}}>
            <div className="settings-card-title">
              <span>Google Drive</span>
              <span className="settings-badge" style={{color:driveConnected?'var(--green-text)':'inherit',background:driveConnected?'var(--green-pale)':'var(--linen)',border:`1px solid ${driveConnected?'var(--green-border)':'var(--border)'}`}}>
                {driveConnected ? 'Connected' : 'Not connected'}
              </span>
            </div>

            {/* Connection status */}
            {driveConnected ? (
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',background:'var(--green-pale)',border:'1px solid var(--green-border)',borderRadius:'var(--radius-md)',marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  {/* Google Drive icon */}
                  <svg width="18" height="18" viewBox="0 0 87.3 78" fill="none">
                    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                    <path d="M43.65 25L29.9 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9.06 9.06 0 000 53h27.5z" fill="#00ac47"/>
                    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H60l5.65 10.8z" fill="#ea4335"/>
                    <path d="M43.65 25L57.4 0H29.9L43.65 25z" fill="#00832d"/>
                    <path d="M60 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.5c1.6 0 3.15-.45 4.5-1.2L60 53z" fill="#2684fc"/>
                    <path d="M59.8 27.35L46.05 3.3c-1.35-.8-2.9-1.2-4.5-1.2-1.6 0-3.15.45-4.5 1.2L57.4 0h.05L73.1 27.35 87.3 53c0-1.55-.4-3.1-1.2-4.5L61.35 3.3 59.8 27.35z" fill="#ffba00"/>
                    <path d="M73.55 76.8L60 53 46.05 78h28.05c1.55 0 3.1-.4 4.5-1.2z" fill="#ffba00" opacity=".5"/>
                    <path d="M87.3 53L73.1 27.35 59.8 53H87.3z" fill="#ffba00"/>
                  </svg>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:'var(--green-text)'}}>Drive connected</div>
                    {driveEmail && <div style={{fontSize:11,color:'var(--text-muted)'}}>{driveEmail}</div>}
                  </div>
                </div>
                <button onClick={handleDisconnectDrive} disabled={disconnecting} style={{fontSize:11,color:'var(--text-muted)',background:'none',border:'none',cursor:'pointer',padding:'4px 8px',borderRadius:4,fontFamily:'Inter,sans-serif'}}>
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            ) : (
              <div style={{marginBottom:14}}>
                <button
                  onClick={handleConnectDrive}
                  disabled={connectingDrive}
                  style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 14px',borderRadius:'var(--radius-md)',border:'1.5px solid var(--border)',background:'var(--white)',cursor:connectingDrive?'default':'pointer',transition:'border-color .15s, background .15s',fontSize:13,fontWeight:500,fontFamily:'Inter,sans-serif',color:'var(--text-primary)',opacity:connectingDrive?.7:1}}
                  onMouseEnter={e=>{ if(!connectingDrive){ e.currentTarget.style.borderColor='var(--sage-dark)'; e.currentTarget.style.background='var(--sage-pale)' }}}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--white)' }}
                >
                  {connectingDrive ? (
                    <><div style={{width:16,height:16,border:'2px solid var(--linen-dark)',borderTopColor:'var(--sage-dark)',borderRadius:'50%',animation:'spin .7s linear infinite'}}/> Connecting…</>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 87.3 78" fill="none">
                        <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                        <path d="M43.65 25L29.9 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9.06 9.06 0 000 53h27.5z" fill="#00ac47"/>
                        <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H60l5.65 10.8z" fill="#ea4335"/>
                        <path d="M43.65 25L57.4 0H29.9L43.65 25z" fill="#00832d"/>
                        <path d="M60 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.5c1.6 0 3.15-.45 4.5-1.2L60 53z" fill="#2684fc"/>
                        <path d="M59.8 27.35L46.05 3.3c-1.35-.8-2.9-1.2-4.5-1.2-1.6 0-3.15.45-4.5 1.2L57.4 0h.05L73.1 27.35 87.3 53c0-1.55-.4-3.1-1.2-4.5L61.35 3.3 59.8 27.35z" fill="#ffba00"/>
                      </svg>
                      Connect Google Drive
                    </>
                  )}
                </button>
                {driveError && <p style={{fontSize:11,color:'var(--red-text)',marginTop:6}}>{driveError}</p>}
                <p style={{fontSize:11,color:'var(--text-muted)',marginTop:6}}>Connect once — we'll remember it permanently.</p>
              </div>
            )}

            {/* Folder Picker */}
            <div style={{marginTop:4}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:6}}>Save location</div>
              {driveFolderId ? (
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 12px',background:'var(--linen-mid)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#2d5a45"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{folderName || 'Selected folder'}</div>
                      <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'monospace'}}>{driveFolderId.slice(0,24)}…</div>
                    </div>
                  </div>
                  <button onClick={openFolderPicker} disabled={!driveConnected||pickingFolder} style={{fontSize:11,color:'var(--sage-dark)',background:'none',border:'none',cursor:'pointer',fontWeight:600,fontFamily:'Inter,sans-serif'}}>
                    Change
                  </button>
                </div>
              ) : (
                <button
                  onClick={openFolderPicker}
                  disabled={!driveConnected||pickingFolder}
                  style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 12px',borderRadius:'var(--radius-md)',border:`1.5px dashed ${driveConnected?'var(--sage-light)':'var(--border)'}`,background:'none',cursor:driveConnected?'pointer':'default',fontSize:12,fontWeight:500,fontFamily:'Inter,sans-serif',color:driveConnected?'var(--sage-dark)':'var(--text-muted)',transition:'all .15s'}}
                  onMouseEnter={e=>{ if(driveConnected){ e.currentTarget.style.background='var(--sage-pale)' }}}
                  onMouseLeave={e=>{ e.currentTarget.style.background='none' }}
                >
                  {pickingFolder ? (
                    <><div style={{width:13,height:13,border:'2px solid var(--linen-dark)',borderTopColor:'var(--sage-dark)',borderRadius:'50%',animation:'spin .7s linear infinite'}}/> Opening picker…</>
                  ) : (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg> Browse Drive to select a folder</>
                  )}
                </button>
              )}
              <p style={{fontSize:11,color:'var(--text-muted)',marginTop:6}}>
                {driveConnected ? 'Invoices will be saved as PDF to your selected folder.' : 'Connect Drive above first.'}
              </p>
            </div>
          </div>

        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageShell>
  )
}
