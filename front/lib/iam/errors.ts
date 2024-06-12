export class SSOEnforcedError extends Error {
  constructor(message: string, readonly workspaceId: string) {
    super(message);
  }
}

export class AuthFlowError extends Error {
  constructor(
    message: string,
    readonly type:
      | "unverified_email"
      | "workspace_not_found"
      | "invite_access_error"
  ) {
    super(message);
  }
}
