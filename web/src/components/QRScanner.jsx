import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

export default function QRScanner({ onScan, onClose }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const streamRef = useRef(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let active = true

    const cleanup = () => {
      active = false
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErr('Camera not supported in this browser.')
      return
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        video.srcObject = stream
        video.play()

        const tick = () => {
          if (!active) return
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const canvas = canvasRef.current
            canvas.width  = video.videoWidth
            canvas.height = video.videoHeight
            canvas.getContext('2d').drawImage(video, 0, 0)
            const img  = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
            if (code?.data) {
              cleanup()
              onScan(code.data)
              return
            }
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        video.onloadeddata = () => { rafRef.current = requestAnimationFrame(tick) }
      })
      .catch(e => setErr(e.message || 'Camera access denied.'))

    return cleanup
  }, [onScan])

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col animate-fade-in">

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 shrink-0">
        <button onClick={onClose} className="text-white/80 text-sm font-medium py-1 px-3 rounded-full bg-white/10">
          Cancel
        </button>
        <p className="text-white font-semibold text-sm tracking-wide">Scan QR Code</p>
        <div className="w-16" />
      </div>

      {err ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          <div className="text-5xl mb-4">📷</div>
          <p className="text-white font-semibold text-lg mb-2">Camera unavailable</p>
          <p className="text-white/50 text-sm">{err}</p>
          <button onClick={onClose} className="mt-8 bg-white/15 text-white px-8 py-2.5 rounded-full text-sm font-medium">
            Close
          </button>
        </div>
      ) : (
        <>
          {/* Camera feed */}
          <div className="flex-1 relative overflow-hidden">
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />

            {/* Dark overlay with cutout illusion */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* top */}
              <div className="absolute inset-x-0 top-0 bottom-[calc(50%-132px)] bg-black/55" />
              {/* bottom */}
              <div className="absolute inset-x-0 top-[calc(50%+132px)] bottom-0 bg-black/55" />
              {/* left */}
              <div className="absolute top-[calc(50%-132px)] bottom-[calc(50%-132px)] left-0 right-[calc(50%+132px)] bg-black/55" />
              {/* right */}
              <div className="absolute top-[calc(50%-132px)] bottom-[calc(50%-132px)] left-[calc(50%+132px)] right-0 bg-black/55" />

              {/* Scan frame */}
              <div className="relative w-64 h-64">
                {/* Corners */}
                {[
                  'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xl',
                  'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xl',
                  'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl',
                  'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl',
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-8 h-8 border-gold ${cls}`} />
                ))}
                {/* Scan line animation */}
                <div className="absolute inset-x-0 h-0.5 bg-gold/70 animate-[scan_2s_ease-in-out_infinite]"
                  style={{ top: '50%', boxShadow: '0 0 8px 2px rgba(240,192,64,0.4)' }} />
              </div>
            </div>
          </div>

          <p className="text-white/50 text-sm text-center py-6 shrink-0">
            Point at a Chakram wallet QR code
          </p>
        </>
      )}

      <style>{`
        @keyframes scan {
          0%,100% { top: 10%; }
          50%      { top: 90%; }
        }
      `}</style>
    </div>
  )
}
