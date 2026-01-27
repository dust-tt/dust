import { createContext, useContext } from "react";

import type {
  LightWorkspaceType,
  SubscriptionType,
  UserType,
} from "@app/types";

export interface AuthContextValue {
  user: UserType | null;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: boolean;
  isBuilder: boolean;
  isSuperUser: boolean;
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
