import {createContext, type ReactNode, useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import api from "../apiConfig.ts";
import { jwtDecode } from 'jwt-decode';


export type UserRole = 'superuser' | 'staff' | 'activator' | null;

interface AuthState {
    user: { username: string; role: UserRole } | null;
    isAuthenticated: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
}

interface DecodedToken {
    exp: number;
    iat: number;
}

export const SESSION_KEY = 'kosa_admin_session';
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
        const token = localStorage.getItem("access_token");
        const session = localStorage.getItem(SESSION_KEY);
        return !!(token && session);  // Both must exist
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
                setIsAuthenticated(true);
            } catch (err) {
                // If profile fetch fails, fallback to username-based role
                const role = deriveRoleFromUsername(username);
                if (!role) {
                    throw new Error('Unable to determine user role after login.');
                }
                const userData = {username, role};
                localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
                setUser(userData);
                setIsAuthenticated(true);
            }

            navigate('/admin/dashboard');
        } catch (err: any) {
            // Clear any partial state on login failure
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem(SESSION_KEY);
            setUser(null);
            setIsAuthenticated(false);
            
            console.error('Login failed:', err);
            throw err; // Re-throw to let the login page handle the error
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


    const checkAndRefreshToken = async () => {
        const accessToken = localStorage.getItem('access_token');
        const refreshToken = localStorage.getItem('refresh_token');

        if (!accessToken || !refreshToken) {
            logout();
            return;
        }

        try {
            // Decode token to check expiration
            const decoded = jwtDecode<DecodedToken>(accessToken);
            const currentTime = Date.now() / 1000; // Convert to seconds

            // If token expires in less than 5 minutes, refresh it
            if (decoded.exp - currentTime < 300) {
                console.log('Token expiring soon, refreshing...');

                const response = await api.post('api/auth/refresh/', {
                    refresh: refreshToken
                });

                const newAccessToken = response.data.access;
                localStorage.setItem('access_token', newAccessToken);

                // Update axios default headers
                if (api.defaults.headers && api.defaults.headers.common) {
                    api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
                }

                console.log('Token refreshed successfully');
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            // If refresh fails, logout user
            logout();
        }
    };

    // Add auto-refresh on app load
    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (token) {
            // Check token immediately on load
            checkAndRefreshToken();

            // Set up interval to check token periodically (every 1 minute)
            const intervalId = setInterval(checkAndRefreshToken, 60000);

            return () => clearInterval(intervalId);
        }
    }, []);

    return (
        <AuthContext.Provider value={{user, isAuthenticated, login, logout}}>
            {children}
        </AuthContext.Provider>
    );
}

export {AuthContext};