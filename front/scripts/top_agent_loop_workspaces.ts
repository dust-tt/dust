import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import { makeScript } from "@app/scripts/helpers";
import type { Client } from "@temporalio/client";
import type { google } from "@temporalio/proto";

const TOP_N = 10;
const DRILL_DOWN_WORKFLOWS = 20;

// From temporal.api.enums.v1.EventType — hardcoded to avoid runtime import issues.
const EVENT_TYPE_ACTIVITY_TASK_SCHEDULED = 10;
const EVENT_TYPE_ACTIVITY_TASK_COMPLETED = 12;
const EVENT_TYPE_ACTIVITY_TASK_FAILED = 13;
const EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT = 14;

interface WorkspaceStats {
  count: number;
  totalDurationMs: number;
}

interface ActivityTiming {
  activityType: string;
  durationMs: number;
  workflowId: string;
}

interface ActivityAggregate {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  maxWorkflowId: string;
}

function tsToMs(ts: google.protobuf.ITimestamp | null | undefined): number {
  if (!ts) {
    return 0;
  }
  const seconds =
    typeof ts.seconds === "number" ? ts.seconds : Number(ts.seconds ?? 0);
  const nanos = ts.nanos ?? 0;
  return seconds * 1000 + Math.floor(nanos / 1_000_000);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

async function runOverview(
  client: Client,
  query: string,
  fromIso: string,
  toIso: string,
  sort: "count" | "duration",
  logger: { info: (msg: string) => void }
) {
  const workflows = client.workflow.list({ query });

  const statsByWorkspace = new Map<string, WorkspaceStats>();
  let total = 0;
  let totalDurationMs = 0;

  for await (const wf of workflows) {
    total++;
    const wsId =
      (wf.memo?.workspaceId as string | undefined) ??
      (wf.searchAttributes?.workspaceId as string[] | undefined)?.[0];

    if (wsId) {
      const stats = statsByWorkspace.get(wsId) ?? {
        count: 0,
        totalDurationMs: 0,
      };
      stats.count++;

      if (wf.startTime && wf.closeTime) {
        const durationMs = wf.closeTime.getTime() - wf.startTime.getTime();
        stats.totalDurationMs += durationMs;
        totalDurationMs += durationMs;
      }

      statsByWorkspace.set(wsId, stats);
    }

    if (total % 10000 === 0) {
      logger.info(`Scanned ${total} workflows so far`);
    }
  }

  const sorted = [...statsByWorkspace.entries()]
    .sort((a, b) =>
      sort === "duration"
        ? b[1].totalDurationMs - a[1].totalDurationMs
        : b[1].count - a[1].count
    )
    .slice(0, TOP_N);

  const rows = sorted.map(([wsId, stats]) => ({
    workspace: wsId,
    count: stats.count.toLocaleString(),
    "count %": `${((stats.count / total) * 100).toFixed(1)}%`,
    "total duration": formatDuration(stats.totalDurationMs),
    "duration %":
      totalDurationMs > 0
        ? `${((stats.totalDurationMs / totalDurationMs) * 100).toFixed(1)}%`
        : "-",
    "avg duration":
      stats.count > 0
        ? formatDuration(stats.totalDurationMs / stats.count)
        : "-",
  }));

  logger.info(
    [
      "",
      `  Period:     ${fromIso} -> ${toIso}`,
      `  Workflows:  ${total.toLocaleString()}`,
      `  Duration:   ${formatDuration(totalDurationMs)}`,
      `  Workspaces: ${statsByWorkspace.size.toLocaleString()}`,
      `  Sorted by:  ${sort}`,
      "",
    ].join("\n")
  );

  console.table(rows);
}

async function runDrillDown(
  client: Client,
  query: string,
  workspace: string | undefined,
  logger: { info: (msg: string) => void }
) {
  const fullQuery = workspace
    ? `${query} AND workspaceId = '${workspace}'`
    : query;

  logger.info(
    workspace
      ? `Finding ${DRILL_DOWN_WORKFLOWS} longest workflows for workspace ${workspace}...`
      : `Finding ${DRILL_DOWN_WORKFLOWS} longest workflows across all workspaces...`
  );

  // Collect workflows with duration, pick the longest ones.
  const candidates: {
    workflowId: string;
    runId: string;
    durationMs: number;
    wsId: string;
  }[] = [];

  for await (const wf of client.workflow.list({ query: fullQuery })) {
    if (wf.startTime && wf.closeTime) {
      const durationMs = wf.closeTime.getTime() - wf.startTime.getTime();
      const wsId =
        (wf.memo?.workspaceId as string | undefined) ??
        (wf.searchAttributes?.workspaceId as string[] | undefined)?.[0] ??
        "unknown";

      candidates.push({
        workflowId: wf.workflowId,
        runId: wf.runId,
        durationMs,
        wsId,
      });

      // Keep only top N to limit memory — re-sort periodically.
      if (candidates.length > DRILL_DOWN_WORKFLOWS * 10) {
        candidates.sort((a, b) => b.durationMs - a.durationMs);
        candidates.length = DRILL_DOWN_WORKFLOWS;
      }
    }
  }

  candidates.sort((a, b) => b.durationMs - a.durationMs);
  const topWorkflows = candidates.slice(0, DRILL_DOWN_WORKFLOWS);

  if (topWorkflows.length === 0) {
    logger.info("No completed workflows found in the given range.");
    return;
  }

  // Show the longest workflows.
  logger.info(`\nTop ${topWorkflows.length} longest workflows:`);
  console.table(
    topWorkflows.map((w, i) => ({
      "#": i + 1,
      workspace: w.wsId,
      workflowId: w.workflowId,
      duration: formatDuration(w.durationMs),
    }))
  );

  // Fetch history for each and extract activity timings.
  logger.info(
    `\nFetching activity history for ${topWorkflows.length} workflows...`
  );

  const allTimings: ActivityTiming[] = [];

  for (const wf of topWorkflows) {
    const handle = client.workflow.getHandle(wf.workflowId, wf.runId);
    const history = await handle.fetchHistory();

    if (!history.events) {
      continue;
    }

    // Build a map of scheduledEventId -> { activityType, scheduledTime }.
    const scheduled = new Map<
      string,
      { activityType: string; scheduledTimeMs: number }
    >();

    for (const event of history.events) {
      const eventId = String(event.eventId);
      const eventTimeMs = tsToMs(event.eventTime);

      if (
        event.eventType === EVENT_TYPE_ACTIVITY_TASK_SCHEDULED &&
        event.activityTaskScheduledEventAttributes
      ) {
        const activityType =
          event.activityTaskScheduledEventAttributes.activityType?.name ??
          "unknown";
        scheduled.set(eventId, {
          activityType,
          scheduledTimeMs: eventTimeMs,
        });
      } else if (
        event.eventType === EVENT_TYPE_ACTIVITY_TASK_COMPLETED &&
        event.activityTaskCompletedEventAttributes
      ) {
        const schedId = String(
          event.activityTaskCompletedEventAttributes.scheduledEventId
        );
        const info = scheduled.get(schedId);
        if (info) {
          allTimings.push({
            activityType: info.activityType,
            durationMs: eventTimeMs - info.scheduledTimeMs,
            workflowId: wf.workflowId,
          });
        }
      } else if (
        event.eventType === EVENT_TYPE_ACTIVITY_TASK_FAILED &&
        event.activityTaskFailedEventAttributes
      ) {
        const schedId = String(
          event.activityTaskFailedEventAttributes.scheduledEventId
        );
        const info = scheduled.get(schedId);
        if (info) {
          allTimings.push({
            activityType: `${info.activityType} (FAILED)`,
            durationMs: eventTimeMs - info.scheduledTimeMs,
            workflowId: wf.workflowId,
          });
        }
      } else if (
        event.eventType === EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT &&
        event.activityTaskTimedOutEventAttributes
      ) {
        const schedId = String(
          event.activityTaskTimedOutEventAttributes.scheduledEventId
        );
        const info = scheduled.get(schedId);
        if (info) {
          allTimings.push({
            activityType: `${info.activityType} (TIMED_OUT)`,
            durationMs: eventTimeMs - info.scheduledTimeMs,
            workflowId: wf.workflowId,
          });
        }
      }
    }
  }

  // Aggregate by activity type.
  const aggregates = new Map<string, ActivityAggregate>();

  for (const timing of allTimings) {
    const agg = aggregates.get(timing.activityType) ?? {
      count: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      maxWorkflowId: "",
    };
    agg.count++;
    agg.totalDurationMs += timing.durationMs;
    if (timing.durationMs > agg.maxDurationMs) {
      agg.maxDurationMs = timing.durationMs;
      agg.maxWorkflowId = timing.workflowId;
    }
    aggregates.set(timing.activityType, agg);
  }

  const totalActivityTimeMs = allTimings.reduce(
    (sum, t) => sum + t.durationMs,
    0
  );

  const sortedActivities = [...aggregates.entries()].sort(
    (a, b) => b[1].totalDurationMs - a[1].totalDurationMs
  );

  logger.info(
    `\nActivity breakdown (across ${topWorkflows.length} longest workflows):`
  );
  console.table(
    sortedActivities.map(([name, agg]) => ({
      activity: name,
      invocations: agg.count.toLocaleString(),
      "total time": formatDuration(agg.totalDurationMs),
      "time %": `${((agg.totalDurationMs / totalActivityTimeMs) * 100).toFixed(1)}%`,
      "avg time": formatDuration(agg.totalDurationMs / agg.count),
      "max time": formatDuration(agg.maxDurationMs),
      "max workflow": agg.maxWorkflowId,
    }))
  );
}

makeScript(
  {
    from: {
      type: "string",
      demandOption: true,
      describe: "Start date (ISO 8601, e.g. 2026-03-01)",
    },
    to: {
      type: "string",
      demandOption: true,
      describe: "End date (ISO 8601, e.g. 2026-03-27)",
    },
    sortBy: {
      type: "string",
      demandOption: false,
      describe: "Sort by: 'count' (default) or 'duration'",
    },
    drillDown: {
      type: "boolean",
      demandOption: false,
      describe:
        "Drill down into the longest workflows to show per-activity timing",
    },
    workspace: {
      type: "string",
      demandOption: false,
      describe:
        "Filter drill-down to a specific workspace ID (use with --drillDown)",
    },
  },
  async ({ from, to, sortBy, drillDown, workspace }, logger) => {
    const fromIso = new Date(from).toISOString();
    const toIso = new Date(to).toISOString();
    const sort = sortBy === "duration" ? "duration" : "count";

    const client = await getTemporalClientForAgentNamespace();

    const query = [
      `WorkflowType = 'agentLoopWorkflow'`,
      `StartTime >= '${fromIso}'`,
      `StartTime <= '${toIso}'`,
    ].join(" AND ");

    if (drillDown) {
      await runDrillDown(client, query, workspace, logger);
    } else {
      await runOverview(client, query, fromIso, toIso, sort, logger);
    }
  }
);
