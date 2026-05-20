import api from '@/lib/api';
import type {
  AuthTokens, Campaign, Field, Publisher, Submission, User,
  PaginatedResponse, ApiResponse,
} from '@/types';

// --- AUTH ---
export const authService = {
  login: (email: string, password: string) =>
    api.post<ApiResponse<AuthTokens>>('/auth/login', { email, password }),

  register: (data: { name: string; email: string; password: string; role?: string; publisher?: string }) =>
    api.post<ApiResponse<AuthTokens>>('/auth/register', data),

  logout: () => api.post('/auth/logout'),

  me: () => api.get<ApiResponse<{ user: User }>>('/auth/me'),

  refresh: () => api.post<ApiResponse<AuthTokens>>('/auth/refresh'),
};

// --- PUBLISHERS ---
export const publisherService = {
  getAll: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Publisher>>('/publishers', { params }),

  getOne: (id: string) =>
    api.get<ApiResponse<{ publisher: Publisher }>>(`/publishers/${id}`),

  create: (data: Partial<Publisher>) =>
    api.post<ApiResponse<{ publisher: Publisher }>>('/publishers', data),

  update: (id: string, data: Partial<Publisher>) =>
    api.patch<ApiResponse<{ publisher: Publisher }>>(`/publishers/${id}`, data),

  rotateApiKey: (id: string) =>
    api.post<ApiResponse<{ publisher: Publisher }>>(`/publishers/${id}/rotate-key`),

  updateIpWhitelist: (id: string, ipWhitelist: string[]) =>
    api.patch<ApiResponse<{ publisher: Publisher }>>(`/publishers/${id}/ip-whitelist`, { ipWhitelist }),

  delete: (id: string) => api.delete(`/publishers/${id}`),
};

// --- CAMPAIGNS ---
export const campaignService = {
  getAll: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Campaign>>('/campaigns', { params }),

  getOne: (id: string) =>
    api.get<ApiResponse<{ campaign: Campaign }>>(`/campaigns/${id}`),

  create: (data: Partial<Campaign>) =>
    api.post<ApiResponse<{ campaign: Campaign }>>('/campaigns', data),

  update: (id: string, data: Partial<Campaign>) =>
    api.patch<ApiResponse<{ campaign: Campaign }>>(`/campaigns/${id}`, data),

  delete: (id: string) => api.delete(`/campaigns/${id}`),

  getEnrichUrl: (id: string) =>
    api.get<ApiResponse<{ enrichUrl: string; publisherId: string; campaignId: string }>>(`/campaigns/${id}/enrich-url`),
};

// --- FIELDS ---
export const fieldService = {
  getAll: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Field>>('/fields', { params }),

  getOne: (id: string) =>
    api.get<ApiResponse<{ field: Field }>>(`/fields/${id}`),

  create: (data: Partial<Field>) =>
    api.post<ApiResponse<{ field: Field }>>('/fields', data),

  update: (id: string, data: Partial<Field>) =>
    api.patch<ApiResponse<{ field: Field }>>(`/fields/${id}`, data),

  delete: (id: string) => api.delete(`/fields/${id}`),
};

// --- SUBMISSIONS ---
export const submissionService = {
  getAll: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Submission>>('/submissions', { params }),

  getOne: (id: string) =>
    api.get<ApiResponse<{ submission: Submission }>>(`/submissions/${id}`),

  submit: (campaignId: string, data: Record<string, unknown>) =>
    api.post<ApiResponse<{ submissionId: string; status: string }>>('/submissions', { campaignId, data }),

  repost: (id: string, targetCampaignId: string) =>
    api.post<ApiResponse<{ submissionId: string; status: string }>>(`/submissions/${id}/repost`, { targetCampaignId }),

  getStats: (params?: Record<string, unknown>) =>
    api.get<ApiResponse<{ totals: number; bySource: unknown[]; byStatus: unknown[]; byCampaign: unknown[] }>>('/submissions/stats', { params }),
};

// --- USERS ---
export const userService = {
  getAll: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<User>>('/users', { params }),

  getOne: (id: string) =>
    api.get<ApiResponse<{ user: User }>>(`/users/${id}`),

  create: (data: Partial<User> & { password: string }) =>
    api.post<ApiResponse<{ user: User }>>('/users', data),

  update: (id: string, data: Partial<User>) =>
    api.patch<ApiResponse<{ user: User }>>(`/users/${id}`, data),

  toggleActive: (id: string) =>
    api.patch<ApiResponse<{ user: User; isActive: boolean }>>(`/users/${id}/toggle-active`),
};

// --- AUDIT LOGS ---
export const auditService = {
  getAll: (params?: Record<string, unknown>) =>
    api.get('/audit', { params }),
};
