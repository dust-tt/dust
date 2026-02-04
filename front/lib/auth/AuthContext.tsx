import { createContext, useContext } from "react";

import type {
  LightWorkspaceType,
  SubscriptionType,
  UserType,
} from "@app/types";

// Context for pages that have workspace (app pages, workspace-scoped poke pages).
// User is non-nullable because withDefaultUserAuthRequirements guarantees authentication.
export interface AuthContextValue {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: boolean;
  isBuilder: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function useWorkspace(): LightWorkspaceType {
  const ctx = useAuth();
  if (!ctx.workspace) {
    throw new Error(
      "useWorkspace must be used within a route that has workspace context"
    );
  }
  return ctx.workspace;
}

// Context for pages that require authenticated user but no workspace (e.g., OAuth finalize).
// User is non-nullable because authentication is required.
export interface AuthContextUserOnlyValue {
  user: UserType;
}

export const AuthContextUserOnly =
  createContext<AuthContextUserOnlyValue | null>(null);

export function useAuthUserOnly(): AuthContextUserOnlyValue {
  const ctx = useContext(AuthContextUserOnly);
  if (!ctx) {
    throw new Error(
      "useAuthUserOnly must be used within AuthContextUserOnly.Provider"
    );
  }
  return ctx;
}

// Context for global pages without workspace (e.g., /poke/plans, /poke/templates).
export interface AuthContextNoWorkspaceValue {
  user: UserType | null;
  isSuperUser: boolean;
}

export const AuthContextNoWorkspace =
  createContext<AuthContextNoWorkspaceValue | null>(null);

export function useAuthNoWorkspace(): AuthContextNoWorkspaceValue {
  const ctx = useContext(AuthContextNoWorkspace);
  if (!ctx) {
    throw new Error(
      "useAuthNoWorkspace must be used within AuthContextNoWorkspace.Provider"
    );
  }
  return ctx;
}
