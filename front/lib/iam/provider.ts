import type { AuthenticationResponse, User } from "@workos-inc/node";

import type { RegionType } from "@app/lib/api/regions/config";

export type SessionCookie = {
  sessionData: string;
  organizationId?: string;
  authenticationMethod: AuthenticationResponse["authenticationMethod"];
  region: RegionType;
};
export type SessionWithUser = {
  sessionId: string;
  user: User;
  organizationId?: string;
  authenticationMethod: AuthenticationResponse["authenticationMethod"];
};
