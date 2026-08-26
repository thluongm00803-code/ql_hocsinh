import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Role } from './types';
import Layout from './components/Layout';
import Login from './pages/Login';
import PendingApproval from './pages/PendingApproval';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import Students from './pages/Students';
import Attendance from './pages/Attendance';
import Grades from './pages/Grades';
import Tuition from './pages/Tuition';
import Users from './pages/Users';
import Zalo from './pages/Zalo';
import ParentView from './pages/ParentView';
import PayView from './pages/PayView';

function FullScreenLoader() {
  return (
    <div className="center-screen">
      <div style={{ textAlign: 'center', color: 'var(--primary)' }}>
        <div className="spinner" style={{ margin: '0 auto' }} />
        <div style={{ marginTop: 12, fontWeight: 600 }}>Đang tải...</div>
      </div>
    </div>
  );
}

/** Wraps authenticated pages: requires login, approval, and (optionally) a role. */
function Protected({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isApproved) return <PendingApproval />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/classes" replace />;

  return <Layout>{children}</Layout>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isApproved) return <PendingApproval />;
  return <Navigate to={user.role === Role.ADMIN ? '/dashboard' : '/classes'} replace />;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <HomeRedirect />;
  return <Login />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/parent/:studentId" element={<ParentView />} />
      <Route path="/pay/:studentId" element={<PayView />} />

      <Route
        path="/dashboard"
        element={
          <Protected roles={[Role.ADMIN]}>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/classes"
        element={
          <Protected>
            <Classes />
          </Protected>
        }
      />
      <Route
        path="/students"
        element={
          <Protected roles={[Role.ADMIN]}>
            <Students />
          </Protected>
        }
      />
      <Route
        path="/attendance"
        element={
          <Protected>
            <Attendance />
          </Protected>
        }
      />
      <Route
        path="/grades"
        element={
          <Protected roles={[Role.ADMIN, Role.TEACHER]}>
            <Grades />
          </Protected>
        }
      />
      <Route
        path="/tuition"
        element={
          <Protected roles={[Role.ADMIN, Role.TEACHER]}>
            <Tuition />
          </Protected>
        }
      />
      <Route
        path="/users"
        element={
          <Protected roles={[Role.ADMIN]}>
            <Users />
          </Protected>
        }
      />
      <Route
        path="/zalo"
        element={
          <Protected roles={[Role.ADMIN]}>
            <Zalo />
          </Protected>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
