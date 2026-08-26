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
