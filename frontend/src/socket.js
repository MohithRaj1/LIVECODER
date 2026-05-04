import { io } from 'socket.io-client';

const socket = io('http://localhost:5001', {
  autoConnect: false,
  transports: ['websocket'],
});

export default socket;
