import {
  devFlagApply,
  devFlagGetVersion,
  devFlagSubscribe,
} from "@app/components/dev/devFlagOverrideStore";
import { DEV_MODE_ACTIVE } from "@app/components/dev/devModeConstants";
import type { SubscriptionType } from "@app/types/plan";
import type { ProvidersHealth } from "@app/types/provider_credential";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

const noopSubscribe = () => () => {};
const noopGetVersion = () => 0;

// Context for pages that have workspace (app pages, workspace-scoped poke pages).
// User is non-nullable because authentication is guaranteed by the session wrapper.
export interface AuthContextValue {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: boolean;
  isBuilder: boolean;
  featureFlags: WhitelistableFeature[];
  vizUrl: string;
  providersHealth: ProvidersHealth | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function useFeatureFlags() {
  const ctx = useContext(AuthContext);
  const serverFlags = ctx?.featureFlags ?? [];

  // Dev mode feature flag overrides: when dev mode is off, these resolve to
  // no-ops (constant version 0, no subscriptions, identity apply). When on,
  // the lazy-loaded dev panel registers the real override logic into
  // devFlagOverrideStore. See that file for the full architecture overview.
  const overrideVersion = useSyncExternalStore(
    DEV_MODE_ACTIVE ? devFlagSubscribe : noopSubscribe,
    DEV_MODE_ACTIVE ? devFlagGetVersion : noopGetVersion,
    noopGetVersion
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: overrideVersion triggers recalculation when dev panel changes overrides
  const featureFlags = useMemo(
    () => (DEV_MODE_ACTIVE ? devFlagApply(serverFlags) : serverFlags),
    [serverFlags, overrideVersion]
  );

  const hasFeature = useCallback(
    (flag: WhitelistableFeature | null | undefined) => {
      if (!flag) {
        return true;
      }
      return featureFlags.includes(flag);
    },
    [featureFlags]
  );

  return { featureFlags, hasFeature };
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
