// Contract types for the poke auth-context endpoints, shared between the Next
// handlers (front/pages/api/poke/...) and their Hono counterparts
// (front-api/routes/poke/...).
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType, UserType } from "@app/types/user";

export type GetPokeNoWorkspaceAuthContextResponseType = {
  user: UserType;
  isSuperUser: true;
};

export type GetPokeWorkspaceAuthContextResponseType = {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: true; // Superusers have admin privileges
  isBuilder: true; // Superusers have builder privileges
  isSuperUser: true;
};
