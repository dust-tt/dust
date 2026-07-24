import { createHash } from "node:crypto";

export function makeSandboxKillRequesterWorkflowId({
  baseImage,
  version,
}: {
  baseImage: string;
  version?: string;
}): string {
  const inputHash = createHash("sha256")
    .update(JSON.stringify([baseImage, version ?? null]))
    .digest()
    .subarray(0, 16)
    .toString("base64url");

  return `sandbox-kill-requester-${inputHash}`;
}
