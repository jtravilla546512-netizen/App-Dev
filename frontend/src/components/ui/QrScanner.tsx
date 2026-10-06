import { useEffect, useRef, useState } from 'react'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'

export default function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const scanCallback = useRef(onScan)
  scanCallback.current = onScan
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false
    let controls: IScannerControls | undefined
    const reader = new BrowserQRCodeReader()
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera scanning requires HTTPS and a supported browser. Use manual entry below.')
      return
    }
    void reader.decodeFromVideoDevice(undefined, video.current!, (result, _error, currentControls) => {
      if (result && !disposed) {
        disposed = true
        currentControls.stop()
        scanCallback.current(result.getText())
      }
    }).then(next => { controls = next; if (disposed) next.stop() })
      .catch(() => { if (!disposed) setError('Camera unavailable or permission denied. Close the scanner and enter the member ID or copy accession number.') })
    return () => { disposed = true; controls?.stop() }
  }, [])
  return <section className="rounded-xl border p-4 space-y-3" aria-label="QR camera scanner">
    <p>Show one member or book-copy QR to the laptop/USB camera. Scanning only looks up a record; it never issues or returns a book.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <video ref={video} className="w-full max-h-72 bg-black rounded-lg" muted playsInline />
    <button type="button" className="border rounded-lg px-4 py-2" onClick={onClose}>Stop camera</button>
  </section>
}
