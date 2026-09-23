import { Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';
import SessionPage from './pages/SessionPage';
import SessionDashboardPage from './pages/SessionDashboardPage';
import GitHubCallbackPage from './pages/GitHubCallbackPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/auth/github/callback" element={<GitHubCallbackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/sessions/:id/dashboard" element={<SessionDashboardPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
