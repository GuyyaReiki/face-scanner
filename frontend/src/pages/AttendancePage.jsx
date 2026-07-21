import { useState, useEffect, useCallback } from 'react'
import { getAttendance, getUsers } from '../api.js'

export default function AttendancePage() {
  const [records, setRecords] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterDate, setFilterDate] = useState('')
  const [filterUser, setFilterUser] = useState('')

  const todayStr = () => new Date().toISOString().slice(0, 10)

  const fetchAttendance = useCallback(async () => {
    try {
      setError(null)
      const params = {}
      if (filterDate) params.date = filterDate
      if (filterUser) params.user_id = filterUser
      const res = await getAttendance(params)
      setRecords(res.data)
    } catch (err) {
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่')
      console.error('Fetch attendance error:', err)
    } finally {
      setLoading(false)
    }
  }, [filterDate, filterUser])

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await getUsers()
        setUsers(res.data)
      } catch (err) {
        console.error('Fetch users error:', err)
      }
    }
    fetchUsers()
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchAttendance()
  }, [fetchAttendance])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAttendance()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchAttendance])

  const formatDateTime = (str) => {
    if (!str) return '-'
    return new Date(str).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const formatConfidence = (val) => {
    if (val == null) return '-'
    return `${(parseFloat(val) * 100).toFixed(1)}%`
  }

  const exportCSV = () => {
    if (records.length === 0) return

    const header = ['ชื่อ', 'รหัสพนักงาน', 'เวลาเข้างาน', 'ความแม่นยำ (%)']
    const rows = records.map(r => [
      r.user_name || '',
      r.user_id || '',
      r.timestamp || '',
      r.confidence != null ? (parseFloat(r.confidence) * 100).toFixed(1) : ''
    ])

    const csvContent = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance_${filterDate || todayStr()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getConfidenceColor = (val) => {
    if (val == null) return 'text-gray-400'
    const pct = parseFloat(val) * 100
    if (pct >= 80) return 'text-green-600 font-semibold'
    if (pct >= 60) return 'text-yellow-600 font-semibold'
    return 'text-red-500 font-semibold'
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">บันทึกการเข้างาน</h1>
            <p className="text-gray-500 mt-1">ประวัติการเข้างานของพนักงาน (รีเฟรชทุก 30 วินาที)</p>
          </div>
          <button
            onClick={exportCSV}
            disabled={records.length === 0}
            className={`flex items-center gap-2 px-5 py-3 rounded-lg font-semibold transition-colors ${
              records.length === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white shadow'
            }`}
          >
            <span>📥</span>
            ส่งออก CSV
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow p-5 mb-6 flex flex-wrap gap-4">
          <div className="flex-1 min-w-48">
            <label className="block text-sm font-semibold text-gray-600 mb-2">กรองตามวันที่</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-sm font-semibold text-gray-600 mb-2">กรองตามพนักงาน</label>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
            >
              <option value="">พนักงานทั้งหมด</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.employee_id ? ` (${u.employee_id})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setFilterDate(''); setFilterUser('') }}
              className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              ล้างตัวกรอง
            </button>
          </div>
        </div>

        {/* Table */}
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
                onClick={() => { setLoading(true); fetchAttendance() }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition-colors"
              >
                ลองใหม่
              </button>
            </div>
          ) : records.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-gray-400 text-lg">ไม่พบข้อมูลการเข้างาน</p>
              {(filterDate || filterUser) && (
                <p className="text-gray-400 text-sm mt-2">ลองเปลี่ยนตัวกรองเพื่อดูข้อมูลอื่น</p>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">โปรไฟล์</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">ชื่อ</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">รหัสพนักงาน</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">เวลาเข้างาน</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-600">ความแม่นยำ</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, idx) => (
                  <tr
                    key={record.id || idx}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                    }`}
                  >
                    <td className="py-4 px-6">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                        {record.user_name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    </td>
                    <td className="py-4 px-6 font-medium text-gray-800">{record.user_name || '-'}</td>
                    <td className="py-4 px-6 text-gray-600 text-sm font-mono">{record.user_id?.slice(0, 8) || '-'}</td>
                    <td className="py-4 px-6 text-gray-600">{formatDateTime(record.timestamp)}</td>
                    <td className={`py-4 px-6 text-right ${getConfidenceColor(record.confidence)}`}>
                      {formatConfidence(record.confidence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && !error && records.length > 0 && (
          <p className="text-gray-400 text-sm mt-4 text-right">
            แสดง {records.length} รายการ
          </p>
        )}
      </div>
    </div>
  )
}
