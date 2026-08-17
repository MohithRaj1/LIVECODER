import axios from 'axios';

/**
 * In dev, use `/api` so Vite proxies to the backend (avoids wrong port / CORS).
 * Set VITE_API_BASE to a full origin in production, e.g. https://api.example.com
 */
function getApiBaseURL() {
  const v = import.meta.env.VITE_API_BASE;
  if (v != null && String(v).trim() !== '') {
    const base = String(v).replace(/\/$/, '');
    return base.endsWith('/api') ? base : `${base}/api`;
  }
  if (import.meta.env.DEV) return '/api';
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/api`;
}

const API = axios.create({
  baseURL: getApiBaseURL(),
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('lc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const signup = (data) => API.post('/auth/signup', data);
export const login = (data) => API.post('/auth/login', data);
export const me = () => API.get('/auth/me');

export const createRoom = (data) => API.post('/rooms/create', data);
export const getRoom = (roomId) => API.get(`/rooms/${roomId}`);
export const getUserRooms = () => API.get('/rooms/user/mine');
export const getRoomMessages = (roomId) => API.get(`/rooms/${roomId}/messages`);
export const getRoomAnalytics = (roomId, params) => API.get(`/rooms/${roomId}/analytics`, { params });
export const aiAnalyze = (data) => API.post('/ai/analyze', data);
export const executeCode = (data) => API.post('/execute', data);

export default API;
