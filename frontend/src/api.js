import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:5001/api',
});

export const createRoom = (data) => API.post('/rooms/create', data);
export const getRoom = (roomId) => API.get(`/rooms/${roomId}`);
export const getRoomMessages = (roomId) => API.get(`/rooms/${roomId}/messages`);
export const getAISuggestion = (data) => API.post('/ai/suggest', data);

export default API;
