export type SandboxFunctionErrorCode =
  | "invalid_path"
  | "sandbox_unavailable"
  | "build_failed"
  | "schema_extraction_failed"
  | "invalid_contract"
  // Another publish holds this pod's publish lock.
  | "publish_conflict"
  // A `dsbx db` command refused a model-correctable input (destructive/disallowed DDL, bad
  // schema file, unknown database, bad SQL).
  | "reconcile_blocked"
  // A `dsbx db` command failed for a non-model-correctable reason (plan/apply error).
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
