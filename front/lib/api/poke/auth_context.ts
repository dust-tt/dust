// Contract types for the poke auth-context endpoints, used by the poke
// auth-context API routes (front-api/routes/poke/...).
import type { AccessIdentityEvidence } from "@app/lib/api/poke/cloudflare_access";
import type { PokeRole } from "@app/lib/poke/roles";
import type { WorkspacePermissions } from "@app/types/group_permissions";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType, UserType } from "@app/types/user";

/** Sanitized Access identity for poke clients. Never includes JWT or cookie. */
export type PokeAccessUserView = {
  subject: string;
  email: string;
  name: string | null;
  identity: AccessIdentityEvidence;
};

export type GetPokeNoWorkspaceAuthContextResponseType = {
  user: UserType;
  isSuperUser: true;
  pokeRoles: PokeRole[];
  accessUser: PokeAccessUserView | null;
};

export type GetPokeWorkspaceAuthContextResponseType = {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: true; // Superusers have admin privileges
  isManager: true; // Superusers have manager privileges
  isSuperUser: true;
  workspacePermissions: WorkspacePermissions;
};
