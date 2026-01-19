import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, type UserRole } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import AdminLayout from './AdminLayout';
import LoginPage from './pages/admin/LoginPage';
import Dashboard from './pages/admin/Dashboard';
import StudentsPage from './pages/admin/StudentsPage';
import ElectionsPage from './pages/admin/ElectionsPage';
import PositionsPage from './pages/admin/PositionsPage';
import CandidatesPage from './pages/admin/CandidatesPage';
import ActivationsPage from './pages/admin/ActivationsPage';

function ProtectedRoute({ children, allowedRoles }: { children: JSX.Element; allowedRoles: Exclude<UserRole, null>[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to="/admin/dashboard" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/admin/login" element={<LoginPage />} />

          <Route element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />

            <Route
              path="students"
              element={
                <ProtectedRoute allowedRoles={['superadmin', 'staff']}>
                  <StudentsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="elections"
              element={
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <ElectionsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="positions"
              element={
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <PositionsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="candidates"
              element={
                <ProtectedRoute allowedRoles={['superadmin', 'staff']}>
                  <CandidatesPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="activations"
              element={
                <ProtectedRoute allowedRoles={['activator', 'superadmin']}>
                  <ActivationsPage />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;