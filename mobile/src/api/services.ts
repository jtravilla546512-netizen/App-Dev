import { api, queryString } from './client';
import type {
  AuthPayload,
  Book,
  BorrowRequest,
  Category,
  LibraryNotification,
  Loan,
  NotificationPreferences,
  PushDevice,
  User,
} from '../types/api';

export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthPayload>('/auth/login', { email, password, device_name: 'android-app' }),
  register: (body: {
    name: string;
    member_id: string;
    email: string;
    password: string;
    password_confirmation: string;
  }) => api.post<AuthPayload>('/auth/register', { ...body, device_name: 'android-app' }),
  me: () => api.get<User>('/auth/me'),
  activity: () => api.post<null>('/auth/activity'),
  updateProfile: (name: string) => api.patch<User>('/auth/me', { name }),
  logout: () => api.post<null>('/auth/logout'),
  forgotPassword: (email: string) => api.post<null>('/auth/forgot-password', { email }),
  resetPassword: (body: {
    email: string;
    token: string;
    password: string;
    password_confirmation: string;
  }) => api.post<null>('/auth/reset-password', body),
  changePassword: (body: {
    current_password: string;
    password: string;
    password_confirmation: string;
  }) => api.put<null>('/auth/password', body),
};

export const catalogApi = {
  categories: () => api.get<Category[]>('/categories'),
  books: (filters: {
    search?: string;
    category_id?: number;
    sort?: string;
    direction?: 'asc' | 'desc';
    page?: number;
    per_page?: number;
  } = {}) => api.get<Book[]>(`/books${queryString(filters)}`),
  book: (id: number) => api.get<Book>(`/books/${id}`),
};

export const libraryApi = {
  eligibility: () => api.get<{ can_borrow: boolean; reason: string | null; overdue_count: number }>('/borrowing-eligibility'),
  requests: () => api.get<BorrowRequest[]>('/borrow-requests?per_page=100&direction=desc'),
  createRequest: (bookId: number) => api.post<BorrowRequest>('/borrow-requests', { book_id: bookId }),
  cancelRequest: (id: number) => api.patch<BorrowRequest>(`/borrow-requests/${id}/cancel`),
  loans: () => api.get<Loan[]>('/loans?per_page=100&direction=desc'),
};

export const notificationApi = {
  list: () => api.get<LibraryNotification[]>('/notifications?per_page=100'),
  read: (id: string) => api.post<LibraryNotification>(`/notifications/${id}/read`),
  readAll: () => api.post<{ updated: number }>('/notifications/read-all'),
  preferences: () => api.get<NotificationPreferences>('/notification-preferences'),
  updatePreferences: (body: Partial<NotificationPreferences>) =>
    api.patch<NotificationPreferences>('/notification-preferences', body),
};

export const pushDeviceApi = {
  test: (id: number) => api.post<null>(`/push-devices/${id}/test`),
  diagnostics: (id: number) => api.get<{ server_enabled: boolean; device_enabled: boolean; latest_attempt: { status: string; error_code: string | null } | null }>(`/push-devices/${id}/diagnostics`),
  register: (body: { expo_push_token: string; platform: 'android' | 'ios' }) =>
    api.post<PushDevice>('/push-devices', body),
  unregister: (id: number) => api.delete<null>(`/push-devices/${id}`),
};
