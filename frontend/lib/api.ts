/**
 * Dynamic API base URL.
 * - On localhost → http://localhost:8000
 * - On any other host (e.g. 192.168.x.x from mobile) → http://<same-host>:8000
 *
 * This means you only need ONE build and it works from both your laptop
 * browser AND your phone on the same Wi-Fi, without ever changing code.
 */
export function getApiBase(): string {
    if (typeof window === "undefined") {
        // SSR fallback
        return "http://localhost:8000"
    }
    const host = window.location.hostname
    return `http://${host}:8000`
}

/** Convenience constant — use this in all client components */
export const API_BASE = typeof window !== "undefined"
    ? `http://${window.location.hostname}:8000`
    : "http://localhost:8000"
