import type { ScopeMutationResult } from "@app/lib/api/sandbox/admin_pods";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";

// The scopeId the bulk egress route reports for the workspace baseline; pods
// use their sId. Shared so the client can map a result back to the Workspace.
export const SANDBOX_WORKSPACE_SCOPE_ID = "workspace";

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

export type GetPodEgressPoliciesBulkResponseBody = {
  policies: { podId: string; policy: EgressPolicy }[];
};

export type PostBulkEgressPolicyResponseBody = {
  results: ScopeMutationResult[];
};
