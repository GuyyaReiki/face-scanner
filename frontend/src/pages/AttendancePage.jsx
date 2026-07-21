import { useState, useEffect, useCallback } from 'react'
import { getAttendance, getUsers } from '../api.js'

function Avatar({ name, photoUrl, size = 'md' }) {
  const [imgError, setImgError] = useState(false)
  const sizeClass = size === 'lg' ? 'w-16 h-16 text-xl' : 'w-12 h-12 text-base'

  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={name}
        onError={() => setImgError(true)}
        className={`${sizeClass} rounded-full object-cover ring-2 ring-indigo-500/30 flex-shrink-0`}
      />
    )
  }
  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  )
}

function ConfidenceBadge({ value }) {
  if (value == null) return null
  const pct = parseFloat(value) * 100
  const color = pct >= 80 ? 'bg-green-100 text-green-700' : pct >= 65 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {pct.toFixed(1)}%
    </span>
  )
}

function formatThaiTime(str) {
  if (!str) return '-'
  const d = new Date(str)
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function formatThaiDate(str) {
  if (!str) return '-'
  const d = new Date(str)
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

function groupByDate(records) {
  const groups = {}
  for (const r of records) {
    const dateKey = r.timestamp?.slice(0, 10) || 'unknown'
    if (!groups[dateKey]) groups[dateKey] = []
    groups[dateKey].push(r)
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
}

export default function AttendancePage() {
  const [records, setRecords] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterDate, setFilterDate] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [viewMode, setViewMode] = useState('feed') // 'feed' | 'table'

  const fetchAttendance = useCallback(async () => {
    try {
      setError(null)
      const params = {}
      if (filterDate) params.date = filterDate
      if (filterUser) params.user_id = filterUser
      const res = await getAttendance(params)
      setRecords(res.data)
      setLastRefresh(new Date())
    } catch (err) {
      setError('ไม่สามารถโหลดข้อมูลได้')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filterDate, filterUser])

  useEffect(() => {
    const fetchUsers = async () => {
      try { const res = await getUsers(); setUsers(res.data) } catch {}
    }
    fetchUsers()
  }, [])

  useEffect(() => { setLoading(true); fetchAttendance() }, [fetchAttendance])

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const iv = setInterval(fetchAttendance, 15000)
    return () => clearInterval(iv)
  }, [fetchAttendance])

  const exportCSV = () => {
    if (!records.length) return
    const header = ['ชื่อ', 'วันที่', 'เวลาเข้างาน', 'ความแม่นยำ (%)']
    const rows = records.map(r => [
      r.user_name || '',
      r.timestamp?.slice(0, 10) || '',
      formatThaiTime(r.timestamp),
      r.confidence != null ? (parseFloat(r.confidence) * 100).toFixed(1) : ''
    ])
    const csv = [header, ...rows].map(row =>
      row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `attendance_${filterDate || new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const grouped = groupByDate(records)

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">บันทึกการเข้างาน</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            อัปเดตล่าสุด {lastRefresh.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            {' '}· {records.length} รายการ
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode(v => v === 'feed' ? 'table' : 'feed')}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
          >
            {viewMode === 'feed' ? '📋 ตาราง' : '🃏 Feed'}
          </button>
          <button
            onClick={exportCSV}
            disabled={!records.length}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
        <select
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 min-w-40"
        >
          <option value="">พนักงานทั้งหมด</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {(filterDate || filterUser) && (
          <button
            onClick={() => { setFilterDate(''); setFilterUser('') }}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg text-sm transition-colors"
          >
            ล้าง ✕
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">กำลังโหลด...</div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-red-400 mb-3">{error}</p>
          <button onClick={() => { setLoading(true); fetchAttendance() }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm">
            ลองใหม่
          </button>
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-20 text-gray-500">ไม่พบข้อมูลการเข้างาน</div>
      ) : viewMode === 'feed' ? (
        /* Feed view */
        <div className="space-y-6">
          {grouped.map(([dateKey, dayRecords]) => (
            <div key={dateKey}>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-sm font-semibold text-indigo-400">{formatThaiDate(dateKey + 'T00:00:00')}</div>
                <div className="flex-1 h-px bg-gray-800"></div>
                <div className="text-xs text-gray-600">{dayRecords.length} คน</div>
              </div>
              <div className="space-y-2">
                {dayRecords.map(r => (
                  <div key={r.id} className="flex items-center gap-4 bg-gray-900 rounded-xl px-4 py-3 border border-gray-800 hover:border-gray-700 transition-colors">
                    <Avatar name={r.user_name} photoUrl={r.photo_url} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{r.user_name}</p>
                      <p className="text-gray-500 text-sm">เข้างาน {formatThaiTime(r.timestamp)}</p>
                    </div>
                    <ConfidenceBadge value={r.confidence} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table view */
        <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-gray-400 font-medium w-14"></th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">ชื่อ</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">วันที่</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">เวลา</th>
                <th className="px-4 py-3 text-right text-gray-400 font-medium">ความแม่นยำ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3"><Avatar name={r.user_name} photoUrl={r.photo_url} size="sm" /></td>
                  <td className="px-4 py-3 text-white font-medium">{r.user_name}</td>
                  <td className="px-4 py-3 text-gray-400">{r.timestamp?.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-gray-300">{formatThaiTime(r.timestamp)}</td>
                  <td className="px-4 py-3 text-right"><ConfidenceBadge value={r.confidence} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
