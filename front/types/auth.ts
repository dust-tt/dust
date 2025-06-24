import type { PlanType, SubscriptionType } from "./plan";
import type { LightWorkspaceType, UserType } from "./user";

export type AuthenticatorType = {
  user: UserType;
  owner: LightWorkspaceType;
  plan: PlanType | null;
  isAdmin: boolean;
  subscription: SubscriptionType;
};
