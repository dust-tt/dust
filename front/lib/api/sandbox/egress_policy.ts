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
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const INVALIDATION_TIMEOUT_MS = 5_000;
const SANDBOX_POLICY_MAX_DOMAINS = 100;

function getWorkspacePolicyPath(auth: Authenticator): string {
  return `workspaces/${auth.getNonNullableWorkspace().sId}.json`;
}

function getSandboxPolicyPath(sandboxProviderId: string): string {
  return `sandboxes/${sandboxProviderId}.json`;
}

function getPolicyBucket() {
  return getBucketInstance(config.getEgressPolicyBucket());
}

export async function readWorkspacePolicy(
  auth: Authenticator
): Promise<Result<EgressPolicy, Error>> {
  try {
    const content = await getPolicyBucket().fetchFileContent(
      getWorkspacePolicyPath(auth)
    );
    const parsed = parseEgressPolicy(JSON.parse(content));

    if (parsed.isErr()) {
      return parsed;
    }

    return new Ok(parsed.value);
  } catch (error) {
    if (isGCSNotFoundError(error)) {
      return new Ok(EMPTY_EGRESS_POLICY);
    }

    return new Err(normalizeError(error));
  }
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

    void invalidateWorkspacePolicyCache(auth);

    return new Ok(normalizedPolicy.value);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function deleteWorkspacePolicy(
  auth: Authenticator
): Promise<Result<void, Error>> {
  try {
    await getPolicyBucket().delete(getWorkspacePolicyPath(auth), {
      ignoreNotFound: true,
    });

    void invalidateWorkspacePolicyCache(auth);

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

export async function readSandboxPolicy(
  sandboxProviderId: string
): Promise<Result<EgressPolicy, Error>> {
  try {
    const content = await getPolicyBucket().fetchFileContent(
      getSandboxPolicyPath(sandboxProviderId)
    );
    const parsed = parseEgressPolicy(JSON.parse(content));

    if (parsed.isErr()) {
      return parsed;
    }

    return new Ok(parsed.value);
  } catch (error) {
    if (isGCSNotFoundError(error)) {
      return new Ok(EMPTY_EGRESS_POLICY);
    }

    return new Err(normalizeError(error));
  }
}

export async function addSandboxPolicyDomain(
  _auth: Authenticator,
  { sandboxProviderId, domain }: { sandboxProviderId: string; domain: string }
): Promise<
  Result<{ policy: EgressPolicy; addedDomain: string | null }, Error>
> {
  const parsedDomain = parseExactEgressDomain(domain);
  if (parsedDomain.isErr()) {
    return new Err(parsedDomain.error);
  }

  const currentPolicy = await readSandboxPolicy(sandboxProviderId);
  if (currentPolicy.isErr()) {
    return new Err(currentPolicy.error);
  }

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
      filePath: getSandboxPolicyPath(sandboxProviderId),
    });

    void invalidateSandboxPolicyCache(sandboxProviderId);

    return new Ok({ policy, addedDomain });
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function deleteSandboxPolicy(
  sandboxProviderId: string
): Promise<Result<void, Error>> {
  try {
    await getPolicyBucket().delete(getSandboxPolicyPath(sandboxProviderId), {
      ignoreNotFound: true,
    });

    void invalidateSandboxPolicyCache(sandboxProviderId);

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

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

async function invalidateSandboxPolicyCache(
  sandboxProviderId: string
): Promise<void> {
  try {
    const baseUrl = config.getEgressProxyInternalUrl();
    if (!baseUrl) {
      return;
    }

    const token = mintEgressInvalidationJwt({ sandboxId: sandboxProviderId });
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
        { statusCode: response.status, sandboxProviderId },
        "Egress proxy cache invalidation failed"
      );
    }
  } catch (error) {
    logger.warn(
      { error: normalizeError(error), sandboxProviderId },
      "Egress proxy cache invalidation error"
    );
  }
}
