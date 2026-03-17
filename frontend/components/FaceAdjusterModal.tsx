import React, { useRef, useState, useEffect, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { ZoomIn, ZoomOut, X as XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function dataURLtoFile(dataurl: string, filename: string): File {
    const arr = dataurl.split(",")
    const mime = arr[0].match(/:(.*?);/)![1]
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) u8arr[n] = bstr.charCodeAt(n)
    return new File([u8arr], filename, { type: mime })
}

export function fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}

export function FaceAdjusterModal({
    title,
    instructionShort,
    instructionLong,
    imageSrc,
    onConfirm,
    onCancel,
}: {
    title: string
    instructionShort: string
    instructionLong: string
    imageSrc: string
    onConfirm: (croppedFile: File, croppedDataURL: string) => void
    onCancel: () => void
}) {
    const SIZE = 480            // output size in px
    const OVAL_W = 0.55         // oval width as fraction of SIZE
    const OVAL_H = 0.72         // oval height as fraction of SIZE

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imgRef = useRef<HTMLImageElement | null>(null)

    const [scale, setScale] = useState(1.2)
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const [dragging, setDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const [imgLoaded, setImgLoaded] = useState(false)
    const [hint, setHint] = useState(true)

    // Load image
    useEffect(() => {
        const img = new Image()
        img.onload = () => {
            imgRef.current = img
            // Start zoomed out so the FULL photo is visible — user then zooms/drags to fit face in circle
            const s = Math.min(SIZE / img.width, SIZE / img.height) * 0.85
            setScale(s)
            setOffset({ x: 0, y: 0 })
            setImgLoaded(true)
        }
        img.src = imageSrc
    }, [imageSrc])

    // Draw every time scale/offset/img changes
    useEffect(() => {
        if (!imgLoaded || !canvasRef.current || !imgRef.current) return
        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")!
        const img = imgRef.current
        const cx = SIZE / 2
        const cy = SIZE / 2
        const RADIUS = SIZE * 0.40   // face CIRCLE radius — perfect circle

        ctx.clearRect(0, 0, SIZE, SIZE)

        // 1. Draw photo
        const dw = img.width * scale
        const dh = img.height * scale
        const dx = cx - dw / 2 + offset.x
        const dy = cy - dh / 2 + offset.y
        ctx.drawImage(img, dx, dy, dw, dh)

        // 2. Darken everything OUTSIDE the circle
        ctx.save()
        ctx.fillStyle = "rgba(0,0,0,0.55)"
        ctx.beginPath()
        ctx.rect(0, 0, SIZE, SIZE)
        ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2)   // ← perfect circle
        ctx.clip("evenodd")
        ctx.fill()
        ctx.restore()

        // 3. Solid sky-blue ring (circle)
        ctx.save()
        ctx.strokeStyle = "rgba(56,189,248,0.95)"
        ctx.lineWidth = 3
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2)   // ← perfect circle
        ctx.stroke()
        ctx.restore()

        // 4. Subtle inner glow ring
        ctx.save()
        ctx.strokeStyle = "rgba(255,255,255,0.25)"
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(cx, cy, RADIUS - 5, 0, Math.PI * 2)   // ← perfect circle
        ctx.stroke()
        ctx.restore()

        // 5. Bottom dark bar with instruction
        ctx.save()
        ctx.fillStyle = "rgba(0,0,0,0.6)"
        ctx.fillRect(0, SIZE - 40, SIZE, 40)
        ctx.fillStyle = "rgba(255,255,255,0.9)"
        ctx.font = "bold 13px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(instructionShort, cx, SIZE - 16)
        ctx.restore()
    }, [scale, offset, imgLoaded, instructionShort])

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        setDragging(true)
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
        setHint(false)
    }
    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!dragging) return
        setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    }
    const handleMouseUp = () => setDragging(false)

    // Touch support
    const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
        const t = e.touches[0]
        setDragging(true)
        setDragStart({ x: t.clientX - offset.x, y: t.clientY - offset.y })
        setHint(false)
    }
    const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (!dragging || !e.touches[0]) return
        const t = e.touches[0]
        setOffset({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y })
    }

    const handleConfirm = () => {
        if (!canvasRef.current) return
        // Export CLEAN canvas (no overlay)
        const hiddenCanvas = document.createElement("canvas")
        hiddenCanvas.width = SIZE
        hiddenCanvas.height = SIZE
        const ctx = hiddenCanvas.getContext("2d")
        if (!ctx || !imgRef.current) return

        // Draw photo with same transform
        const img = imgRef.current
        const dw = img.width * scale
        const dh = img.height * scale
        const dx = SIZE / 2 - dw / 2 + offset.x
        const dy = SIZE / 2 - dh / 2 + offset.y

        ctx.fillStyle = "black"
        ctx.fillRect(0, 0, SIZE, SIZE) // background
        ctx.drawImage(img, dx, dy, dw, dh)

        const dataURL = hiddenCanvas.toDataURL("image/jpeg", 0.95)
        const file = dataURLtoFile(dataURL, `face-adjusted.jpg`)
        onConfirm(file, dataURL)
    }

    const [mounted, setMounted] = useState(false)
    useLayoutEffect(() => { setMounted(true) }, [])
    if (!mounted) return null

    return createPortal(
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'stretch', justifyContent: 'center',
            background: 'rgba(0,0,0,0.92)',
        }}>
            {/* Full-screen panel — canvas fills, controls always visible at bottom */}
            <div style={{
                display: 'flex', flexDirection: 'column',
                width: '100%', maxWidth: '600px', height: '100vh',
                background: 'white',
            }}>
                {/* ── Header ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0,
                }}>
                    <div>
                        <p style={{ fontWeight: 700, fontSize: '14px', margin: 0 }}>
                            Adjust Face — {title}
                        </p>
                        <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
                            {instructionLong}
                        </p>
                    </div>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
                        <XIcon style={{ width: 20, height: 20 }} />
                    </button>
                </div>

                {/* ── Canvas — fills all remaining space ── */}
                <div style={{
                    flex: 1, position: 'relative', background: 'black',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                }}>
                    <canvas
                        ref={canvasRef}
                        width={SIZE}
                        height={SIZE}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'grab', touchAction: 'none' }}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={() => setDragging(false)}
                    />
                    {hint && (
                        <div style={{
                            position: 'absolute', top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)',
                            pointerEvents: 'none',
                            background: 'rgba(0,0,0,0.65)', color: 'white',
                            fontSize: '12px', padding: '6px 14px', borderRadius: '99px',
                            whiteSpace: 'nowrap',
                        }}>
                            Drag &amp; zoom to fit your face inside the circle
                        </div>
                    )}
                </div>

                {/* ── Zoom slider ── always visible ── */}
                <div style={{
                    flexShrink: 0, padding: '10px 16px',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                }}>
                    <ZoomOut style={{ width: 16, height: 16, color: '#64748b', flexShrink: 0 }} />
                    <input
                        type="range" min={0.1} max={5} step={0.02} value={scale}
                        onChange={e => { setScale(Number(e.target.value)); setHint(false) }}
                        style={{ flex: 1, accentColor: '#0ea5e9' }}
                    />
                    <ZoomIn style={{ width: 16, height: 16, color: '#64748b', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: '#64748b', minWidth: '38px', textAlign: 'right' }}>
                        {(scale * 100).toFixed(0)}%
                    </span>
                </div>

                {/* ── Action buttons ── always visible ── */}
                <div style={{
                    flexShrink: 0, display: 'flex', gap: '8px',
                    padding: '12px 16px',
                    borderTop: '1px solid #e2e8f0', background: 'white',
                }}>
                    <Button variant="outline" style={{ flex: 1 }} onClick={onCancel}>
                        Choose Different
                    </Button>
                    <Button
                        style={{ flex: 1, background: '#0ea5e9', color: 'white' }}
                        onClick={handleConfirm}
                        disabled={!imgLoaded}
                    >
                        ✓ Confirm &amp; Scan
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    )
}
