import type { EgressPolicy } from "@app/types/sandbox/egress_policy";

export type GetWorkspaceEgressPolicyResponseBody = {
  policy: EgressPolicy;
};

export type PutWorkspaceEgressPolicyResponseBody = {
  policy: EgressPolicy;
};
