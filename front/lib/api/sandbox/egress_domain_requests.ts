import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { Ok, type Result } from "@app/types/shared/result";

// A domain an agent asked to reach from a Pod's Computer, pending admin
// approval into the Pod egress allowlist.
export type EgressDomainRequest = {
  domain: string;
  requestedAtMs: number;
  // Conversation the request originated from, when known — display-only.
  requesterConversationId?: string;
};

// TODO(2026-07-22 SANDBOX_EGRESS): stub — always empty until the tool
// approval flow routes non-privileged pod domain requests to the
// requested-domains manifest instead of writing the pod policy directly.
// When that lands:
// 1. Read the pending requests from the manifest here.
// 2. Add a dismiss path (remove from the manifest without approving).
// 3. Gate request/approve on one shared predicate — pod editor OR workspace
//    admin — applied together to the tool's direct-approve branch, the pod
//    sandbox route group, and the Pod settings gate (they must not drift).
// Approval itself needs no new write path: the UI merges the domain into the
// existing pod egress policy update, which already audits and reaches the
// proxy via its cache refresh.
export async function listPendingEgressDomainRequests(
  _auth: Authenticator,
  _pod: SpaceResource
): Promise<Result<EgressDomainRequest[], Error>> {
  return new Ok([]);
}
