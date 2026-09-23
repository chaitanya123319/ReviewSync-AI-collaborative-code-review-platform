import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/apiClient';

interface GitHubAuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    githubId?: string;
  };
}

export default function GitHubCallbackPage() {
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const code = searchParams.get('code');
    const ghError = searchParams.get('error');
    const ghErrorDesc = searchParams.get('error_description');

    if (ghError) {
      setError(ghErrorDesc || ghError || 'GitHub authorization was denied');
      setIsLoading(false);
      return;
    }

    if (!code) {
      setError('No authorization code received from GitHub');
      setIsLoading(false);
      return;
    }

    // Exchange code for JWT via our backend
    apiClient
      .post<GitHubAuthResponse>('/api/v1/auth/github', { code })
      .then((data) => {
        loginWithToken(data.accessToken, data.user);
      })
      .catch((err) => {
        setError(err.message || 'Failed to authenticate with GitHub');
        setIsLoading(false);
      });
  }, [searchParams, loginWithToken]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-gray-700 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-400">Signing in with GitHub…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-600/20 text-red-400 mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Authentication Failed</h2>
          <p className="text-sm text-gray-400 mb-6">{error}</p>
          <Link
            to="/"
            className="inline-block px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
