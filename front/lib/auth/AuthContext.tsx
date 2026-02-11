import { createContext, useContext } from "react";

import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType, UserType } from "@app/types/user";

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
