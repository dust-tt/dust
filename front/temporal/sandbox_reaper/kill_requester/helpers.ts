export function makeSandboxKillRequesterWorkflowId({
  baseImage,
  version,
}: {
  baseImage: string;
  version?: string;
}): string {
  return `sandbox-kill-requester-${baseImage}-${version ?? "all"}`;
}
