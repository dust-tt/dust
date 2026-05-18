export const WORKSPACE_SANDBOX_ENV_VAR_KINDS = [
  "config",
  "https_secret",
] as const;

export type WorkspaceSandboxEnvVarKind =
  (typeof WORKSPACE_SANDBOX_ENV_VAR_KINDS)[number];

export type WorkspaceSandboxEnvVarType = {
  sId: string;
  name: string;
  kind: WorkspaceSandboxEnvVarKind;
  placeholderNonce: string | null;
  allowedDomains: string[] | null;
  createdAt: number;
  updatedAt: number;
  createdByName: string | null;
  lastUpdatedByName: string | null;
};
