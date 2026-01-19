import { createContext, type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from "../apiConfig.ts";

// Mirror backend roles: superuser, staff, activator
export type UserRole = 'superuser' | 'staff' | 'activator' | null;

interface AuthState {
    user: { username: string; role: UserRole } | null;
    isAuthenticated: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
}

const SESSION_KEY = 'kosa_admin_session';

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    // lazy initializer reads localStorage synchronously once (avoids setState in effect)
    const [user, setUser] = useState<AuthState['user']>(() => {
        const stored = localStorage.getItem(SESSION_KEY);
        if (!stored) return null;
        try {
            return JSON.parse(stored);
        } catch {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
    });

    const [isAuthenticated, setIsAuthenticated] = useState(() => {
            return !!localStorage.getItem("access_token");
        });

    const navigate = useNavigate();

    const login = async (username: string, password: string) => {
        try {
                const response = await api.post('/token/', {
                    username,
                    password,
                });

                const {access, refresh} = response.data;

                localStorage.setItem('access_token', access);
                localStorage.setItem('refresh_token', refresh);

                setIsAuthenticated(true);
                return true;
            } catch (error) {
                console.error("Login failed", error)
                return false
            }
    };

    const logout = () => {
        localStorage.removeItem(SESSION_KEY);
        setUser(null);
        navigate('/admin/login');
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

// Keep only the component export in this file (move hook to separate file)
export { AuthContext };
