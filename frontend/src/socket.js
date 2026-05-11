import { io } from 'socket.io-client';

function getSocketURL() {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (import.meta.env.DEV && typeof window !== 'undefined') return window.location.origin;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://127.0.0.1:5001';
}

const socket = io(getSocketURL(), {
  path: '/socket.io',
  autoConnect: false,
  transports: ['websocket', 'polling'],
});

export function setSocketAuth(token) {
  socket.auth = { token };
}

export default socket;
