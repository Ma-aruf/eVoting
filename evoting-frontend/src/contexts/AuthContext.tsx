// src/context/AuthContext.tsx
import {createContext, type ReactNode, useContext, useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';

type UserRole = 'superadmin' | 'staff' | 'activator' | null;

interface AuthState {
    user: { username: string; role: UserRole } | null;
    isAuthenticated: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({children}: { children: ReactNode }) {
    const [user, setUser] = useState<AuthState['user']>(null);
    const navigate = useNavigate();

    useEffect(() => {
        // Try to restore session from localStorage
        const stored = localStorage.getItem('kosa_admin_session');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                setUser(parsed);
            } catch {
                localStorage.removeItem('kosa_admin_session');
            }
        }
    }, []);

    const login = async (username: string, password: string) => {
        // TODO: Replace with real API call to /api-token-auth/ or your login endpoint
        // For now: mock based on username
        let role: UserRole = null;

        if (username === 'superadmin' && password === 'admin123') {
            role = 'superadmin';
        } else if (username.startsWith('staff')) {
            role = 'staff';
        } else if (username.startsWith('activator')) {
            role = 'activator';
        }

        if (!role) {
            throw new Error('Invalid credentials');
        }

        const userData = {username, role};
        localStorage.setItem('kosa_admin_session', JSON.stringify(userData));
        setUser(userData);
        navigate('/admin/dashboard');
    };

    const logout = () => {
        localStorage.removeItem('kosa_admin_session');
        setUser(null);
        navigate('/admin/login');
    };

    return (
        <AuthContext.Provider value={{user, isAuthenticated: !!user, login, logout}}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}