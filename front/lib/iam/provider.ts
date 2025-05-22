import type { User } from "@workos-inc/node";
import type { AuthenticationResponse } from "@workos-inc/node";

export type SessionCookie = {
  sessionData: string;
  organizationId?: string;
  authenticationMethod: AuthenticationResponse["authenticationMethod"];
};
export type SessionWithUser = {
  sessionId: string;
  user: User;
  organizationId?: string;
  authenticationMethod: AuthenticationResponse["authenticationMethod"];
};
