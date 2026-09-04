import {
  requestOwnerPolicyDomains,
  requestWorkspacePolicyDomains,
} from "@app/lib/api/sandbox/egress_policy";
import type { Authenticator } from "@app/lib/auth";
import { assertNever } from "@app/types/shared/utils/assert_never";

// Where a publish files the domains it declares: the Pod whose policy the
// published functions run under, or the workspace when there is no Pod.
export type EgressDomainRequestScope =
  | { kind: "pod"; podId: string }
  | { kind: "workspace" };

// The batch is filed whole or not at all, so a failure carries every domain.
export type EgressDomainRequestsSummary =
  | {
      kind: "filed";
      scope: EgressDomainRequestScope["kind"];
      // "requested" or "already_requested": pending an admin's review.
      requested: string[];
      alreadyAllowed: string[];
    }
  | { kind: "failed"; domains: string[]; message: string };

// Files the declared domains as requests on the scope for admin review —
// never grants. Failures are reported, not returned: the publish that
// declared the domains has already landed.
export async function requestEgressDomainsForScope(
  auth: Authenticator,
  { scope, domains }: { scope: EgressDomainRequestScope; domains: string[] }
): Promise<EgressDomainRequestsSummary> {
  const result =
    scope.kind === "pod"
      ? await requestOwnerPolicyDomains(auth, {
          ownerId: scope.podId,
          domains,
        })
      : await requestWorkspacePolicyDomains(auth, { domains });
  if (result.isErr()) {
    return { kind: "failed", domains, message: result.error.message };
  }

  const { outcomes } = result.value;
  return {
    kind: "filed",
    scope: scope.kind,
    requested: outcomes
      .filter(({ outcome }) => outcome !== "already_allowed")
      .map(({ domain }) => domain),
    alreadyAllowed: outcomes
      .filter(({ outcome }) => outcome === "already_allowed")
      .map(({ domain }) => domain),
  };
}

export function formatEgressDomainRequestsNote(
  summary: EgressDomainRequestsSummary
): string | null {
  switch (summary.kind) {
    case "failed":
      return (
        `Could not request ${summary.domains.join(", ")}: ${summary.message} ` +
        "Retry with request_egress_domain once resolved."
      );
    case "filed": {
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
      return parts.length > 0 ? parts.join(" ") : null;
    }
    default:
      return assertNever(summary);
  }
}
