import type { StoredUser } from "@app/extension/app/src/lib/storage";
import type { ReactNode } from "react";
import React, { createContext, useContext } from "react";

import { useAuthHook } from "../hooks/useAuth";

type AuthContextType = {
  token: string | null;
  isAuthenticated: boolean;
  user: StoredUser | null;
  isUserSetup: boolean;
  isLoading: boolean;
  handleLogin: () => void;
  handleLogout: () => void;
  handleSelectWorkspace: (workspaceId: string) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const {
    token,
    isAuthenticated,
    user,
    isUserSetup,
    isLoading,
    handleLogin,
    handleLogout,
    handleSelectWorkspace,
  } = useAuthHook();

  return (
    <AuthContext.Provider
      value={{
        token,
        isAuthenticated,
        user,
        isUserSetup,
        isLoading,
        handleLogin,
        handleLogout,
        handleSelectWorkspace,
      }}
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
