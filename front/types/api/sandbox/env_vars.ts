import type { SandboxEnvVarType } from "@app/types/sandbox/env_var";

export type GetSandboxEnvVarsResponseBody = {
  envVars: SandboxEnvVarType[];
};

export type PostSandboxEnvVarsResponseBody = {
  envVar: SandboxEnvVarType;
  created: boolean;
};
