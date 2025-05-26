export interface ExternalUser {
  sid: string;
  email: string;
  email_verified: boolean;
  name: string;
  nickname: string;
  sub: string;

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
