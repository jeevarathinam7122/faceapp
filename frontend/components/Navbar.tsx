"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { PlusSquare, Home, LogOut, Bell, ScanFace, User } from "lucide-react"
import axios from "axios"
import { API_BASE } from "@/lib/api"

export function Navbar() {
    const pathname = usePathname()
    const [token, setToken] = useState<string | null>(null)
    const [hasUnread, setHasUnread] = useState(false)

    useEffect(() => {
        if (typeof window !== "undefined") {
            const currentToken = localStorage.getItem("token")
            setToken(currentToken)

            if (currentToken && pathname !== "/notifications") {
                checkNotifications(currentToken)
            } else if (pathname === "/notifications") {
                // On the notifications page: clear dot immediately
                setHasUnread(false)
            }
        }
    }, [pathname])

    // Poll every 30 seconds to catch new notifications while the user is browsing
    useEffect(() => {
        if (!token || pathname === "/notifications") return
        const interval = setInterval(() => checkNotifications(token), 30000)
        return () => clearInterval(interval)
    }, [token, pathname])

    const checkNotifications = async (currentToken: string) => {
        try {
            // Fetch both inbox (pending) and sent (to detect status changes)
            const [inboxRes, sentRes] = await Promise.all([
                axios.get(`${API_BASE}/users/permissions/pending`, {
                    headers: { Authorization: `Bearer ${currentToken}` }
                }),
                axios.get(`${API_BASE}/users/permissions/sent`, {
                    headers: { Authorization: `Bearer ${currentToken}` }
                }),
            ])

            // IDs the user has already seen (stored as JSON array of strings)
            const seenRaw = localStorage.getItem("seenNotifIds")
            const seenIds: string[] = seenRaw ? JSON.parse(seenRaw) : []
            const seenSet = new Set(seenIds)

            // Any pending inbox request not yet seen? → dot
            const hasNewInbox = inboxRes.data.some((r: any) => !seenSet.has(String(r.id)))

            // Any sent request that has been decided (not PENDING) and not yet seen? → dot
            const hasNewSentDecision = sentRes.data.some(
                (r: any) => r.status !== "PENDING" && !seenSet.has(`sent_${r.id}`)
            )

            setHasUnread(hasNewInbox || hasNewSentDecision)
        } catch (err: any) {
            if (err.response?.status !== 401) {
                console.error("Failed to fetch notifications for navbar", err)
            }
        }
    }

    const handleLogout = () => {
        localStorage.removeItem("token")
        window.location.href = "/login"
    }

    if (pathname === "/login" || pathname === "/register" || pathname === "/") return null

    return (
        <nav
            className="fixed top-0 left-0 right-0 z-50 shadow-lg"
            style={{
                height: '64px',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 60%, #7dd3fc 100%)',
            }}
        >
            <div className="h-full mx-auto px-6 flex items-center justify-between" style={{ maxWidth: '1280px' }}>
                {/* Brand */}
                <Link href="/feed" className="flex items-center gap-2">
                    <span style={{
                        color: 'white',
                        fontWeight: 800,
                        fontSize: '1.25rem',
                        letterSpacing: '0.05em',
                        textShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }}>
                        FaceSocial
                    </span>
                </Link>

                {/* Nav icons */}
                <nav className="flex items-center gap-5">
                    {[
                        { href: "/feed", icon: <Home className="h-6 w-6" />, label: "Home" },
                        { href: "/upload", icon: <PlusSquare className="h-6 w-6" />, label: "Upload" },
                        { href: "/enhance-profile", icon: <ScanFace className="h-6 w-6" />, label: "Enhance Face" },
                        { href: "/notifications", icon: <Bell className="h-6 w-6" />, label: "Notifications" },
                        { href: "/profile", icon: <User className="h-6 w-6" />, label: "Profile" },
                    ].map(({ href, icon, label }) => (
                        <Link
                            key={href}
                            href={href}
                            aria-label={label}
                            onClick={() => {
                                if (href === "/notifications") {
                                    setHasUnread(false)
                                }
                            }}
                            style={{
                                color: pathname === href ? 'white' : 'rgba(255,255,255,0.65)',
                                transform: pathname === href ? 'scale(1.15)' : 'scale(1)',
                                display: 'inline-flex',
                                transition: 'all 0.15s ease',
                                position: 'relative',
                            }}
                            className="hover:opacity-100"
                        >
                            {icon}
                            {href === "/notifications" && hasUnread && (
                                <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-sky-400" />
                            )}
                            <span className="sr-only">{label}</span>
                        </Link>
                    ))}

                    <button
                        onClick={handleLogout}
                        aria-label="Logout"
                        style={{
                            color: 'rgba(255,255,255,0.65)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'inline-flex',
                            transition: 'color 0.15s ease',
                        }}
                        onMouseOver={e => (e.currentTarget.style.color = 'white')}
                        onMouseOut={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')}
                    >
                        <LogOut className="h-6 w-6" />
                        <span className="sr-only">Logout</span>
                    </button>
                </nav>
            </div>
        </nav>
    )
}
