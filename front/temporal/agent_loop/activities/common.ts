import {
  fetchMessageInConversation,
  getCompletionDuration,
} from "@app/lib/api/assistant/messages";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import { TERMINAL_AGENT_MESSAGE_EVENT_TYPES } from "@app/lib/api/assistant/streaming/types";
import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import { Authenticator as AuthenticatorClass } from "@app/lib/auth";
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/llms/agent_message_content_parser";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { globalCoalescer } from "@app/temporal/agent_loop/lib/event_coalescer";
import type {
  LightAgentConfigurationType,
  ToolErrorEvent,
} from "@app/types/assistant/agent";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import {
  getAgentLoopData,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";
// biome-ignore lint/plugin/noBulkLodash: existing usage
import _ from "lodash";
import {
  fn,
  type InferAttributes,
  literal,
  type WhereOptions,
} from "sequelize";

/** 
 * Update in database as well as in-memory agent message.
 * Note that we are mutating the agentMessage object in memory and not returning a new object.
 * This is because we want to make sure that all functions using this object have the latest state.
 */
export async function updateAgentMessageDBAndMemory(
  auth: Authenticator,
  {
    agentMessage,
    update,
  }: {
    agentMessage: AgentMessageType;
    update:
      | {
          type: "status";
          status: "succeeded" | "cancelled";
        }
      | {
          type: "error";
          error: ToolErrorEvent["error"];
        }
      | {
          type: "runIds";
          runIds: string[];
        }
      | {
          type: "modelInteractionDurationMs";
          modelInteractionDurationMs: number;
        }
      | {
          type: "prunedContext";
          prunedContext: true;
        };
  }
): Promise<void> {
  const updateType = update.type;
  const where: WhereOptions<InferAttributes<AgentMessageModel>> = {
    id: agentMessage.agentMessageId,
    workspaceId: auth.getNonNullableWorkspace().id,
  };

  switch (updateType) {
    case "error":
      {
        const completedAt = new Date();
        await AgentMessageModel.update(
          {
            status: "failed",
            completedAt,
            errorCode: update.error.code,
            errorMessage: update.error.message,
            errorMetadata: update.error.metadata,
          },
          { where }
        );
        agentMessage.status = "failed";
        agentMessage.completedTs = completedAt.getTime();
        agentMessage.error = update.error;
      }
      break;

    case "status":
      {
        const completedAt = new Date();
        await AgentMessageModel.update(
          {
            status: update.status,
            completedAt,
          },
          { where }
        );
        agentMessage.status = update.status;
        agentMessage.completedTs = completedAt.getTime();
      }
      break;

    case "modelInteractionDurationMs":
      {
        const roundedModelInteractionDurationMs = Math.round(
          update.modelInteractionDurationMs
        );
        // Note: we update the modelInteractionDurationMs directly in the database using a function to ensure
        // an atomic update.
        await AgentMessageModel.update(
          {
            modelInteractionDurationMs: literal(
              `COALESCE("modelInteractionDurationMs", 0) + ${roundedModelInteractionDurationMs}`
            ),
          },
          { where }
        );

        agentMessage.modelInteractionDurationMs =
          (agentMessage.modelInteractionDurationMs ?? 0) +
          roundedModelInteractionDurationMs;
      }
      break;

    case "runIds":
      {
        // Note: we update the runIds directly in the database using a function to ensure
        // an atomic update.
        await AgentMessageModel.update(
          {
            runIds: fn(
              "ARRAY",
              literal(
                `SELECT DISTINCT unnest(COALESCE("runIds", '{}') || ARRAY['${update.runIds.join("','")}']::text[])`
              )
            ),
          },
          { where }
        );
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
      assertNever(updateType);
  }
}

export async function markAgentMessageAsFailed(
  auth: Authenticator,
  {
    agentMessage,
    error,
  }: {
    agentMessage: AgentMessageType;
    error: ToolErrorEvent["error"];
  }
): Promise<void> {
  await updateAgentMessageDBAndMemory(auth, {
    agentMessage,
    update: {
      type: "error",
      error,
    },
  });
}

// Process database operations for agent events before publishing to Redis.
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
): Promise<void> {
  // If we have a model interaction duration, store it.
  if (modelInteractionDurationMs) {
    await updateAgentMessageDBAndMemory(auth, {
      agentMessage,
      update: {
        type: "modelInteractionDurationMs",
        modelInteractionDurationMs,
      },
    });
  }

  // Merge runIds from events that include them. This ensures runIds are persisted
  // incrementally as events are published.
  if ("runIds" in event && event.runIds && event.runIds.length > 0) {
    await updateAgentMessageDBAndMemory(auth, {
      agentMessage,
      update: {
        type: "runIds",
        runIds: event.runIds,
      },
    });
  }

  switch (event.type) {
    case "agent_error":
      // Store error in database.
      await markAgentMessageAsFailed(auth, {
        agentMessage,
        error: event.error,
      });

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

    case "tool_error":
      await markAgentMessageAsFailed(auth, {
        agentMessage,
        error: event.error,
      });

      // Mark the conversation as errored.
      await ConversationResource.markHasError(auth, {
        conversation,
      });
      break;

    case "agent_generation_cancelled":
      // Store cancellation in database.
      await updateAgentMessageDBAndMemory(auth, {
        agentMessage,
        update: {
          type: "status",
          status: "cancelled",
        },
      });
      break;

    case "agent_message_success":
      await Promise.all([
        // Store success in database. runIds are already merged above.
        updateAgentMessageDBAndMemory(auth, {
          agentMessage,
          update: {
            type: "status",
            status: "succeeded",
          },
        }),
        // Mark the conversation as updated
        ConversationResource.markAsUpdated(auth, { conversation }),
      ]);

      break;

    default:
      // Ensure we handle all event types.
      break;
  }
}

// Process unread state for agent events before publishing to Redis.
async function processEventForUnreadState(
  auth: Authenticator,
  {
    event,
    conversation,
  }: { event: AgentMessageEvents; conversation: ConversationWithoutContentType }
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
  // Process DB updates and unread state for all events.
  await Promise.all([
    processEventForDatabase(auth, {
      event,
      agentMessage,
      step,
      conversation,
      modelInteractionDurationMs,
    }),
    processEventForUnreadState(auth, { event, conversation }),
  ]);

  // All events go through the coalescer, which handles batching logic internally.
  const key = `${conversation.sId}-${event.messageId}-${step}`;
  await globalCoalescer.handleEvent({
    conversationId: conversation.sId,
    event,
    key,
    step,
  });
}

export async function notifyWorkflowError(
  authType: AuthenticatorType,
  { conversationId, agentMessageId, agentMessageVersion }: AgentLoopArgs,
  error: Error
): Promise<void> {
  let authResult = await AuthenticatorClass.fromJSON(authType);

  // If subscription changed while the message was running, get a fresh auth with the current
  // subscription and continue gracefully.
  if (authResult.isErr() && authResult.error.code === "subscription_mismatch") {
    logger.info(
      {
        workspaceId: authType.workspaceId,
        originalSubscriptionId: authType.subscriptionId,
      },
      "Subscription changed while message was running, using fresh auth in notifyWorkflowError"
    );

    // Retry without the subscriptionId constraint to get the current subscription.
    authResult = await AuthenticatorClass.fromJSON({
      ...authType,
      subscriptionId: null,
    });
  }

  if (authResult.isErr()) {
    throw new Error(
      `Failed to deserialize authenticator: ${authResult.error.code}`
    );
  }
  const auth = authResult.value;

  // Use lighter fetchConversationWithoutContent
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    if (conversationRes.error.type === "conversation_not_found") {
      return;
    }

    throw new Error(`Conversation not found: ${conversationId}`);
  }
  const conversation = conversationRes.value;

  // Fetch the agent message using the proper API function
  const messageRow = await fetchMessageInConversation(
    auth,
    conversation,
    agentMessageId,
    agentMessageVersion
  );

  if (!messageRow?.agentMessage) {
    throw new Error(`Agent message not found: ${agentMessageId}`);
  }

  const errorEvent: AgentMessageEvents = {
    type: "agent_error",
    created: Date.now(),
    configurationId: messageRow.agentMessage.agentConfigurationId || "",
    messageId: agentMessageId,
    error: {
      code: "workflow_error",
      message: error.message || "Workflow execution failed",
      metadata: {
        category: "critical_failure",
        // Ensure errorName is a string (not an Error object or undefined)
        errorName: error.name || "UnknownError",
      },
    },
    // Workflow errors occur outside of LLM execution, so use existing runIds from DB
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

    // HACKY: These last 3 fields are not used in the workflow error case but required in the type.
    configuration: null as unknown as LightAgentConfigurationType,
    parentMessageId: null as unknown as string,
    parentAgentMessageId: null as unknown as string,
  };

  await updateResourceAndPublishEvent(auth, {
    event: errorEvent,
    agentMessage,
    conversation,
    step: 0, // Workflow-level error, not tied to a specific step
  });
}

/**
 * Activity executed after a cancel signal
 */
export async function finalizeCancellation(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const runAgentDataRes = await getAgentLoopData(authType, agentLoopArgs);
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
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

  // get the last step of the agent message
  const step = _.maxBy(agentMessage.contents, "step")?.step ?? 0;

  const contentParser = new AgentMessageContentParser(
    agentConfiguration,
    agentMessage.sId,
    getDelimitersConfiguration({ agentConfiguration })
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
