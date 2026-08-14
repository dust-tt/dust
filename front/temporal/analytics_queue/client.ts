import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import {
  buildConsumptionExportCacheKey,
  buildConsumptionExportGcsPath,
} from "@app/temporal/analytics_queue/activities/consumption_export";
import { QUEUE_NAME } from "@app/temporal/analytics_queue/config";
import {
  makeAgentMessageAnalyticsWorkflowId,
  makeConsumptionExportWorkflowId,
} from "@app/temporal/analytics_queue/helpers";
import { storeAgentMessageConsumptionAttributionV3Signal } from "@app/temporal/analytics_queue/signals";
import {
  getConsumptionExportParamsQuery,
  runConsumptionExportWorkflow,
  storeAgentAnalyticsWorkflow,
  storeAgentMessageConsumptionAttributionV3Workflow,
  storeAgentMessageFeedbackWorkflow,
} from "@app/temporal/analytics_queue/workflows";
import type {
  AgentLoopArgs,
  AgentMessageRef,
} from "@app/types/assistant/agent_run";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkflowHandle } from "@temporalio/client";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
} from "@temporalio/client";

// Resolves the agent configuration id backing an agent message (referenced by its
// message sId). Used to decide whether the feedback workflow needs to wait for
// Langfuse trace ingestion, which only applies to global agents.
async function getAgentConfigurationIdForAgentMessage(
  auth: Authenticator,
  { agentMessageId }: { agentMessageId: string }
): Promise<string | null> {
  const messageRow = await MessageModel.findOne({
    attributes: ["id"],
    where: {
      sId: agentMessageId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        attributes: ["agentConfigurationId"],
        required: true,
      },
    ],
  });

  return messageRow?.agentMessage?.agentConfigurationId ?? null;
}

export async function launchStoreAgentAnalyticsWorkflow({
  authType,
  agentLoopArgs,
}: {
  authType: AuthenticatorType;
  agentLoopArgs: AgentLoopArgs;
}): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;

  const { agentMessageId, conversationId } = agentLoopArgs;

  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeAgentMessageAnalyticsWorkflowId({
    agentMessageId,
    conversationId,
    workspaceId,
  });

  try {
    await client.workflow.start(storeAgentAnalyticsWorkflow, {
      args: [authType, { agentLoopArgs }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        conversationId: [conversationId],
        workspaceId: [workspaceId],
      },
      memo: {
        agentMessageId,
        workspaceId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          workflowId,
          agentMessageId,
          error: e,
        },
        "Failed starting agent analytics workflow"
      );
    }

    return new Err(normalizeError(e));
  }
}

export async function launchStoreAgentMessageConsumptionAttributionWorkflow({
  authType,
  message,
}: {
  authType: AuthenticatorType;
  message: AgentMessageRef;
}): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;

  const { agentMessageId, conversationId } = message;
  const messageRef = { agentMessageId, conversationId };

  const client = await getTemporalClientForFrontNamespace();

  const workflowId =
    makeAgentMessageAnalyticsWorkflowId({
      agentMessageId,
      conversationId,
      workspaceId,
    }) + "-consumption-attribution-v3";

  try {
    // signalWithStart, not start: a message settles across several finalizes (pause for approval,
    // resume, retries) and each must recompute. start would drop every pass after the first as
    // already-started, freezing a tool that was still blocked when the first pass ran. The signal
    // instead reruns a workflow already in flight and starts one otherwise.
    await client.workflow.signalWithStart(
      storeAgentMessageConsumptionAttributionV3Workflow,
      {
        args: [authType, { message: messageRef }],
        taskQueue: QUEUE_NAME,
        workflowId,
        signal: storeAgentMessageConsumptionAttributionV3Signal,
        signalArgs: undefined,
        searchAttributes: {
          conversationId: [conversationId],
          workspaceId: [workspaceId],
        },
        memo: {
          agentMessageId,
          workspaceId,
        },
      }
    );
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        agentMessageId,
        error: e,
      },
      "Failed starting agent message consumption attribution workflow"
    );

    return new Err(normalizeError(e));
  }
}

// A running export's parameters, read back via a workflow query. `null` means an export
// is (or, in the AlreadyStarted race below, was) running but its parameters could not be
// recovered (e.g. the workflow hadn't installed its query handler yet).
export type RunningConsumptionExport = {
  period: ConsumptionPeriod;
  filter: ConsumptionScopeFilter;
} | null;

export type LaunchConsumptionExportOutcome =
  | { status: "started"; workflowId: string }
  | { status: "cached"; gcsPath: string }
  | {
      status: "already_running";
      workflowId: string;
      running: RunningConsumptionExport;
    };

// A period is "open-ended" while its end is still in the future relative to now (e.g. "this
// cycle", whose endDate is the cycle's future close date) or was only just resolved to now
// (e.g. "last N days"): its underlying data keeps changing even though the period value
// itself doesn't, so every trigger must produce its own export instead of reusing a
// previous, now-stale one. A period whose end has already passed is "closed": its data is
// settled, so requests for the same period+filter can safely reuse a prior export.
function isOpenEndedPeriod(period: ConsumptionPeriod): boolean {
  return new Date(period.endDate).getTime() > Date.now();
}

async function describeRunningConsumptionExport(
  handle: WorkflowHandle
): Promise<RunningConsumptionExport | undefined> {
  try {
    const execution = await handle.describe();
    if (execution.status.name !== "RUNNING") {
      return undefined;
    }

    try {
      return await handle.query(getConsumptionExportParamsQuery);
    } catch {
      return null;
    }
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      return undefined;
    }
    throw e;
  }
}

// Only one export runs per workspace at a time
// A concurrent request while one is in flight is surfaced as "already_running"
// A closed period (see isOpenEndedPeriod) whose export already exists in GCS for the
// exact same period+filter is surfaced as "cached" instead of recomputing it
export async function launchConsumptionExportWorkflow(
  auth: Authenticator,
  {
    period,
    filter,
  }: {
    period: ConsumptionPeriod;
    filter: ConsumptionScopeFilter;
  }
): Promise<Result<LaunchConsumptionExportOutcome, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const authType = auth.toJSON();

  const openEnded = isOpenEndedPeriod(period);
  const exportId = buildConsumptionExportCacheKey({
    period,
    filter,
    salt: openEnded ? new Date().toISOString() : undefined,
  });
  const gcsPath = buildConsumptionExportGcsPath(workspaceId, exportId);

  if (!openEnded) {
    const [cached] = await getPrivateUploadBucket().file(gcsPath).exists();
    if (cached) {
      return new Ok({ status: "cached", gcsPath });
    }
  }

  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeConsumptionExportWorkflowId({ workspaceId });

  try {
    const running = await describeRunningConsumptionExport(
      client.workflow.getHandle(workflowId)
    );
    if (running !== undefined) {
      return new Ok({ status: "already_running", workflowId, running });
    }

    await client.workflow.start(runConsumptionExportWorkflow, {
      args: [authType, { period, filter, exportId }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: {
        workspaceId,
      },
    });
    return new Ok({ status: "started", workflowId });
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      // Lost the race to start: another request started an export between our
      // describe() check and start() above. Look up what it's running so the
      // caller can still report accurate parameters instead of a bare success.
      const running = await describeRunningConsumptionExport(
        client.workflow.getHandle(workflowId)
      );
      return new Ok({
        status: "already_running",
        workflowId,
        running: running ?? null,
      });
    }

    logger.error(
      {
        workflowId,
        workspaceId,
        error: e,
      },
      "Failed starting consumption export workflow"
    );

    return new Err(normalizeError(e));
  }
}

export async function launchAgentMessageFeedbackWorkflow(
  auth: Authenticator,
  {
    message,
  }: {
    message: AgentMessageRef;
  }
): Promise<Result<undefined, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const authType = auth.toJSON();

  const { conversationId, agentMessageId } = message;

  const client = await getTemporalClientForFrontNamespace();

  const workflowId =
    makeAgentMessageAnalyticsWorkflowId({
      conversationId,
      agentMessageId,
      workspaceId,
    }) + "-feedback";

  // The startDelay exists only to let Langfuse ingest traces before the workflow
  // appends negative-feedback traces to the Langfuse dataset, which only happens for
  // global agents. For non-global agents the workflow merely updates the Elasticsearch
  // analytics document (no trace dependency), so we skip the delay to keep the feedback
  // chart/overview in sync without a multi-minute lag.
  const agentConfigurationId = await getAgentConfigurationIdForAgentMessage(
    auth,
    { agentMessageId }
  );
  const needsLangfuseTraceDelay =
    agentConfigurationId !== null && isGlobalAgentId(agentConfigurationId);

  try {
    await client.workflow.start(storeAgentMessageFeedbackWorkflow, {
      args: [authType, { message }],
      taskQueue: QUEUE_NAME,
      workflowId,
      startDelay: needsLangfuseTraceDelay ? "2 minutes" : undefined,
      memo: {
        agentMessageId,
        workspaceId,
      },
    });

    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          workflowId,
          agentMessageId,
          error: e,
        },
        "Failed starting agent message feedback workflow"
      );
    }

    return new Err(normalizeError(e));
  }
}
