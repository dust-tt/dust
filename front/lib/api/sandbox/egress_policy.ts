import config from "@app/lib/api/config";
import { getBucketInstance } from "@app/lib/file_storage";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type EgressPolicyAction = "allow" | "deny";

export interface EgressPolicyRule {
  action: EgressPolicyAction;
  domain: string;
}

export interface EgressPolicy {
  defaultAction: EgressPolicyAction;
  rules: EgressPolicyRule[];
}

export const EMPTY_EGRESS_POLICY: EgressPolicy = {
  defaultAction: "deny",
  rules: [],
};

function getSandboxPolicyPath(providerId: string): string {
  return `sandboxes/${providerId}.json`;
}

function getPolicyBucket() {
  return getBucketInstance(config.getEgressPolicyBucket());
}

export async function writeSandboxPolicy(
  providerId: string,
  policy: EgressPolicy
): Promise<Result<void, Error>> {
  try {
    await getPolicyBucket().uploadRawContentToBucket({
      content: JSON.stringify(policy),
      contentType: "application/json",
      filePath: getSandboxPolicyPath(providerId),
    });

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function writeEmptySandboxPolicy(
  providerId: string
): Promise<Result<void, Error>> {
  return writeSandboxPolicy(providerId, EMPTY_EGRESS_POLICY);
}

export async function deleteSandboxPolicy(
  providerId: string
): Promise<Result<void, Error>> {
  try {
    await getPolicyBucket().delete(getSandboxPolicyPath(providerId), {
      ignoreNotFound: true,
    });

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
