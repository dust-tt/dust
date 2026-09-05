/**
 * Run agent arguments
 */
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { PREVIOUS_INTERACTIONS_TO_PRESERVE } from "@app/lib/api/assistant/conversation_rendering";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import { resolveModel } from "@app/lib/api/assistant/resolve_model";
import { getStaticReplyForUserMessage } from "@app/lib/api/assistant/static_reply";
import { legacyModelIdToModel } from "@app/lib/api/llm";
import { selectPreferredStreamEndpointForWorkspace } from "@app/lib/api/llm/selectPreferredEndpointForWorkspace";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DustNoopNoopGlobalNoopStream } from "@app/lib/llms/stream/endpoints/noop_noop_global_noop";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { cacheWithRedis } from "@app/lib/utils/cache";
import type {
  AgentConfigurationType,
  AgentConfigurationWithoutModelType,
  AgentModelConfigurationType,
  GlobalAgentContext,
} from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageOrigin,
  UserMessageType,
} from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { NOOP_MODEL_ID } from "@app/types/assistant/models/noop";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import type { Result } from "../shared/result";
import { Err, Ok } from "../shared/result";
import { isGlobalAgentId } from "./assistant";
import { ConversationError } from "./conversation";

/**
 * Error types for getAgentLoopRuntimeData that indicate deleted or unavailable resources.
 * These are safe to ignore in callers since retrying won't make the data available.
 */
const AGENT_LOOP_DATA_SOFT_DELETE_ERROR_TYPES = [
  "conversation_deleted",
  "agent_message_deleted",
  "user_message_deleted",
] as const;

// Cache for 200 seconds, which maps to P95 execution time of the agent loop.
const AGENT_CONFIGURATION_CACHE_TTL_MS = 200 * 1000;

type AgentLoopDataSoftDeleteErrorType =
  (typeof AGENT_LOOP_DATA_SOFT_DELETE_ERROR_TYPES)[number];

class AgentLoopDataError extends Error {
  readonly type: AgentLoopDataSoftDeleteErrorType;

  constructor(type: AgentLoopDataSoftDeleteErrorType) {
    super(`Agent loop data unavailable: ${type}`);
    this.type = type;
  }
}

export function isAgentLoopDataSoftDeleteError(
  error: Error
): error is AgentLoopDataError {
  return (
    error instanceof AgentLoopDataError &&
    AGENT_LOOP_DATA_SOFT_DELETE_ERROR_TYPES.includes(error.type)
  );
}

class AgentLoopDataModelNotFoundError extends Error {
  readonly type = "model_not_found" as const;

  constructor(modelId: string) {
    super(`The selected model was not found ${modelId}.`);
    this.name = "AgentLoopDataModelNotFoundError";
  }
}

export function isAgentLoopDataModelNotFoundError(
  error: Error
): error is AgentLoopDataModelNotFoundError {
  return error instanceof AgentLoopDataModelNotFoundError;
}

export type ConversationCaching =
  | { useCachedGetConversation: false }
  | { useCachedGetConversation: true; unicitySuffix: string; ttlMs: number };

// Throws on error because cacheWithRedis expects functions that throw (not Result types).
// Errors are caught and converted back to Result in getFullAgentLoopDataWithAuth.
async function getConversationForAgentLoop(
  auth: Authenticator,
  conversationId: string,
  // These params are only used for cache key uniqueness.
  _workspaceId: string,
  _unicitySuffix: string
): Promise<ConversationType> {
  // biome-ignore lint/plugin/noExpensiveConversationFetch: intentional full conversation load
  const res = await getConversation(
    auth,
    conversationId,
    false,
    PREVIOUS_INTERACTIONS_TO_PRESERVE + 1 // X previous + the last one
  );
  if (res.isErr()) {
    throw res.error;
  }
  return res.value;
}

function getCachedGetConversation(ttlMs: number) {
  return cacheWithRedis(
    getConversationForAgentLoop,
    (_auth, conversationId, workspaceId, unicitySuffix) =>
      `${workspaceId}:${conversationId}:${unicitySuffix}`,
    {
      ttlMs,
      useDistributedLock: true,
    }
  );
}

export type AgentLoopArgs = {
  agentMessageId: string;
  agentMessageVersion: number;
  conversationId: string;
  conversationTitle: string | null;

  // Note that the original user message may not be the same as the parent message as agent might mention other agents.
  userMessageId: string;
  userMessageVersion: number;
  // Always set at launch time (the column is NOT NULL); consumers reading Temporal-serialized
  // args from old workflow histories must still tolerate a missing value at runtime.
  userMessageOrigin: UserMessageOrigin;

  caching?: ConversationCaching;

  // RunIds from the specific agent loop execution. Used by tracking workflows
  // to process only this execution's runs (not all accumulated runs on the message).
  dustRunIds?: string[];

  // The step at which this agent loop execution started. Used to filter MCP actions
  // to only those from this execution (step >= startStep).
  startStep?: number;

  runKey?: string;

  rootAgentMessageId?: string;
};

export type AgentMessageRef = {
  agentMessageId: string;
  conversationId: string;
};

export type ModelInfo<E> = {
  endpoint: E;
  temperature: number;
  reasoningEffort?: ReasoningEffort;
  responseFormat?: string;
  metaData?: Record<string, unknown>;
};

export type StreamModelInfo = ModelInfo<DustStreamEndpointConstructor>;

export type AgentLoopExecutionData = {
  // No models on the agent configuration as it might be different at run time (eg: auto mode, override by inputbar picker)
  agentConfiguration: AgentConfigurationWithoutModelType;
  modelInfo: StreamModelInfo;
  agentMessage: AgentMessageType;
  conversation: ConversationType;
  userMessage: UserMessageType;
};

export type AgentLoopRuntimeData = Omit<
  AgentLoopExecutionData,
  "conversation"
> & {
  conversation: Omit<ConversationType, "content">;
};

export type AgentLoopRuntimeDataWithAuth = AgentLoopRuntimeData & {
  auth: Authenticator;
};

export type FullAgentLoopDataWithAuth = AgentLoopExecutionData & {
  auth: Authenticator;
};

export type AgentLoopArgsWithTiming = AgentLoopArgs & {
  initialStartTime: number;
};

export async function getAgentLoopRuntimeData(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<Result<AgentLoopRuntimeDataWithAuth, AgentLoopDataError | Error>> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  return getAgentLoopRuntimeDataWithAuth(auth, agentLoopArgs);
}

/**
 * Same as getAgentLoopRuntimeData but accepts a pre-built Authenticator, avoiding redundant
 * Authenticator.fromJSON calls when the caller already has a valid auth.
 */
export async function getAgentLoopRuntimeDataWithAuth(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<Result<AgentLoopRuntimeDataWithAuth, AgentLoopDataError | Error>> {
  const conversation = await ConversationResource.fetchById(
    auth,
    agentLoopArgs.conversationId,
    { includeDeleted: true, includeForkingData: true }
  );
  if (!conversation || conversation.visibility === "deleted") {
    return new Err(new AgentLoopDataError("conversation_deleted"));
  }

  const messageRows = await ConversationResource.getMessageByIds(
    auth,
    conversation,
    [agentLoopArgs.agentMessageId, agentLoopArgs.userMessageId]
  );
  const agentMessageRow = messageRows.find(
    (message) =>
      message.sId === agentLoopArgs.agentMessageId &&
      message.version === agentLoopArgs.agentMessageVersion &&
      message.agentMessage
  );
  if (!agentMessageRow) {
    return new Err(new Error("Agent message not found"));
  }
  if (agentMessageRow.visibility === "deleted") {
    return new Err(new AgentLoopDataError("agent_message_deleted"));
  }

  const userMessageRow = messageRows.find(
    (message) =>
      message.sId === agentLoopArgs.userMessageId &&
      message.version === agentLoopArgs.userMessageVersion &&
      message.userMessage
  );
  if (!userMessageRow) {
    return new Err(new Error("Unexpected: User message not found"));
  }
  if (userMessageRow.visibility === "deleted") {
    return new Err(new AgentLoopDataError("user_message_deleted"));
  }

  const renderedMessages = await batchRenderMessages(
    auth,
    conversation,
    [userMessageRow, agentMessageRow],
    "full"
  );
  if (renderedMessages.isErr()) {
    return renderedMessages;
  }

  const agentMessage = renderedMessages.value.find(
    (message) =>
      isAgentMessageType(message) &&
      message.sId === agentLoopArgs.agentMessageId &&
      message.version === agentLoopArgs.agentMessageVersion
  );
  if (!agentMessage || !isAgentMessageType(agentMessage)) {
    return new Err(new Error("Agent message not found after rendering"));
  }

  const userMessage = renderedMessages.value.find(
    (message) =>
      isUserMessageType(message) &&
      message.sId === agentLoopArgs.userMessageId &&
      message.version === agentLoopArgs.userMessageVersion
  );
  if (!userMessage || !isUserMessageType(userMessage)) {
    return new Err(new Error("User message not found after rendering"));
  }

  return buildAgentLoopRuntimeData(auth, agentLoopArgs, {
    agentMessage,
    conversation: {
      ...conversation.toJSON(),
      owner: auth.getNonNullableWorkspace(),
      visibility: conversation.visibility,
    },
    userMessage,
  });
}

export async function getFullAgentLoopDataWithAuth(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<Result<FullAgentLoopDataWithAuth, AgentLoopDataError | Error>> {
  const { caching, conversationId } = agentLoopArgs;

  let conversation: ConversationType;
  if (caching?.useCachedGetConversation) {
    try {
      const cachedGetConversation = getCachedGetConversation(caching.ttlMs);
      conversation = await cachedGetConversation(
        auth,
        conversationId,
        auth.getNonNullableWorkspace().sId,
        caching.unicitySuffix
      );
    } catch (error) {
      if (
        error instanceof ConversationError &&
        error.type === "conversation_not_found"
      ) {
        // Check if the conversation was deleted or is no longer readable.
        const conv = await ConversationResource.fetchById(
          auth,
          conversationId,
          { includeDeleted: true }
        );
        if (!conv || conv.visibility === "deleted") {
          return new Err(new AgentLoopDataError("conversation_deleted"));
        }
      }
      if (error instanceof ConversationError) {
        return new Err(error);
      }
      throw error;
    }
  } else {
    // biome-ignore lint/plugin/noExpensiveConversationFetch: intentional full conversation load
    const conversationRes = await getConversation(
      auth,
      conversationId,
      false,
      PREVIOUS_INTERACTIONS_TO_PRESERVE + 1 // X previous + the last one
    );

    if (conversationRes.isErr()) {
      if (conversationRes.error.type === "conversation_not_found") {
        // Check if the conversation was deleted or is no longer readable.
        const conv = await ConversationResource.fetchById(
          auth,
          conversationId,
          { includeDeleted: true }
        );
        if (!conv || conv.visibility === "deleted") {
          return new Err(new AgentLoopDataError("conversation_deleted"));
        }
      }
      return conversationRes;
    }
    conversation = conversationRes.value;
  }

  return buildAgentLoopDataFromConversation(auth, agentLoopArgs, conversation);
}

export async function buildAgentLoopDataFromConversation(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs,
  conversation: ConversationType
): Promise<Result<FullAgentLoopDataWithAuth, AgentLoopDataError | Error>> {
  const {
    agentMessageId,
    agentMessageVersion,
    userMessageId,
    userMessageVersion,
  } = agentLoopArgs;

  // Find the agent message by searching all groups in reverse order. Retried messages do not have
  // the same sId as the original message, so we need to search all groups.
  let agentMessage: AgentMessageType | undefined;
  for (let i = conversation.content.length - 1; i >= 0 && !agentMessage; i--) {
    const messageGroup = conversation.content[i];
    for (const msg of messageGroup) {
      if (
        isAgentMessageType(msg) &&
        msg.sId === agentMessageId &&
        msg.version === agentMessageVersion
      ) {
        agentMessage = msg;
        break;
      }
    }
  }

  if (!agentMessage) {
    return new Err(new Error("Agent message not found"));
  }

  // Check if the agent message was soft-deleted.
  if (agentMessage.visibility === "deleted") {
    return new Err(new AgentLoopDataError("agent_message_deleted"));
  }

  // Find the user message group by searching in reverse order.
  const userMessageGroup = conversation.content.findLast((messageGroup) =>
    messageGroup.some((m) => m.sId === userMessageId)
  );

  // We assume that the message group is ordered by version ASC. Message version starts from 0.
  const userMessage = userMessageGroup?.[userMessageVersion];

  if (
    !userMessage ||
    !isUserMessageType(userMessage) ||
    userMessage.sId !== userMessageId ||
    userMessage.version !== userMessageVersion
  ) {
    return new Err(new Error("Unexpected: User message not found"));
  }

  // Check if the user message was soft-deleted.
  if (userMessage.visibility === "deleted") {
    return new Err(new AgentLoopDataError("user_message_deleted"));
  }

  const runtimeData = await buildAgentLoopRuntimeData(auth, agentLoopArgs, {
    agentMessage,
    conversation,
    userMessage,
  });
  if (runtimeData.isErr()) {
    return runtimeData;
  }

  return new Ok({
    ...runtimeData.value,
    conversation,
  });
}

async function buildAgentLoopRuntimeData(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs,
  {
    agentMessage,
    conversation,
    userMessage,
  }: {
    agentMessage: AgentMessageType;
    conversation: Omit<ConversationType, "content">;
    userMessage: UserMessageType;
  }
): Promise<Result<AgentLoopRuntimeDataWithAuth, Error>> {
  const { agentMessageId, agentMessageVersion } = agentLoopArgs;

  const agentId = agentMessage.configuration.sId;

  const globalAgentContext: GlobalAgentContext = {
    userMessageRank: userMessage.rank,
    sidekickIsNewAgentFromScratch:
      conversation.metadata?.sidekickIsNewAgentFromScratch === true ||
      undefined,
    staticReply: getStaticReplyForUserMessage({ conversation, userMessage }),
  };

  // As the agent configuration is never supposed to change during a loop, we can cache it for a long time.
  // The key will be different for a new message or a new version of the same message (retries).
  const agentConfiguration = await cacheWithRedis<
    AgentConfigurationType | null,
    Parameters<typeof getAgentConfiguration<"full">>
  >(
    getAgentConfiguration,
    () =>
      `agentMessageId:${agentMessageId}-agentConfigurationId:${agentId}-agentMessageVersion:${agentMessageVersion}`,
    {
      ttlMs: AGENT_CONFIGURATION_CACHE_TTL_MS,
    }
  )(auth, {
    agentId,
    // We do define agentMessage.configuration.version for global agent, ignoring this value here.
    agentVersion: isGlobalAgentId(agentMessage.configuration.sId)
      ? undefined
      : agentMessage.configuration.version,
    variant: "full" as const,
    globalAgentContext,
  });

  if (!agentConfiguration) {
    return new Err(new Error(`Agent configuration not found ${agentId}`));
  }

  const { model: agentModelConfig, ...agentConfigurationWithoutModel } =
    agentConfiguration;

  // The resolved model is stored in the agent message.
  // Legacy message will not have a resolved model.
  let { resolvedModel } = agentMessage;
  if (!resolvedModel && isModelStreamId(agentModelConfig.modelId)) {
    // Legacy messages have no stored model resolution. Global agent configurations ignore the
    // message's configuration version and may now use a stream, so resolve the stream before
    // selecting its endpoint.
    ({ resolvedModel } = await resolveModel(auth, {
      configuration: agentConfiguration,
      featureFlags: await getFeatureFlags(auth),
    }));
  }
  // Global agents may pin the noop model at run time (static replies from the dust and
  // sidekick agents, see `getStaticReplyForUserMessage`). The model stored on the agent
  // message was resolved at creation time without that context, so it must not override
  // the noop pin.
  const isNoopPinnedModel = agentModelConfig.modelId === NOOP_MODEL_ID;
  const resolvedModelConfig: AgentModelConfigurationType = {
    // Apply configuration that are not stored in the resolved model (temperature, responseFormat, etc.)
    ...agentModelConfig,
    // Apply the resolved model.
    ...(isNoopPinnedModel ? null : resolvedModel),
  };

  // Select the endpoint by its router-native `model` id (bare `Model`), 1-to-1
  // with legacy model selection.
  const model = legacyModelIdToModel(resolvedModelConfig.modelId);

  // The noop pin is internal (static replies): it must resolve for every workspace, so it
  // bypasses the workspace endpoint gating (feature flag, region) that applies to
  // user-selected models.
  const endpoint = isNoopPinnedModel
    ? DustNoopNoopGlobalNoopStream
    : model
      ? await selectPreferredStreamEndpointForWorkspace(auth, {
          model: { eq: model },
        })
      : null;

  if (!endpoint) {
    return new Err(
      new AgentLoopDataModelNotFoundError(resolvedModelConfig.modelId)
    );
  }

  const { temperature, reasoningEffort, responseFormat, metaData } =
    resolvedModelConfig;

  return new Ok({
    agentConfiguration: agentConfigurationWithoutModel,
    modelInfo: {
      endpoint,
      temperature,
      reasoningEffort,
      metaData,
      // Cleanup unsupported settings
      responseFormat: endpoint.modelConfig.supportsResponseFormat
        ? responseFormat
        : undefined,
    },
    agentMessage,
    auth,
    conversation,
    userMessage,
  });
}
