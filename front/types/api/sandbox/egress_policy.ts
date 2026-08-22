import type { EgressPolicy } from "@app/types/sandbox/egress_policy";

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

// The Pods that have their own egress policy, for the admin scope selector.
export type GetEgressPolicyPodsResponseBody = {
  pods: { sId: string; name: string }[];
};

export type GetPodEgressPoliciesBulkResponseBody = {
  policies: { podId: string; policy: EgressPolicy }[];
};
