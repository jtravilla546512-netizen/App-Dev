import type { ApiEnvelope } from '../types/api';

const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_URL = (configuredUrl || 'http://10.0.2.2:8000/api/v1').replace(/\/$/, '');

let accessToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function setApiToken(token: string | null): void {
  accessToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function firstValidationError(errors: Record<string, string[]>): string | undefined {
  return Object.values(errors).flat()[0];
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const requestToken = accessToken;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const headers = new Headers(init.headers);

  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as
      | (ApiEnvelope<T> & { errors?: Record<string, string[]> })
      | null;

    if (!response.ok || !payload?.success) {
      if (response.status === 401 && requestToken !== null && requestToken === accessToken) {
        unauthorizedHandler?.();
      }

      const errors = payload?.errors ?? {};
      throw new ApiError(
        firstValidationError(errors) ?? payload?.message ?? `Request failed (${response.status}).`,
        response.status,
        errors,
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('The server took too long to respond. Please try again.', 408);
    }
    const networkDetail = error instanceof Error && error.message ? ` Details: ${error.message}` : '';
    throw new ApiError(
      `Cannot reach the library server at ${API_URL}. Check Laravel and your network connection.${networkDetail}`,
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function queryString(values: Record<string, string | number | undefined>): string {
  const parts = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

  return parts.length ? `?${parts.join('&')}` : '';
}

export function mediaUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('/')) {
    return `${new URL(API_URL).origin}${value}`;
  }

  try {
    const source = new URL(value);
    const apiOrigin = new URL(API_URL);
    if (['localhost', '127.0.0.1'].includes(source.hostname)) {
      source.hostname = apiOrigin.hostname;
      source.port = apiOrigin.port;
    }
    return source.toString();
  } catch {
    return value;
  }
}
