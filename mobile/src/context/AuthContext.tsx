import * as SecureStore from 'expo-secure-store';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { setSignOutHandler } from '../api/client';

interface AuthContextType {
  token: string | null;
  isLoading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync('access_token').then((t) => {
      setToken(t);
      setIsLoading(false);
    });
  }, []);

  const signIn = async (newToken: string) => {
    await SecureStore.setItemAsync('access_token', newToken);
    setToken(newToken);
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync('access_token');
    setToken(null);
  };

  // Регистрируем signOut в axios-клиенте чтобы 401 автоматически разлогинивал
  useEffect(() => {
    setSignOutHandler(signOut);
  }, []);

  return (
    <AuthContext.Provider value={{ token, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
