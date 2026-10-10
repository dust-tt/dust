import {
  devFlagApply,
  devFlagGetVersion,
  devFlagSubscribe,
} from "@app/components/dev/devFlagOverrideStore";
import { DEV_MODE_ACTIVE } from "@app/components/dev/devModeConstants";
import type { GroupManagementAccess } from "@app/types/api/auth_context";
import type { WorkspacePermissions } from "@app/types/group_permissions";
import type { SupportedLocale } from "@app/types/locale";
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
  isManager: boolean;
  featureFlags: WhitelistableFeature[];
  vizUrl: string;
  collabUrl?: string;
  providersHealth: ProvidersHealth | null;
  workspacePermissions: WorkspacePermissions;
  groupManagement?: GroupManagementAccess;
  userLocale?: SupportedLocale | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

/**
 * @cc [owner:PopDaph,label:product] live-editing-per-cell
 * Files MUST be edited live only where the cell's auth context returns a `collabUrl` (its
 * `COLLAB_PUBLIC_URL`), and only through it: without one, the editor saves the file itself.
 */
export function useCollabUrl(): string | undefined {
  return useContext(AuthContext)?.collabUrl;
}

export function useFeatureFlags() {
  const ctx = useContext(AuthContext);
  const serverFlags = ctx?.featureFlags ?? [];

  // Dev mode flag overrides — no-ops when off, see devFlagOverrideStore.ts.
  const overrideVersion = useSyncExternalStore(
    DEV_MODE_ACTIVE ? devFlagSubscribe : noopSubscribe,
    DEV_MODE_ACTIVE ? devFlagGetVersion : noopGetVersion,
    noopGetVersion
  );

  const featureFlags = useMemo(
    () => (DEV_MODE_ACTIVE ? devFlagApply(serverFlags) : serverFlags),
    // oxlint-disable-next-line react/exhaustive-deps -- not reported by the previous linter; deps kept as-is
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
