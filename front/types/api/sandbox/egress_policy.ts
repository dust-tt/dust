import type { EgressPolicy } from "@app/types/sandbox/egress_policy";

export type GetWorkspaceEgressPolicyResponseBody = {
  policy: EgressPolicy;
};

export type PutWorkspaceEgressPolicyResponseBody = {
  policy: EgressPolicy;
};

export type GetPodEgressPolicyResponseBody = {
  policy: EgressPolicy;
  // Agent-requested domains pending admin approval — empty until the tool
  // approval flow routes requests to the manifest (see
  // lib/api/sandbox/egress_domain_requests.ts).
  requestedDomains?: { domain: string; requestedAtMs: number }[];
};

export type PutPodEgressPolicyResponseBody = {
  policy: EgressPolicy;
};
