import type { PlanType, SubscriptionType } from "./plan";
import type { LightWorkspaceType, UserType } from "./user";

export type AuthenticatorType = {
  user: UserType | null;
  owner: LightWorkspaceType | null;
  plan: PlanType | null;
  isAdmin: boolean;
  subscription: SubscriptionType | null;
};
