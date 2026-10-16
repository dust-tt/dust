import { config as regionConfig } from "@app/lib/api/regions/config";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";

export type FramePublishTimingStep =
  | "ui_build"
  | "frame_sandbox_ensure"
  | "function_stage_and_build"
  | "database_reconcile"
  | "store"
  | "compare"
  | "allowlist"
  | "stage"
  | "activate"
  | "publish_total";

export type FramePublishTimingContext = {
  workspaceId: string;
  frameId?: string;
  publicationId?: string;
  sourceFileCount?: number;
  functionCount?: number;
  databaseCount?: number;
};

function recordFramePublishTiming(
  step: FramePublishTimingStep,
  context: FramePublishTimingContext,
  durationMs: number,
  status: "success" | "error"
): void {
  statsDMetrics.distribution("frame.publish.step.duration", durationMs, [
    `region:${regionConfig.getCurrentRegion()}`,
    `step:${step}`,
    `status:${status}`,
  ]);
  logger.info(
    {
      ...context,
      step,
      durationMs,
      stepStatus: status,
    },
    "Frame publish step timing"
  );
}

/**
 * Time a publish step that returns a `Result`. Step names are stable across
 * refactors so before/after compares stay valid.
 */
export async function withFramePublishTimingResult<T, E>(
  step: FramePublishTimingStep,
  context: FramePublishTimingContext,
  fn: () => Promise<Result<T, E>>
): Promise<Result<T, E>> {
  const startedAt = Date.now();
  const result = await fn();
  recordFramePublishTiming(
    step,
    context,
    Date.now() - startedAt,
    result.isErr() ? "error" : "success"
  );
  return result;
}
