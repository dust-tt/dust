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
