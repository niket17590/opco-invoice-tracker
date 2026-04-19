import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import Dashboard from './pages/Dashboard'
import Invoices from './pages/Invoices'
import NewInvoice from './pages/NewInvoice'
import Clients from './pages/Clients'
import Settings from './pages/Settings'
import ShareView from './pages/ShareView'

function ProtectedRoute({ children }) {
  const { user, loading, isOwner } = useAuth()

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#a89e90', fontFamily:'Inter,sans-serif' }}>Loading…</div>

  if (!user) return <Navigate to="/login" replace />

  // Only the owner email can access the app
  if (!isOwner) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12, fontFamily:'Inter,sans-serif' }}>
      <p style={{ color:'#c0392b', fontWeight:500 }}>Access denied.</p>
      <p style={{ color:'#a89e90', fontSize:13 }}>This account is not authorised to access this application.</p>
    </div>
  )

  return children
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login"         element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/share/:token"  element={<ShareView />} />

      {/* Protected routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index                  element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"       element={<Dashboard />} />
        <Route path="invoices"        element={<Invoices />} />
        <Route path="invoices/new"    element={<NewInvoice />} />
        <Route path="invoices/:id"    element={<NewInvoice />} />
        <Route path="clients"         element={<Clients />} />
        <Route path="settings"        element={<Settings />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
