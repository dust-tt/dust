import { renderAgentMessageContentView } from "@app/lib/api/assistant/activity_steps";
import { updateAgentMessageWithFinalStatus } from "@app/lib/api/assistant/conversation";
import { getCompletionDuration } from "@app/lib/api/assistant/messages";
import { resolvedModelFromAgentMessageRow } from "@app/lib/api/assistant/models";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import { finalizeAgentMessagesWithoutWorkflow } from "@app/lib/api/cancel";
import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import { Authenticator as AuthenticatorClass } from "@app/lib/auth";
import { CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS } from "@app/lib/constants/credits";
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/llms/agent_message_content_parser";
import type { UserBlockedReason } from "@app/lib/metronome/user_block";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { notifyManualActionRequired } from "@app/lib/notifications/triggers/manual-action-required";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import {
  DEFAULT_EVENT_FLUSH_INTERVAL_MS,
  globalCoalescer,
} from "@app/temporal/agent_loop/lib/event_coalescer";
import type {
  GenericErrorContent,
  LightAgentConfigurationType,
  ToolErrorEvent,
} from "@app/types/assistant/agent";
import { TERMINAL_AGENT_MESSAGE_EVENT_TYPES } from "@app/types/assistant/agent_message_events";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import {
  getAgentLoopRuntimeData,
  isAgentLoopConfigNotFoundError,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";
import type {
  AgentMessageStatus,
  AgentMessageType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import maxBy from "lodash/maxBy";
import type { InferAttributes, WhereOptions } from "sequelize";
import { fn, literal } from "sequelize";

const SUB_AGENT_FLUSH_INTERVAL_MS = 2 * DEFAULT_EVENT_FLUSH_INTERVAL_MS;
// Conversations that are more than one level deep will seldom be viewed in real-time.
const DEEP_CONVERSATION_FLUSH_INTERVAL_MS =
  10 * DEFAULT_EVENT_FLUSH_INTERVAL_MS;

type AgentMessageStatusUpdate = Extract<
  AgentMessageStatus,
  "succeeded" | "cancelled" | "interrupted" | "gracefully_stopped"
>;

/**
 * Update in database as well as in-memory agent message.
 * Note that we are mutating the agentMessage object in memory and not returning a new object.
 * This is because we want to make sure that all functions using this object have the latest state.
 */
export async function updateAgentMessageDBAndMemory(
  auth: Authenticator,
  args:
    | {
        agentMessage: AgentMessageType;
        conversation: ConversationWithoutContentType;
        update:
          | {
              type: "status";
              status: AgentMessageStatusUpdate;
            }
          | {
              type: "error";
              error: ToolErrorEvent["error"];
            };
      }
    | {
        agentMessage: AgentMessageType;
        update:
          | {
              type: "usageMetadata";
              runIds?: string[];
              modelInteractionDurationMs?: number;
            }
          | {
              type: "prunedContext";
              prunedContext: true;
            };
      }
): Promise<boolean> {
  const { agentMessage } = args;
  const where: WhereOptions<InferAttributes<AgentMessageModel>> = {
    id: agentMessage.agentMessageId,
    workspaceId: auth.getNonNullableWorkspace().id,
  };

  // Terminal status updates go through the advisory-locked updateAgentMessageWithFinalStatus.
  // Returns false when the terminal transition was not applied (message already finalized):
  // callers must then skip the remaining terminal side effects.
  if ("conversation" in args) {
    const { conversation, update } = args;
    switch (update.type) {
      case "error": {
        const result = await updateAgentMessageWithFinalStatus(auth, {
          conversation,
          agentMessage,
          status: "failed",
          error: update.error,
        });
        agentMessage.status = result.status;
        agentMessage.completedTs = result.completedTs;
        if (result.applied) {
          agentMessage.error = update.error;
        }
        return result.applied;
      }

      case "status": {
        const result = await updateAgentMessageWithFinalStatus(auth, {
          conversation,
          agentMessage,
          status: update.status,
        });
        agentMessage.status = result.status;
        agentMessage.completedTs = result.completedTs;
        return result.applied;
      }

      default:
        return assertNever(update);
    }
  }

  // Non-terminal metadata updates — no lock needed.
  const { update } = args;
  switch (update.type) {
    case "usageMetadata":
      {
        const roundedModelInteractionDurationMs =
          update.modelInteractionDurationMs !== undefined
            ? Math.round(update.modelInteractionDurationMs)
            : null;

        // Note: both fields are updated directly in the database using functions to ensure
        // atomic updates, and in a single statement to avoid one commit per field.
        const values = {
          ...(roundedModelInteractionDurationMs !== null
            ? {
                modelInteractionDurationMs: literal(
                  `COALESCE("modelInteractionDurationMs", 0) + ${roundedModelInteractionDurationMs}`
                ),
              }
            : {}),
          ...(update.runIds && update.runIds.length > 0
            ? {
                runIds: fn(
                  "ARRAY",
                  literal(
                    `SELECT DISTINCT unnest(COALESCE("runIds", '{}') || ARRAY['${update.runIds.join("','")}']::text[])`
                  )
                ),
              }
            : {}),
        };

        if (Object.keys(values).length > 0) {
          await AgentMessageModel.update(values, { where });
        }

        if (roundedModelInteractionDurationMs !== null) {
          agentMessage.modelInteractionDurationMs =
            (agentMessage.modelInteractionDurationMs ?? 0) +
            roundedModelInteractionDurationMs;
        }
      }
      break;

    case "prunedContext":
      {
        await AgentMessageModel.update(
          {
            prunedContext: update.prunedContext,
          },
          { where }
        );
        agentMessage.prunedContext = update.prunedContext;
      }
      break;

    default:
      assertNever(update);
  }

  return true;
}

export async function markAgentMessageAsFailed(
  auth: Authenticator,
  {
    agentMessage,
    conversation,
    error,
  }: {
    agentMessage: AgentMessageType;
    conversation: ConversationWithoutContentType;
    error: ToolErrorEvent["error"];
  }
): Promise<boolean> {
  return updateAgentMessageDBAndMemory(auth, {
    agentMessage,
    conversation,
    update: {
      type: "error",
      error,
    },
  });
}

// Process database operations for agent events before publishing to Redis.
// Returns false when a terminal event targets an already-finalized message: the event is stale
// (e.g. emitted by an orphaned activity after an interrupt) and must be dropped by the caller
// instead of being published.
export async function processEventForDatabase(
  auth: Authenticator,
  {
    event,
    agentMessage,
    step,
    conversation,
    modelInteractionDurationMs,
  }: {
    event: AgentMessageEvents;
    agentMessage: AgentMessageType;
    step: number;
    conversation: ConversationWithoutContentType;
    modelInteractionDurationMs?: number;
  }
): Promise<boolean> {
  // Store the model interaction duration and merge runIds from events that include them, in a
  // single update. This ensures runIds are persisted incrementally as events are published.
  const eventRunIds =
    "runIds" in event && event.runIds && event.runIds.length > 0
      ? event.runIds
      : undefined;
  if (modelInteractionDurationMs || eventRunIds) {
    await updateAgentMessageDBAndMemory(auth, {
      agentMessage,
      update: {
        type: "usageMetadata",
        modelInteractionDurationMs: modelInteractionDurationMs || undefined,
        runIds: eventRunIds,
      },
    });
  }

  switch (event.type) {
    case "agent_error": {
      // Store error in database.
      const applied = await markAgentMessageAsFailed(auth, {
        agentMessage,
        conversation,
        error: event.error,
      });

      if (!applied) {
        return false;
      }

      // Mark the conversation as errored.
      await ConversationResource.markHasError(auth, {
        conversation,
      });

      await AgentStepContentResource.createNewVersion({
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: agentMessage.agentMessageId,
        step,
        index: 0, // Errors are the only content for this step
        type: "error",
        value: {
          type: "error",
          value: {
            code: event.error.code,
            message: event.error.message,
            metadata: {
              ...event.error.metadata,
              category: event.error.metadata?.category ?? "",
            },
          },
        },
      });
      break;
    }

    case "tool_error": {
      const applied = await markAgentMessageAsFailed(auth, {
        agentMessage,
        conversation,
        error: event.error,
      });

      if (!applied) {
        return false;
      }

      // Mark the conversation as errored.
      await ConversationResource.markHasError(auth, {
        conversation,
      });
      break;
    }

    case "agent_generation_cancelled": {
      // Store cancellation in database. Also denies blocked actions of the cancelled message
      // (via updateAgentMessageWithFinalStatus).
      const applied = await updateAgentMessageDBAndMemory(auth, {
        agentMessage,
        conversation,
        update: {
          type: "status",
          status: event.status,
        },
      });

      if (!applied) {
        return false;
      }
      break;
    }

    case "agent_message_gracefully_stopped":
    case "agent_message_success": {
      // Store terminal status in database behind advisory lock.
      const applied = await updateAgentMessageDBAndMemory(auth, {
        agentMessage,
        conversation,
        update: {
          type: "status",
          status:
            event.type === "agent_message_gracefully_stopped"
              ? "gracefully_stopped"
              : "succeeded",
        },
      });

      if (!applied) {
        return false;
      }

      // Mark the conversation as updated
      await ConversationResource.markAsUpdated(auth, { conversation });
      break;
    }

    default:
      // Ensure we handle all event types.
      break;
  }

  if (TERMINAL_AGENT_MESSAGE_EVENT_TYPES.includes(event.type)) {
    await ConversationResource.setIsRunningAgentLoop(auth, {
      conversation,
      isRunningAgentLoop: false,
    });
  }

  return true;
}

// Process unread state for agent events before publishing to Redis.
async function processEventForUnreadState(
  auth: Authenticator,
  {
    event,
    conversation,
  }: {
    event: AgentMessageEvents;
    conversation: ConversationWithoutContentType;
  }
) {
  // If the event is a done event, we want to mark the conversation as unread for all participants.
  if (TERMINAL_AGENT_MESSAGE_EVENT_TYPES.includes(event.type)) {
    // Publish the agent message done event that will be handled on the client-side.
    await publishConversationRelatedEvent({
      conversationId: conversation.sId,
      event: {
        type: "agent_message_done",
        created: Date.now(),
        configurationId: event.configurationId,
        conversationId: conversation.sId,
        messageId: event.messageId,
        status:
          event.type === "agent_error" || event.type === "tool_error"
            ? "error"
            : "success",
      },
    });
  }
}

export async function updateResourceAndPublishEvent(
  auth: Authenticator,
  {
    event,
    agentMessage,
    conversation,
    step,
    modelInteractionDurationMs,
  }: {
    event: AgentMessageEvents;
    agentMessage: AgentMessageType;
    conversation: ConversationWithoutContentType;
    step: number;
    modelInteractionDurationMs?: number;
  }
): Promise<void> {
  // Persist the DB updates first, then publish the terminal done event. The credit cost is
  // computed and persisted later, in the finalize activities (see finalize.ts), so it is
  // intentionally not carried on the terminal events here — clients read it from the messages /
  // conversation API on their next revalidation.
  const shouldPublish = await processEventForDatabase(auth, {
    event,
    agentMessage,
    step,
    conversation,
    modelInteractionDurationMs,
  });

  if (!shouldPublish) {
    // Stale terminal event from an orphaned activity (the message was already finalized): don't
    // publish it nor let it mutate conversation flags. Usage metadata (runIds,
    // modelInteractionDurationMs) was still recorded above: those runs really happened and must
    // stay attributed for cost accounting.
    logger.info(
      {
        conversationId: conversation.sId,
        messageId: event.messageId,
        eventType: event.type,
      },
      "Dropping late terminal event for already-finalized agent message"
    );
    return;
  }

  await processEventForUnreadState(auth, {
    event,
    conversation,
  });

  // For terminal "succeeded" events, attach the fully-rendered content view
  // (body, chain of thought, activity steps) computed from the persisted step
  // contents — the same source reload uses. This lets the client trust it
  // wholesale instead of reconciling its incrementally-built streaming view.
  const eventToPublish = await withContentView(auth, event, agentMessage);

  // All events go through the coalescer, which handles batching logic internally.
  const key = `${conversation.sId}-${event.messageId}-${step}`;
  const flushIntervalMs =
    conversation.depth > 1
      ? DEEP_CONVERSATION_FLUSH_INTERVAL_MS
      : conversation.depth > 0
        ? SUB_AGENT_FLUSH_INTERVAL_MS
        : undefined;

  await globalCoalescer.handleEvent({
    conversationId: conversation.sId,
    event: eventToPublish,
    key,
    step,
    flushIntervalMs,
  });
}

// Enrich `agent_message_success` / `agent_message_gracefully_stopped` events with
// the server-rendered content view. Reads the latest persisted step contents
// (authoritative, identical to reload) so the rendered view never drifts from a
// reload. Other event types pass through unchanged.
async function withContentView(
  auth: Authenticator,
  event: AgentMessageEvents,
  agentMessage: AgentMessageType
): Promise<AgentMessageEvents> {
  if (
    event.type !== "agent_message_success" &&
    event.type !== "agent_message_gracefully_stopped"
  ) {
    return event;
  }

  // Reads the latest persisted step contents (authoritative, identical to
  // reload). A failure here throws and Temporal retries the activity, like the
  // other DB operations in this publish path.
  const stepContents = await AgentStepContentResource.fetchByAgentMessages(
    auth,
    {
      agentMessageIds: [agentMessage.agentMessageId],
    }
  );
  const contents = stepContents.map((sc) => ({
    step: sc.step,
    content: sc.value,
  }));

  const contentView = await renderAgentMessageContentView(
    contents,
    agentMessage.actions,
    agentMessage.configuration,
    agentMessage.sId
  );

  return { ...event, contentView };
}

const DEFAULT_WORKFLOW_ERROR_MESSAGE =
  "An unexpected error occurred while generating the agent response. Please try again.";

/**
 * @cc [owner:philipperolet,label:backend] finalize-unavailable-loop
 * Call only after the loop's conversation or message becomes unavailable; cancel its unfinished
 * message before exiting, without publishing terminal events or starting another run.
 */
export async function finalizeUnavailableAgentLoop(
  authType: AuthenticatorType,
  agentLoopArgs: Pick<
    AgentLoopArgs,
    "conversationId" | "agentMessageId" | "agentMessageVersion"
  >
): Promise<void> {
  const auth = await AuthenticatorClass.fromJsonWithRefrehedGroups(authType);
  await ConversationResource.cancelUnavailableAgentMessage(auth, agentLoopArgs);
}

/**
 * Stops the loop's agent message without its agent configuration or model, which can no longer be
 * loaded (see `isAgentLoopConfigNotFoundError`): retrying would fail forever. Pending tokens are
 * not flushed, as that requires the configuration.
 */
async function stopWithoutAgentConfiguration(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs,
  status: "cancelled" | "interrupted"
): Promise<void> {
  const { conversationId, agentMessageId } = agentLoopArgs;
  const auth = await AuthenticatorClass.fromJsonWithRefrehedGroups(authType);
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversation) {
    await finalizeUnavailableAgentLoop(authType, agentLoopArgs);
    return;
  }

  await finalizeAgentMessagesWithoutWorkflow(auth, {
    conversation,
    messageIds: [agentMessageId],
    status,
  });
  // As the regular cancelled event does (`processEventForDatabase`). An interrupt keeps the flag:
  // promoted messages start a new loop.
  if (status === "cancelled") {
    await ConversationResource.setIsRunningAgentLoop(auth, {
      conversation: conversation.toJSON(),
      isRunningAgentLoop: false,
    });
  }
  logger.info(
    { conversationId, agentMessageId, messageStatus: status },
    "Agent configuration unavailable, agent message stopped without it"
  );
}

function toUserFriendlyMessage(error: {
  message: string;
  name: string;
}): string {
  if (!error.message) {
    return DEFAULT_WORKFLOW_ERROR_MESSAGE;
  }
  if (
    error.message === "Activity task timed out" &&
    error.name === "ActivityFailure"
  ) {
    return "The agent took too long to respond. Please try again.";
  }
  return error.message;
}

// Returns the errored agent message's model id (already resolved here) so the caller can
// attribute the failure without refetching the conversation, or null when the conversation is
// gone.
export async function notifyWorkflowError(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs,
  error: { message: string; name: string }
): Promise<ModelId | null> {
  return notifyAgentMessageError(authType, agentLoopArgs, {
    error: {
      code: "workflow_error",
      message: toUserFriendlyMessage(error),
      metadata: {
        category: "critical_failure",
        errorTitle: "Agent response generation failed",
        // Ensure errorName is a string (not an Error object or undefined)
        errorName: error.name || "UnknownError",
      },
    },
    step: 0, // Workflow-level error, not tied to a specific step
  });
}

// Fails the agent message with `error`, stored at `step`, without loading its agent configuration.
// Returns the agent message's model id, or null when the conversation is gone.
export async function notifyAgentMessageError(
  authType: AuthenticatorType,
  { conversationId, agentMessageId, agentMessageVersion }: AgentLoopArgs,
  { error, step }: { error: GenericErrorContent; step: number }
): Promise<ModelId | null> {
  const auth = await AuthenticatorClass.fromJsonWithRefrehedGroups(authType);

  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversation) {
    await finalizeUnavailableAgentLoop(authType, {
      conversationId,
      agentMessageId,
      agentMessageVersion,
    });
    return null;
  }

  // Fetch the agent message using the proper API function
  const messageRes = await conversation.getMessageById(
    auth,
    agentMessageId,
    agentMessageVersion
  );

  if (messageRes.isErr()) {
    throw new Error(`Agent message not found: ${agentMessageId}`);
  }

  const messageRow = messageRes.value;

  if (!messageRow.agentMessage) {
    throw new Error(`Agent message not found: ${agentMessageId}`);
  }

  const errorEvent: AgentMessageEvents = {
    type: "agent_error",
    created: Date.now(),
    configurationId: messageRow.agentMessage.agentConfigurationId || "",
    messageId: agentMessageId,
    error,
    // These errors occur outside of LLM execution, so use existing runIds from DB
    runIds: messageRow.agentMessage.runIds ?? [],
  };

  const agentMessage: AgentMessageType = {
    id: messageRow.id,
    agentMessageId: messageRow.agentMessage.id,
    created: messageRow.agentMessage.createdAt.getTime(),
    completedTs: messageRow.agentMessage.completedAt?.getTime() ?? null,
    sId: messageRow.sId,
    type: "agent_message",
    visibility: messageRow.visibility,
    version: messageRow.version,
    branchId: null,

    status: messageRow.agentMessage.status,
    actions: [],
    content: null,
    chainOfThought: null,
    error: null,
    rank: messageRow.rank,
    skipToolsValidation: messageRow.agentMessage.skipToolsValidation,
    contents: [],
    modelInteractionDurationMs:
      messageRow.agentMessage.modelInteractionDurationMs,
    completionDurationMs: getCompletionDuration(
      messageRow.agentMessage.createdAt.getTime(),
      messageRow.agentMessage.completedAt?.getTime() ?? null,
      []
    ),
    richMentions: [],
    reactions: [],
    costCredits: null,
    resolvedModel: resolvedModelFromAgentMessageRow(messageRow.agentMessage),
    modelResolutionMethod: messageRow.agentMessage.modelResolutionMethod,

    // HACKY: These last 3 fields are not used in the workflow error case but required in the type.
    configuration: null as unknown as LightAgentConfigurationType,
    parentMessageId: null as unknown as string,
    parentAgentMessageId: null as unknown as string,
  };

  await updateResourceAndPublishEvent(auth, {
    event: errorEvent,
    agentMessage,
    conversation: conversation.toJSON(),
    step,
  });

  return messageRow.agentMessage.id;
}

/**
 * Activity executed after a cancel signal
 */
/**
 * @cc [owner:philipperolet,label:error-handling;backend] cancel-without-agent-configuration
 * When the loop's agent configuration or its model cannot be loaded
 * (`isAgentLoopConfigNotFoundError`), `finalizeCancellation` MUST mark the agent message
 * `cancelled` and return without throwing, as its activity retries without limit.
 */
export async function finalizeCancellation(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const runAgentDataRes = await getAgentLoopRuntimeData(
    authType,
    agentLoopArgs
  );
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      await finalizeUnavailableAgentLoop(authType, agentLoopArgs);
      logger.info(
        {
          conversationId: agentLoopArgs.conversationId,
          agentMessageId: agentLoopArgs.agentMessageId,
        },
        "Message or conversation was deleted, exiting"
      );
      return;
    }
    if (isAgentLoopConfigNotFoundError(runAgentDataRes.error)) {
      await stopWithoutAgentConfiguration(authType, agentLoopArgs, "cancelled");
      return;
    }
    throw new Error(
      `Failed to get run agent data: ${runAgentDataRes.error.message}`
    );
  }
  const { auth, agentConfiguration, modelInfo, agentMessage, conversation } =
    runAgentDataRes.value;

  // get the last step of the agent message
  const step = maxBy(agentMessage.contents, "step")?.step ?? 0;

  const contentParser = new AgentMessageContentParser(
    agentConfiguration,
    agentMessage.sId,
    getDelimitersConfiguration(modelInfo)
  );

  // Flush pending tokens from the content parser, if any.
  for await (const tokenEvent of contentParser.flushTokens()) {
    await updateResourceAndPublishEvent(auth, {
      event: tokenEvent,
      agentMessage,
      conversation,
      step,
    });
  }
  await updateResourceAndPublishEvent(auth, {
    event: {
      type: "agent_generation_cancelled",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      status: "cancelled",
    },
    agentMessage,
    conversation,
    step,
  });
  logger.info(
    {
      agentMessageId: agentMessage.sId,
      conversationId: conversation.sId,
    },
    "Agent generation cancelled"
  );
}

/**
 * Activity executed after an interrupt signal. Like cancellation, in-flight activities are killed
 * immediately. Unlike cancellation, pending queued messages are promoted and a new agent message
 * is created to continue processing them.
 */
/**
 * @cc [owner:philipperolet,label:error-handling;backend] interrupt-without-agent-configuration
 * When the loop's agent configuration or its model cannot be loaded
 * (`isAgentLoopConfigNotFoundError`), `finalizeInterruption` MUST mark the agent message
 * `interrupted` and return without throwing, as its activity retries without limit.
 */
export async function finalizeInterruption(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const runAgentDataRes = await getAgentLoopRuntimeData(
    authType,
    agentLoopArgs
  );
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      await finalizeUnavailableAgentLoop(authType, agentLoopArgs);
      logger.info(
        {
          conversationId: agentLoopArgs.conversationId,
          agentMessageId: agentLoopArgs.agentMessageId,
        },
        "Message or conversation was deleted, exiting"
      );
      return;
    }
    if (isAgentLoopConfigNotFoundError(runAgentDataRes.error)) {
      await stopWithoutAgentConfiguration(
        authType,
        agentLoopArgs,
        "interrupted"
      );
      return;
    }
    throw new Error(
      `Failed to get run agent data: ${runAgentDataRes.error.message}`
    );
  }
  const { auth, agentConfiguration, modelInfo, agentMessage, conversation } =
    runAgentDataRes.value;

  // The message may have been finalized by another path already (e.g. an orphaned activity
  // erroring during the kill window). Don't publish a stale interrupted event: the single-shot
  // guard in updateAgentMessageWithFinalStatus would no-op the transition anyway, and pending
  // messages were already promoted by the first finalization.
  if (agentMessage.status !== "created") {
    logger.info(
      {
        agentMessageId: agentMessage.sId,
        conversationId: conversation.sId,
        messageStatus: agentMessage.status,
      },
      "finalizeInterruption: message already finalized, skipping"
    );
    return;
  }

  const step = maxBy(agentMessage.contents, "step")?.step ?? 0;

  const contentParser = new AgentMessageContentParser(
    agentConfiguration,
    agentMessage.sId,
    getDelimitersConfiguration(modelInfo)
  );

  for await (const tokenEvent of contentParser.flushTokens()) {
    await updateResourceAndPublishEvent(auth, {
      event: tokenEvent,
      agentMessage,
      conversation,
      step,
    });
  }

  // Published before updateAgentMessageWithFinalStatus so clients drop the old message from
  // generatingMessages before the new agent message appears. Known TOCTOU: the DB transition
  // below may no-op if another terminal event wins after the status snapshot above. We accept
  // the tiny window because the DB is guarded and the worst case is transient UI state,
  // corrected on reload.
  await publishConversationRelatedEvent({
    event: {
      type: "agent_generation_cancelled",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      status: "interrupted",
    },
    conversationId: conversation.sId,
    step,
  });

  await updateAgentMessageWithFinalStatus(auth, {
    conversation,
    agentMessage,
    status: "interrupted",
  });
}

/**
 * Activity executed after a graceful stop signal. The current step completed normally so all
 * content is already flushed — we just need to emit the terminal event.
 */
export async function finalizeGracefulStop(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const runAgentDataRes = await getAgentLoopRuntimeData(
    authType,
    agentLoopArgs
  );
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      await finalizeUnavailableAgentLoop(authType, agentLoopArgs);
      logger.info(
        {
          conversationId: agentLoopArgs.conversationId,
          agentMessageId: agentLoopArgs.agentMessageId,
        },
        "Message or conversation was deleted, exiting"
      );
      return;
    }
    throw new Error(
      `Failed to get run agent data: ${runAgentDataRes.error.message}`
    );
  }
  const { auth, agentConfiguration, agentMessage, conversation } =
    runAgentDataRes.value;

  const step = maxBy(agentMessage.contents, "step")?.step ?? 0;

  await updateResourceAndPublishEvent(auth, {
    event: {
      type: "agent_message_gracefully_stopped",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      message: agentMessage,
      runIds: [],
    },
    agentMessage,
    conversation,
    step,
  });
  logger.info(
    {
      agentMessageId: agentMessage.sId,
      conversationId: conversation.sId,
    },
    "Agent generation gracefully stopped"
  );
}

const CREDIT_STOP_ERROR_TITLES: Record<UserBlockedReason, string> = {
  credits_exhausted: "Workspace out of credits",
  user_cap_reached: "Personal usage cap reached",
  group_shared_usage_limit_reached: "Shared usage limit reached",
  no_seat: "No seat assigned",
};

export function creditStopMessage(
  auth: Authenticator,
  reason: UserBlockedReason
): string {
  const isAdmin = auth.isAdmin();
  switch (reason) {
    case "credits_exhausted":
      return isAdmin
        ? "Your workspace has run out of credits. Please purchase more credits to continue using Dust."
        : "Your workspace has run out of credits. Please contact your administrator to purchase more credits.";
    case "user_cap_reached":
      return isAdmin
        ? "You have reached your personal usage cap. You can adjust user caps on the usage page."
        : "You have reached your personal usage cap. Please contact your administrator to increase it.";
    case "group_shared_usage_limit_reached":
      return isAdmin
        ? "Your group has reached its shared usage limit. You can adjust shared usage limits on the usage page."
        : "Your group has reached its shared usage limit. Please contact your group managers or administrator to increase it.";
    case "no_seat":
      return isAdmin
        ? "You don't have a seat assigned in this workspace. Go to the usage page to assign yourself one."
        : "You don't have a seat assigned in this workspace. Please contact your administrator to assign you one.";
    default:
      assertNever(reason);
  }
}

/**
 * Credit stop: publishes the retryable `credits_exhausted` agent error, titled after the block reason
 *
 * TODO (Issue #8715): We will iterate on this to allow for users to continue the step after a resumable pause.
 * Currently, this is categorized as an error which is not ideal.
 */
export async function finalizeCreditStop(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs,
  reason: UserBlockedReason
): Promise<void> {
  const runAgentDataRes = await getAgentLoopRuntimeData(
    authType,
    agentLoopArgs
  );
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      await finalizeUnavailableAgentLoop(authType, agentLoopArgs);
      logger.info(
        {
          conversationId: agentLoopArgs.conversationId,
          agentMessageId: agentLoopArgs.agentMessageId,
        },
        "Message or conversation was deleted, exiting"
      );
      return;
    }
    throw new Error(
      `Failed to get run agent data: ${runAgentDataRes.error.message}`
    );
  }
  const { auth, agentConfiguration, agentMessage, conversation } =
    runAgentDataRes.value;

  const step = maxBy(agentMessage.contents, "step")?.step ?? 0;

  await updateResourceAndPublishEvent(auth, {
    event: {
      type: "agent_error",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "credits_exhausted",
        message: creditStopMessage(auth, reason),
        metadata: {
          category: "credits_exhausted",
          errorTitle: CREDIT_STOP_ERROR_TITLES[reason],
          blockedReason: reason,
        },
      },
      runIds: agentLoopArgs.dustRunIds ?? [],
    },
    agentMessage,
    conversation,
    step,
  });
  logger.info(
    {
      agentMessageId: agentMessage.sId,
      conversationId: conversation.sId,
    },
    "[CreditCheck] agent loop stopped: user blocked"
  );
}

/**
 * Credit spend checkpoint pause: persists the pause on the message, flags the conversation as
 * needing the user's attention and notifies the client. Runs in the non-cancellable finalize so
 * the persisted status can never say "paused" while the loop is still running.
 */
export async function finalizeCreditSpendCheckpointPause(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const runAgentDataRes = await getAgentLoopRuntimeData(
    authType,
    agentLoopArgs
  );
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      await finalizeUnavailableAgentLoop(authType, agentLoopArgs);
      logger.info(
        {
          conversationId: agentLoopArgs.conversationId,
          agentMessageId: agentLoopArgs.agentMessageId,
        },
        "Message or conversation was deleted, exiting"
      );
      return;
    }
    throw new Error(
      `Failed to get run agent data: ${runAgentDataRes.error.message}`
    );
  }
  const { auth, agentConfiguration, agentMessage, conversation } =
    runAgentDataRes.value;

  const step = maxBy(agentMessage.contents, "step")?.step ?? 0;

  // A stop or cancellation can land around the pause. The terminal status wins: a cancelled
  // message must not be flagged paused and waiting for the user.
  if (agentMessage.status !== "created") {
    logger.info(
      {
        agentMessageId: agentMessage.sId,
        conversationId: conversation.sId,
        messageStatus: agentMessage.status,
      },
      "[CreditSpendCheckpoint] message already finalized, skipping pause"
    );
    return;
  }

  const { applied } =
    await ConversationResource.markAgentMessageCreditSpendCheckpointPaused(
      auth,
      { agentMessage }
    );
  if (!applied) {
    return;
  }

  if (!conversation.actionRequired) {
    notifyManualActionRequired(auth, { conversationId: conversation.sId });
  }
  await ConversationResource.markAsActionRequired(auth, { conversation });

  await publishConversationRelatedEvent({
    conversationId: conversation.sId,
    step,
    event: {
      type: "agent_credit_spend_checkpoint_updated",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      status: "paused",
    },
  });
  logger.info(
    {
      agentMessageId: agentMessage.sId,
      conversationId: conversation.sId,
      thresholdAwuCredits: CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS,
    },
    "[CreditSpendCheckpoint] agent loop paused at credit spend checkpoint"
  );
}
