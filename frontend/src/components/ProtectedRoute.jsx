import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const token = localStorage.getItem('authToken')
  const role = localStorage.getItem('userRole')

  if (!token) return <Navigate to="/login" replace />
  if (requireAdmin && role !== 'admin') return <Navigate to="/my-attendance" replace />

  return children
}
