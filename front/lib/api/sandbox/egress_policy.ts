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
  parseEgressPolicy,
} from "@app/types/sandbox/egress_policy";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

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
  const policy: EgressPolicy = {
    allowedDomains: alreadyAllowed
      ? currentPolicy.value.allowedDomains
      : [...currentPolicy.value.allowedDomains, parsedDomain.value],
  };

  if (policy.allowedDomains.length > SANDBOX_POLICY_MAX_DOMAINS) {
    return new Err(
      new Error(
        `Sandbox egress policy cannot exceed ${SANDBOX_POLICY_MAX_DOMAINS} domains.`
      )
    );
  }

  try {
    // Last-writer-wins is acceptable here because sandbox policy updates are user-approved and rare.
    await getPolicyBucket().uploadRawContentToBucket({
      content: JSON.stringify(policy),
      contentType: "application/json",
      filePath: getOwnerPolicyPath(auth, ownerId),
    });

    await invalidateOwnerPolicyCache(auth, ownerId);

    return new Ok({ policy, addedDomain });
  } catch (error) {
    return new Err(normalizeError(error));
  }
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
  const parsedDomain = parseExactEgressDomain(domain);
  if (parsedDomain.isErr()) {
    return new Err(parsedDomain.error);
  }

  const currentPolicy = await readOwnerPolicy(auth, ownerId);
  if (currentPolicy.isErr()) {
    return new Err(currentPolicy.error);
  }

  const wasPresent = currentPolicy.value.allowedDomains.includes(
    parsedDomain.value
  );
  const removedDomain = wasPresent ? parsedDomain.value : null;
  const allowedDomains = currentPolicy.value.allowedDomains.filter(
    (allowed) => allowed !== parsedDomain.value
  );

  const written = await writeOwnerPolicy(auth, {
    ownerId,
    policy: { allowedDomains },
  });
  if (written.isErr()) {
    return new Err(written.error);
  }

  return new Ok({ policy: written.value, removedDomain });
}

// Workspace-scoped counterpart of removeOwnerPolicyDomain.
export async function removeWorkspacePolicyDomain(
  auth: Authenticator,
  { domain }: { domain: string }
): Promise<
  Result<{ policy: EgressPolicy; removedDomain: string | null }, Error>
> {
  const parsedDomain = parseExactEgressDomain(domain);
  if (parsedDomain.isErr()) {
    return new Err(parsedDomain.error);
  }

  const currentPolicy = await readWorkspacePolicy(auth);
  if (currentPolicy.isErr()) {
    return new Err(currentPolicy.error);
  }

  const wasPresent = currentPolicy.value.allowedDomains.includes(
    parsedDomain.value
  );
  const removedDomain = wasPresent ? parsedDomain.value : null;
  const allowedDomains = currentPolicy.value.allowedDomains.filter(
    (allowed) => allowed !== parsedDomain.value
  );

  const written = await writeWorkspacePolicy(auth, {
    policy: { allowedDomains },
  });
  if (written.isErr()) {
    return new Err(written.error);
  }

  return new Ok({ policy: written.value, removedDomain });
}

// Caps the pending-request section: the proxy re-reads this file on every
// cache miss, so an agent must not be able to grow it unboundedly.
const SANDBOX_POLICY_MAX_REQUESTED_DOMAINS = 50;

export type RequestOwnerPolicyDomainOutcome =
  | "requested"
  | "already_allowed"
  | "already_requested";

// Records an agent's pod-scoped domain request in the policy file's
// requestedDomains section for admin review — never grants anything. Exact
// domains only (same rule as tool approvals: no agent-supplied wildcards).
// The read/write pair a scope's request/dismiss helpers operate on, plus a
// label for the cap error. Pod requests use the owner file, workspace
// requests the workspace file — the logic is otherwise identical.
type PolicyDomainScope = {
  read: () => Promise<Result<EgressPolicy, Error>>;
  write: (policy: EgressPolicy) => Promise<Result<EgressPolicy, Error>>;
  label: string;
};

async function requestPolicyDomain(
  scope: PolicyDomainScope,
  { domain }: { domain: string }
): Promise<
  Result<
    { policy: EgressPolicy; outcome: RequestOwnerPolicyDomainOutcome },
    Error
  >
> {
  // Wildcards are accepted (unlike the conversation add): every request is
  // reviewed by an admin before it grants, the same trust boundary as the
  // admin settings PUT, which also allows them.
  const parsedDomain = normalizeEgressPolicyDomain(domain);
  if (parsedDomain.isErr()) {
    return new Err(parsedDomain.error);
  }

  const currentPolicy = await scope.read();
  if (currentPolicy.isErr()) {
    return new Err(currentPolicy.error);
  }

  // Exact-string membership on the normalized pattern: a domain covered by
  // an existing wildcard still records a request and surfaces to the admin,
  // who resolves it by approving (redundant entry) or dismissing.
  if (currentPolicy.value.allowedDomains.includes(parsedDomain.value)) {
    return new Ok({ policy: currentPolicy.value, outcome: "already_allowed" });
  }
  const pending = currentPolicy.value.requestedDomains ?? [];
  if (pending.some((request) => request.domain === parsedDomain.value)) {
    return new Ok({
      policy: currentPolicy.value,
      outcome: "already_requested",
    });
  }
  if (pending.length >= SANDBOX_POLICY_MAX_REQUESTED_DOMAINS) {
    return new Err(
      new Error(
        `This ${scope.label} already has ${SANDBOX_POLICY_MAX_REQUESTED_DOMAINS} pending domain requests. Ask an admin to review them before requesting more.`
      )
    );
  }

  const written = await scope.write({
    allowedDomains: currentPolicy.value.allowedDomains,
    requestedDomains: [
      ...pending,
      {
        domain: parsedDomain.value,
        requestedAtMs: Date.now(),
      },
    ],
  });
  if (written.isErr()) {
    return written;
  }

  return new Ok({ policy: written.value, outcome: "requested" });
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
    write: (policy) => writeOwnerPolicy(auth, { ownerId, policy }),
    label: "Pod",
  };
}

function workspaceScope(auth: Authenticator): PolicyDomainScope {
  return {
    read: () => readWorkspacePolicy(auth),
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
