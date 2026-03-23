import axios from 'axios';

export function getApiErrorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  const detail = error.response?.data?.detail;
  if (detail && typeof detail === 'object' && typeof detail.code === 'string') {
    return detail.code;
  }

  return null;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const detail = error.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
    return detail.message;
  }

  return fallback;
}
