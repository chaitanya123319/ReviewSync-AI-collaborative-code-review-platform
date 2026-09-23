import { io, Socket } from 'socket.io-client';

// Socket.IO connects directly from the browser to the backend (not through Vite proxy)
const SOCKET_URL = `http://${window.location.hostname}:3001`;

class SocketClient {
  private socket: Socket | null = null;

  connect() {
    if (!this.socket) {
      this.socket = io(SOCKET_URL, {
        transports: ['websocket'],
      });
    }
    return this.socket;
  }

  getSocket() {
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketClient = new SocketClient();
