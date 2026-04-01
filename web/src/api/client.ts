import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const POST_LOGIN_REDIRECT_KEY = 'post_login_redirect';
const SESSION_EXPIRED_REASON = 'session_expired';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const authorizationHeader = error?.config?.headers?.Authorization;
    const requestUrl = String(error?.config?.url ?? '');

    const shouldHandleExpiredSession =
      status === 401 &&
      Boolean(authorizationHeader) &&
      !requestUrl.includes('/auth/login');

    if (
      shouldHandleExpiredSession &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/login')
    ) {
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, currentPath || '/');
      localStorage.removeItem('access_token');
      window.location.replace(`/login?reason=${SESSION_EXPIRED_REASON}`);

      // Keep the original request from bubbling into page-level alerts while the app redirects.
      return new Promise(() => {});
    }

    return Promise.reject(error);
  }
);

export function consumePostLoginRedirect() {
  if (typeof window === 'undefined') {
    return null;
  }

  const redirectPath = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
  if (!redirectPath) {
    return null;
  }

  sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  return redirectPath;
}
