export interface ExternalUser {
  email: string;
  email_verified: boolean;
  name: string;
  nickname: string;
  auth0Sub: string | null;
  workOSUserId: string | null;
  // Google-specific fields.
  family_name?: string;
  given_name?: string;

  // Always optional.
  picture?: string;
}

export type SessionWithUser = {
  type: "workos" | "auth0";
  sessionId: string;
  user: ExternalUser;
  workspaceId?: string;
  organizationId?: string;
  isSSO: boolean;
  authenticationMethod: string | undefined;
};
