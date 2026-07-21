import { useState, useEffect } from 'react'
import { getUserAttendance } from '../api'

function Avatar({ name, photoUrl }) {
  const [imgError, setImgError] = useState(false)
  if (photoUrl && !imgError) {
    return (
      <img src={photoUrl} alt={name} onError={() => setImgError(true)}
        className="w-12 h-12 rounded-full object-cover ring-2 ring-indigo-500/30 flex-shrink-0" />
    )
  }
  return (
    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0">
      {name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  )
}

export default function MyAttendancePage() {
  const userId = localStorage.getItem('userId')
  const username = localStorage.getItem('username')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [date, setDate] = useState('')

  const fetchData = async () => {
    if (!userId) return
    setLoading(true); setError('')
    try {
      const params = {}
      if (date) params.date = date
      const res = await getUserAttendance(userId, params)
      setRecords(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [date])

  const todayCount = records.filter(
    r => r.timestamp?.slice(0, 10) === new Date().toISOString().slice(0, 10)
  ).length

  const formatTime = str => str ? new Date(str).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'
  const formatDate = str => str ? new Date(str).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">ประวัติการเข้างานของฉัน</h1>
        <p className="text-gray-400">สวัสดี, <span className="text-indigo-400 font-medium">{username}</span></p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-gray-400 text-sm mb-1">เข้างานวันนี้</p>
          <p className="text-3xl font-bold text-white">{todayCount}</p>
          <p className="text-gray-500 text-xs mt-1">ครั้ง</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-gray-400 text-sm mb-1">ทั้งหมด</p>
          <p className="text-3xl font-bold text-white">{records.length}</p>
          <p className="text-gray-500 text-xs mt-1">รายการ</p>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-3 mb-4">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500 text-sm" />
        {date && (
          <button onClick={() => setDate('')} className="text-gray-400 hover:text-white text-sm transition-colors">
            ล้างตัวกรอง ✕
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-500 text-red-300 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-gray-400 py-8 text-center">กำลังโหลด...</div>
      ) : records.length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-12 text-center border border-gray-800">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-400">ไม่พบข้อมูลการเข้างาน</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r.id} className="flex items-center gap-4 bg-gray-900 rounded-xl px-4 py-3 border border-gray-800 hover:border-gray-700 transition-colors">
              <Avatar name={r.user_name} photoUrl={r.photo_url} />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium">{formatDate(r.timestamp)}</p>
                <p className="text-gray-500 text-sm">เข้างาน {formatTime(r.timestamp)}</p>
              </div>
              {r.confidence != null && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  parseFloat(r.confidence) >= 0.8 ? 'bg-green-900/40 text-green-400' : 'bg-yellow-900/40 text-yellow-400'
                }`}>
                  {(parseFloat(r.confidence) * 100).toFixed(1)}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [date, setDate] = useState('')

  const fetchData = async () => {
    if (!userId) return
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (date) params.date = date
      const res = await getUserAttendance(userId, params)
      setRecords(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [date])

  const todayCount = records.filter(
    (r) => r.timestamp?.slice(0, 10) === new Date().toISOString().slice(0, 10)
  ).length

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">ประวัติการเข้างานของฉัน</h1>
        <p className="text-gray-400">
          สวัสดี, <span className="text-indigo-400 font-medium">{username}</span>
        </p>
      </div>

      {/* Today's summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-gray-400 text-sm mb-1">เข้างานวันนี้</p>
          <p className="text-3xl font-bold text-white">{todayCount}</p>
          <p className="text-gray-500 text-xs mt-1">ครั้ง</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-gray-400 text-sm mb-1">ทั้งหมด</p>
          <p className="text-3xl font-bold text-white">{records.length}</p>
          <p className="text-gray-500 text-xs mt-1">รายการ</p>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500 text-sm"
        />
        {date && (
          <button
            onClick={() => setDate('')}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            ล้างตัวกรอง ✕
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/40 border border-red-500 text-red-300 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-gray-400 py-8 text-center">กำลังโหลด...</div>
      ) : records.length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-12 text-center border border-gray-800">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-400">ไม่พบข้อมูลการเข้างาน</p>
          {date && (
            <p className="text-gray-600 text-sm mt-1">
              สำหรับวันที่ {date}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">วันที่</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">เวลาเข้างาน</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">ความมั่นใจ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-300">{r.timestamp?.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-white font-medium">
                    {r.timestamp ? new Date(r.timestamp).toLocaleTimeString('th-TH', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full text-xs font-medium">
                      {r.confidence != null ? `${(r.confidence * 100).toFixed(1)}%` : '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
