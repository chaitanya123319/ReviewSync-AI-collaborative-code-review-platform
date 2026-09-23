import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/apiClient';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (accessToken: string, user: User) => void;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    token: null,
    user: null,
  });
  const navigate = useNavigate();

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiClient.post<AuthResponse>(
        '/api/v1/auth/login',
        { email, password },
      );
      setAuthState({ token: data.accessToken, user: data.user });
      navigate('/dashboard');
    },
    [navigate],
  );

  const loginWithToken = useCallback(
    (accessToken: string, user: User) => {
      setAuthState({ token: accessToken, user });
      navigate('/dashboard');
    },
    [navigate],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const data = await apiClient.post<AuthResponse>(
        '/api/v1/auth/register',
        { name, email, password },
      );
      setAuthState({ token: data.accessToken, user: data.user });
      navigate('/dashboard');
    },
    [navigate],
  );

  const logout = useCallback(() => {
    setAuthState({ token: null, user: null });
    navigate('/');
  }, [navigate]);

  const value: AuthContextValue = {
    ...authState,
    isAuthenticated: authState.token !== null,
    login,
    loginWithToken,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
