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
  const normalizedPolicy = normalizeEgressPolicy(policy);

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
  const normalizedPolicyRes = normalizeEgressPolicy(policy);

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
