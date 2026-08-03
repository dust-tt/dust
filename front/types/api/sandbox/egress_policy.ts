import type { EgressPolicy } from "@app/types/sandbox/egress_policy";

export type GetWorkspaceEgressPolicyResponseBody = {
  policy: EgressPolicy;
};

export type PutWorkspaceEgressPolicyResponseBody = {
  policy: EgressPolicy;
};

export type GetPodEgressPolicyResponseBody = {
  policy: EgressPolicy;
};

export type PutPodEgressPolicyResponseBody = {
  policy: EgressPolicy;
};
