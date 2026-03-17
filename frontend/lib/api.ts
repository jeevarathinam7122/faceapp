/**
 * Dynamic API base URL.
 * - In production → Uses process.env.NEXT_PUBLIC_API_URL
 * - On local laptop → http://localhost:8000
 * - On local mobile (same Wi-Fi) → http://<same-host>:8000
 */
export function getApiBase(): string {
    if (process.env.NEXT_PUBLIC_API_URL) {
        return process.env.NEXT_PUBLIC_API_URL;
    }
    if (typeof window === "undefined") {
        // SSR fallback
        return "http://localhost:8000";
    }
    const host = window.location.hostname;
    return `http://${host}:8000`;
}

/** Convenience constant — use this in all client components */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined"
    ? `http://${window.location.hostname}:8000`
    : "http://localhost:8000");
