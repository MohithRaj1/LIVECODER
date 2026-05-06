import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:5001/api',
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
export const getRoomMessages = (roomId) => API.get(`/rooms/${roomId}/messages`);
export const getRoomAnalytics = (roomId, params) => API.get(`/rooms/${roomId}/analytics`, { params });
export const aiAnalyze = (data) => API.post('/ai/analyze', data);
export const executeCode = (data) => API.post('/execute', data);

export default API;
