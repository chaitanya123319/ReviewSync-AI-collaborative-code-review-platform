import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAccessToken } from './lib/tokens';
import prisma from './lib/prisma';

interface JoinSessionPayload {
  sessionId: string;
  token: string;
}

// In-memory state tracking socketId -> User + sessionId
interface OnlineUser {
  socketId: string;
  userId: string;
  name: string;
  email: string;
  sessionId: string;
}

const onlineUsers = new Map<string, OnlineUser>();

// Exported so HTTP routes can emit events to session rooms
let io: Server;

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call setupSocket first.');
  }
  return io;
}

export function setupSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*', // For dev
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join_session', async (payload: JoinSessionPayload) => {
      try {
        const { sessionId, token } = payload;
        if (!sessionId || !token) {
          socket.emit('error', 'Missing sessionId or token');
          return;
        }

        // Verify token
        const userPayload = verifyAccessToken(token);

        // Fetch user from DB to get the name
        const user = await prisma.user.findUnique({
          where: { id: userPayload.userId },
          select: { id: true, name: true, email: true },
        });

        if (!user) {
          socket.emit('error', 'User not found');
          return;
        }

        // Join room
        socket.join(sessionId);

        // Track user
        const onlineUser: OnlineUser = {
          socketId: socket.id,
          userId: user.id,
          name: user.name,
          email: user.email,
          sessionId,
        };
        onlineUsers.set(socket.id, onlineUser);

        // Broadcast updated list
        broadcastOnlineUsers(sessionId);

        console.log(`User ${user.name} joined session ${sessionId}`);
      } catch (error) {
        console.error('Socket join_session error:', error);
        socket.emit('error', 'Authentication failed');
      }
    });

    socket.on('leave_session', () => {
      const user = onlineUsers.get(socket.id);
      if (user) {
        socket.leave(user.sessionId);
        onlineUsers.delete(socket.id);
        broadcastOnlineUsers(user.sessionId);
        console.log(`User ${user.name} left session ${user.sessionId}`);
      }
    });

    socket.on('disconnect', () => {
      const user = onlineUsers.get(socket.id);
      if (user) {
        onlineUsers.delete(socket.id);
        broadcastOnlineUsers(user.sessionId);
        console.log(`Socket disconnected: ${socket.id}, user ${user.name} removed from session ${user.sessionId}`);
      }
    });
  });
}

function broadcastOnlineUsers(sessionId: string) {
  const usersInSession = Array.from(onlineUsers.values())
    .filter((u) => u.sessionId === sessionId)
    .map(({ userId, name, email }) => ({ userId, name, email }));

  // Remove duplicates in case a user is connected from multiple tabs
  const uniqueUsers = Array.from(
    new Map(usersInSession.map((u) => [u.userId, u])).values()
  );

  io.to(sessionId).emit('online_users_list', uniqueUsers);
}
