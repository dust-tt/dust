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
