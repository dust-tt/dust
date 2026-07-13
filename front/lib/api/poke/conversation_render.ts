import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { sliceConversationForAgentMessage } from "@app/temporal/agent_loop/lib/loop_utils";
import type { ConversationRenderReconstruction } from "@app/types/api/poke/conversation_render";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { getAgentLoopDataWithAuth } from "@app/types/assistant/agent_run";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";

export class RenderTargetError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404 = 400,
    readonly errorType:
      | "agent_configuration_not_found"
      | "invalid_request_error" = "invalid_request_error"
  ) {
    super(message);
  }
}

export type ConversationRenderTarget = {
  runAgentData: AgentLoopExecutionData;
  agentMessage: AgentMessageType;
  conversation: ConversationType;
  reconstruction: ConversationRenderReconstruction;
};

function findAgentMessage(
  conversation: ConversationType,
  agentMessageId: string,
  agentMessageVersion?: number
): AgentMessageType | undefined {
  return conversation.content
    .flat()
    .find(
      (message): message is AgentMessageType =>
        isAgentMessageType(message) &&
        message.sId === agentMessageId &&
        (agentMessageVersion === undefined ||
          message.version === agentMessageVersion)
    );
}

function findParentUserMessage(
  conversation: ConversationType,
  agentMessage: AgentMessageType
): UserMessageType | undefined {
  return conversation.content
    .flat()
    .find(
      (message): message is UserMessageType =>
        isUserMessageType(message) &&
        message.sId === agentMessage.parentMessageId
    );
}

export async function getHistoricalRunAgentData(
  auth: Authenticator,
  {
    conversation,
    agentMessageId,
    agentMessageVersion,
    step,
  }: {
    conversation: ConversationType;
    agentMessageId: string;
    agentMessageVersion?: number;
    step: number;
  }
): Promise<ConversationRenderTarget | RenderTargetError> {
  const targetAgentMessage = findAgentMessage(
    conversation,
    agentMessageId,
    agentMessageVersion
  );
  if (!targetAgentMessage) {
    return new RenderTargetError(
      "Agent message not found in this conversation."
    );
  }

  const userMessage = findParentUserMessage(conversation, targetAgentMessage);
  if (!userMessage) {
    return new RenderTargetError(
      "Parent user message not found in this conversation."
    );
  }

  const runAgentDataRes = await getAgentLoopDataWithAuth(auth, {
    agentMessageId: targetAgentMessage.sId,
    agentMessageVersion: targetAgentMessage.version,
    conversationBranchId: targetAgentMessage.branchId,
    conversationId: conversation.sId,
    conversationTitle: conversation.title,
    userMessageId: userMessage.sId,
    userMessageVersion: userMessage.version,
  });
  if (runAgentDataRes.isErr()) {
    return new RenderTargetError(runAgentDataRes.error.message);
  }

  const {
    auth: _runAuth,
    conversation: loopConversation,
    agentMessage: loopAgentMessage,
    ...rest
  } = runAgentDataRes.value;
  const { slicedConversation, slicedAgentMessage } =
    sliceConversationForAgentMessage(loopConversation, {
      agentMessageId: loopAgentMessage.sId,
      agentMessageVersion: loopAgentMessage.version,
      step,
    });

  return {
    agentMessage: slicedAgentMessage,
    conversation: slicedConversation,
    reconstruction: {
      agentId: rest.agentConfiguration.sId,
      agentMessageId: loopAgentMessage.sId,
      agentMessageVersion: loopAgentMessage.version,
      caveats: [
        "Uses the same agent-loop loader, step slicing, prompt and tool preparation, and renderer as runModel.",
        "Feature flags, tools, skills, and other mutable context are resolved now; compare with the recorded Poke or Langfuse trace for historical ground truth.",
      ],
      mode: "historical_step",
      step,
    },
    runAgentData: {
      ...rest,
      agentMessage: slicedAgentMessage,
      conversation: slicedConversation,
    },
  };
}

export async function getPreviewRunAgentData(
  auth: Authenticator,
  {
    agentId,
    conversation,
  }: {
    agentId: string;
    conversation: ConversationType;
  }
): Promise<ConversationRenderTarget | RenderTargetError> {
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId,
    variant: "full",
  });
  if (!agentConfiguration) {
    return new RenderTargetError(
      `Agent configuration not found for sId ${agentId}.`,
      404,
      "agent_configuration_not_found"
    );
  }

  const modelConfiguration = getSupportedModelConfig(agentConfiguration.model);
  if (!modelConfiguration) {
    return new RenderTargetError(
      `Model ${agentConfiguration.model.modelId} is not supported for rendering.`
    );
  }

  const userMessage = conversation.content
    .flat()
    .filter((message): message is UserMessageType => isUserMessageType(message))
    .at(-1);
  if (!userMessage) {
    return new RenderTargetError(
      "No user message found in conversation content."
    );
  }

  const syntheticAgentMessageId = generateRandomModelSId("msg");
  const placeholderAgentMessage: AgentMessageType = {
    type: "agent_message",
    sId: syntheticAgentMessageId,
    version: 0,
    rank: 0,
    branchId: null,
    created: Date.now(),
    completedTs: null,
    parentMessageId: userMessage.sId,
    parentAgentMessageId: null,
    status: "created",
    content: null,
    chainOfThought: null,
    error: null,
    id: -1,
    agentMessageId: -1,
    visibility: "visible",
    configuration: agentConfiguration,
    skipToolsValidation: false,
    actions: [],
    contents: [],
    modelInteractionDurationMs: null,
    completionDurationMs: null,
    richMentions: [],
    reactions: [],
    costCredits: null,
    resolvedModel: null,
    modelResolutionMethod: null,
  };
  const { model: agentModelConfiguration, ...agentConfigurationWithoutModel } =
    agentConfiguration;

  return {
    agentMessage: placeholderAgentMessage,
    conversation,
    reconstruction: {
      agentId,
      caveats: [
        "Uses the same prompt and tool preparation and renderer as runModel, but simulates a new run with a synthetic agent message.",
        "The whole current conversation and latest mutable configuration are used; this is a preview, not a historical replay.",
      ],
      mode: "live_preview",
      syntheticAgentMessageId,
    },
    runAgentData: {
      agentConfiguration: agentConfigurationWithoutModel,
      agentMessage: placeholderAgentMessage,
      conversation,
      model: {
        ...modelConfiguration,
        ...agentModelConfiguration,
        ...(modelConfiguration.supportsResponseFormat
          ? { responseFormat: agentModelConfiguration.responseFormat }
          : { responseFormat: undefined }),
      },
      userMessage,
    },
  };
}
