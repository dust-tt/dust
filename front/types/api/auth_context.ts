import type { WorkspacePermissions } from "@app/types/group_permissions";
import type { SupportedLocale } from "@app/types/locale";
import type { SubscriptionType } from "@app/types/plan";
import type { ProvidersHealth } from "@app/types/provider_credential";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { LightWorkspaceType, UserType } from "@app/types/user";

export type GroupManagementScope =
  | { kind: "all" }
  | { kind: "ids"; groupIds: string[] };

export function hasGroupManagementScope(
  scope: GroupManagementScope | undefined
): boolean {
  return scope?.kind === "all" || (scope?.groupIds.length ?? 0) > 0;
}

export type GroupManagementAccess = {
  write: GroupManagementScope;
  read_usage: GroupManagementScope;
  set_usage_limits: GroupManagementScope;
};

export type GetNoWorkspaceAuthContextResponseType = {
  user: UserType;
  defaultWorkspaceId: string | null;
};

export type GetWorkspaceAuthContextResponseType = {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: boolean;
  isManager: boolean;
  featureFlags: WhitelistableFeature[];
  isEligibleForTrial?: boolean;
  vizUrl: string;
  /** The live session server's URL; absent where live editing is not deployed. */
  collabUrl?: string;
  providersHealth: ProvidersHealth | null;
  workspacePermissions: WorkspacePermissions;
  groupManagement?: GroupManagementAccess;
  locale?: SupportedLocale;
  userLocale?: SupportedLocale | null;
};
