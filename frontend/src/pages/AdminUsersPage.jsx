import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUsers, deleteUser } from '../api.js'

export default function AdminUsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const fetchUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await getUsers()
      setUsers(res.data)
    } catch (err) {
      setError('ไม่สามารถโหลดข้อมูลผู้ใช้ได้ กรุณาลองใหม่')
      console.error('Fetch users error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleDelete = async (user) => {
    const confirmed = window.confirm(
      `คุณต้องการลบผู้ใช้ "${user.name}" ออกจากระบบ?\nการกระทำนี้ไม่สามารถยกเลิกได้`
    )
    if (!confirmed) return

    try {
      await deleteUser(user.id)
      setUsers(prev => prev.filter(u => u.id !== user.id))
    } catch (err) {
      alert('ไม่สามารถลบผู้ใช้ได้ กรุณาลองใหม่')
      console.error('Delete user error:', err)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">จัดการผู้ใช้</h1>
            <p className="text-gray-500 mt-1">รายชื่อพนักงานทั้งหมดในระบบ</p>
          </div>
          <button
            onClick={() => navigate('/admin/add-user')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-3 rounded-lg transition-colors flex items-center gap-2"
          >
            <span>➕</span>
            เพิ่มผู้ใช้ใหม่
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-500">กำลังโหลด...</p>
              </div>
            </div>
          ) : error ? (
            <div className="py-20 text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={fetchUsers}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition-colors"
              >
                ลองใหม่
              </button>
            </div>
          ) : users.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-gray-400 text-lg">ยังไม่มีผู้ใช้ในระบบ</p>
              <button
                onClick={() => navigate('/admin/add-user')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition-colors"
              >
                เพิ่มผู้ใช้คนแรก
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">ชื่อ</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">รหัสพนักงาน</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">วันที่ลงทะเบียน</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-600">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, idx) => (
                  <tr
                    key={user.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                    }`}
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-sm">
                          {user.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-gray-800">{user.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-gray-600">{user.employee_id || '-'}</td>
                    <td className="py-4 px-6 text-gray-600">{formatDate(user.created_at)}</td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handleDelete(user)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && !error && users.length > 0 && (
          <p className="text-gray-400 text-sm mt-4 text-right">
            ทั้งหมด {users.length} คน
          </p>
        )}
      </div>
    </div>
  )
}
