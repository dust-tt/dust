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

export type SandboxFunctionInvocationErrorCode =
  | "user_authentication_required"
  | "frame_runtime_unavailable";

export class SandboxFunctionInvocationError extends Error {
  constructor(
    message: string,
    readonly code: SandboxFunctionInvocationErrorCode = "user_authentication_required"
  ) {
    super(message);
    this.name = "SandboxFunctionInvocationError";
  }
}

export function isSandboxFunctionInvocationError(
  error: Error
): error is SandboxFunctionInvocationError {
  return error instanceof SandboxFunctionInvocationError;
}
