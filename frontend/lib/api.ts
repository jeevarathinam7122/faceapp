export const API_BASE = import.meta.env.VITE_API_URL;
import { API_BASE } from "../lib/api";
fetch(`${API_BASE}/upload`)
