import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createUser } from '../api.js'

const REQUIRED_PHOTOS = 5

export default function AddUserPage() {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [photos, setPhotos] = useState([]) // array of { blob, url }
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [recaptureIdx, setRecaptureIdx] = useState(null)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)
  const navigate = useNavigate()

  // Start/stop camera on step 2
  useEffect(() => {
    if (step !== 2) return

    let mounted = true
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
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
  }, [step])

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      photos.forEach(p => URL.revokeObjectURL(p.url))
    }
  }, [])

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = videoRef.current.videoWidth || 640
    canvas.height = videoRef.current.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoRef.current, 0, 0)

    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)

      if (recaptureIdx !== null) {
        // Replace photo at index
        setPhotos(prev => {
          const updated = [...prev]
          URL.revokeObjectURL(updated[recaptureIdx].url)
          updated[recaptureIdx] = { blob, url }
          return updated
        })
        setRecaptureIdx(null)
      } else if (photos.length < REQUIRED_PHOTOS) {
        setPhotos(prev => [...prev, { blob, url }])
      }
    }, 'image/jpeg', 0.92)
  }

  const handleStep1Submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setStep(2)
  }

  const handleSubmit = async () => {
    if (photos.length < REQUIRED_PHOTOS) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const formData = new FormData()
      formData.append('name', name.trim())
      if (employeeId.trim()) {
        formData.append('employee_id', employeeId.trim())
      }
      photos.forEach((p) => {
        formData.append('images', p.blob, `photo_${Date.now()}.jpg`)
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
            {s === 1 ? 'ข้อมูลพื้นฐาน' : s === 2 ? 'ถ่ายรูปใบหน้า' : 'เสร็จสิ้น'}
          </span>
          {s < 3 && <div className="w-8 h-px bg-gray-300 mx-1" />}
        </div>
      ))}
    </div>
  )

  return (
    <div className="p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800">เพิ่มผู้ใช้ใหม่</h1>
          <p className="text-gray-500 mt-1">ลงทะเบียนพนักงานเข้าสู่ระบบจดจำใบหน้า</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <StepIndicator />

          {/* Step 1: Basic info */}
          {step === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  ชื่อ-นามสกุล <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                  placeholder="กรอกชื่อ-นามสกุล"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  รหัสพนักงาน <span className="text-gray-400 font-normal">(ไม่บังคับ)</span>
                </label>
                <input
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                  placeholder="กรอกรหัสพนักงาน"
                />
              </div>
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/admin/users')}
                  className="flex-1 border border-gray-300 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-50 transition-colors"
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

          {/* Step 2: Capture photos */}
          {step === 2 && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-gray-700 font-medium">
                  {recaptureIdx !== null
                    ? `ถ่ายรูปใหม่สำหรับรูปที่ ${recaptureIdx + 1}`
                    : `ถ่ายรูปที่ ${photos.length + 1} จาก ${REQUIRED_PHOTOS}`}
                </p>
                <span className="bg-blue-100 text-blue-700 text-sm font-semibold px-3 py-1 rounded-full">
                  {photos.length}/{REQUIRED_PHOTOS} รูป
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 mb-5">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(photos.length / REQUIRED_PHOTOS) * 100}%` }}
                />
              </div>

              {/* Webcam */}
              <div className="flex flex-col items-center gap-4 mb-6">
                <div className="relative rounded-xl overflow-hidden border-2 border-gray-300 bg-black w-full">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-auto"
                  />
                </div>
                <canvas ref={canvasRef} className="hidden" />
                {(photos.length < REQUIRED_PHOTOS || recaptureIdx !== null) && (
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

              {/* Photo thumbnails */}
              {photos.length > 0 && (
                <div className="mb-6">
                  <p className="text-sm font-semibold text-gray-600 mb-3">รูปที่ถ่ายแล้ว (คลิกเพื่อถ่ายใหม่)</p>
                  <div className="grid grid-cols-5 gap-2">
                    {photos.map((p, idx) => (
                      <div key={idx} className="relative group cursor-pointer" onClick={() => setRecaptureIdx(idx)}>
                        <img
                          src={p.url}
                          alt={`รูปที่ ${idx + 1}`}
                          className="w-full aspect-square object-cover rounded-lg border-2 border-green-400"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                          <span className="text-white text-xs font-semibold">ถ่ายใหม่</span>
                        </div>
                        <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      </div>
                    ))}
                    {Array.from({ length: REQUIRED_PHOTOS - photos.length }).map((_, idx) => (
                      <div
                        key={`empty-${idx}`}
                        className="w-full aspect-square rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center"
                      >
                        <span className="text-gray-300 text-2xl">📷</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {submitError && (
                <div className="mb-4 bg-red-50 border border-red-300 text-red-600 rounded-lg px-4 py-3 text-sm">
                  {submitError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setStep(1); setPhotos([]); setRecaptureIdx(null) }}
                  className="flex-1 border border-gray-300 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  ← ย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={photos.length < REQUIRED_PHOTOS || submitting}
                  className={`flex-2 flex-grow bg-green-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    photos.length < REQUIRED_PHOTOS || submitting
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-green-700'
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
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">✅</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">บันทึกสำเร็จ!</h2>
              <p className="text-gray-500 mb-2">
                ลงทะเบียน <span className="font-semibold text-gray-700">{name}</span> เรียบร้อยแล้ว
              </p>
              <p className="text-gray-400 text-sm">กำลังกลับไปหน้าจัดการผู้ใช้...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
