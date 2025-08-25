import type { RegionType } from "@app/lib/api/regions/config";

export interface ExternalUser {
  email: string;
  email_verified: boolean;
  name: string;
  nickname: string;
  auth0Sub: string | null;
  workOSUserId: string;
  // Google-specific fields.
  family_name?: string;
  given_name?: string;

  // Always optional.
  picture?: string;
}

export type SessionWithUser = {
  type: "workos";
  sessionId: string;
  user: ExternalUser;
  region: RegionType;
  workspaceId?: string;
  organizationId?: string;
  isSSO: boolean;
  authenticationMethod: string | undefined;
};
