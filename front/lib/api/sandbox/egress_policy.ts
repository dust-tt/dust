import config from "@app/lib/api/config";
import { getBucketInstance } from "@app/lib/file_storage";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import {
  EMPTY_EGRESS_POLICY,
  normalizeEgressPolicy,
  parseEgressPolicy,
} from "@app/types/sandbox/egress_policy";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function getWorkspacePolicyPath(workspaceId: string): string {
  return `workspaces/${workspaceId}.json`;
}

function getPolicyBucket() {
  return getBucketInstance(config.getEgressPolicyBucket());
}

export async function readWorkspacePolicy(
  workspaceId: string
): Promise<Result<EgressPolicy, Error>> {
  try {
    const content = await getPolicyBucket().fetchFileContent(
      getWorkspacePolicyPath(workspaceId)
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

export async function writeWorkspacePolicy({
  workspaceId,
  policy,
}: {
  workspaceId: string;
  policy: EgressPolicy;
}): Promise<Result<EgressPolicy, Error>> {
  const normalizedPolicy = normalizeEgressPolicy(policy);

  if (normalizedPolicy.isErr()) {
    return normalizedPolicy;
  }

  try {
    await getPolicyBucket().uploadRawContentToBucket({
      content: JSON.stringify(normalizedPolicy.value),
      contentType: "application/json",
      filePath: getWorkspacePolicyPath(workspaceId),
    });

    return new Ok(normalizedPolicy.value);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function deleteWorkspacePolicy(
  workspaceId: string
): Promise<Result<void, Error>> {
  try {
    await getPolicyBucket().delete(getWorkspacePolicyPath(workspaceId), {
      ignoreNotFound: true,
    });

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
