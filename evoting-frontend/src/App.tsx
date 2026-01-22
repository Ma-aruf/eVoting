import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ToastContainer} from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {AuthProvider, type UserRole} from './contexts/AuthContext';
import {useAuth} from './hooks/useAuth';
import AdminLayout from './components/AdminLayout.tsx';
import LoginPage from './pages/admin/LoginPage';
import Dashboard from './pages/admin/Dashboard';
import StudentsPage from './pages/admin/StudentsPage';
import ElectionsPage from './pages/admin/ElectionsPage';
import ManageElectionsPage from './pages/admin/ManageElectionsPage';
import PositionsPage from './pages/admin/PositionsPage';
import CandidatesPage from './pages/admin/CandidatesPage';
import ActivationsPage from './pages/admin/ActivationsPage';
import UsersPage from './pages/admin/UsersPage';
import type {JSX} from "react";
import StudentLoginPage from "./pages/StudentLoginPage";
import VotingPage from "./pages/VotingPage";
import ResultsPage from "./pages/admin/ResultsPage";

// Create a client with caching configuration for voting data
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: Infinity, // Data never becomes stale during the session
            gcTime: Infinity, // Keep data in cache indefinitely
            refetchOnWindowFocus: false, // Don't refetch when window regains focus
            refetchOnReconnect: false, // Don't refetch on reconnect
            refetchOnMount: false, // Don't refetch when component mounts
            retry: 1, // Only retry once on failure
        },
    },
});

function ProtectedRoute({children, allowedRoles}: { children: JSX.Element; allowedRoles: Exclude<UserRole, null>[] }) {
    const {user} = useAuth();

    // If there is no authenticated user, send them to login
    if (!user) return <Navigate to="/admin/login" replace/>;

    // Only allow access if the user's role is in the allowed list
    if (!user.role || !allowedRoles.includes(user.role)) {
        const fallback = user.role === 'activator' ? '/admin/activations' : '/admin/dashboard';
        return <Navigate to={fallback} replace/>;
    }

    return children;
}

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider>
                    <ToastContainer />
                    <Routes>
                        <Route path="/" element={<StudentLoginPage/>}/>
                        <Route path="/voter-login" element={<StudentLoginPage/>}/>
                        <Route path="/admin/login" element={<LoginPage/>}/>
                        <Route path="/vote" element={<VotingPage/>}/>

                        {/* All admin pages live under /admin */}
                        <Route path="/admin" element={<AdminLayout/>}>
                            <Route index element={<Navigate to="/admin/dashboard" replace/>}/>
                            <Route
                                path="dashboard"
                                element={
                                    <ProtectedRoute allowedRoles={['superuser', 'staff']}>
                                        <Dashboard/>
                                    </ProtectedRoute>
                                }
                            />
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
                            <Route
                                path="results"
                                element={
                                    <ProtectedRoute allowedRoles={['superuser']}>
                                        <ResultsPage/>
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="users"
                                element={
                                    <ProtectedRoute allowedRoles={['superuser']}>
                                        <UsersPage/>
                                    </ProtectedRoute>
                                }
                            />
                            {/* Fallback */}
                            <Route path="*" element={<Navigate to="/admin/dashboard" replace/>}/>
                        </Route>
                    </Routes>
                </AuthProvider>
            </BrowserRouter>
        </QueryClientProvider>
    );
}

export default App;