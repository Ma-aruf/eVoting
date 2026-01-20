import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';
import {AuthProvider, type UserRole} from './contexts/AuthContext';
import {useAuth} from './hooks/useAuth';
import AdminLayout from './AdminLayout';
import LoginPage from './pages/admin/LoginPage';
import Dashboard from './pages/admin/Dashboard';
import StudentsPage from './pages/admin/StudentsPage';
import ElectionsPage from './pages/admin/ElectionsPage';
import ManageElectionsPage from './pages/admin/ManageElectionsPage';
import PositionsPage from './pages/admin/PositionsPage';
import CandidatesPage from './pages/admin/CandidatesPage';
import ActivationsPage from './pages/admin/ActivationsPage';
import type {JSX} from "react";

function ProtectedRoute({children, allowedRoles}: { children: JSX.Element; allowedRoles: Exclude<UserRole, null>[] }) {
    const {user} = useAuth();

    // If there is no authenticated user, send them to login
    if (!user) return <Navigate to="/admin/login" replace/>;

    // Only allow access if the user's role is in the allowed list
    if (!user.role || !allowedRoles.includes(user.role)) {
        return <Navigate to="/admin/dashboard" replace/>;
    }

    return children;
}

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/admin/login" element={<LoginPage/>}/>

                    {/* All admin pages live under /admin */}
                    <Route path="/admin" element={<AdminLayout/>}>
                        <Route index element={<Navigate to="/admin/dashboard" replace/>}/>
                        <Route path="dashboard" element={<Dashboard/>}/>

                        <Route
                            path="students"
                            element={
                                <ProtectedRoute allowedRoles={['superuser', 'staff']}>
                                    <StudentsPage/>
                                </ProtectedRoute>
                            }
                        />

                        <Route
                            path="elections"
                            element={
                                <ProtectedRoute allowedRoles={['superuser']}>
                                    <ElectionsPage/>
                                </ProtectedRoute>
                            }
                        />

                        <Route
                            path="manage-elections"
                            element={
                                <ProtectedRoute allowedRoles={['superuser']}>
                                    <ManageElectionsPage/>
                                </ProtectedRoute>
                            }
                        />

                        <Route
                            path="positions"
                            element={
                                <ProtectedRoute allowedRoles={['superuser']}>
                                    <PositionsPage/>
                                </ProtectedRoute>
                            }
                        />

                        <Route
                            path="candidates"
                            element={
                                <ProtectedRoute allowedRoles={['superuser', 'staff']}>
                                    <CandidatesPage/>
                                </ProtectedRoute>
                            }
                        />

                        <Route
                            path="activations"
                            element={
                                <ProtectedRoute allowedRoles={['activator', 'superuser']}>
                                    <ActivationsPage/>
                                </ProtectedRoute>
                            }
                        />

                        {/* Fallback */}
                        <Route path="*" element={<Navigate to="/admin/dashboard" replace/>}/>
                    </Route>
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}
export default App;