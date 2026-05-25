import { io } from 'socket.io-client';

// Create a single socket instance for the entire application.
// 'autoConnect: false' prevents it from connecting immediately upon import.
// We will manually call socket.connect() inside our components.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  transports: ['websocket'],
  withCredentials: true,
});
