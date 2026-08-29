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
  readonly code: "user_authentication_required" | "sandbox_function_not_found";
  readonly status: 401 | 404;

  constructor(
    message: string,
    {
      code = "user_authentication_required",
      status = 401,
    }:
      | {
          code?: "user_authentication_required";
          status?: 401;
        }
      | {
          code: "sandbox_function_not_found";
          status: 404;
        } = {}
  ) {
    super(message);
    this.name = "SandboxFunctionInvocationError";
    this.code = code;
    this.status = status;
  }
}

export function isSandboxFunctionInvocationError(
  error: Error
): error is SandboxFunctionInvocationError {
  return error instanceof SandboxFunctionInvocationError;
}
