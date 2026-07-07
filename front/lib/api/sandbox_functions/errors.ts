export type SandboxFunctionErrorCode =
  | "invalid_path"
  | "sandbox_unavailable"
  | "build_failed"
  | "schema_extraction_failed"
  | "invalid_contract"
  // The manifest diff found a change that would break a sibling function's published bundle.
  | "compat_blocked"
  // A `dsbx db` command refused a model-correctable input (destructive/disallowed DDL, bad
  // schema file, unknown database, bad SQL).
  | "reconcile_blocked"
  // A `dsbx db` command failed for a non-model-correctable reason (plan/apply error).
  | "reconcile_failed"
  // Another publish holds this pod's publish lock.
  | "publish_conflict"
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
