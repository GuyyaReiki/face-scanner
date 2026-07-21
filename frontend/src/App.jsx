import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import ScanPage from './pages/ScanPage.jsx'
import AdminUsersPage from './pages/AdminUsersPage.jsx'
import AddUserPage from './pages/AddUserPage.jsx'
import AttendancePage from './pages/AttendancePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SetupPage from './pages/SetupPage.jsx'
import MyAttendancePage from './pages/MyAttendancePage.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'

function Layout() {
  const navigate = useNavigate()
  const [role, setRole] = useState(localStorage.getItem('userRole'))
  const [token, setToken] = useState(localStorage.getItem('authToken'))

  // Re-sync state when localStorage changes (e.g., after login/logout)
  useEffect(() => {
    const sync = () => {
      setRole(localStorage.getItem('userRole'))
      setToken(localStorage.getItem('authToken'))
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    localStorage.removeItem('userRole')
    localStorage.removeItem('userId')
    localStorage.removeItem('username')
    setRole(null)
    setToken(null)
    navigate('/login')
  }

  const isLoggedIn = !!token

  const adminNavItems = [
    { to: '/scan', label: 'สแกนใบหน้า', icon: '📷' },
    { to: '/admin/users', label: 'จัดการผู้ใช้', icon: '👥' },
    { to: '/admin/add-user', label: 'เพิ่มผู้ใช้', icon: '➕' },
    { to: '/attendance', label: 'บันทึกการเข้างาน', icon: '📋' },
  ]

  const employeeNavItems = [
    { to: '/scan', label: 'สแกนใบหน้า', icon: '📷' },
    { to: '/my-attendance', label: 'การเข้างานของฉัน', icon: '📋' },
  ]

  const publicNavItems = [
    { to: '/scan', label: 'สแกน (Kiosk)', icon: '📷' },
  ]

  const navItems = !isLoggedIn
    ? publicNavItems
    : role === 'admin'
    ? adminNavItems
    : employeeNavItems

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col flex-shrink-0">
        <div className="px-6 py-6 border-b border-gray-700">
          <h1 className="text-lg font-bold leading-tight">ระบบบันทึกเวลา</h1>
          <p className="text-gray-400 text-sm mt-1">Face Recognition</p>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-gray-700">
          {isLoggedIn ? (
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-white text-sm transition-colors w-full text-left"
            >
              ออกจากระบบ
            </button>
          ) : (
            <NavLink
              to="/login"
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              เข้าสู่ระบบ
            </NavLink>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-950 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/scan" replace />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route
            path="/my-attendance"
            element={
              <ProtectedRoute>
                <MyAttendancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance"
            element={
              <ProtectedRoute>
                <AttendancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute requireAdmin>
                <AdminUsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/add-user"
            element={
              <ProtectedRoute requireAdmin>
                <AddUserPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
