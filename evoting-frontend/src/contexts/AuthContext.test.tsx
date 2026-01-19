// file: evoting-frontend/src/contexts/AuthContext.test.tsx
import { renderHook, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, AuthContext } from './AuthContext';
import api from '../apiConfig';

jest.mock('../apiConfig');

describe('AuthContext', () => {
    const mockApi = api as jest.Mocked<typeof api>;

    beforeEach(() => {
        localStorage.clear();
        jest.resetAllMocks();
    });

    it('logs in successfully and sets user data', async () => {
        mockApi.post.mockResolvedValueOnce({
            data: { access: 'mockAccessToken', refresh: 'mockRefreshToken' },
        });
        mockApi.get.mockResolvedValueOnce({
            data: { username: 'superuser', role: 'superuser' },
        });

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <BrowserRouter>
                <AuthProvider>{children}</AuthProvider>
            </BrowserRouter>
        );

        const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });

        await act(async () => {
            await result.current?.login('superuser', 'admin123');
        });

        expect(localStorage.getItem('access_token')).toBe('mockAccessToken');
        expect(localStorage.getItem('refresh_token')).toBe('mockRefreshToken');
        expect(localStorage.getItem('kosa_admin_session')).toContain('superuser');
        expect(result.current?.user?.username).toBe('superuser');
        expect(result.current?.isAuthenticated).toBe(true);
    });

    it('handles login failure', async () => {
        mockApi.post.mockRejectedValueOnce({
            response: { data: { detail: 'Invalid credentials' } },
        });

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <BrowserRouter>
                <AuthProvider>{children}</AuthProvider>
            </BrowserRouter>
        );

        const { result } = renderHook(() => React.useContext(AuthContext), { wrapper });

        await act(async () => {
            await expect(result.current?.login('invalidUser', 'wrongPassword')).rejects.toThrow('Invalid credentials');
        });

        expect(localStorage.getItem('access_token')).toBeNull();
        expect(localStorage.getItem('refresh_token')).toBeNull();
        expect(localStorage.getItem('kosa_admin_session')).toBeNull();
        expect(result.current?.user).toBeNull();
        expect(result.current?.isAuthenticated).toBe(false);
    });
});