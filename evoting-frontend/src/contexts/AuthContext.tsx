import {createContext, type ReactNode, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import api from "../apiConfig.ts";

export type UserRole = 'superuser' | 'staff' | 'activator' | null;

interface AuthState {
    user: { username: string; role: UserRole } | null;
    isAuthenticated: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
}

const SESSION_KEY = 'kosa_admin_session';
const AuthContext = createContext<AuthState | undefined>(undefined);

function deriveRoleFromUsername(username: string): UserRole {
    if (username === 'superuser') return 'superuser';
    if (username.startsWith('staff')) return 'staff';
    if (username.startsWith('activator')) return 'activator';
    return null;
}

export function AuthProvider({children}: { children: ReactNode }) {
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
            const response = await api.post('api/auth/login/', {
                username,
                password,
            });

            const {access, refresh} = response.data;
            if (!access || !refresh) {
                throw new Error('Invalid login response from server.');
            }

            localStorage.setItem('access_token', access);
            localStorage.setItem('refresh_token', refresh);

            // ensure common headers object exists and set Authorization there
            api.defaults.headers = api.defaults.headers || {};
            api.defaults.headers.common = api.defaults.headers.common || {};
            api.defaults.headers.common['Authorization'] = `Bearer ${access}`;
            try {
                const profileResp = await api.get('api/auth/me/');
                const profile = profileResp.data || {};
                const role: UserRole = profile.role ?? deriveRoleFromUsername(username);
                const userData = {username: profile.username ?? username, role};
                localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
                setUser(userData);
            } catch (err) {
                const role = deriveRoleFromUsername(username);
                if (!role) {
                    throw new Error('Unable to determine user role after login.');
                }
                const userData = {username, role};
                localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
                setUser(userData);
            }

            setIsAuthenticated(true);
            navigate('/admin/dashboard');
        } catch (err) {
            const role = deriveRoleFromUsername(username);
            if (!role) {
                console.error('Role derivation failed for username:', username); // Add logging
                throw new Error('Unable to determine user role after login.');
            }
            const userData = {username, role};
            localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
            setUser(userData);
        }
    };

    const logout = () => {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setUser(null);
        setIsAuthenticated(false);
        if (api.defaults && api.defaults.headers && api.defaults.headers.common) {
            delete api.defaults.headers.common['Authorization'];
        }
        navigate('/admin/login');
    };

    return (
        <AuthContext.Provider value={{user, isAuthenticated, login, logout}}>
            {children}
        </AuthContext.Provider>
    );
}

export {AuthContext};