export class SSOEnforcedError extends Error {
  constructor(message: string, readonly workspaceId: string) {
    super(message);
  }
}

export class AuthFlowError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class UnverifiedEmailError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class WorkspaceIdentificationError extends Error {
  constructor(message: string) {
    super(message);
  }
}
