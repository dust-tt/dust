import React, { createContext, useContext } from "react";
import { useAuth } from "../hooks/useAuth";
import type { StoredUser } from "../types";
import type { WorkspaceType } from "@dust-tt/client";

type AuthContextType = {
  user: StoredUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  handleLogin: (organizationId?: string) => Promise<void>;
  handleLogout: () => Promise<void>;
  handleSelectWorkspace: (workspace: WorkspaceType) => void;
  selectedWorkspace: WorkspaceType | undefined;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return ctx;
}
