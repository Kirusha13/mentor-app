import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Во время разработки — локальный бэкенд
// При деплое заменить на реальный URL
export const API_BASE_URL = 'https://mentor-app-production-3ae0.up.railway.app/api/v1';

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

export default client;
