import { config as regionConfig } from "@app/lib/api/regions/config";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { getStatsDClient } from "@app/lib/utils/statsd";

interface MetricContext {
  workspaceId: string;
  region?: string;
}

function buildTags(ctx: MetricContext): string[] {
  return [
    `workspace_id:${ctx.workspaceId}`,
    `region:${ctx.region ?? regionConfig.getCurrentRegion()}`,
  ];
}

export function recordLifecycleOperation(
  operation: "create" | "wake" | "sleep" | "destroy",
  ctx: MetricContext
): void {
  getStatsDClient().increment(
    `sandbox.lifecycle.${operation}`,
    1,
    buildTags(ctx)
  );
}

export function recordStateDuration(
  previousStatus: SandboxStatus,
  durationMs: number,
  ctx: MetricContext
): void {
  getStatsDClient().distribution("sandbox.lifecycle.duration", durationMs, [
    ...buildTags(ctx),
    `status:${previousStatus}`,
  ]);
}

export function recordToolDuration(
  tool: string,
  durationMs: number,
  ctx: MetricContext,
  status: "success" | "error" = "success"
): void {
  getStatsDClient().distribution("sandbox.tools.duration", durationMs, [
    ...buildTags(ctx),
    `tool:${tool}`,
    `status:${status}`,
  ]);
}
