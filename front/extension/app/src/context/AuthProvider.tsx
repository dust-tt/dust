import type { ReactNode } from "react";
import React, { createContext, useContext } from "react";

import { useAuthHook } from "../hooks/useAuth";

type AuthContextType = {
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  handleLogin: () => void;
  handleLogout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { token, isLoading, isAuthenticated, handleLogin, handleLogout } =
    useAuthHook();

  return (
    <AuthContext.Provider
      value={{ token, isLoading, isAuthenticated, handleLogin, handleLogout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
