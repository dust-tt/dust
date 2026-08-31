import type { ScopeMutationResult } from "@app/types/api/sandbox/egress_policy";
import type { SandboxEnvVarType } from "@app/types/sandbox/env_var";

export type GetSandboxEnvVarsResponseBody = {
  envVars: SandboxEnvVarType[];
};

export type PostSandboxEnvVarsResponseBody = {
  envVar: SandboxEnvVarType;
  created: boolean;
};

// Flat across the requested pods; each row carries its pod via `spaceId`.
export type GetSandboxEnvVarsBulkResponseBody = {
  envVars: SandboxEnvVarType[];
};

export type PodSandboxEnvVarBulkResult = {
  podId: string;
  success: boolean;
  // Set on success: whether the row was created (vs replaced).
  created?: boolean;
  // Set on failure.
  errorMessage?: string;
};

export type PostSandboxEnvVarsBulkResponseBody = {
  results: PodSandboxEnvVarBulkResult[];
};

// Delete reports per scope (workspace and/or pods), unlike the pods-only
// upsert, since a variable can be removed from the workspace baseline too.
export type DeleteSandboxEnvVarsBulkResponseBody = {
  results: ScopeMutationResult[];
};
