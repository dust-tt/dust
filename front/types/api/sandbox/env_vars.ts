import type { WorkspaceSandboxEnvVarType } from "@app/types/sandbox/env_var";

export type GetWorkspaceSandboxEnvVarsResponseBody = {
  envVars: WorkspaceSandboxEnvVarType[];
};

export type PostWorkspaceSandboxEnvVarsResponseBody = {
  envVar: WorkspaceSandboxEnvVarType;
  created: boolean;
};
