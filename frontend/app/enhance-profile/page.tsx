"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { API_BASE } from "@/lib/api"
import { Camera, Upload, CheckCircle, AlertCircle, ScanFace, X, User } from "lucide-react"
import { FaceUploadGuidelines } from "@/components/FaceUploadGuidelines"
import { VisualFaceExample, FaceExampleType } from "@/components/VisualFaceExample"
import { FaceAdjusterModal, fileToDataURL } from "@/components/FaceAdjusterModal"

const BACKEND_BASE = API_BASE  // e.g. http://localhost:8000

interface FacePhoto {
    url: string
    label: string
    type: "registered" | "enhanced"
}

export default function EnhanceProfilePage() {
    const router = useRouter()
    const [token, setToken] = useState<string | null>(null)
    const [totalEmbeddings, setTotalEmbeddings] = useState(0)
    const [uploading, setUploading] = useState(false)
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null)
    const [selectedAngle, setSelectedAngle] = useState("")
    const [adjusting, setAdjusting] = useState<{ imageSrc: string } | null>(null)
    const [showCamera, setShowCamera] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const streamRef = useRef<MediaStream | null>(null)

    const [registeredPhotos, setRegisteredPhotos] = useState<FacePhoto[]>([])
    const [enhancedPhotos, setEnhancedPhotos] = useState<FacePhoto[]>([])

    useEffect(() => {
        const t = localStorage.getItem("token")
        if (!t) { router.push("/login"); return }
        setToken(t)
        fetchGallery(t)
        fetchFaceCount(t)
    }, [])

    const fetchFaceCount = async (t: string) => {
        try {
            const r = await axios.get(`${API_BASE}/auth/face-count`, {
                headers: { Authorization: `Bearer ${t}` }
            })
            setTotalEmbeddings(r.data.total_embeddings)
        } catch { }
    }

    const fetchGallery = async (t: string) => {
        try {
            const r = await axios.get(`${API_BASE}/auth/face-gallery`, {
                headers: { Authorization: `Bearer ${t}` }
            })
            setRegisteredPhotos(r.data.registered || [])
            setEnhancedPhotos(r.data.enhanced || [])
        } catch { }
    }

    const uploadFace = async (file: File | Blob) => {
        if (!token) return
        setUploading(true)
        setMessage(null)
        const formData = new FormData()
        formData.append("file", file, (file as File).name || "camera_capture.jpg")
        formData.append("angle", selectedAngle || "other")
        try {
            const r = await axios.post(`${API_BASE}/auth/add-face`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "multipart/form-data"
                }
            })
            setMessage({ text: r.data.message, type: "success" })
            setTotalEmbeddings(r.data.total_embeddings)
            // Refresh gallery to show the new photo
            fetchGallery(token)
        } catch (err: any) {
            const detail = err?.response?.data?.detail || "Upload failed. Please try again."
            setMessage({ text: detail, type: "error" })
        } finally {
            setUploading(false)
        }
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = "" // allow re-selecting the same file
        const dataURL = await fileToDataURL(file)
        setAdjusting({ imageSrc: dataURL })
    }

    const handleAdjustConfirm = (croppedFile: File) => {
        setAdjusting(null)
        uploadFace(croppedFile)
    }

    const startCamera = async () => {
        setShowCamera(true)
        setMessage(null)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: 640, height: 480 }
            })
            streamRef.current = stream
            if (videoRef.current) {
                videoRef.current.srcObject = stream
            }
        } catch {
            setMessage({ text: "Cannot access camera. Please check permissions.", type: "error" })
            setShowCamera(false)
        }
    }

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return
        const video = videoRef.current
        const canvas = canvasRef.current
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.drawImage(video, 0, 0)
        canvas.toBlob((blob) => {
            if (blob) {
                stopCamera()
                uploadFace(blob)
            }
        }, "image/jpeg", 0.9)
    }

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop())
            streamRef.current = null
        }
        setShowCamera(false)
    }

    const angleOptions = [
        { id: "front", label: "Front Face", icon: "📸", desc: "Look straight at the camera" },
        { id: "left", label: "Left Profile", icon: "◀️", desc: "Turn slightly left" },
        { id: "right", label: "Right Profile", icon: "▶️", desc: "Turn slightly right" },
        { id: "upward", label: "Looking Upward", icon: "⬆️", desc: "Tilt head upward" },
        { id: "downward", label: "Looking Downward", icon: "⬇️", desc: "Tilt head downward" },
        { id: "glasses", label: "Dark Glasses", icon: "🕶️", desc: "Wearing sunglasses" },
        { id: "hat", label: "Wearing Hat", icon: "🎩", desc: "Hat or cap on" },
        { id: "lighting", label: "Dim Lighting", icon: "💡", desc: "Different lighting" },
        { id: "smile", label: "Smiling Face", icon: "😊", desc: "Your best smile!" },
    ]

    const PhotoCard = ({ photo, small = false }: { photo: FacePhoto; small?: boolean }) => (
        <div style={{ textAlign: "center" }}>
            <div style={{
                width: "100%", aspectRatio: "1", borderRadius: small ? "10px" : "12px",
                overflow: "hidden", border: "2px solid #e2e8f0",
                background: "#f8fafc", marginBottom: "6px",
                display: "flex", alignItems: "center", justifyContent: "center"
            }}>
                <img
                    src={`${BACKEND_BASE}/${photo.url}`}
                    alt={photo.label}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => {
                        const t = e.target as HTMLImageElement
                        t.style.display = "none"
                        t.nextElementSibling?.removeAttribute("style")
                    }}
                />
                <div style={{ display: "none", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                    <User style={{ width: 28, height: 28, color: "#cbd5e1" }} />
                </div>
            </div>
            <span style={{ fontSize: small ? "0.72rem" : "0.78rem", fontWeight: 600, color: "#475569" }}>
                {photo.label}
            </span>
        </div>
    )

    return (
        <>
            {adjusting && (
                <FaceAdjusterModal
                    title={angleOptions.find(o => o.id === selectedAngle)?.label || "Adjust Photo"}
                    instructionShort="Fit your face inside the circle"
                    instructionLong={angleOptions.find(o => o.id === selectedAngle)?.desc || "Drag and zoom so your face fills the guide."}
                    imageSrc={adjusting.imageSrc}
                    onConfirm={handleAdjustConfirm}
                    onCancel={() => setAdjusting(null)}
                />
            )}
            <div style={{ maxWidth: "640px", margin: "0 auto", padding: "80px 16px 60px" }}>

                {/* Header */}
                <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <ScanFace style={{ color: "#0ea5e9", width: 26, height: 26 }} />
                    <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#0f2942", margin: 0 }}>
                        Enhance Face Profile
                    </h1>
                </div>

                {/* Stats Card */}
                <div style={{
                    background: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
                    borderRadius: "16px", padding: "20px 24px", marginBottom: "20px",
                    color: "white", boxShadow: "0 8px 32px rgba(14,165,233,0.25)"
                }}>
                    <div style={{ fontSize: "0.82rem", opacity: 0.85 }}>Your AI Face Profiles</div>
                    <div style={{ fontSize: "2.4rem", fontWeight: 800, lineHeight: 1.1 }}>{totalEmbeddings}</div>
                    <div style={{ fontSize: "0.78rem", opacity: 0.75, marginTop: "4px" }}>
                        More profiles = better recognition accuracy
                    </div>
                </div>

                {/* Registered Faces */}
                {registeredPhotos.length > 0 && (
                    <div style={{
                        background: "white", borderRadius: "16px", padding: "18px 20px",
                        border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
                        marginBottom: "16px"
                    }}>
                        <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f2942", margin: "0 0 3px 0" }}>
                            Registration Photos
                        </h3>
                        <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "0 0 14px 0" }}>
                            Submitted when you created your account.
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                            {registeredPhotos.map((p, i) => <PhotoCard key={i} photo={p} />)}
                        </div>
                    </div>
                )}

                {/* Enhanced Faces */}
                {enhancedPhotos.length > 0 && (
                    <div style={{
                        background: "white", borderRadius: "16px", padding: "18px 20px",
                        border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
                        marginBottom: "16px"
                    }}>
                        <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f2942", margin: "0 0 3px 0" }}>
                            Accuracy Enhancement Photos
                        </h3>
                        <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "0 0 14px 0" }}>
                            Photos you uploaded to improve recognition.
                        </p>
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: enhancedPhotos.length === 1 ? "1fr 1fr 1fr" : "repeat(auto-fill, minmax(90px, 1fr))",
                            gap: "10px"
                        }}>
                            {enhancedPhotos.map((p, i) => <PhotoCard key={i} photo={p} small />)}
                        </div>
                    </div>
                )}

                {/* Accuracy Tip Banner */}
                <div style={{
                    background: "linear-gradient(135deg, #fef9c3, #fef08a)",
                    borderRadius: "14px", padding: "14px 16px", marginBottom: "18px",
                    border: "1px solid #fde047"
                }}>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#713f12", marginBottom: "5px" }}>
                        🎯 Improve Your Recognition Accuracy
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#854d0e", lineHeight: 1.6 }}>
                        Upload more faces for <strong>high accuracy</strong> — try adding:
                        <span style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                            {["🕶️ Sunglasses", "🎩 Hat", "⬆️ Looking up", "⬇️ Looking down", "💡 Dim light", "😊 Smiling"].map(t => (
                                <span key={t} style={{
                                    background: "rgba(113,63,18,0.10)", borderRadius: "99px",
                                    padding: "2px 10px", fontSize: "0.75rem", fontWeight: 600
                                }}>{t}</span>
                            ))}
                        </span>
                    </div>
                </div>

                {/* Status Message */}
                {message && (
                    <div style={{
                        padding: "12px 14px", borderRadius: "12px", marginBottom: "16px",
                        display: "flex", alignItems: "center", gap: "10px",
                        background: message.type === "success" ? "#ecfdf5" : "#fef2f2",
                        border: `1px solid ${message.type === "success" ? "#6ee7b7" : "#fca5a5"}`,
                        color: message.type === "success" ? "#065f46" : "#991b1b",
                    }}>
                        {message.type === "success"
                            ? <CheckCircle style={{ width: 18, height: 18, flexShrink: 0 }} />
                            : <AlertCircle style={{ width: 18, height: 18, flexShrink: 0 }} />
                        }
                        <span style={{ fontSize: "0.88rem" }}>{message.text}</span>
                    </div>
                )}

                {/* Camera View */}
                {showCamera && (
                    <>
                        <div style={{ marginBottom: "16px" }}>
                            <VisualFaceExample type={selectedAngle as FaceExampleType} />
                        </div>
                        <div style={{ borderRadius: "16px", overflow: "hidden", marginBottom: "16px", background: "#000", position: "relative" }}>
                        <video
                            ref={videoRef}
                            autoPlay playsInline muted
                            style={{ width: "100%", display: "block", transform: "scaleX(-1)" }}
                        />
                        <div style={{
                            position: "absolute", bottom: "16px", left: 0, right: 0,
                            display: "flex", justifyContent: "center", gap: "14px"
                        }}>
                            <button
                                onClick={capturePhoto}
                                style={{
                                    width: "60px", height: "60px", borderRadius: "50%", background: "white",
                                    border: "4px solid rgba(255,255,255,0.5)", cursor: "pointer",
                                    boxShadow: "0 4px 16px rgba(0,0,0,0.3)"
                                }}
                            />
                            <button
                                onClick={stopCamera}
                                style={{
                                    width: "42px", height: "42px", borderRadius: "50%",
                                    background: "rgba(220,38,38,0.8)", border: "none", cursor: "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "center"
                                }}
                            >
                                <X style={{ color: "white", width: 18, height: 18 }} />
                            </button>
                        </div>
                    </div>
                    </>
                )}

                {/* Add New Face section */}
                {!showCamera && (
                    <div style={{
                        background: "white", borderRadius: "16px", padding: "18px 20px",
                        border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.03)"
                    }}>
                        <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f2942", margin: "0 0 3px 0" }}>
                            Add a New Face Photo
                        </h3>
                        <p style={{ fontSize: "0.78rem", color: "#64748b", margin: "0 0 14px 0" }}>
                            Select a type, then upload or take a photo.
                        </p>

                        <FaceUploadGuidelines />

                        {/* Angle grid */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                            {angleOptions.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setSelectedAngle(opt.id)}
                                    disabled={uploading}
                                    style={{
                                        padding: "10px 12px", borderRadius: "12px", textAlign: "left",
                                        background: selectedAngle === opt.id ? "#eff6ff" : "#f8fafc",
                                        border: `2px solid ${selectedAngle === opt.id ? "#3b82f6" : "#e2e8f0"}`,
                                        color: selectedAngle === opt.id ? "#1e3a8a" : "#475569",
                                        cursor: uploading ? "not-allowed" : "pointer",
                                        display: "flex", alignItems: "center", gap: "8px",
                                        transition: "all 0.2s", fontWeight: selectedAngle === opt.id ? 600 : 500
                                    }}
                                >
                                    <span style={{ fontSize: "1.1rem" }}>{opt.icon}</span>
                                    <div>
                                        <div style={{ fontSize: "0.82rem" }}>{opt.label}</div>
                                        <div style={{ fontSize: "0.68rem", opacity: 0.6, marginTop: "1px" }}>{opt.desc}</div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Action buttons and Visual Example — only shown after selection */}
                        {selectedAngle && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                                {/* Dynamic visual example for the specific angle */}
                                <VisualFaceExample type={selectedAngle as FaceExampleType} />

                                <div style={{ display: "flex", gap: "10px" }}>
                                    <button
                                        onClick={startCamera}
                                        disabled={uploading}
                                        style={{
                                            flex: 1, padding: "14px", borderRadius: "12px",
                                            background: uploading ? "#94a3b8" : "linear-gradient(135deg,#0ea5e9,#38bdf8)",
                                            color: "white", border: "none", cursor: uploading ? "not-allowed" : "pointer",
                                            fontWeight: 600, fontSize: "0.9rem",
                                            display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                                            boxShadow: "0 4px 14px rgba(14,165,233,0.3)"
                                        }}
                                    >
                                        <Camera style={{ width: 18, height: 18 }} />
                                        {uploading ? "Processing…" : "Open Camera"}
                                    </button>

                                    <label style={{
                                        flex: 1, padding: "14px", borderRadius: "12px",
                                        background: uploading ? "#94a3b8" : "linear-gradient(135deg,#6366f1,#818cf8)",
                                        color: "white", border: "none", cursor: uploading ? "not-allowed" : "pointer",
                                        fontWeight: 600, fontSize: "0.9rem",
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                                        boxShadow: "0 4px 14px rgba(99,102,241,0.3)"
                                    }}>
                                        <Upload style={{ width: 18, height: 18 }} />
                                        {uploading ? "Processing…" : "Upload Photo"}
                                        <input type="file" accept="image/*" onChange={handleFileSelect} disabled={uploading} style={{ display: "none" }} />
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <canvas ref={canvasRef} style={{ display: "none" }} />
            </div>
        </>
    )
}
