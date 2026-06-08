// In dev: Vite proxies /api → localhost:3001
// In prod: VITE_API_BASE points to Railway backend URL
export const API_BASE = import.meta.env.VITE_API_BASE ?? '';
