import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login } from '../api'

export default function LoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await login(form.username, form.password)
      const { access_token, role, user_id, username } = res.data
      localStorage.setItem('authToken', access_token)
      localStorage.setItem('userRole', role)
      localStorage.setItem('userId', user_id || '')
      localStorage.setItem('username', username)
      navigate(role === 'admin' ? '/admin/users' : '/my-attendance')
    } catch (err) {
      setError(err.response?.data?.detail || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔍</div>
          <h1 className="text-2xl font-bold text-white">Face Scanner</h1>
          <p className="text-gray-400 text-sm mt-1">ระบบบันทึกเวลาเข้างาน</p>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-500 text-red-300 rounded-lg p-3 mb-6 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1">ชื่อผู้ใช้</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="กรอกชื่อผู้ใช้"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1">รหัสผ่าน</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="กรอกรหัสผ่าน"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg py-2.5 transition-colors mt-2"
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-center">
          <Link
            to="/scan"
            className="block text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            ไปยังหน้าสแกน (Kiosk) →
          </Link>
          <Link
            to="/setup"
            className="block text-gray-700 hover:text-gray-500 text-xs transition-colors"
          >
            ตั้งค่าระบบครั้งแรก (สร้าง Admin)
          </Link>
        </div>
      </div>
    </div>
  )
}
