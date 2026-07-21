import { useEffect, useRef } from 'react'

export default function WebcamCapture({ onCapture, width = 640, height = 480 }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    let mounted = true

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width, height }
        })
        if (mounted && videoRef.current) {
          videoRef.current.srcObject = stream
          streamRef.current = stream
        }
      } catch (err) {
        console.error('WebcamCapture error:', err)
      }
    }

    startCamera()

    return () => {
      mounted = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [width, height])

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = videoRef.current.videoWidth || width
    canvas.height = videoRef.current.videoHeight || height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoRef.current, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (blob && onCapture) onCapture(blob)
      },
      'image/jpeg',
      0.92
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative rounded-xl overflow-hidden border-2 border-gray-300 bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="block"
          style={{ width, height: 'auto', maxWidth: '100%' }}
        />
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <button
        type="button"
        onClick={capture}
        className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold px-6 py-3 rounded-lg transition-colors flex items-center gap-2 shadow"
      >
        <span className="text-lg">📷</span>
        ถ่ายรูป
      </button>
    </div>
  )
}
