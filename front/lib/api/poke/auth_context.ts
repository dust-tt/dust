// Contract types for the poke auth-context endpoints, used by the poke
// auth-context API routes (front-api/routes/poke/...).
import type { PokeRole } from "@app/lib/poke/roles";
import type { WorkspacePermissions } from "@app/types/group_permissions";
import type { SubscriptionType } from "@app/types/plan";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { LightWorkspaceType, UserType } from "@app/types/user";

export type GetPokeNoWorkspaceAuthContextResponseType = {
  user: UserType;
  isSuperUser: true;
  pokeRoles: PokeRole[];
};

export type GetPokeWorkspaceAuthContextResponseType = {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: true; // Superusers have admin privileges
  isManager: true; // Superusers have manager privileges
  isSuperUser: true;
  workspacePermissions: WorkspacePermissions;
  // The workspace's real feature flags, so poke pages built from shared
  // components (which gate behavior via useFeatureFlags()/hasFeature())
  // see the same flags as the workspace's own members instead of none.
  featureFlags: WhitelistableFeature[];
};
