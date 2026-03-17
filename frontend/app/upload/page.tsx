"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { API_BASE } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ImagePlus, UploadCloud, X, CheckCircle2, AlertCircle } from "lucide-react"

type UploadStatus = "idle" | "uploading" | "success" | "pending_permission" | "error"

export default function UploadPage() {
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [status, setStatus] = useState<UploadStatus>("idle")
    const [message, setMessage] = useState("")
    const [dragOver, setDragOver] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const router = useRouter()

    const selectFile = (f: File) => {
        if (!f.type.startsWith("image/")) {
            setMessage("Please select an image file.")
            return
        }
        setFile(f)
        setPreview(URL.createObjectURL(f))
        setStatus("idle")
        setMessage("")
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) selectFile(f)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) selectFile(f)
    }

    const clearFile = () => {
        setFile(null)
        setPreview(null)
        setStatus("idle")
        setMessage("")
        if (inputRef.current) inputRef.current.value = ""
    }

    const handleUpload = async () => {
        if (!file) return
        setStatus("uploading")
        setMessage("")

        const formData = new FormData()
        formData.append("file", file)

        try {
            const token = localStorage.getItem("token")
            if (!token) {
                router.push("/login")
                return
            }
            const response = await axios.post(`${API_BASE}/posts/upload`, formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    Authorization: `Bearer ${token}`,
                },
            })
            const post = response.data
            if (post.is_active) {
                setStatus("success")
                setMessage("Post published successfully!")
                setTimeout(() => router.push("/feed"), 1500)
            } else {
                setStatus("pending_permission")
                setMessage("A face was detected in your photo. Waiting for permission from the person before publishing.")
            }
        } catch (err: any) {
            // Check for 401 first to avoid logging expected auth errors
            if (err.response?.status === 401) {
                // Silent handle
                alert("Session expired. Please login again.")
                localStorage.removeItem("token")
                router.push("/login")
                return
            }
            console.error("Upload Error:", err)
            setStatus("error")
            setMessage(err.response?.data?.detail || "Upload failed. Please try again.")
        }
    }

    return (
        <div className="container max-w-lg mx-auto py-10">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ImagePlus className="h-5 w-5 text-primary" />
                        Create New Post
                    </CardTitle>
                    <CardDescription>
                        Share a photo. If it contains someone else's face, they'll be asked for permission first.
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* Drop zone */}
                    {!preview ? (
                        <div
                            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${dragOver
                                ? "border-primary bg-primary/5"
                                : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/30"
                                }`}
                            onClick={() => inputRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                        >
                            <UploadCloud className={`h-12 w-12 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
                            <div className="text-center">
                                <p className="font-medium text-sm">Drag & drop a photo here</p>
                                <p className="text-xs text-muted-foreground mt-1">or click to browse files</p>
                                <p className="text-xs text-muted-foreground">Supports: JPG, PNG, WEBP</p>
                            </div>
                        </div>
                    ) : (
                        /* Image preview */
                        <div className="relative rounded-xl overflow-hidden bg-muted aspect-square">
                            <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                            {status === "idle" && (
                                <button
                                    onClick={clearFile}
                                    className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition-colors"
                                    title="Remove photo"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                            {/* Overlay while uploading */}
                            {status === "uploading" && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <div className="text-white text-center">
                                        <div className="animate-spin rounded-full h-10 w-10 border-4 border-white border-t-transparent mx-auto mb-2" />
                                        <p className="text-sm font-medium">Uploading & scanning faces...</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Hidden file input */}
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                    />

                    {/* Status messages */}
                    {message && (
                        <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${status === "success"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : status === "pending_permission"
                                ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}>
                            {status === "success" && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
                            {status === "pending_permission" && <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                            {status === "error" && <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                            <span>{message}</span>
                        </div>
                    )}

                    {/* Upload button */}
                    {file && status !== "success" && status !== "pending_permission" && (
                        <Button
                            className="w-full"
                            onClick={handleUpload}
                            disabled={status === "uploading"}
                        >
                            {status === "uploading" ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <UploadCloud className="mr-2 h-4 w-4" />
                                    Post Photo
                                </>
                            )}
                        </Button>
                    )}

                    {/* After pending: buttons */}
                    {status === "pending_permission" && (
                        <div className="flex gap-2">
                            <Button variant="outline" className="flex-1" onClick={clearFile}>
                                Upload Another
                            </Button>
                            <Button className="flex-1" onClick={() => router.push("/feed")}>
                                Go to Feed
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
