export class SSOEnforcedError extends Error {
  constructor(
    message: string,
    readonly workspaceId: string
  ) {
    super(message);
  }
}

type AuthFlowErrorCodeType =
  | "invalid_invitation_token"
  | "invitation_token_email_mismatch"
  | "invalid_domain"
  | "membership_update_error"
  | "revoked";

export class AuthFlowError extends Error {
  constructor(
    readonly code: AuthFlowErrorCodeType,
    message: string
  ) {
    super(message);
  }
}
