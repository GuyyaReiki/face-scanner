import { useState, useEffect, useRef } from 'react'
import { checkIn } from '../api.js'

export default function ScanPage() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState({ type: 'scanning', message: 'กำลังสแกน...' })
  const [recentCheckins, setRecentCheckins] = useState([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [cameraError, setCameraError] = useState(null)

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 }
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          streamRef.current = stream
        }
        setCameraError(null)
      } catch (err) {
        setCameraError('ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบการอนุญาต')
        console.error('Camera error:', err)
      }
    }

    startCamera()

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    const captureInterval = setInterval(async () => {
      if (!videoRef.current || !videoRef.current.videoWidth) return

      const canvas = document.createElement('canvas')
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(videoRef.current, 0, 0)

      canvas.toBlob(async (blob) => {
        if (!blob) return

        const formData = new FormData()
        formData.append('image', blob, 'capture.jpg')

        try {
          setStatus({ type: 'scanning', message: 'กำลังสแกน...' })
          const response = await checkIn(formData)

          if (response.data.matched) {
            setStatus({
              type: 'success',
              message: `ยินดีต้อนรับ ${response.data.user_name}`,
              time: response.data.timestamp
            })

            setRecentCheckins(prev => [{
              name: response.data.user_name,
              time: response.data.timestamp,
              timestamp: new Date().toISOString()
            }, ...prev.slice(0, 4)])
          } else {
            setStatus({ type: 'error', message: 'ไม่พบบุคคลในระบบ' })
          }

          setTimeout(() => {
            setStatus({ type: 'scanning', message: 'กำลังสแกน...' })
          }, 2000)
        } catch (err) {
          console.error('Check-in error:', err)
          setStatus({ type: 'error', message: 'เกิดข้อผิดพลาด' })
        }
      }, 'image/jpeg', 0.9)
    }, 2000)

    return () => clearInterval(captureInterval)
  }, [])

  const formatTime = (date) => {
    return date.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const formatDate = (date) => {
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    })
  }

  const borderColor = {
    scanning: 'border-gray-400',
    success: 'border-green-500',
    error: 'border-red-500'
  }[status.type]

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">
              {formatTime(currentTime)}
            </h1>
            <p className="text-gray-600">{formatDate(currentTime)}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {cameraError ? (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl p-8 text-center">
                  <p className="text-red-600 font-medium">{cameraError}</p>
                </div>
              ) : (
                <div className={`relative border-4 ${borderColor} rounded-xl overflow-hidden transition-colors duration-300`}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-auto bg-black"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                    <p className="text-white text-center font-semibold text-lg">
                      {status.message}
                    </p>
                    {status.time && (
                      <p className="text-white text-center text-sm mt-1">
                        เวลาเข้างาน: {status.time}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-4">การเข้างานล่าสุด</h2>
              {recentCheckins.length === 0 ? (
                <p className="text-gray-500 text-sm">ยังไม่มีข้อมูล</p>
              ) : (
                <div className="space-y-3">
                  {recentCheckins.map((checkin, idx) => (
                    <div
                      key={idx}
                      className="bg-green-50 border border-green-200 rounded-lg p-3"
                    >
                      <p className="font-semibold text-gray-800">{checkin.name}</p>
                      <p className="text-sm text-gray-600">{checkin.time}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
