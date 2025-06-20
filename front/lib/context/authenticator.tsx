import pick from "lodash/pick";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type {
  LightWorkspaceType,
  PlanType,
  SubscriptionType,
  UserType,
} from "@app/types";

export type AuthenticatorState = {
  user: UserType;
  owner: LightWorkspaceType;
  plan: PlanType | null;
  isAdmin: boolean;
  subscription: SubscriptionType;
};

const AuthenticatorContext = createContext<AuthenticatorState | null>(null);

export function AuthenticatorProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: AuthenticatorState;
}) {
  return (
    <AuthenticatorContext.Provider
      // use pick to make sure we only put the needed key in the event of passing an any or bigger object above
      value={pick(value, ["user", "owner", "plan", "isAdmin", "subscription"])}
    >
      {children}
    </AuthenticatorContext.Provider>
  );
}

export function useAuthenticator() {
  const context = useContext(AuthenticatorContext);
  if (!context) {
    throw new Error(
      "useAuthenticator must be used within an AuthenticatorProvider"
    );
  }
  return context;
}
