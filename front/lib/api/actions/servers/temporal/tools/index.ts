import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  enforceTemporalSecurityGates,
  getTemporalClient,
  jsonResponse,
  makeTemporalUiUrl,
  protoTimeToIso,
  protoTimeToMs,
  summarizeFailure,
  summarizeWorkflowExecutionInfo,
  temporalErrorToMCPError,
} from "@app/lib/api/actions/servers/temporal/helpers";
import type { HistoryEvent } from "@app/lib/api/actions/servers/temporal/history";
import { summarizeHistory } from "@app/lib/api/actions/servers/temporal/history";
import {
  COUNT_WORKFLOWS_TOOL_NAME,
  DESCRIBE_TASK_QUEUE_TOOL_NAME,
  DESCRIBE_WORKFLOW_TOOL_NAME,
  GET_WORKFLOW_HISTORY_TOOL_NAME,
  HISTORY_DEFAULT_MAX_EVENTS,
  LIST_WORKFLOWS_DEFAULT_LIMIT,
  LIST_WORKFLOWS_TOOL_NAME,
  TEMPORAL_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/temporal/metadata";
import { Err } from "@app/types/shared/result";
import type { Client } from "@temporalio/client";

// Values of temporal.api.enums.v1.PendingActivityState.
const PENDING_ACTIVITY_STATES: Record<number, string> = {
  1: "scheduled",
  2: "started",
  3: "cancel_requested",
  4: "paused",
  5: "pause_requested",
};

// Values of temporal.api.enums.v1.TaskQueueType.
const WORKFLOW_TASK_QUEUE_TYPE = 1;
const ACTIVITY_TASK_QUEUE_TYPE = 2;

const handlers: ToolHandlers<typeof TEMPORAL_TOOLS_METADATA> = {
  [COUNT_WORKFLOWS_TOOL_NAME]: async (
    { namespace, query, group_by_status },
    extra
  ) => {
    const gateResult = await enforceTemporalSecurityGates(
      extra,
      COUNT_WORKFLOWS_TOOL_NAME
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const countQuery = group_by_status
      ? `${query ?? ""} GROUP BY ExecutionStatus`.trim()
      : query;

    const client = await getTemporalClient(namespace);
    try {
      const { count, groups } = await client.workflow.count(countQuery);
      return jsonResponse({
        namespace: client.options.namespace,
        query: countQuery ?? null,
        count,
        groups: group_by_status
          ? groups.map((group) => ({
              status: group.groupValues.flat().join(","),
              count: group.count,
            }))
          : undefined,
      });
    } catch (err) {
      return new Err(temporalErrorToMCPError(err));
    }
  },

  [LIST_WORKFLOWS_TOOL_NAME]: async ({ namespace, query, limit }, extra) => {
    const gateResult = await enforceTemporalSecurityGates(
      extra,
      LIST_WORKFLOWS_TOOL_NAME
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const maxResults = limit ?? LIST_WORKFLOWS_DEFAULT_LIMIT;

    const client = await getTemporalClient(namespace);
    try {
      const workflows: ReturnType<typeof summarizeWorkflowExecutionInfo>[] = [];
      for await (const info of client.workflow.list({
        query,
        pageSize: maxResults,
      })) {
        workflows.push(summarizeWorkflowExecutionInfo(client, info));
        if (workflows.length >= maxResults) {
          break;
        }
      }

      const countsByTypeAndStatus: Record<string, Record<string, number>> = {};
      for (const { type, status } of workflows) {
        countsByTypeAndStatus[type] ??= {};
        countsByTypeAndStatus[type][status] =
          (countsByTypeAndStatus[type][status] ?? 0) + 1;
      }

      return jsonResponse({
        namespace: client.options.namespace,
        query: query ?? null,
        returned: workflows.length,
        mayHaveMore: workflows.length >= maxResults,
        countsByTypeAndStatus,
        workflows,
      });
    } catch (err) {
      return new Err(temporalErrorToMCPError(err));
    }
  },

  [DESCRIBE_WORKFLOW_TOOL_NAME]: async (
    { namespace, workflow_id, run_id },
    extra
  ) => {
    const gateResult = await enforceTemporalSecurityGates(
      extra,
      DESCRIBE_WORKFLOW_TOOL_NAME
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const client = await getTemporalClient(namespace);
    try {
      const description = await client.workflow
        .getHandle(workflow_id, run_id)
        .describe();
      const { raw } = description;
      const pendingWorkflowTask = raw.pendingWorkflowTask;

      return jsonResponse({
        ...summarizeWorkflowExecutionInfo(client, description),
        rootWorkflowId: description.rootExecution?.workflowId ?? null,
        workflowExecutionTimeoutMs: protoTimeToMs(
          raw.executionConfig?.workflowExecutionTimeout
        ),
        workflowRunTimeoutMs: protoTimeToMs(
          raw.executionConfig?.workflowRunTimeout
        ),
        pendingWorkflowTask: pendingWorkflowTask
          ? {
              attempt: pendingWorkflowTask.attempt ?? null,
              scheduledTime: protoTimeToIso(pendingWorkflowTask.scheduledTime),
              originalScheduledTime: protoTimeToIso(
                pendingWorkflowTask.originalScheduledTime
              ),
              startedTime: protoTimeToIso(pendingWorkflowTask.startedTime),
            }
          : null,
        pendingActivities: (raw.pendingActivities ?? []).map((activity) => ({
          activityId: activity.activityId ?? null,
          activityType: activity.activityType?.name ?? null,
          state: PENDING_ACTIVITY_STATES[activity.state ?? 0] ?? "unknown",
          attempt: activity.attempt ?? null,
          maximumAttempts: activity.maximumAttempts ?? null,
          scheduledTime: protoTimeToIso(activity.scheduledTime),
          lastStartedTime: protoTimeToIso(activity.lastStartedTime),
          lastHeartbeatTime: protoTimeToIso(activity.lastHeartbeatTime),
          expirationTime: protoTimeToIso(activity.expirationTime),
          lastWorkerIdentity: activity.lastWorkerIdentity || null,
          lastFailure: summarizeFailure(activity.lastFailure),
        })),
        pendingChildren: (raw.pendingChildren ?? []).map((child) => ({
          workflowId: child.workflowId ?? null,
          runId: child.runId ?? null,
          workflowType: child.workflowTypeName ?? null,
        })),
      });
    } catch (err) {
      return new Err(temporalErrorToMCPError(err));
    }
  },

  [GET_WORKFLOW_HISTORY_TOOL_NAME]: async (
    { namespace, workflow_id, run_id, order, max_events, include_payloads },
    extra
  ) => {
    const gateResult = await enforceTemporalSecurityGates(
      extra,
      GET_WORKFLOW_HISTORY_TOOL_NAME
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const maxEvents = max_events ?? HISTORY_DEFAULT_MAX_EVENTS;
    const readOrder = order ?? "latest";

    const client = await getTemporalClient(namespace);
    try {
      // Resolve the run first: reading the history backwards requires a run ID, and the
      // description tells whether the read window covers the whole history.
      const description = await client.workflow
        .getHandle(workflow_id, run_id)
        .describe();
      const execution = {
        workflowId: description.workflowId,
        runId: description.runId,
      };

      const events: HistoryEvent[] = [];
      let nextPageToken: Uint8Array | undefined = undefined;
      do {
        const request: Parameters<
          Client["workflowService"]["getWorkflowExecutionHistory"]
        >[0] = {
          namespace: client.options.namespace,
          execution,
          maximumPageSize: maxEvents - events.length,
          nextPageToken,
        };
        const response: {
          history?: { events?: HistoryEvent[] | null } | null;
          nextPageToken?: Uint8Array | null;
        } =
          readOrder === "latest"
            ? await client.workflowService.getWorkflowExecutionHistoryReverse(
                request
              )
            : await client.workflowService.getWorkflowExecutionHistory(request);
        events.push(...(response.history?.events ?? []));
        nextPageToken = response.nextPageToken?.length
          ? response.nextPageToken
          : undefined;
      } while (nextPageToken && events.length < maxEvents);

      return jsonResponse({
        workflowId: execution.workflowId,
        runId: execution.runId,
        type: description.type,
        status: description.status.name,
        historyLength: description.historyLength,
        eventsRead: events.length,
        isPartial: events.length < description.historyLength,
        readOrder,
        temporalUiUrl: makeTemporalUiUrl(client, execution),
        ...summarizeHistory(events.slice(0, maxEvents), {
          includePayloads: include_payloads ?? false,
        }),
      });
    } catch (err) {
      return new Err(temporalErrorToMCPError(err));
    }
  },

  [DESCRIBE_TASK_QUEUE_TOOL_NAME]: async ({ namespace, task_queue }, extra) => {
    const gateResult = await enforceTemporalSecurityGates(
      extra,
      DESCRIBE_TASK_QUEUE_TOOL_NAME
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const client = await getTemporalClient(namespace);
    try {
      const describe = async (taskQueueType: number) => {
        const response = await client.workflowService.describeTaskQueue({
          namespace: client.options.namespace,
          taskQueue: { name: task_queue },
          taskQueueType,
          reportStats: true,
        });
        const stats = response.stats;
        return {
          pollerCount: response.pollers?.length ?? 0,
          pollers: (response.pollers ?? []).map((poller) => ({
            identity: poller.identity ?? null,
            lastAccessTime: protoTimeToIso(poller.lastAccessTime),
            ratePerSecond: poller.ratePerSecond ?? null,
          })),
          stats: stats
            ? {
                approximateBacklogCount: Number(
                  stats.approximateBacklogCount ?? 0
                ),
                approximateBacklogAgeMs: protoTimeToMs(
                  stats.approximateBacklogAge
                ),
                tasksAddRate: stats.tasksAddRate ?? null,
                tasksDispatchRate: stats.tasksDispatchRate ?? null,
              }
            : null,
        };
      };

      const [workflowTasks, activityTasks] = await Promise.all([
        describe(WORKFLOW_TASK_QUEUE_TYPE),
        describe(ACTIVITY_TASK_QUEUE_TYPE),
      ]);

      return jsonResponse({
        namespace: client.options.namespace,
        taskQueue: task_queue,
        workflowTasks,
        activityTasks,
      });
    } catch (err) {
      return new Err(temporalErrorToMCPError(err));
    }
  },
};

export const TOOLS = buildTools(TEMPORAL_TOOLS_METADATA, handlers);
