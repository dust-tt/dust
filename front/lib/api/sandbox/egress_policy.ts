import config from "@app/lib/api/config";
import { mintEgressJwt } from "@app/lib/api/sandbox/egress";
import type { Authenticator } from "@app/lib/auth";
import { getBucketInstance } from "@app/lib/file_storage";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import logger from "@app/logger/logger";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import {
  EMPTY_EGRESS_POLICY,
  normalizeEgressPolicy,
  parseEgressPolicy,
} from "@app/types/sandbox/egress_policy";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const INVALIDATION_TIMEOUT_MS = 5_000;

function getWorkspacePolicyPath(auth: Authenticator): string {
  return `workspaces/${auth.getNonNullableWorkspace().sId}.json`;
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

async function invalidateWorkspacePolicyCache(
  auth: Authenticator
): Promise<void> {
  const baseUrl = config.getEgressProxyInternalUrl();
  if (!baseUrl) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();
  const token = mintEgressJwt("invalidate-cache", workspace.sId);

  try {
    const response = await fetch(`${baseUrl}/invalidate-policy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ keys: [`w:${workspace.sId}`] }),
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
      { error: normalizeError(error), workspaceId: workspace.sId },
      "Egress proxy cache invalidation error"
    );
  }
}
