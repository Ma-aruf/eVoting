// src/lib/apiConfig.ts
import axios, {type AxiosInstance } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false, // change to true if using cookies later
});

// Optional: Add auth token interceptor (if using JWT)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('kosa_admin_token'); // if you switch to JWT
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Global error handling (401 → logout, etc.)
    if (error.response?.status === 401) {
      localStorage.removeItem('kosa_admin_session');
      localStorage.removeItem('kosa_admin_token');
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  }
);

// Helper typed wrappers
export const getElections = () => api.get('elections/');
export const getPositions = (electionId: number | string) =>
  api.get('positions/', { params: { election_id: electionId } });
export const getCandidates = (positionId: number | string) =>
  api.get('candidates/', { params: { position_id: positionId } });

export default api;