import { runOnRedis } from "@app/lib/api/redis";

// Must outlive the tool activity start-to-close timeout plus any delay before the workflow claims
// the marker after the activity timed out, which can be long when agent loop workers are down or
// backlogged.
const TOOL_ACTIVITY_START_MARKER_TTL_SECONDS = 24 * 60 * 60;

type ToolActivityStartMarker = "started" | "abandoned";

export type ToolActivityExecution = {
  workflowId: string;
  runId: string;
  activityId: string;
};

function makeToolActivityStartMarkerKey({
  workflowId,
  runId,
  activityId,
}: ToolActivityExecution): string {
  return `tool_activity_start_marker:${workflowId}:${runId}:${activityId}`;
}

async function setToolActivityStartMarkerIfAbsent(
  execution: ToolActivityExecution,
  marker: ToolActivityStartMarker
): Promise<string | null> {
  const key = makeToolActivityStartMarkerKey(execution);

  return runOnRedis({ origin: "tool_activity_start_marker" }, async (redis) => {
    const result = await redis.set(key, marker, {
      NX: true,
      EX: TOOL_ACTIVITY_START_MARKER_TTL_SECONDS,
    });
    if (result === "OK") {
      return marker;
    }

    return redis.get(key);
  });
}

/**
 * @cc [owner:tdraier,label:error-handling;concurrency] start-unless-abandoned
 * Returns true unless `claimToolActivityNeverStarted` already succeeded for `execution`; once it
 * returns true, `claimToolActivityNeverStarted` returns false for `execution`. Redis failures
 * throw.
 */
export async function claimToolActivityStart(
  execution: ToolActivityExecution
): Promise<boolean> {
  const marker = await setToolActivityStartMarkerIfAbsent(execution, "started");

  return marker !== "abandoned";
}

/**
 * @cc [owner:tdraier,label:error-handling;concurrency] never-started-unless-claimed
 * Returns true unless `claimToolActivityStart` already returned true for `execution`; once it
 * returns true, `claimToolActivityStart` returns false for `execution`. Idempotent; Redis failures
 * throw.
 */
export async function claimToolActivityNeverStarted(
  execution: ToolActivityExecution
): Promise<boolean> {
  const marker = await setToolActivityStartMarkerIfAbsent(
    execution,
    "abandoned"
  );

  return marker === "abandoned";
}
