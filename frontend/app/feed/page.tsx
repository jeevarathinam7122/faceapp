"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import axios from "axios"
import { API_BASE } from "@/lib/api"
import { Trash2, ImageOff, LayoutGrid, Heart, MessageCircle, Send, X } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Post {
    id: number
    image_url: string
    uploader_id: number
    is_active: boolean
    uploader: { username: string; email: string }
}

interface Comment {
    id: number
    text: string
    username: string
    created_at: string
}

interface FlyingHeart {
    id: number
    x: number
    y: number
    size: number   // font-size in px
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function UserAvatar({ name }: { name: string }) {
    return (
        <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 700, fontSize: '1rem',
            boxShadow: '0 2px 8px rgba(14,165,233,0.35)', flexShrink: 0,
        }}>
            {name[0].toUpperCase()}
        </div>
    )
}

// ─── Flying Heart Animation ───────────────────────────────────────────────────

function FlyingHearts({ hearts }: { hearts: FlyingHeart[] }) {
    return (
        <>
            {hearts.map(h => (
                <div
                    key={h.id}
                    style={{
                        position: 'absolute',
                        left: h.x,
                        top: h.y,
                        pointerEvents: 'none',
                        animation: 'heartFly 1.1s ease-out forwards',
                        fontSize: `${h.size}px`,
                        zIndex: 20,
                        lineHeight: 1,
                    }}
                >
                    ❤️
                </div>
            ))}
        </>
    )
}

// ─── Comment Section ──────────────────────────────────────────────────────────

function CommentSection({ postId, token, currentUsername }: {
    postId: number
    token: string | null
    currentUsername: string | null
}) {
    const [comments, setComments] = useState<Comment[]>([])
    const [text, setText] = useState("")
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        setLoading(true)
        axios.get(`${API_BASE}/posts/${postId}/comments`)
            .then(r => setComments(r.data))
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [postId])

    const submit = async () => {
        if (!text.trim() || !token) return
        setSubmitting(true)
        try {
            const r = await axios.post(
                `${API_BASE}/posts/${postId}/comments`,
                { text },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            setComments(prev => [...prev, r.data])
            setText("")
        } catch { }
        finally { setSubmitting(false) }
    }

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
    }

    return (
        <div style={{ borderTop: '1px solid rgba(14,165,233,0.1)', padding: '12px 20px 16px' }}>
            {/* Comment list */}
            {loading ? (
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 10px' }}>Loading…</p>
            ) : (
                <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {comments.length === 0 && (
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>No comments yet. Be the first!</p>
                    )}
                    {comments.map(c => (
                        <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: '50%',
                                background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontWeight: 700, fontSize: '0.72rem', flexShrink: 0,
                            }}>
                                {c.username[0].toUpperCase()}
                            </div>
                            <div style={{
                                background: 'rgba(14,165,233,0.07)', borderRadius: '12px',
                                padding: '6px 12px', flex: 1,
                                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4,
                            }}>
                                <div>
                                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f2942' }}>{c.username} </span>
                                    <span style={{ fontSize: '0.82rem', color: '#334155' }}>{c.text}</span>
                                </div>
                                {/* Delete button — only for comment author */}
                                {currentUsername === c.username && (
                                    <button
                                        onClick={async () => {
                                            try {
                                                await axios.delete(
                                                    `${API_BASE}/posts/${postId}/comments/${c.id}`,
                                                    { headers: { Authorization: `Bearer ${token}` } }
                                                )
                                                setComments(prev => prev.filter(x => x.id !== c.id))
                                            } catch { alert('Could not delete comment') }
                                        }}
                                        title="Delete comment"
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            padding: '2px 4px', color: '#cbd5e1', flexShrink: 0,
                                            display: 'flex', alignItems: 'center',
                                            transition: 'color 0.15s',
                                        }}
                                        onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                                        onMouseOut={e => (e.currentTarget.style.color = '#cbd5e1')}
                                    >
                                        <Trash2 style={{ width: 13, height: 13 }} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Comment input */}
            {token && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="Add a comment…"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={handleKey}
                        style={{
                            flex: 1, border: '1.5px solid rgba(14,165,233,0.25)',
                            borderRadius: '20px', padding: '8px 14px',
                            fontSize: '0.85rem', outline: 'none',
                            background: 'rgba(240,249,255,0.8)',
                            color: '#0f2942',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={e => e.currentTarget.style.borderColor = '#0ea5e9'}
                        onBlur={e => e.currentTarget.style.borderColor = 'rgba(14,165,233,0.25)'}
                    />
                    <button
                        onClick={submit}
                        disabled={submitting || !text.trim()}
                        style={{
                            width: 36, height: 36, borderRadius: '50%', border: 'none',
                            background: text.trim() ? 'linear-gradient(135deg,#0ea5e9,#38bdf8)' : '#e2e8f0',
                            color: text.trim() ? 'white' : '#94a3b8',
                            cursor: text.trim() ? 'pointer' : 'default',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, transition: 'all 0.2s',
                        }}
                    >
                        <Send style={{ width: 15, height: 15 }} />
                    </button>
                </div>
            )}
        </div>
    )
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
    post,
    currentUsername,
    token,
    onDelete,
}: {
    post: Post
    currentUsername: string | null
    token: string | null
    onDelete: (id: number) => void
}) {
    const [liked, setLiked] = useState(false)
    const [likeCount, setLikeCount] = useState(0)
    const [commentCount, setCommentCount] = useState(0)
    const [showComments, setShowComments] = useState(false)
    const [hearts, setHearts] = useState<FlyingHeart[]>([])
    const [liking, setLiking] = useState(false)
    const cardRef = useRef<HTMLDivElement>(null)
    const heartIdRef = useRef(0)

    // Load initial like state
    useEffect(() => {
        if (!token) return
        axios.get(`${API_BASE}/posts/${post.id}/likes`, {
            headers: { Authorization: `Bearer ${token}` }
        }).then(r => {
            setLiked(r.data.liked)
            setLikeCount(r.data.like_count)
        }).catch(() => { })

        axios.get(`${API_BASE}/posts/${post.id}/comments`)
            .then(r => setCommentCount(r.data.length))
            .catch(() => { })
    }, [post.id, token])

    const spawnHearts = useCallback((e: React.MouseEvent) => {
        const rect = cardRef.current?.getBoundingClientRect()
        if (!rect) return
        const baseX = e.clientX - rect.left
        const baseY = e.clientY - rect.top
        // Exactly 2 hearts: one small, one bigger
        const newHearts: FlyingHeart[] = [
            { id: heartIdRef.current++, x: baseX - 14, y: baseY - 10, size: 18 },
            { id: heartIdRef.current++, x: baseX + 10, y: baseY - 4, size: 30 },
        ]
        setHearts(prev => [...prev, ...newHearts])
        setTimeout(() => setHearts(prev => prev.filter(h => !newHearts.find(n => n.id === h.id))), 1200)
    }, [])

    const handleLike = async (e: React.MouseEvent) => {
        if (!token || liking) return
        setLiking(true)

        // Optimistic update
        const wasLiked = liked
        setLiked(!wasLiked)
        setLikeCount(c => wasLiked ? c - 1 : c + 1)

        if (!wasLiked) spawnHearts(e)

        try {
            const r = await axios.post(
                `${API_BASE}/posts/${post.id}/like`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            )
            setLiked(r.data.liked)
            setLikeCount(r.data.like_count)
        } catch {
            // Revert on error
            setLiked(wasLiked)
            setLikeCount(c => wasLiked ? c + 1 : c - 1)
        } finally {
            setLiking(false)
        }
    }

    return (
        <div
            ref={cardRef}
            style={{
                position: 'relative',
                background: 'rgba(255,255,255,0.88)',
                backdropFilter: 'blur(16px)',
                borderRadius: '20px',
                overflow: 'hidden',
                border: '1px solid rgba(186,230,253,0.5)',
                boxShadow: '0 4px 24px rgba(14,165,233,0.1), 0 1px 6px rgba(0,0,0,0.04)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseOver={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                    ; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(14,165,233,0.18)'
            }}
            onMouseOut={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                    ; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(14,165,233,0.1)'
            }}
        >
            {/* Flying hearts layer */}
            <FlyingHearts hearts={hearts} />

            {/* Header */}
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <UserAvatar name={post.uploader.username} />
                    <div>
                        <p style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f2942', margin: 0 }}>
                            {post.uploader.username}
                        </p>
                        <p style={{ fontSize: '0.73rem', color: '#94a3b8', margin: 0 }}>FaceSocial</p>
                    </div>
                </div>
                {currentUsername && post.uploader.username === currentUsername && (
                    <button
                        onClick={() => onDelete(post.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '6px 12px', borderRadius: '10px',
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
                            color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                            transition: 'all 0.15s ease',
                        }}
                        onMouseOver={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.16)')}
                        onMouseOut={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                    >
                        <Trash2 style={{ width: 13, height: 13 }} />
                        Delete
                    </button>
                )}
            </div>

            {/* Image — double-click to like */}
            <div style={{ position: 'relative', background: 'rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'center' }}>
                <img
                    src={`${API_BASE}/${post.image_url.replace(/\\/g, "/")}`}
                    alt="Post"
                    style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '700px', objectFit: 'contain' }}
                    onDoubleClick={handleLike}
                    title="Double-click to like ❤️"
                />
            </div>

            {/* Actions bar */}
            <div style={{
                padding: '12px 20px 8px',
                display: 'flex', alignItems: 'center', gap: '16px',
            }}>
                {/* Like button */}
                <button
                    onClick={handleLike}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'none', border: 'none', cursor: token ? 'pointer' : 'default',
                        padding: '4px 0', color: liked ? '#ef4444' : '#64748b',
                        transition: 'all 0.15s ease',
                    }}
                >
                    <Heart
                        style={{
                            width: 24, height: 24,
                            fill: liked ? '#ef4444' : 'none',
                            stroke: liked ? '#ef4444' : '#64748b',
                            transition: 'all 0.2s ease',
                            transform: liked ? 'scale(1.2)' : 'scale(1)',
                        }}
                    />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{likeCount}</span>
                </button>

                {/* Comment button */}
                <button
                    onClick={() => setShowComments(s => !s)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '4px 0', color: showComments ? '#0ea5e9' : '#64748b',
                        transition: 'color 0.15s',
                    }}
                >
                    <MessageCircle style={{
                        width: 23, height: 23,
                        fill: showComments ? 'rgba(14,165,233,0.15)' : 'none',
                        stroke: showComments ? '#0ea5e9' : '#64748b',
                        transition: 'all 0.2s',
                    }} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{commentCount}</span>
                </button>
            </div>

            {/* Comments section (expandable) */}
            {showComments && (
                <CommentSection
                    postId={post.id}
                    token={token}
                    currentUsername={currentUsername}
                />
            )}
        </div>
    )
}

// ─── Feed Page ────────────────────────────────────────────────────────────────

export default function FeedPage() {
    const [posts, setPosts] = useState<Post[]>([])
    const [currentUsername, setCurrentUsername] = useState<string | null>(null)
    const [token, setToken] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const t = localStorage.getItem("token")
        setToken(t)
        if (t) {
            try {
                const payload = JSON.parse(atob(t.split('.')[1]))
                setCurrentUsername(payload.sub)
            } catch { }
        }
        fetchPosts()
    }, [])

    const fetchPosts = async () => {
        setLoading(true)
        try {
            const t = localStorage.getItem("token")
            const r = await axios.get(`${API_BASE}/posts/`, {
                headers: { Authorization: `Bearer ${t}` }
            })
            setPosts(r.data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (postId: number) => {
        if (!confirm("Delete this post?")) return
        try {
            const t = localStorage.getItem("token")
            await axios.delete(`${API_BASE}/posts/${postId}`, {
                headers: { Authorization: `Bearer ${t}` }
            })
            setPosts(posts.filter(p => p.id !== postId))
        } catch {
            alert("Failed to delete post")
        }
    }

    return (
        <>
            {/* Keyframe animation injected once */}
            <style>{`
                @keyframes heartFly {
                    0%   { transform: translateY(0) scale(1);   opacity: 1; }
                    60%  { transform: translateY(-80px) scale(1.4); opacity: 0.9; }
                    100% { transform: translateY(-130px) scale(0.6); opacity: 0; }
                }
            `}</style>

            <div style={{ paddingTop: '80px', minHeight: '100vh', maxWidth: '640px', margin: '0 auto', padding: '80px 16px 60px' }}>
                {/* Header */}
                <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <LayoutGrid style={{ color: '#0ea5e9', width: 22, height: 22 }} />
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f2942', margin: 0 }}>Your Feed</h1>
                </div>

                {/* Skeleton */}
                {loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {[1, 2].map(i => (
                            <div key={i} style={{
                                background: 'rgba(255,255,255,0.7)', borderRadius: '20px',
                                overflow: 'hidden', boxShadow: '0 4px 20px rgba(14,165,233,0.1)',
                            }}>
                                <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e0f2fe' }} />
                                    <div style={{ width: 120, height: 14, borderRadius: 8, background: '#e0f2fe' }} />
                                </div>
                                <div style={{ height: 300, background: '#e0f2fe' }} />
                                <div style={{ padding: '14px 20px', display: 'flex', gap: '16px' }}>
                                    <div style={{ width: 60, height: 28, borderRadius: 8, background: '#e0f2fe' }} />
                                    <div style={{ width: 70, height: 28, borderRadius: 8, background: '#e0f2fe' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Posts */}
                {!loading && posts.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                        {posts.map(post => (
                            <PostCard
                                key={post.id}
                                post={post}
                                currentUsername={currentUsername}
                                token={token}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {!loading && posts.length === 0 && (
                    <div style={{
                        textAlign: 'center', padding: '80px 20px',
                        background: 'rgba(255,255,255,0.7)',
                        borderRadius: '24px',
                        border: '2px dashed rgba(14,165,233,0.3)',
                        boxShadow: '0 4px 20px rgba(14,165,233,0.08)',
                    }}>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 80, height: 80, borderRadius: '20px', marginBottom: '20px',
                            background: 'linear-gradient(135deg, rgba(14,165,233,0.15), rgba(56,189,248,0.1))',
                            border: '2px solid rgba(14,165,233,0.2)',
                        }}>
                            <ImageOff style={{ width: 36, height: 36, color: '#38bdf8' }} />
                        </div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f2942', marginBottom: '8px' }}>
                            No posts yet
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: '300px', margin: '0 auto 24px' }}>
                            Be the first to share a photo!
                        </p>
                        <a href="/upload" style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            padding: '10px 24px', borderRadius: '12px', fontWeight: 600,
                            textDecoration: 'none', color: 'white', fontSize: '0.9rem',
                            background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
                            boxShadow: '0 4px 14px rgba(14,165,233,0.4)',
                        }}>
                            Upload a Photo
                        </a>
                    </div>
                )}
            </div>
        </>
    )
}
