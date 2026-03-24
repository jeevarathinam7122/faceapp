"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { API_BASE } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface PermissionRequest {
    id: number
    post_id: number
    tagged_user_id: number
    status: string
    face_box?: number[]
    created_at?: string
    post: {
        id: number
        image_url: string
        uploader: {
            username: string
        }
    }
    tagged_user?: {
        username: string
    }
}

function NotificationImage({ src, alt, faceBox, label }: { src: string, alt: string, faceBox?: number[], label?: string }) {
    return (
        <div className="relative rounded-md overflow-hidden border bg-black/5 flex items-center justify-center min-h-[16rem]">
            <img
                src={src}
                alt={alt}
                className="max-w-full max-h-96 object-contain block mx-auto"
            />
        </div>
    )
}

export default function NotificationsPage() {
    const [inboxRequests, setInboxRequests] = useState<PermissionRequest[]>([])
    const [sentRequests, setSentRequests] = useState<PermissionRequest[]>([])
    const [activeTab, setActiveTab] = useState<"inbox" | "sent">("inbox")

    const router = useRouter()

    useEffect(() => {
        fetchInbox()
        fetchSent()
    }, [])

    const fetchInbox = async () => {
        try {
            const token = localStorage.getItem("token")
            if (!token) {
                router.push("/login")
                return
            }
            const response = await axios.get(`${API_BASE}/users/permissions/pending`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setInboxRequests(response.data)
            markAsSeen(response.data.map((r: PermissionRequest) => String(r.id)), [])
        } catch (err: any) {
            if (err.response?.status === 401) {
                router.push("/login")
            } else {
                console.error("fetchInbox error:", err)
            }
        }
    }

    const fetchSent = async () => {
        try {
            const token = localStorage.getItem("token")
            if (!token) return
            const response = await axios.get(`${API_BASE}/users/permissions/sent`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setSentRequests(response.data)
            // Mark all decided sent requests as seen
            const decidedSentKeys = (response.data as PermissionRequest[])
                .filter(r => r.status !== "PENDING")
                .map(r => `sent_${r.id}`)
            markAsSeen([], decidedSentKeys)
        } catch (err: any) {
            if (err.response?.status === 401) {
                router.push("/login")
            } else {
                console.error("fetchSent error:", err)
            }
        }
    }

    // Persist seen IDs into localStorage so Navbar clears the dot
    const markAsSeen = (inboxIds: string[], sentKeys: string[]) => {
        const username = localStorage.getItem("username") || "unknown"
        const existing: string[] = JSON.parse(localStorage.getItem(`seenNotifIds_${username}`) || "[]")
        const merged = Array.from(new Set([...existing, ...inboxIds, ...sentKeys]))
        localStorage.setItem(`seenNotifIds_${username}`, JSON.stringify(merged))
    }

    const handleAction = async (id: number, action: "approve" | "deny") => {
        try {
            const token = localStorage.getItem("token")
            if (!token) return
            await axios.post(`${API_BASE}/users/permissions/${id}/${action}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setInboxRequests(inboxRequests.filter(r => r.id !== id))
            // Mark this inbox item as seen so the dot doesn't re-appear for it
            markAsSeen([String(id)], [])
        } catch (err: any) {
            console.error("handleAction error:", err)
        }
    }

    const formatDate = (dateString?: string) => {
        if (!dateString) return ""
        const date = new Date(dateString + 'Z') // backend sends UTC
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    return (
        <div className="container max-w-2xl mx-auto py-8 space-y-6">
            <h1 className="text-2xl font-bold">Notifications</h1>

            {/* Tabs */}
            <div className="flex gap-2 border-b pb-2">
                <Button
                    variant={activeTab === "inbox" ? "default" : "ghost"}
                    onClick={() => setActiveTab("inbox")}
                >
                    Inbox ({inboxRequests.length})
                </Button>
                <Button
                    variant={activeTab === "sent" ? "default" : "ghost"}
                    onClick={() => setActiveTab("sent")}
                >
                    Sent ({sentRequests.length})
                </Button>
            </div>

            {/* Inbox Content */}
            {activeTab === "inbox" && (
                <div className="space-y-4">
                    <p className="text-muted-foreground text-sm">Requests to post photos of you.</p>
                    {inboxRequests.map(req => (
                        <Card key={req.id} className="glass">
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <CardTitle className="text-base">
                                        Request from <span className="font-bold">{req.post.uploader.username}</span>
                                    </CardTitle>
                                    {req.created_at && (
                                        <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                                            {formatDate(req.created_at)}
                                        </span>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <NotificationImage
                                    src={`${API_BASE}/${req.post.image_url}`}
                                    alt="Request"
                                    faceBox={req.face_box}
                                    label="You"
                                />
                                <p className="text-sm">
                                    <span className="font-semibold">{req.post.uploader.username}</span> wants to tag you.
                                </p>
                            </CardContent>
                            <CardFooter className="gap-2">
                                <Button onClick={() => handleAction(req.id, "approve")} className="flex-1 bg-green-600 hover:bg-green-700">Approve</Button>
                                <Button onClick={() => handleAction(req.id, "deny")} variant="destructive" className="flex-1">Deny</Button>
                            </CardFooter>
                        </Card>
                    ))}
                    {inboxRequests.length === 0 && <p className="text-center text-muted-foreground py-8">No pending requests.</p>}
                </div>
            )}

            {/* Sent Content */}
            {activeTab === "sent" && (
                <div className="space-y-4">
                    <p className="text-muted-foreground text-sm">Requests you sent to others.</p>
                    {sentRequests.map(req => {
                        const targetUser = req.tagged_user?.username || "Unknown"
                        return (
                            <Card key={req.id} className="glass">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <div className="flex flex-col">
                                        <CardTitle className="text-base font-medium">
                                            To: <span className="font-bold">{targetUser}</span>
                                        </CardTitle>
                                        {req.created_at && (
                                            <span className="text-xs text-muted-foreground mt-1">
                                                {formatDate(req.created_at)}
                                            </span>
                                        )}
                                    </div>
                                    <div className={`px-2 py-1 rounded-full text-xs font-bold uppercase
                                        ${req.status === "APPROVED" ? "bg-green-100 text-green-700 border border-green-200" :
                                            req.status === "REJECTED" ? "bg-red-100 text-red-700 border border-red-200" :
                                                "bg-yellow-100 text-yellow-700 border border-yellow-200"}`}>
                                        {req.status}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <NotificationImage
                                        src={`${API_BASE}/${req.post.image_url}`}
                                        alt="Sent Request"
                                        faceBox={req.face_box}
                                        label={targetUser}
                                    />
                                    <p className="text-sm">
                                        {req.status === "PENDING" && (
                                            <>Waiting for approval from <span className="font-bold">{targetUser}</span>.</>
                                        )}
                                        {req.status === "APPROVED" && (
                                            <><span className="font-bold">{targetUser}</span> approved your request. Post is live!</>
                                        )}
                                        {req.status === "REJECTED" && (
                                            <><span className="font-bold">{targetUser}</span> denied your request. Post is hidden.</>
                                        )}
                                    </p>
                                </CardContent>
                            </Card>
                        )
                    })}
                    {sentRequests.length === 0 && <p className="text-center text-muted-foreground py-8">No sent requests.</p>}
                </div>
            )}
        </div>
    )
}
