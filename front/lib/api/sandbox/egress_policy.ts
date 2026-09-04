import config from "@app/lib/api/config";
import { mintEgressInvalidationJwt } from "@app/lib/api/sandbox/egress";
import type { Authenticator } from "@app/lib/auth";
import { getBucketInstance } from "@app/lib/file_storage";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import logger from "@app/logger/logger";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import {
  EMPTY_EGRESS_POLICY,
  normalizeEgressPolicy,
  normalizeEgressPolicyDomain,
  normalizeEgressPolicyDomains,
  parseEgressPolicy,
  SANDBOX_POLICY_MAX_REQUESTED_DOMAINS,
} from "@app/types/sandbox/egress_policy";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";

const INVALIDATION_TIMEOUT_MS = 5_000;
const SANDBOX_POLICY_MAX_DOMAINS = 100;

// Policy layout: everything lives under a per-workspace prefix so relocation
// and scrubbing are prefix operations.
//
//   w/{wId}/sandbox-egress-policy.json  workspace-wide policy
//   w/{wId}/sandboxes/{ownerId}.json owner policy; ownerId is a conversation
//                                    sId (conversation sandboxes) or a space
//                                    sId (pod sandboxes)
//
// Owner files are keyed by the sandbox's stable owner, not the ephemeral
// provider id, so they survive sandbox destroy/recreate cycles.
function getWorkspacePolicyPath(auth: Authenticator): string {
  return `w/${auth.getNonNullableWorkspace().sId}/sandbox-egress-policy.json`;
}

function getOwnerPolicyPath(auth: Authenticator, ownerId: string): string {
  return `w/${auth.getNonNullableWorkspace().sId}/sandboxes/${ownerId}.json`;
}

function getPolicyBucket() {
  return getBucketInstance(config.getEgressPolicyBucket());
}

// Pod ids that have their own egress policy file. Pods store policies at
// w/{wId}/sandboxes/{podId}.json; the `vlt_` prefix (spaces' sId prefix)
// isolates Pod (space) policies from the conversation-owned files sharing that
// directory. One prefix list instead of a read per Pod, so the admin surfaces
// scale with the Pods that actually diverged from the workspace baseline, not
// the total Pod count.
export async function listPodIdsWithEgressPolicy(
  auth: Authenticator
): Promise<Result<string[], Error>> {
  const prefix = `w/${auth.getNonNullableWorkspace().sId}/sandboxes/vlt_`;
  try {
    const { files } = await getPolicyBucket().getAllFilesByPrefix({ prefix });
    return new Ok(
      files.flatMap((file) => {
        const match = file.name.match(/\/sandboxes\/(vlt_[^/]+)\.json$/);
        return match ? [match[1]] : [];
      })
    );
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

// Reads a policy file, distinguishing "absent" (Ok(null)) from real errors so
// callers can fall back across layouts without masking failures.
async function fetchPolicyAtPath(
  filePath: string
): Promise<Result<EgressPolicy | null, Error>> {
  try {
    const content = await getPolicyBucket().fetchFileContent(filePath);
    const parsed = parseEgressPolicy(JSON.parse(content));

    if (parsed.isErr()) {
      return parsed;
    }

    return new Ok(parsed.value);
  } catch (error) {
    if (isGCSNotFoundError(error)) {
      return new Ok(null);
    }

    return new Err(normalizeError(error));
  }
}

export async function readWorkspacePolicy(
  auth: Authenticator
): Promise<Result<EgressPolicy, Error>> {
  const current = await fetchPolicyAtPath(getWorkspacePolicyPath(auth));
  if (current.isErr()) {
    return current;
  }

  return new Ok(current.value ?? EMPTY_EGRESS_POLICY);
}

export async function writeWorkspacePolicy(
  auth: Authenticator,
  { policy }: { policy: EgressPolicy }
): Promise<Result<EgressPolicy, Error>> {
  // Mirror writeOwnerPolicy: a caller replacing the allowlist without stating
  // the requestedDomains section must not wipe pending requests. No producer
  // writes workspace requests yet, so this preserves nothing today — but it
  // keeps both write paths symmetric so a future workspace-request flow does
  // not have to re-discover this footgun.
  let effectivePolicy = policy;
  if (policy.requestedDomains === undefined) {
    const current = await readWorkspacePolicy(auth);
    if (current.isErr()) {
      return current;
    }
    effectivePolicy = {
      ...policy,
      requestedDomains: current.value.requestedDomains,
    };
  }

  const normalizedPolicy = normalizeEgressPolicy(effectivePolicy);

  if (normalizedPolicy.isErr()) {
    return normalizedPolicy;
  }

  try {
    await getPolicyBucket().uploadRawContentToBucket({
      content: JSON.stringify(normalizedPolicy.value),
      contentType: "application/json",
      filePath: getWorkspacePolicyPath(auth),
    });
  } catch (error) {
    return new Err(normalizeError(error));
  }

  await invalidateWorkspacePolicyCache(auth);

  return new Ok(normalizedPolicy.value);
}

export async function deleteWorkspacePolicy(
  auth: Authenticator
): Promise<Result<void, Error>> {
  try {
    await getPolicyBucket().delete(getWorkspacePolicyPath(auth), {
      ignoreNotFound: true,
    });

    await invalidateWorkspacePolicyCache(auth);

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export function parseExactEgressDomain(value: string): Result<string, Error> {
  if (value.trim().startsWith("*.")) {
    return new Err(
      new Error(
        `${value}: Wildcard domains are not supported for sandbox egress requests.`
      )
    );
  }

  const normalized = normalizeEgressPolicyDomain(value);
  if (normalized.isErr()) {
    return new Err(new Error(`${value}: ${normalized.error.message}`));
  }

  return new Ok(normalized.value);
}

export async function readOwnerPolicy(
  auth: Authenticator,
  ownerId: string
): Promise<Result<EgressPolicy, Error>> {
  const policy = await fetchPolicyAtPath(getOwnerPolicyPath(auth, ownerId));
  if (policy.isErr()) {
    return policy;
  }

  return new Ok(policy.value ?? EMPTY_EGRESS_POLICY);
}

// Replaces an owner's whole allowlist. The admin-facing write for pod
// (Shared Computer) policies: like the workspace policy — and unlike the
// agent tool's exact-domain appends — wildcard entries such as
// `*.github.com` are supported, and there is no domain-count cap (also
// mirroring the workspace policy). Tool approvals never touch pod files
// (they land in the conversation's own policy file), so an over-cap admin
// list does not interfere with addOwnerPolicyDomain's cap check.
export async function writeOwnerPolicy(
  auth: Authenticator,
  { ownerId, policy }: { ownerId: string; policy: EgressPolicy }
): Promise<Result<EgressPolicy, Error>> {
  // Callers replacing the allowlist (the admin settings PUT) don't carry the
  // requestedDomains section — preserve the file's pending requests unless
  // the caller states them explicitly. Combined with normalizeEgressPolicy
  // dropping requests whose domain is now allowed, this makes "append the
  // domain and PUT" an atomic approve: one write moves it from requested to
  // allowed.
  let effectivePolicy = policy;
  if (policy.requestedDomains === undefined) {
    const current = await readOwnerPolicy(auth, ownerId);
    if (current.isErr()) {
      return current;
    }
    effectivePolicy = {
      ...policy,
      requestedDomains: current.value.requestedDomains,
    };
  }

  const normalizedPolicyRes = normalizeEgressPolicy(effectivePolicy);

  if (normalizedPolicyRes.isErr()) {
    return normalizedPolicyRes;
  }

  try {
    await getPolicyBucket().uploadRawContentToBucket({
      content: JSON.stringify(normalizedPolicyRes.value),
      contentType: "application/json",
      filePath: getOwnerPolicyPath(auth, ownerId),
    });

    await invalidateOwnerPolicyCache(auth, ownerId);

    return new Ok(normalizedPolicyRes.value);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function addOwnerPolicyDomain(
  auth: Authenticator,
  { ownerId, domain }: { ownerId: string; domain: string }
): Promise<
  Result<{ policy: EgressPolicy; addedDomain: string | null }, Error>
> {
  const parsedDomain = parseExactEgressDomain(domain);
  if (parsedDomain.isErr()) {
    return new Err(parsedDomain.error);
  }

  const currentPolicy = await readOwnerPolicy(auth, ownerId);
  if (currentPolicy.isErr()) {
    return new Err(currentPolicy.error);
  }

  // Exact-string membership on purpose. Pod files mix writers (admin-managed
  // entries, possibly wildcards, plus tool appends from the Pod's
  // conversations), so a domain covered by an admin wildcard still re-prompts
  // for approval and lands as a redundant exact entry. Accepted: it matches
  // the existing behavior for workspace-wildcard-covered domains in normal
  // conversations, and a redundant exact entry is harmless.
  const alreadyAllowed = currentPolicy.value.allowedDomains.includes(
    parsedDomain.value
  );
  const addedDomain = alreadyAllowed ? null : parsedDomain.value;
  const allowedDomains = alreadyAllowed
    ? currentPolicy.value.allowedDomains
    : [...currentPolicy.value.allowedDomains, parsedDomain.value];

  if (allowedDomains.length > SANDBOX_POLICY_MAX_DOMAINS) {
    return new Err(
      new Error(
        `Sandbox egress policy cannot exceed ${SANDBOX_POLICY_MAX_DOMAINS} domains.`
      )
    );
  }

  // Write through writeOwnerPolicy so the file's pending requestedDomains are
  // preserved (and a now-allowed request is resolved) rather than overwritten
  // with an allowlist-only policy.
  const written = await writeOwnerPolicy(auth, {
    ownerId,
    policy: { allowedDomains },
  });
  if (written.isErr()) {
    return written;
  }

  return new Ok({ policy: written.value, addedDomain });
}

// Workspace-scoped counterpart of addOwnerPolicyDomain: exact-domain append
// with the same dedupe and cap, but on the workspace policy file.
export async function addWorkspacePolicyDomain(
  auth: Authenticator,
  { domain }: { domain: string }
): Promise<
  Result<{ policy: EgressPolicy; addedDomain: string | null }, Error>
> {
  const parsedDomain = parseExactEgressDomain(domain);
  if (parsedDomain.isErr()) {
    return new Err(parsedDomain.error);
  }

  const currentPolicy = await readWorkspacePolicy(auth);
  if (currentPolicy.isErr()) {
    return new Err(currentPolicy.error);
  }

  const alreadyAllowed = currentPolicy.value.allowedDomains.includes(
    parsedDomain.value
  );
  const addedDomain = alreadyAllowed ? null : parsedDomain.value;
  const allowedDomains = alreadyAllowed
    ? currentPolicy.value.allowedDomains
    : [...currentPolicy.value.allowedDomains, parsedDomain.value];

  if (allowedDomains.length > SANDBOX_POLICY_MAX_DOMAINS) {
    return new Err(
      new Error(
        `Sandbox egress policy cannot exceed ${SANDBOX_POLICY_MAX_DOMAINS} domains.`
      )
    );
  }

  const written = await writeWorkspacePolicy(auth, {
    policy: { allowedDomains },
  });
  if (written.isErr()) {
    return new Err(written.error);
  }

  return new Ok({ policy: written.value, addedDomain });
}

// Removes an exact domain from a pod's allowlist. No cap check (removal only
// shrinks the list); removedDomain is null when the domain was not present.
export async function removeOwnerPolicyDomain(
  auth: Authenticator,
  { ownerId, domain }: { ownerId: string; domain: string }
): Promise<
  Result<{ policy: EgressPolicy; removedDomain: string | null }, Error>
> {
  const currentPolicy = await readOwnerPolicy(auth, ownerId);
  if (currentPolicy.isErr()) {
    return new Err(currentPolicy.error);
  }

  // Match the stored entry as-is: the domain comes straight from the existing
  // allowlist, so there's nothing to validate or normalize — and matching as-is
  // is what lets wildcards (`*.example.com`) be removed, which the exact-domain
  // add parser rejects. A domain that isn't present is a no-op: never create an
  // owner policy file for it, which would make an unconfigured Pod look
  // configured to listPodIdsWithEgressPolicy (file-existence based).
  if (!currentPolicy.value.allowedDomains.includes(domain)) {
    return new Ok({ policy: currentPolicy.value, removedDomain: null });
  }

  const allowedDomains = currentPolicy.value.allowedDomains.filter(
    (allowed) => allowed !== domain
  );

  const written = await writeOwnerPolicy(auth, {
    ownerId,
    policy: { allowedDomains },
  });
  if (written.isErr()) {
    return new Err(written.error);
  }

  return new Ok({ policy: written.value, removedDomain: domain });
}

// Workspace-scoped counterpart of removeOwnerPolicyDomain.
export async function removeWorkspacePolicyDomain(
  auth: Authenticator,
  { domain }: { domain: string }
): Promise<
  Result<{ policy: EgressPolicy; removedDomain: string | null }, Error>
> {
  const currentPolicy = await readWorkspacePolicy(auth);
  if (currentPolicy.isErr()) {
    return new Err(currentPolicy.error);
  }

  // Match the stored entry as-is (see removeOwnerPolicyDomain): the domain comes
  // from the existing allowlist, so there's nothing to normalize, and matching
  // as-is lets wildcards be removed. Absent domain is a no-op.
  if (!currentPolicy.value.allowedDomains.includes(domain)) {
    return new Ok({ policy: currentPolicy.value, removedDomain: null });
  }

  const allowedDomains = currentPolicy.value.allowedDomains.filter(
    (allowed) => allowed !== domain
  );

  const written = await writeWorkspacePolicy(auth, {
    policy: { allowedDomains },
  });
  if (written.isErr()) {
    return new Err(written.error);
  }

  return new Ok({ policy: written.value, removedDomain: domain });
}

export type RequestOwnerPolicyDomainOutcome =
  | "requested"
  | "already_allowed"
  | "already_requested";

export type PolicyDomainRequestOutcome = {
  domain: string;
  outcome: RequestOwnerPolicyDomainOutcome;
};

// The read/write pair a scope's request/dismiss helpers operate on, plus a
// label for the cap error. Pod requests use the owner file, workspace
// requests the workspace file — the logic is otherwise identical.
type PolicyDomainScope = {
  read: () => Promise<Result<EgressPolicy, Error>>;
  // A layer the sandbox also honors (the workspace file, for a Pod). Read
  // only to skip redundant requests; requests always land on this scope.
  readInherited: (() => Promise<Result<EgressPolicy, Error>>) | null;
  write: (policy: EgressPolicy) => Promise<Result<EgressPolicy, Error>>;
  label: string;
};

// Exact-string membership on the normalized pattern: a domain covered by an
// existing wildcard still records a request and surfaces to the admin, who
// resolves it by approving (redundant entry) or dismissing. `allowed` spans
// this scope and any inherited layer, so a Pod request for a domain the
// workspace already allows reports already_allowed instead of duplicating it.
function classifyDomainRequest(
  domain: string,
  { allowed, pending }: { allowed: Set<string>; pending: Set<string> }
): RequestOwnerPolicyDomainOutcome {
  if (allowed.has(domain)) {
    return "already_allowed";
  }
  if (pending.has(domain)) {
    return "already_requested";
  }
  return "requested";
}

// Records domain requests in the scope's requestedDomains section for admin
// review — never grants anything. One read and at most one write for the
// whole batch. Wildcards are accepted (unlike the conversation add): every
// request is reviewed by an admin before it grants, the same trust boundary
// as the admin settings PUT, which also allows them. The batch is rejected
// whole when it would push the pending section past the cap.
async function requestPolicyDomains(
  scope: PolicyDomainScope,
  { domains }: { domains: string[] }
): Promise<
  Result<
    { policy: EgressPolicy; outcomes: PolicyDomainRequestOutcome[] },
    Error
  >
> {
  const parsedDomains = normalizeEgressPolicyDomains(domains);
  if (parsedDomains.isErr()) {
    return new Err(parsedDomains.error);
  }

  // Two reads at most: this scope's file and its inherited layer.
  const [currentPolicy, inheritedPolicy] = await Promise.all([
    scope.read(),
    scope.readInherited ? scope.readInherited() : Promise.resolve(null),
  ]);
  if (currentPolicy.isErr()) {
    return new Err(currentPolicy.error);
  }
  let inheritedAllowedDomains: string[] = [];
  if (inheritedPolicy) {
    if (inheritedPolicy.isErr()) {
      return new Err(inheritedPolicy.error);
    }
    inheritedAllowedDomains = inheritedPolicy.value.allowedDomains;
  }

  const pending = currentPolicy.value.requestedDomains ?? [];
  const membership = {
    allowed: new Set([
      ...currentPolicy.value.allowedDomains,
      ...inheritedAllowedDomains,
    ]),
    pending: new Set(pending.map((request) => request.domain)),
  };
  const outcomes = parsedDomains.value.map((domain) => ({
    domain,
    outcome: classifyDomainRequest(domain, membership),
  }));

  const newDomains = outcomes
    .filter(({ outcome }) => outcome === "requested")
    .map(({ domain }) => domain);
  if (newDomains.length === 0) {
    return new Ok({ policy: currentPolicy.value, outcomes });
  }
  if (
    pending.length + newDomains.length >
    SANDBOX_POLICY_MAX_REQUESTED_DOMAINS
  ) {
    return new Err(
      new Error(
        `This ${scope.label} has ${pending.length} pending domain requests and can hold at most ${SANDBOX_POLICY_MAX_REQUESTED_DOMAINS}. Ask an admin to review them before requesting more.`
      )
    );
  }

  const requestedAtMs = Date.now();
  const written = await scope.write({
    allowedDomains: currentPolicy.value.allowedDomains,
    requestedDomains: [
      ...pending,
      ...newDomains.map((domain) => ({ domain, requestedAtMs })),
    ],
  });
  if (written.isErr()) {
    return written;
  }

  return new Ok({ policy: written.value, outcomes });
}

async function requestPolicyDomain(
  scope: PolicyDomainScope,
  { domain }: { domain: string }
): Promise<
  Result<
    { policy: EgressPolicy; outcome: RequestOwnerPolicyDomainOutcome },
    Error
  >
> {
  const result = await requestPolicyDomains(scope, { domains: [domain] });
  if (result.isErr()) {
    return result;
  }
  const [first] = result.value.outcomes;
  assert(first, "One domain in, one outcome out.");
  return new Ok({ policy: result.value.policy, outcome: first.outcome });
}

async function dismissRequestedPolicyDomain(
  scope: PolicyDomainScope,
  domain: string
): Promise<Result<EgressPolicy, Error>> {
  const parsedDomain = normalizeEgressPolicyDomain(domain);
  if (parsedDomain.isErr()) {
    return new Err(parsedDomain.error);
  }

  const currentPolicy = await scope.read();
  if (currentPolicy.isErr()) {
    return currentPolicy;
  }

  const pending = currentPolicy.value.requestedDomains ?? [];
  const remaining = pending.filter(
    (request) => request.domain !== parsedDomain.value
  );
  if (remaining.length === pending.length) {
    return new Ok(currentPolicy.value);
  }

  return scope.write({
    allowedDomains: currentPolicy.value.allowedDomains,
    requestedDomains: remaining,
  });
}

function ownerScope(auth: Authenticator, ownerId: string): PolicyDomainScope {
  return {
    read: () => readOwnerPolicy(auth, ownerId),
    readInherited: () => readWorkspacePolicy(auth),
    write: (policy) => writeOwnerPolicy(auth, { ownerId, policy }),
    label: "Pod",
  };
}

function workspaceScope(auth: Authenticator): PolicyDomainScope {
  return {
    read: () => readWorkspacePolicy(auth),
    readInherited: null,
    write: (policy) => writeWorkspacePolicy(auth, { policy }),
    label: "workspace",
  };
}

// Records a pod-scoped domain request (in the owner file's requestedDomains
// section) for admin review — never grants.
export async function requestOwnerPolicyDomain(
  auth: Authenticator,
  { ownerId, domain }: { ownerId: string; domain: string }
): Promise<
  Result<
    { policy: EgressPolicy; outcome: RequestOwnerPolicyDomainOutcome },
    Error
  >
> {
  return requestPolicyDomain(ownerScope(auth, ownerId), { domain });
}

// Records a workspace-scoped domain request (in the workspace policy file's
// requestedDomains section) for admin review — never grants.
export async function requestWorkspacePolicyDomain(
  auth: Authenticator,
  { domain }: { domain: string }
): Promise<
  Result<
    { policy: EgressPolicy; outcome: RequestOwnerPolicyDomainOutcome },
    Error
  >
> {
  return requestPolicyDomain(workspaceScope(auth), { domain });
}

// Batch form of requestOwnerPolicyDomain: one read and at most one write for
// every domain a publish declares.
export async function requestOwnerPolicyDomains(
  auth: Authenticator,
  { ownerId, domains }: { ownerId: string; domains: string[] }
): Promise<
  Result<
    { policy: EgressPolicy; outcomes: PolicyDomainRequestOutcome[] },
    Error
  >
> {
  return requestPolicyDomains(ownerScope(auth, ownerId), { domains });
}

// Batch form of requestWorkspacePolicyDomain.
export async function requestWorkspacePolicyDomains(
  auth: Authenticator,
  { domains }: { domains: string[] }
): Promise<
  Result<
    { policy: EgressPolicy; outcomes: PolicyDomainRequestOutcome[] },
    Error
  >
> {
  return requestPolicyDomains(workspaceScope(auth), { domains });
}

// Removes a pending request without granting it. Approval needs no
// dedicated helper: appending the domain to allowedDomains and writing the
// policy resolves the request atomically (see writeOwnerPolicy).
export async function dismissRequestedOwnerPolicyDomain(
  auth: Authenticator,
  { ownerId, domain }: { ownerId: string; domain: string }
): Promise<Result<EgressPolicy, Error>> {
  return dismissRequestedPolicyDomain(ownerScope(auth, ownerId), domain);
}

export async function dismissRequestedWorkspacePolicyDomain(
  auth: Authenticator,
  { domain }: { domain: string }
): Promise<Result<EgressPolicy, Error>> {
  return dismissRequestedPolicyDomain(workspaceScope(auth), domain);
}

// Owner files outlive individual sandboxes by design; they are deleted when
// their owner is (conversation destruction, pod space deletion), not when a
// sandbox is destroyed.
export async function deleteOwnerPolicy(
  auth: Authenticator,
  ownerId: string
): Promise<Result<void, Error>> {
  try {
    await getPolicyBucket().delete(getOwnerPolicyPath(auth, ownerId), {
      ignoreNotFound: true,
    });

    await invalidateOwnerPolicyCache(auth, ownerId);

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

// Best-effort proxy cache bust, bounded by INVALIDATION_TIMEOUT_MS. Never
// throws (failures are logged); awaited at call sites so no promise escapes.
async function invalidateWorkspacePolicyCache(
  auth: Authenticator
): Promise<void> {
  try {
    const baseUrl = config.getEgressProxyInternalUrl();
    if (!baseUrl) {
      return;
    }

    const workspace = auth.getNonNullableWorkspace();
    const token = mintEgressInvalidationJwt({ workspaceId: workspace.sId });
    const url = `${baseUrl.replace(/\/+$/, "")}/invalidate-policy`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(INVALIDATION_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn(
        { statusCode: response.status, workspaceId: workspace.sId },
        "Egress proxy cache invalidation failed"
      );
    }
  } catch (error) {
    logger.warn(
      { error: normalizeError(error) },
      "Egress proxy cache invalidation error"
    );
  }
}

// Same contract as invalidateWorkspacePolicyCache: never throws, bounded.
async function invalidateOwnerPolicyCache(
  auth: Authenticator,
  ownerId: string
): Promise<void> {
  try {
    const baseUrl = config.getEgressProxyInternalUrl();
    if (!baseUrl) {
      return;
    }

    // The proxy's owner cache key needs both the workspace and the owner.
    const token = mintEgressInvalidationJwt({
      workspaceId: auth.getNonNullableWorkspace().sId,
      ownerId,
    });
    const url = `${baseUrl.replace(/\/+$/, "")}/invalidate-policy`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(INVALIDATION_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn(
        { statusCode: response.status, ownerId },
        "Egress proxy cache invalidation failed"
      );
    }
  } catch (error) {
    logger.warn(
      { error: normalizeError(error), ownerId },
      "Egress proxy cache invalidation error"
    );
  }
}
