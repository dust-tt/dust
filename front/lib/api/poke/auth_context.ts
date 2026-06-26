// Contract types for the poke auth-context endpoints, used by the poke
// auth-context API routes (front-api/routes/poke/...).
import type { PokeRole } from "@app/lib/poke/roles";
import type { SubscriptionType } from "@app/types/plan";
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
  isBuilder: true; // Superusers have builder privileges
  isSuperUser: true;
};
