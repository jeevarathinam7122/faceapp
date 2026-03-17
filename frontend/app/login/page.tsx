"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import axios from "axios"
import { API_BASE } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, User, Lock, Scan } from "lucide-react"

export default function LoginPage() {
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        setLoading(true)
        try {
            const response = await axios.post(`${API_BASE}/auth/token`, {
                username,
                password,
                email: "placeholder@example.com",
            })
            localStorage.setItem("token", response.data.access_token)
            router.push("/feed")
        } catch {
            setError("Invalid username or password")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            {/* Decorative blobs */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30"
                    style={{ background: 'radial-gradient(circle, #38bdf8 0%, transparent 70%)' }} />
                <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-20"
                    style={{ background: 'radial-gradient(circle, #0ea5e9 0%, transparent 70%)' }} />
            </div>

            <div className="relative w-full max-w-md">
                {/* Card */}
                <div className="rounded-3xl overflow-hidden shadow-2xl"
                    style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(186,230,253,0.6)' }}>

                    {/* Gradient Header */}
                    <div className="px-8 pt-10 pb-8 text-center"
                        style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 60%, #7dd3fc 100%)' }}>
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                            style={{ background: 'rgba(255,255,255,0.2)' }}>
                            <Scan className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-3xl font-extrabold text-white tracking-tight">FaceSocial</h1>
                        <p className="text-sky-100 mt-1 text-sm">Sign in to your account</p>
                    </div>

                    {/* Form */}
                    <div className="px-8 py-8">
                        <form onSubmit={handleLogin} className="space-y-5">
                            {/* Username */}
                            <div className="space-y-1.5">
                                <Label htmlFor="username" className="text-sm font-semibold text-slate-700">Username</Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-400" />
                                    <Input
                                        id="username"
                                        type="text"
                                        placeholder="johndoe"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                        className="pl-10 h-11 rounded-xl border-sky-200 bg-sky-50/50 focus:bg-white transition-colors"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div className="space-y-1.5">
                                <Label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-400" />
                                    <Input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className="pl-10 pr-10 h-11 rounded-xl border-sky-200 bg-sky-50/50 focus:bg-white transition-colors"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-sky-400 hover:text-sky-600 transition-colors"
                                        tabIndex={-1}
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                                    <p className="text-sm text-red-600">{error}</p>
                                </div>
                            )}

                            {/* Submit */}
                            <Button
                                className="w-full h-11 rounded-xl font-semibold text-base text-white transition-all hover:opacity-90 hover:shadow-lg active:scale-95"
                                style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', boxShadow: '0 4px 15px rgba(14,165,233,0.4)' }}
                                type="submit"
                                disabled={loading}
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Signing in…
                                    </span>
                                ) : "Sign In"}
                            </Button>
                        </form>

                        {/* Footer link */}
                        <p className="text-center text-sm text-slate-500 mt-6">
                            Don&apos;t have an account?{" "}
                            <Link href="/register" className="font-semibold text-sky-500 hover:text-sky-700 transition-colors">
                                Create account
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Bottom decorative text */}
                <p className="text-center text-xs text-sky-400/70 mt-6">
                    Protected by face recognition technology
                </p>
            </div>
        </div>
    )
}
