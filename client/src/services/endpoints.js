/**
 * Auth API wrappers.
 */
import api from './api.js';
import { useAuthStore } from '../stores/authStore.js';

export const authApi = {
  register: (data) => api.post('/auth/register', data).then(r => r.data),
  login: (data) => api.post('/auth/login', data).then(r => r.data),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }).then(r => r.data),
};

export const profileApi = {
  get: () => api.get('/profile').then(r => r.data),
  update: (data) => api.put('/profile', data).then(r => r.data),
  usage: () => api.get('/profile/usage').then(r => r.data),
  updatePlan: (plan) => api.patch('/profile/plan', { plan }).then(r => r.data),
  // Fetch the full appliance catalog from the Python AI engine (SSOT).
  // Used by the OnboardingModal to render a searchable device dropdown.
  getCatalog: () => api.get('/profile/catalog').then(r => r.data),
};

export const paymentApi = {
  checkout: (plan) => api.post('/payments/checkout', { plan }).then(r => r.data),
  confirm: (sessionId) => api.post('/payments/confirm', { sessionId }).then(r => r.data),
};

export const sessionApi = {
  list: () => api.get('/sessions').then(r => r.data),
  create: () => api.post('/sessions').then(r => r.data),
  get: (id) => api.get(`/sessions/${id}`).then(r => r.data),
  updateTitle: (id, title) => api.patch(`/sessions/${id}/title`, { title }).then(r => r.data),
  updateStarred: (id, starred) => api.patch(`/sessions/${id}/star`, { starred }).then(r => r.data),
  updateShare: (id, enabled) => api.patch(`/sessions/${id}/share`, { enabled }).then(r => r.data),
  getShared: (token) => api.get(`/sessions/share/${token}`).then(r => r.data),
  delete: (id) => api.delete(`/sessions/${id}`).then(r => r.data),
  sendMessage: (id, content) => api.post(`/sessions/${id}/messages`, { content }).then(r => r.data),
};

export const topologyApi = {
  get: (id) => api.get(`/topology/${id}`).then(r => r.data),
};

export const exportApi = {
  status: (id) => api.get(`/export/${id}/status`).then(r => r.data),
  downloadUrl: (id, file) => {
    const token = useAuthStore.getState().accessToken;
    const base = import.meta.env.VITE_API_URL || '/api';
    return `${base}/export/${id}/download/${file}?token=${encodeURIComponent(token)}`;
  },
};
