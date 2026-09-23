import { useEffect, useState } from 'react';
import { socketClient } from '../api/socket';
import { useAuth } from '../context/AuthContext';

export interface OnlineUser {
  userId: string;
  name: string;
  email: string;
}

export function useOnlineUsers(sessionId: string | undefined) {
  const { token } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    if (!sessionId || !token) return;

    const socket = socketClient.connect();

    socket.emit('join_session', { sessionId, token });

    const handleOnlineUsers = (users: OnlineUser[]) => {
      setOnlineUsers(users);
    };

    socket.on('online_users_list', handleOnlineUsers);

    return () => {
      socket.emit('leave_session');
      socket.off('online_users_list', handleOnlineUsers);
      // We don't disconnect the entire socket here, just leave the session,
      // in case we navigate to a different session or reuse the connection.
    };
  }, [sessionId, token]);

  return onlineUsers;
}
