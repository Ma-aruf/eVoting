// src/lib/apiConfig.ts
import axios, {type AxiosInstance} from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/';

const api: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add request interceptor
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        
        // Handle 401 errors (unauthorized)
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            
            const refreshToken = localStorage.getItem('refresh_token');
            
            if (refreshToken) {
                try {
                    // Try to refresh the token
                    const response = await axios.post(`${API_BASE_URL}api/auth/refresh/`, {
                        refresh: refreshToken
                    });
                    
                    const newAccessToken = response.data.access;
                    localStorage.setItem('access_token', newAccessToken);
                    
                    // Update the failed request with new token
                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                    
                    return api(originalRequest);
                } catch (refreshError) {
                    // Refresh failed, logout user
                    localStorage.removeItem('kosa_admin_session');
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    window.location.href = '/admin/login';
                    return Promise.reject(refreshError);
                }
            } else {
                // No refresh token, logout
                localStorage.removeItem('kosa_admin_session');
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/admin/login';
            }
        }
        
        return Promise.reject(error);
    }
);

// Helper typed wrappers
export const getElections = () => api.get('api/elections/');
export const getPositions = (electionId: number | string) =>
    api.get('api/positions/', {params: {election_id: electionId}});  

export const getCandidates = (positionId: number | string) =>
    api.get('api/candidates/', {params: {position_id: positionId}});

export default api;