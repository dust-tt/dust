export const SANDBOX_ENV_VAR_KINDS = ["config", "https_secret"] as const;

export type SandboxEnvVarKind = (typeof SANDBOX_ENV_VAR_KINDS)[number];

export type SandboxEnvVarType = {
  sId: string;
  name: string;
  kind: SandboxEnvVarKind;
  placeholderNonce: string | null;
  allowedDomains: string[] | null;
  createdAt: number;
  updatedAt: number;
  createdByName: string | null;
  lastUpdatedByName: string | null;
};
