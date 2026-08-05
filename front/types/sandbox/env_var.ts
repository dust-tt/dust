export const SANDBOX_ENV_VAR_KINDS = ["config", "https_secret"] as const;

export type SandboxEnvVarKind = (typeof SANDBOX_ENV_VAR_KINDS)[number];

// One wire type for both sandbox env var scopes: `spaceId` is null for
// workspace-scoped vars and the pod space sId for pod-scoped ones.
export type SandboxEnvVarType = {
  sId: string;
  name: string;
  kind: SandboxEnvVarKind;
  placeholderNonce: string | null;
  allowedDomains: string[] | null;
  spaceId: string | null;
  createdAt: number;
  updatedAt: number;
  createdByName: string | null;
  lastUpdatedByName: string | null;
};
