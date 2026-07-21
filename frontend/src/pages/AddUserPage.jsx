import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createUser } from '../api.js'

const MIN_PHOTOS = 3
const MAX_PHOTOS = 10

export default function AddUserPage() {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [photos, setPhotos] = useState([]) // array of { id, blob, preview }
  const [captureTab, setCaptureTab] = useState('webcam') // 'webcam' or 'upload'
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  // Start/stop camera when on webcam tab
  useEffect(() => {
    if (step !== 2 || captureTab !== 'webcam') {
      // Stop camera if not on webcam tab
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      return
    }

    let mounted = true
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 }
        })
        if (mounted && videoRef.current) {
          videoRef.current.srcObject = stream
          streamRef.current = stream
        }
      } catch (err) {
        console.error('Camera error:', err)
        alert('ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบการอนุญาต')
      }
    }

    startCamera()

    return () => {
      mounted = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [step, captureTab])

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      photos.forEach(p => URL.revokeObjectURL(p.preview))
    }
  }, [])

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    if (photos.length >= MAX_PHOTOS) return

    const canvas = canvasRef.current
    canvas.width = videoRef.current.videoWidth || 640
    canvas.height = videoRef.current.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoRef.current, 0, 0)

    canvas.toBlob((blob) => {
      if (!blob) return
      const preview = URL.createObjectURL(blob)
      const id = `webcam-${Date.now()}-${Math.random()}`

      setPhotos(prev => [...prev, { id, blob, preview }])
    }, 'image/jpeg', 0.92)
  }

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return

    const remainingSlots = MAX_PHOTOS - photos.length
    const filesToAdd = files.slice(0, remainingSlots)

    filesToAdd.forEach((file) => {
      if (!file.type.startsWith('image/')) return

      const reader = new FileReader()
      reader.onload = (evt) => {
        const preview = evt.target.result
        const id = `upload-${Date.now()}-${Math.random()}`

        setPhotos(prev => {
          if (prev.length >= MAX_PHOTOS) return prev
          return [...prev, { id, blob: file, preview }]
        })
      }
      reader.readAsDataURL(file)
    })

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removePhoto = (id) => {
    setPhotos(prev => {
      const updated = prev.filter(p => p.id !== id)
      const toRemove = prev.find(p => p.id === id)
      if (toRemove) {
        URL.revokeObjectURL(toRemove.preview)
      }
      return updated
    })
  }

  const handleStep1Submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setStep(2)
  }

  const handleSubmit = async () => {
    if (photos.length < MIN_PHOTOS) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const formData = new FormData()
      formData.append('name', name.trim())
      if (employeeId.trim()) {
        formData.append('employee_id', employeeId.trim())
      }
      if (username.trim()) {
        formData.append('username', username.trim())
      }
      if (password.trim()) {
        formData.append('password', password.trim())
      }

      photos.forEach((p, idx) => {
        formData.append('images', p.blob, `photo_${idx}_${Date.now()}.jpg`)
      })

      await createUser(formData)
      setStep(3)
      setTimeout(() => navigate('/admin/users'), 2500)
    } catch (err) {
      console.error('Create user error:', err)
      setSubmitError(err.response?.data?.detail || 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  const StepIndicator = () => (
    <div className="flex items-center gap-2 mb-8">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              step > s
                ? 'bg-green-500 text-white'
                : step === s
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {step > s ? '✓' : s}
          </div>
          <span
            className={`text-sm font-medium ${
              step === s ? 'text-blue-600' : 'text-gray-400'
            }`}
          >
            {s === 1 ? 'ข้อมูลพื้นฐาน' : s === 2 ? 'เก็บรูปใบหน้า' : 'เสร็จสิ้น'}
          </span>
          {s < 3 && <div className="w-8 h-px bg-gray-300 mx-1" />}
        </div>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">เพิ่มผู้ใช้ใหม่</h1>
          <p className="text-gray-400 mt-1">ลงทะเบียนพนักงานเข้าสู่ระบบจดจำใบหน้า</p>
        </div>

        <div className="bg-gray-800 rounded-xl shadow-lg p-8">
          <StepIndicator />

          {/* Step 1: Basic info */}
          {step === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  ชื่อ-นามสกุล <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                  placeholder="กรอกชื่อ-นามสกุล"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  รหัสพนักงาน <span className="text-gray-500 font-normal">(ไม่บังคับ)</span>
                </label>
                <input
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                  placeholder="กรอกรหัสพนักงาน"
                />
              </div>

              <div className="pt-2 border-t border-gray-700">
                <p className="text-sm font-semibold text-gray-300 mb-3">
                  สร้างบัญชีเข้าสู่ระบบ <span className="text-gray-500 font-normal">(ไม่บังคับ)</span>
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      ชื่อผู้ใช้
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                      placeholder="กรอกชื่อผู้ใช้"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      รหัสผ่าน
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                      placeholder="กรอกรหัสผ่าน"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/admin/users')}
                  className="flex-1 border border-gray-600 text-gray-300 font-semibold py-3 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  ถัดไป →
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Capture/Upload photos */}
          {step === 2 && (
            <div>
              {/* Tabs */}
              <div className="flex gap-2 mb-6 border-b border-gray-700">
                <button
                  type="button"
                  onClick={() => setCaptureTab('webcam')}
                  className={`px-6 py-3 font-semibold transition-colors relative ${
                    captureTab === 'webcam'
                      ? 'text-blue-400'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>📷</span>
                    ถ่ายรูป
                  </span>
                  {captureTab === 'webcam' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureTab('upload')}
                  className={`px-6 py-3 font-semibold transition-colors relative ${
                    captureTab === 'upload'
                      ? 'text-blue-400'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>📁</span>
                    อัปโหลด
                  </span>
                  {captureTab === 'upload' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
                  )}
                </button>
              </div>

              {/* Tab content */}
              <div className="mb-6">
                {captureTab === 'webcam' && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative rounded-xl overflow-hidden border-2 border-gray-600 bg-black w-full max-w-2xl">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-auto"
                      />
                    </div>
                    <canvas ref={canvasRef} className="hidden" />
                    {photos.length < MAX_PHOTOS && (
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors flex items-center gap-2 shadow"
                      >
                        <span className="text-lg">📷</span>
                        ถ่ายรูป
                      </button>
                    )}
                  </div>
                )}

                {captureTab === 'upload' && (
                  <div className="flex flex-col items-center gap-4">
                    <div
                      className="w-full max-w-2xl border-2 border-dashed border-gray-600 rounded-xl p-12 bg-gray-700/30 hover:bg-gray-700/50 transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="text-center">
                        <div className="text-6xl mb-4">📁</div>
                        <p className="text-gray-300 font-semibold mb-2">
                          คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่
                        </p>
                        <p className="text-gray-500 text-sm">
                          รองรับไฟล์รูปภาพทุกประเภท (JPG, PNG, etc.)
                        </p>
                        <p className="text-gray-500 text-sm mt-1">
                          สามารถเลือกหลายไฟล์พร้อมกันได้
                        </p>
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    {photos.length < MAX_PHOTOS && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors flex items-center gap-2 shadow"
                      >
                        <span className="text-lg">📁</span>
                        เลือกไฟล์
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Photo count badge */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-gray-300 font-medium">
                  รูปที่เก็บแล้ว (ต้องการอย่างน้อย {MIN_PHOTOS} รูป)
                </p>
                <span
                  className={`text-sm font-semibold px-3 py-1 rounded-full ${
                    photos.length >= MIN_PHOTOS
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-blue-500/20 text-blue-400'
                  }`}
                >
                  {photos.length}/{MAX_PHOTOS} รูป
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-700 rounded-full h-2 mb-6">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    photos.length >= MIN_PHOTOS ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${(photos.length / MAX_PHOTOS) * 100}%` }}
                />
              </div>

              {/* Shared photo grid */}
              {photos.length > 0 ? (
                <div className="mb-6">
                  <div className="grid grid-cols-5 gap-3">
                    {photos.map((p) => (
                      <div key={p.id} className="relative group">
                        <img
                          src={p.preview}
                          alt="Photo"
                          className="w-full aspect-square object-cover rounded-lg border-2 border-green-400"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(p.id)}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg transition-colors text-sm font-bold"
                        >
                          ✕
                        </button>
                        <div className="absolute top-2 left-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      </div>
                    ))}
                    {Array.from({ length: MAX_PHOTOS - photos.length }).map((_, idx) => (
                      <div
                        key={`empty-${idx}`}
                        className="w-full aspect-square rounded-lg border-2 border-dashed border-gray-600 bg-gray-700/30 flex items-center justify-center"
                      >
                        <span className="text-gray-600 text-2xl">📷</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mb-6 text-center py-8 bg-gray-700/30 rounded-lg border border-gray-600">
                  <p className="text-gray-400">ยังไม่มีรูปภาพ</p>
                  <p className="text-gray-500 text-sm mt-1">
                    กรุณาถ่ายรูปหรืออัปโหลดไฟล์อย่างน้อย {MIN_PHOTOS} รูป
                  </p>
                </div>
              )}

              {submitError && (
                <div className="mb-4 bg-red-900/50 border border-red-500 text-red-300 rounded-lg px-4 py-3 text-sm">
                  {submitError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1)
                    setPhotos([])
                    setCaptureTab('webcam')
                  }}
                  className="flex-1 border border-gray-600 text-gray-300 font-semibold py-3 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  ← ย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={photos.length < MIN_PHOTOS || submitting}
                  className={`flex-2 flex-grow text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    photos.length < MIN_PHOTOS || submitting
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {submitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      กำลังบันทึก...
                    </>
                  ) : (
                    'ส่งข้อมูล ✓'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">✅</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">บันทึกสำเร็จ!</h2>
              <p className="text-gray-400 mb-2">
                ลงทะเบียน <span className="font-semibold text-white">{name}</span> เรียบร้อยแล้ว
              </p>
              <p className="text-gray-500 text-sm">กำลังกลับไปหน้าจัดการผู้ใช้...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
