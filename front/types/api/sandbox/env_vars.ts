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
