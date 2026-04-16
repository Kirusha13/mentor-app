import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = 'https://mentor-app-f3cl.onrender.com/api/v1';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Автоматически подставляем JWT-токен из защищённого хранилища
client.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Обработчик истечения сессии — устанавливается из AuthContext
let signOutHandler: (() => void) | null = null;

export function setSignOutHandler(fn: () => void) {
  signOutHandler = fn;
}

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && signOutHandler) {
      signOutHandler();
    }
    return Promise.reject(error);
  },
);

export default client;
