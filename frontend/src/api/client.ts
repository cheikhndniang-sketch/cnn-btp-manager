import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // envoie le cookie HttpOnly refresh_token
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

interface RetriableConfig extends AxiosRequestConfig {
  _retry?: boolean;
}

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data } = await axios.post<{ access_token: string }>(
      `${API_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    setAccessToken(data.access_token);
    return data.access_token;
  } catch {
    setAccessToken(null);
    return null;
  }
}

// Rejoue automatiquement une requête après un 401 via le refresh token.
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    // On ne tente PAS de refresh pour login/refresh/logout (mais on l'autorise pour /auth/me).
    const noRetry = /\/auth\/(login|refresh|logout)/.test(original?.url ?? '');

    if (error.response?.status === 401 && original && !original._retry && !noRetry) {
      original._retry = true;
      refreshing ??= refreshAccessToken().finally(() => {
        refreshing = null;
      });
      const token = await refreshing;
      if (token) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${token}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);
