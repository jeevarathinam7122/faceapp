"use client"

import { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import axios from "axios"
import { API_BASE } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
    CheckCircle, Camera, RotateCcw, ChevronRight,
    User, Mail, Lock, Eye, EyeOff, ImagePlus,
    ZoomIn, ZoomOut, Move, X as XIcon
} from "lucide-react"
import { FaceUploadGuidelines } from "@/components/FaceUploadGuidelines"
import { VisualFaceExample } from "@/components/VisualFaceExample"

// ─── Types ───────────────────────────────────────────────────────────────────

type CaptureState = "idle" | "capturing" | "captured"
type ScanStatus = "idle" | "scanning" | "ok" | "error"

interface FaceCaptures {
    front: string | null
    left: string | null
    right: string | null
}

interface AngleScanState {
    dataURL: string | null
    file: File | null
    embedding: number[] | null   // ArcFace 512-D vector from /auth/scan-face
    lower_embedding: number[] | null // ArcFace 512-D vector for the lower face
    status: ScanStatus
    message: string
}

type GalleryScans = Record<FaceStep, AngleScanState>

const STEPS = ["front", "left", "right"] as const
type FaceStep = typeof STEPS[number]

const STEP_LABELS: Record<FaceStep, string> = {
    front: "Front View",
    left: "Left Side",
    right: "Right Side",
}

const STEP_INSTRUCTIONS_SHORT: Record<FaceStep, string> = {
    front: "Look straight at the camera",
    left: "Turn slightly LEFT",
    right: "Turn slightly RIGHT",
}

const STEP_INSTRUCTIONS_LONG: Record<FaceStep, string> = {
    front: "Face the camera directly. Your face should fill most of the oval guide. Good lighting is important.",
    left: "Turn your head slightly to the left. Your left profile should be visible.",
    right: "Turn your head slightly to the right. Your right profile should be visible.",
}

const defaultScan: AngleScanState = { dataURL: null, file: null, embedding: null, lower_embedding: null, status: "idle", message: "" }

import { dataURLtoFile, fileToDataURL, FaceAdjusterModal } from "@/components/FaceAdjusterModal"
// ─── Scan Status Icon ─────────────────────────────────────────────────────────

function ScanIcon({ s }: { s: AngleScanState }) {
    if (s.status === "scanning")
        return <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
    if (s.status === "ok")
        return <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
    if (s.status === "error")
        return <span className="text-red-500 text-xl font-bold shrink-0 leading-none">✕</span>
    return <span className="h-5 w-5 shrink-0" />
}

// ─── Gallery Upload Mode ──────────────────────────────────────────────────────

function GalleryUploadMode({
    onRegister,
    submitting,
    submitError,
}: {
    onRegister: (embeddings: { front_embedding: number[]; left_embedding: number[]; right_embedding: number[]; lower_embedding: number[] | null; front_image_base64?: string; left_image_base64?: string; right_image_base64?: string }) => void
    submitting: boolean
    submitError: string
}) {
    const [scans, setScans] = useState<GalleryScans>({
        front: { ...defaultScan },
        left: { ...defaultScan },
        right: { ...defaultScan },
    })

    // Adjuster modal state
    const [adjusting, setAdjusting] = useState<{ step: FaceStep; imageSrc: string } | null>(null)

    const frontRef = useRef<HTMLInputElement>(null)
    const leftRef = useRef<HTMLInputElement>(null)
    const rightRef = useRef<HTMLInputElement>(null)
    const fileInputRefs: Record<FaceStep, React.RefObject<HTMLInputElement | null>> = {
        front: frontRef,
        left: leftRef,
        right: rightRef,
    }

    // File selected → open adjuster first
    const handleFileChange = async (step: FaceStep, e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (!f) return
        const dataURL = await fileToDataURL(f)
        setAdjusting({ step, imageSrc: dataURL })
        if (fileInputRefs[step].current) fileInputRefs[step].current!.value = ""
    }

    // Adjuster confirmed → send the cropped file to /auth/scan-face
    const handleAdjustConfirm = async (croppedFile: File, croppedDataURL: string) => {
        if (!adjusting) return
        const { step } = adjusting
        setAdjusting(null)

        setScans(prev => ({
            ...prev,
            [step]: { dataURL: croppedDataURL, file: croppedFile, embedding: null, lower_embedding: null, status: "scanning", message: "Scanning face…" },
        }))

        try {
            const formData = new FormData()
            formData.append("file", croppedFile)
            formData.append("angle", step) // Pass the required angle (front, left, right)
            const res = await axios.post(`${API_BASE}/auth/scan-face`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            })
            const data = res.data

            if (!data.face_detected || data.already_registered) {
                setScans(prev => ({
                    ...prev,
                    [step]: { dataURL: croppedDataURL, file: croppedFile, embedding: null, lower_embedding: null, status: "error", message: data.message },
                }))
            } else {
                // Store the ArcFace embedding returned by the server — reused at registration
                setScans(prev => ({
                    ...prev,
                    [step]: {
                        dataURL: croppedDataURL,
                        file: croppedFile,
                        embedding: data.embedding,
                        lower_embedding: data.lower_embedding || null,
                        status: "ok",
                        message: data.message,
                    },
                }))
            }
        } catch (error: any) {
            console.error("Scan error:", error)
            const msg = error.response?.data?.message || "Scan failed. Please try again."
            setScans(prev => ({
                ...prev,
                [step]: {
                    dataURL: croppedDataURL,
                    file: croppedFile,
                    embedding: null,
                    lower_embedding: null,
                    status: "error",
                    message: msg,
                },
            }))
        }
    }

    const allOk = (Object.keys(scans) as FaceStep[]).every(k => scans[k].status === "ok")

    const handleCompleteRegistration = () => {
        if (!scans.front.embedding || !scans.left.embedding || !scans.right.embedding) return
        onRegister({
            front_embedding: scans.front.embedding,
            left_embedding: scans.left.embedding,
            right_embedding: scans.right.embedding,
            lower_embedding: scans.front.lower_embedding, // Passed selectively from the front scan
            front_image_base64: scans.front.dataURL ?? undefined,
            left_image_base64: scans.left.dataURL ?? undefined,
            right_image_base64: scans.right.dataURL ?? undefined,
        })
    }

    return (
        <>
            {/* Face adjuster modal */}
            {adjusting && (
                <FaceAdjusterModal
                    title={STEP_LABELS[adjusting.step]}
                    instructionShort={STEP_INSTRUCTIONS_SHORT[adjusting.step]}
                    instructionLong={STEP_INSTRUCTIONS_LONG[adjusting.step]}
                    imageSrc={adjusting.imageSrc}
                    onConfirm={handleAdjustConfirm}
                    onCancel={() => setAdjusting(null)}
                />
            )}

            <div className="grid gap-3">
                {/* Find the first step that is not yet 'ok' to show its example */}
                {(() => {
                    const currentStep = STEPS.find(s => scans[s].status !== "ok") || "front"
                    return <VisualFaceExample type={currentStep} className="mb-2" />
                })()}

                <p className="text-xs text-muted-foreground text-center">
                    Upload each angle. You can adjust the face position before scanning.
                </p>

                {STEPS.map((step, idx) => {
                    const scan = scans[step]
                    const prevStep = idx > 0 ? STEPS[idx - 1] : null
                    const prevOk = prevStep ? scans[prevStep].status === "ok" : true

                    // Force sequential: Hide future steps until previous is done (or error?)
                    // If previous step is NOT ok, do not render this step at all
                    if (idx > 0 && !prevOk) return null

                    const isLocked = !prevOk && scan.status === "idle"

                    return (
                        <div key={step}>
                            <input
                                ref={fileInputRefs[step]}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => handleFileChange(step, e)}
                            />
                            <div
                                className={`flex items-center gap-3 border-2 rounded-xl p-3 transition-all ${isLocked
                                    ? "hidden" // Fail-safe (though we returned null above)
                                    : scan.status === "ok"
                                        ? "border-green-500 bg-green-50 cursor-pointer"
                                        : scan.status === "error"
                                            ? "border-red-400 bg-red-50 cursor-pointer"
                                            : scan.status === "scanning"
                                                ? "border-primary/60 bg-primary/5 cursor-default"
                                                : "border-dashed border-muted-foreground/40 hover:border-primary/60 hover:bg-muted/20 cursor-pointer"
                                    }`}
                                onClick={() =>
                                    !isLocked && scan.status !== "scanning" && fileInputRefs[step].current?.click()
                                }
                            >
                                {/* Thumbnail */}
                                {scan.dataURL ? (
                                    <div className="relative shrink-0">
                                        <img
                                            src={scan.dataURL}
                                            alt={step}
                                            style={{
                                                width: 64, height: 64, borderRadius: 10,
                                                objectFit: 'cover', display: 'block',
                                                border: scan.status === 'ok' ? '2.5px solid #22c55e' : scan.status === 'error' ? '2.5px solid #ef4444' : '2.5px solid transparent',
                                            }}
                                        />
                                        {/* Scanning spinner */}
                                        {scan.status === "scanning" && (
                                            <div style={{
                                                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                                                borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <div style={{
                                                    width: 24, height: 24, border: '2.5px solid white',
                                                    borderTopColor: 'transparent', borderRadius: '50%',
                                                    animation: 'spin 0.75s linear infinite'
                                                }} />
                                            </div>
                                        )}
                                        {/* Green tick overlay on success */}
                                        {scan.status === "ok" && (
                                            <div style={{
                                                position: 'absolute', inset: 0, borderRadius: 10,
                                                background: 'rgba(34,197,94,0.18)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: '50%',
                                                    background: '#22c55e',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    boxShadow: '0 0 0 3px rgba(34,197,94,0.25)',
                                                }}>
                                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                </div>
                                            </div>
                                        )}
                                        {/* Red X overlay on error */}
                                        {scan.status === "error" && (
                                            <div style={{
                                                position: 'absolute', inset: 0, borderRadius: 10,
                                                background: 'rgba(239,68,68,0.18)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: '50%',
                                                    background: '#ef4444',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    boxShadow: '0 0 0 3px rgba(239,68,68,0.25)',
                                                }}>
                                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                                                        <line x1="18" y1="6" x2="6" y2="18" />
                                                        <line x1="6" y1="6" x2="18" y2="18" />
                                                    </svg>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div
                                        className={`h-16 w-16 rounded-lg flex items-center justify-center shrink-0 ${isLocked ? "bg-muted/40" : "bg-muted"
                                            }`}
                                    >
                                        <Camera className="h-7 w-7 text-muted-foreground" />
                                    </div>
                                )}

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <p className="text-sm font-semibold">{STEP_LABELS[step]}</p>
                                        <ScanIcon s={scan} />
                                    </div>

                                    {scan.status === "idle" ? (
                                        <p className="text-xs text-muted-foreground">
                                            {isLocked
                                                ? `Complete ${STEP_LABELS[STEPS[idx - 1]]} first`
                                                : `Tap to upload — ${STEP_INSTRUCTIONS_SHORT[step]}`}
                                        </p>
                                    ) : (
                                        <p
                                            className={`text-xs leading-snug ${scan.status === "ok"
                                                ? "text-green-600"
                                                : scan.status === "error"
                                                    ? "text-red-500"
                                                    : "text-primary"
                                                }`}
                                        >
                                            {scan.status === "scanning"
                                                ? "Scanning… detecting face"
                                                : scan.message}
                                        </p>
                                    )}

                                    {scan.status === "error" && (
                                        <p className="text-xs text-muted-foreground mt-0.5 italic">
                                            Tap to upload & adjust a different photo
                                        </p>
                                    )}
                                    {scan.status === "ok" && (
                                        <p className="text-xs text-muted-foreground mt-0.5 italic">
                                            Tap to replace this photo
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Re-adjust button for error state */}
                            {scan.status === "error" && scan.dataURL && (
                                <button
                                    type="button"
                                    className="mt-1 ml-1 text-xs underline text-primary"
                                    onClick={() =>
                                        scan.dataURL && setAdjusting({ step, imageSrc: scan.dataURL })
                                    }
                                >
                                    ✏️ Re-adjust face position
                                </button>
                            )}
                        </div>
                    )
                })}

                {allOk && (
                    <div className="grid gap-2 pt-1">
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                            <p className="text-xs text-green-700 font-medium">
                                All 3 angles verified! Ready to create your account.
                            </p>
                        </div>
                        {submitError && (
                            <p className="text-sm text-red-500 text-center">{submitError}</p>
                        )}
                        <Button
                            className="w-full bg-green-600 hover:bg-green-700 text-white"
                            onClick={handleCompleteRegistration}
                            disabled={submitting}
                        >
                            {submitting ? "Registering..." : "✅ Complete Registration"}
                        </Button>
                    </div>
                )}
            </div>
        </>
    )
}

// ─── Step 1: Credentials ─────────────────────────────────────────────────────

function CredentialsStep({
    onNext,
}: {
    onNext: (data: { username: string; email: string; password: string }) => void
}) {
    const [username, setUsername] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onNext({ username, email, password })
    }

    return (
        <form onSubmit={handleSubmit}>
            <CardContent className="grid gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="username">
                        <span className="flex items-center gap-2">
                            <User className="h-4 w-4" /> Username
                        </span>
                    </Label>
                    <Input
                        id="username"
                        placeholder="johndoe"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        required
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="email">
                        <span className="flex items-center gap-2">
                            <Mail className="h-4 w-4" /> Email
                        </span>
                    </Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="john@example.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="password">
                        <span className="flex items-center gap-2">
                            <Lock className="h-4 w-4" /> Password
                        </span>
                    </Label>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            className="pr-10"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            tabIndex={-1}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                <Button className="w-full" type="submit">
                    Next: Face Registration <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            </CardFooter>
        </form>
    )
}

// ─── Step 2: Face Capture ─────────────────────────────────────────────────────

function FaceCaptureStep({
    credentials,
    onComplete,
}: {
    credentials: { username: string; email: string; password: string }
    onComplete: () => void
}) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const streamRef = useRef<MediaStream | null>(null)

    const [mode, setMode] = useState<"camera" | "gallery">("camera")
    const [currentStep, setCurrentStep] = useState<number>(0)
    const [captures, setCaptures] = useState<FaceCaptures>({ front: null, left: null, right: null })
    const [captureState, setCaptureState] = useState<CaptureState>("idle")
    const [cameraError, setCameraError] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState("")

    const stepKey = STEPS[currentStep]

    useEffect(() => {
        if (mode === "camera") startCamera()
        else stopCamera()
        return () => stopCamera()
    }, [mode])

    const startCamera = async () => {
        try {
            setCameraError("")
            // Only request new stream if we don't already have one
            let stream = streamRef.current
            if (!stream) {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
                streamRef.current = stream
            }
            if (videoRef.current) {
                videoRef.current.srcObject = stream
                videoRef.current.play().catch((e) => {
                    console.log("Play interrupted", e)
                })
            }
        } catch {
            setCameraError("Camera not accessible. Switch to 'Upload Photos' instead.")
        }
    }

    // Connect the stream to the video element whenever it re-mounts (e.g. going from "captured" back to "idle")
    useEffect(() => {
        if (mode === "camera" && captureState === "idle" && streamRef.current && videoRef.current) {
            videoRef.current.srcObject = streamRef.current
            videoRef.current.play().catch(e => console.log("Play interrupted", e))
        }
    }, [captureState, currentStep, mode])

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop())
            streamRef.current = null
        }
    }

    const switchMode = (newMode: "camera" | "gallery") => {
        setMode(newMode)
        setCaptures({ front: null, left: null, right: null })
        setCaptureState("idle")
        setCurrentStep(0)
        setError("")
    }

    const capture = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return
        const video = videoRef.current
        const canvas = canvasRef.current
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext("2d")!
        ctx.save()
        // Do not mirror the image so that left and right profiles are correct
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        ctx.restore()
        const dataURL = canvas.toDataURL("image/jpeg", 0.9)
        setCaptureState("captured")
        setCaptures(prev => ({ ...prev, [stepKey]: dataURL }))
    }, [stepKey])

    const retake = () => {
        setCaptureState("idle")
        setCaptures(prev => ({ ...prev, [stepKey]: null }))
    }

    const nextAngle = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(s => s + 1)
            setCaptureState("idle")
        }
    }

    const allCaptured = captures.front && captures.left && captures.right

    // Camera mode registration — converts dataURL to File
    const submitCamera = async () => {
        if (!captures.front || !captures.left || !captures.right) return
        setSubmitting(true)
        setError("")
        try {
            const formData = new FormData()
            formData.append("username", credentials.username)
            formData.append("email", credentials.email)
            formData.append("password", credentials.password)
            formData.append("front", dataURLtoFile(captures.front, "front.jpg"))
            formData.append("left", dataURLtoFile(captures.left, "left.jpg"))
            formData.append("right", dataURLtoFile(captures.right, "right.jpg"))
            const response = await axios.post(`${API_BASE}/auth/register`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            })
            localStorage.setItem("token", response.data.access_token)
            stopCamera()
            onComplete()
        } catch (err: any) {
            setError(err.response?.data?.detail || "Registration failed. Ensure your face is clearly visible.")
            setSubmitting(false)
        }
    }

    // Gallery mode registration — sends pre-verified ArcFace embeddings (no re-running DeepFace)
    const submitGallery = async (embeddings: { front_embedding: number[]; left_embedding: number[]; right_embedding: number[]; lower_embedding: number[] | null; front_image_base64?: string; left_image_base64?: string; right_image_base64?: string }) => {
        setSubmitting(true)
        setError("")
        try {
            const response = await axios.post(`${API_BASE}/auth/register-with-embeddings`, {
                username: credentials.username,
                email: credentials.email,
                password: credentials.password,
                front_embedding: embeddings.front_embedding,
                left_embedding: embeddings.left_embedding,
                right_embedding: embeddings.right_embedding,
                lower_embedding: embeddings.lower_embedding,
                front_image_base64: embeddings.front_image_base64,
                left_image_base64: embeddings.left_image_base64,
                right_image_base64: embeddings.right_image_base64,
            })
            localStorage.setItem("token", response.data.access_token)
            onComplete()
        } catch (err: any) {
            setError(err.response?.data?.detail || "Registration failed. Please try again.")
            setSubmitting(false)
        }
    }

    return (
        <CardContent className="grid gap-4">
            {/* Mode toggle */}
            <div className="flex rounded-lg border p-1 gap-1 bg-muted">
                <button
                    type="button"
                    onClick={() => switchMode("camera")}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-all ${mode === "camera"
                        ? "bg-background shadow text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                        }`}
                >
                    <Camera className="h-4 w-4" /> Live Camera
                </button>
                <button
                    type="button"
                    onClick={() => switchMode("gallery")}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-all ${mode === "gallery"
                        ? "bg-background shadow text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                        }`}
                >
                    <ImagePlus className="h-4 w-4" /> Upload Photos
                </button>
            </div>

            {mode === "gallery" ? (
                <GalleryUploadMode
                    onRegister={submitGallery}
                    submitting={submitting}
                    submitError={error}
                />
            ) : (
                <>
                    {/* Step progress */}
                    <div className="flex gap-2 justify-center">
                        {STEPS.map((step, i) => (
                            <div key={step} className="flex flex-col items-center gap-1">
                                <div
                                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${captures[step]
                                        ? "bg-green-500 text-white"
                                        : i === currentStep
                                            ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                                            : "bg-muted text-muted-foreground"
                                        }`}
                                >
                                    {captures[step] ? <CheckCircle className="h-4 w-4" /> : i + 1}
                                </div>
                                <span className="text-xs text-muted-foreground">{STEP_LABELS[step]}</span>
                            </div>
                        ))}
                    </div>

                    {/* Instruction */}
                    <div className="text-center">
                        <p className="font-semibold text-sm">{STEP_LABELS[stepKey]}</p>
                        <p className="text-xs text-muted-foreground mt-1">{STEP_INSTRUCTIONS_SHORT[stepKey]}</p>
                    </div>

                    {/* Camera feed */}
                    <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                        {cameraError ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-sm text-red-400 p-4 text-center gap-2">
                                <span>{cameraError}</span>
                                <button
                                    type="button"
                                    onClick={() => switchMode("gallery")}
                                    className="underline text-primary text-xs"
                                >
                                    Switch to gallery upload →
                                </button>
                            </div>
                        ) : captureState === "captured" && captures[stepKey] ? (
                            <img
                                src={captures[stepKey]!}
                                alt="Captured"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <video
                                ref={videoRef}
                                className="w-full h-full object-cover"
                                style={{ transform: "scaleX(-1)" }}
                                autoPlay
                                playsInline
                                muted
                            />
                        )}
                        {captureState !== "captured" && !cameraError && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="border-2 border-white/60 rounded-full w-40 h-52 opacity-60" />
                            </div>
                        )}
                    </div>
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Buttons */}
                    <div className="flex gap-2">
                        {captureState !== "captured" ? (
                            <Button className="flex-1" onClick={capture} disabled={!!cameraError}>
                                <Camera className="mr-2 h-4 w-4" /> Capture
                            </Button>
                        ) : (
                            <>
                                <Button variant="outline" className="flex-1" onClick={retake}>
                                    <RotateCcw className="mr-2 h-4 w-4" /> Retake
                                </Button>
                                {currentStep < STEPS.length - 1 && (
                                    <Button className="flex-1" onClick={nextAngle}>
                                        Next Angle <ChevronRight className="ml-2 h-4 w-4" />
                                    </Button>
                                )}
                            </>
                        )}
                    </div>

                    {allCaptured && (
                        <div className="grid gap-2">
                            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                            <Button
                                className="w-full bg-green-600 hover:bg-green-700 text-white"
                                onClick={submitCamera}
                                disabled={submitting}
                            >
                                {submitting ? "Registering..." : "✅ Complete Registration"}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </CardContent>
    )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function RegisterPage() {
    const [step, setStep] = useState<1 | 2>(1)
    const [credentials, setCredentials] = useState<{
        username: string
        email: string
        password: string
    } | null>(null)
    const router = useRouter()

    const handleCredentialsNext = (data: { username: string; email: string; password: string }) => {
        setCredentials(data)
        setStep(2)
    }

    const handleComplete = () => {
        router.push("/feed")
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '72px 16px 16px' }}>
            <div style={{
                width: '100%', maxWidth: '460px',
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(20px)',
                borderRadius: '24px',
                overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(14,165,233,0.15), 0 4px 20px rgba(0,0,0,0.06)',
                border: '1px solid rgba(186,230,253,0.6)',
            }}>
                {/* Gradient Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 60%, #7dd3fc 100%)',
                    padding: '28px 32px 22px',
                }}>
                    {/* Progress bar */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <div style={{ flex: 1, height: '4px', borderRadius: '99px', background: 'rgba(255,255,255,0.9)' }} />
                        <div style={{ flex: 1, height: '4px', borderRadius: '99px', background: step >= 2 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)' }} />
                    </div>
                    <h1 style={{ color: 'white', fontWeight: 800, fontSize: '1.5rem', margin: 0 }}>
                        {step === 1 ? "Create Account" : "Face Registration"}
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem', margin: '4px 0 0' }}>
                        {step === 1 ? "Step 1 of 2 — Enter your details" : "Step 2 of 2 — Register your face"}
                    </p>
                </div>

                {/* Card body */}
                <Card className="rounded-none border-0 shadow-none bg-transparent">
                    {step === 1 && <CredentialsStep onNext={handleCredentialsNext} />}
                    {step === 2 && credentials && (
                        <FaceCaptureStep credentials={credentials} onComplete={handleComplete} />
                    )}

                    {step === 1 && (
                        <div className="text-center text-sm p-4 pt-0">
                            Already have an account?{" "}
                            <Link href="/login" className="underline text-primary font-semibold">
                                Sign in
                            </Link>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    )
}
