import type { EgressPolicy } from "@app/types/sandbox/egress_policy";

// The scopeId the bulk egress write reports for the workspace baseline; pods
// use their sId. Shared so the client can map a result back to the Workspace.
export const SANDBOX_WORKSPACE_SCOPE_ID = "workspace";

// Per-scope outcome of a bulk egress write. scopeId is
// SANDBOX_WORKSPACE_SCOPE_ID for the workspace scope or a pod sId.
export type ScopeMutationResult = {
  scopeId: string;
  success: boolean;
  errorMessage?: string;
};

export type GetWorkspaceEgressPolicyResponseBody = {
  policy: EgressPolicy;
  requestedDomains?: { domain: string; requestedAtMs: number }[];
};

export type PutWorkspaceEgressPolicyResponseBody = {
  policy: EgressPolicy;
};

export type GetPodEgressPolicyResponseBody = {
  policy: EgressPolicy;
  requestedDomains?: { domain: string; requestedAtMs: number }[];
};

export type PutPodEgressPolicyResponseBody = {
  policy: EgressPolicy;
};

// Outcome of a member's domain request: it was recorded, or was a no-op
// because the domain is already allowed or already pending.
export type SandboxEgressRequestOutcome =
  | "already_allowed"
  | "already_requested"
  | "requested";

export type PostPodEgressPolicyRequestResponseBody = {
  policy: EgressPolicy;
  outcome: SandboxEgressRequestOutcome;
};

// The Pods that have their own egress policy, for the admin scope selector.
export type GetEgressPolicyPodsResponseBody = {
  pods: { sId: string; name: string }[];
};

export type GetPodEgressPoliciesBulkResponseBody = {
  policies: { podId: string; policy: EgressPolicy }[];
};

export type PostBulkEgressPolicyResponseBody = {
  results: ScopeMutationResult[];
};
