import {
  requestOwnerPolicyDomain,
  requestWorkspacePolicyDomain,
} from "@app/lib/api/sandbox/egress_policy";
import type { Authenticator } from "@app/lib/auth";

// Where a publish files the domains it declares: the Pod whose policy the
// published functions run under, or the workspace when there is no Pod.
export type EgressDomainRequestScope =
  | { kind: "pod"; podId: string }
  | { kind: "workspace" };

export type EgressDomainRequestsSummary = {
  scope: EgressDomainRequestScope["kind"];
  requested: string[];
  alreadyAllowed: string[];
  failed: string[];
};

// Files each declared domain as a request on the scope for admin review —
// never grants. Failures are collected, not returned: the publish that
// declared the domains has already landed, and the caller reports them so the
// domains can be retried with request_egress_domain. Sequential writes are
// bounded by one publish's declared domains.
export async function requestEgressDomainsForScope(
  auth: Authenticator,
  { scope, domains }: { scope: EgressDomainRequestScope; domains: string[] }
): Promise<EgressDomainRequestsSummary> {
  const summary: EgressDomainRequestsSummary = {
    scope: scope.kind,
    requested: [],
    alreadyAllowed: [],
    failed: [],
  };

  for (const domain of domains) {
    const result =
      scope.kind === "pod"
        ? await requestOwnerPolicyDomain(auth, {
            ownerId: scope.podId,
            domain,
          })
        : await requestWorkspacePolicyDomain(auth, { domain });
    if (result.isErr()) {
      summary.failed.push(domain);
    } else if (result.value.outcome === "already_allowed") {
      summary.alreadyAllowed.push(domain);
    } else {
      // "requested" or "already_requested": pending an admin's review.
      summary.requested.push(domain);
    }
  }

  return summary;
}

export function formatEgressDomainRequestsNote(
  summary: EgressDomainRequestsSummary
): string | null {
  const target = summary.scope === "pod" ? "Pod" : "workspace";
  const parts: string[] = [];
  if (summary.requested.length > 0) {
    parts.push(
      `Requested for the ${target} (pending admin approval): ${summary.requested.join(", ")}.`
    );
  }
  if (summary.alreadyAllowed.length > 0) {
    parts.push(`Already allowed: ${summary.alreadyAllowed.join(", ")}.`);
  }
  if (summary.failed.length > 0) {
    parts.push(
      `Could not process (retry with request_egress_domain): ${summary.failed.join(", ")}.`
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
