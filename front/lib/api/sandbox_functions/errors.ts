export type SandboxFunctionErrorCode =
  | "invalid_path"
  | "not_found"
  | "sandbox_unavailable"
  | "build_failed"
  | "schema_extraction_failed"
  | "invalid_contract"
  | "publish_conflict"
  | "reconcile_blocked"
  | "reconcile_failed"
  | "internal";

export class SandboxFunctionError extends Error {
  constructor(
    readonly code: SandboxFunctionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SandboxFunctionError";
  }
}

export function isSandboxFunctionError(
  error: unknown
): error is SandboxFunctionError {
  return error instanceof SandboxFunctionError;
}

export class SandboxFunctionInvocationError extends Error {
  readonly code = "user_authentication_required";

  constructor(message: string) {
    super(message);
    this.name = "SandboxFunctionInvocationError";
  }
}

export function isSandboxFunctionInvocationError(
  error: Error
): error is SandboxFunctionInvocationError {
  return error instanceof SandboxFunctionInvocationError;
}
