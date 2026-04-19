import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        subscription.unsubscribe()
        navigate('/dashboard', { replace: true })
      } else if (event === 'SIGNED_OUT' || !session) {
        subscription.unsubscribe()
        navigate('/login', { replace: true })
      }
    })

    // Fallback after 3 seconds
    const timeout = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      subscription.unsubscribe()
      navigate(session ? '/dashboard' : '/login', { replace: true })
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate])

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'Inter,sans-serif', flexDirection:'column', gap:12, background:'#f0ece4' }}>
      <div style={{ width:32, height:32, border:'2px solid #e8e2d8', borderTopColor:'#2d5a45', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
      <p style={{ color:'#a89e90', fontSize:13 }}>Signing you in…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}