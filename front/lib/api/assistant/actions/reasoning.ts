import { runActionStreamed } from "@app/lib/actions/server";
import { DEFAULT_REASONING_ACTION_NAME } from "@app/lib/api/assistant/actions/constants";
import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import { AgentMessageContentParser } from "@app/lib/api/assistant/agent_message_content_parser";
import { renderConversationForModel } from "@app/lib/api/assistant/generation";
import { getRedisClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentReasoningAction } from "@app/lib/models/assistant/actions/reasoning";
import { getDustProdAction } from "@app/lib/registry";
import { cloneBaseConfig } from "@app/lib/registry";
import logger from "@app/logger/logger";
import type {
  AgentActionSpecification,
  FunctionCallType,
  FunctionMessageTypeModel,
  GenerationTokensEvent,
  ModelId,
  ReasoningActionType,
  ReasoningConfigurationType,
  ReasoningErrorEvent,
  ReasoningStartedEvent,
  ReasoningSuccessEvent,
  ReasoningThinkingEvent,
  ReasoningTokensEvent,
  Result,
} from "@app/types";
import {
  BaseAction,
  isProviderWhitelisted,
  isReasoningConfiguration,
  Ok,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";

interface ReasoningActionBlob {
  id: ModelId;
  agentMessageId: ModelId;
  output: string | null;
  thinking: string | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}

const CANCELLATION_CHECK_INTERVAL = 500;

const REASONING_GENERATION_TOKENS = 20480;

export class ReasoningAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly output: string | null;
  readonly thinking: string | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly type = "reasoning_action";

  constructor(blob: ReasoningActionBlob) {
    super(blob.id, "reasoning_action");

    this.agentMessageId = blob.agentMessageId;

    this.output = blob.output;
    this.thinking = blob.thinking;

    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? DEFAULT_REASONING_ACTION_NAME,
      arguments: JSON.stringify({}),
    };
  }

  async renderForMultiActionsModel(): Promise<FunctionMessageTypeModel> {
    return {
      role: "function",
      name: this.functionCallName ?? DEFAULT_REASONING_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      // TODO(REASONING TOOL): decide if we want to add the thinking here.
      // (probably not)
      content: this.output || "(reasoning failed)",
    };
  }
}

export class ReasoningConfigurationServerRunner extends BaseActionConfigurationServerRunner<ReasoningConfigurationType> {
  async buildSpecification(
    auth: Authenticator,
    { name, description }: { name: string; description: string | null }
  ): Promise<Result<AgentActionSpecification, Error>> {
    return new Ok({
      name,
      description:
        description ||
        "Perform complex step-by-step reasoning using an advanced AI model.",
      inputs: [],
    });
  }

  async *run(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
      agentMessage,
      functionCallId,
      step,
    }: BaseActionRunParams
  ): AsyncGenerator<
    | ReasoningErrorEvent
    | ReasoningStartedEvent
    | ReasoningThinkingEvent
    | ReasoningSuccessEvent
    | ReasoningTokensEvent
  > {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Unexpected unauthenticated call to `runReasoningAction`"
      );
    }

    const { actionConfiguration } = this;

    const action = await AgentReasoningAction.create({
      reasoningConfigurationId: actionConfiguration.sId,
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step,
      workspaceId: owner.id,
    });

    yield {
      type: "reasoning_started",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new ReasoningAction({
        id: action.id,
        agentMessageId: action.agentMessageId,
        output: null,
        thinking: null,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
      }),
    };

    const actionConfig = agentConfiguration.actions.find(
      (action) =>
        action.type === "reasoning_configuration" &&
        action.sId === actionConfiguration.sId
    );

    if (!actionConfig || !isReasoningConfiguration(actionConfig)) {
      throw new Error("Unreachable: Reasoning configuration not found");
    }
    const supportedModel = SUPPORTED_MODEL_CONFIGS.find(
      (m) =>
        m.modelId === actionConfig.modelId &&
        m.providerId === actionConfig.providerId
    );

    if (!supportedModel) {
      yield {
        type: "reasoning_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "reasoning_error",
          message: "Reasoning configuration not found",
        },
      };
      return;
    }

    if (!isProviderWhitelisted(owner, supportedModel.providerId)) {
      yield {
        type: "reasoning_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "reasoning_error",
          message: "Provider not supported",
        },
      };
      return;
    }

    if (supportedModel.featureFlag) {
      const featureFlags = await getFeatureFlags(owner);
      if (!featureFlags.includes(supportedModel.featureFlag)) {
        yield {
          type: "reasoning_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "reasoning_error",
            message: "Model not allowed.",
          },
        };
        return;
      }
    }

    const renderedConversationRes = await renderConversationForModel(auth, {
      conversation,
      model: supportedModel,
      prompt: agentConfiguration.instructions ?? "",
      allowedTokenCount:
        supportedModel.contextSize - REASONING_GENERATION_TOKENS,
      excludeImages: true,
    });
    if (renderedConversationRes.isErr()) {
      yield {
        type: "reasoning_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "reasoning_error",
          message: `Error running reasoning action: ${renderedConversationRes.error.message}`,
        },
      };
      return;
    }
    const renderedConversation = renderedConversationRes.value;

    const config = cloneBaseConfig(
      getDustProdAction("assistant-v2-reason").config
    );

    config.MODEL.provider_id = supportedModel.providerId;
    config.MODEL.model_id = supportedModel.modelId;
    if (actionConfig.temperature) {
      config.MODEL.temperature = actionConfig.temperature;
    }
    if (actionConfig.reasoningEffort) {
      config.MODEL.reasoning_effort = actionConfig.reasoningEffort;
    }

    const inputs = [
      {
        conversation: renderedConversation.modelConversation.messages,
        instructions: agentConfiguration.instructions,
      },
    ];

    const res = await runActionStreamed(
      auth,
      "assistant-v2-reason",
      config,
      inputs,
      {
        conversationId: conversation.sId,
        workspaceId: conversation.owner.sId,
        agentMessageId: agentMessage.sId,
      }
    );

    if (res.isErr()) {
      yield {
        type: "reasoning_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "reasoning_error",
          message: `Error running reasoning action: ${res.error.message}`,
        },
      };
      return;
    }

    const { eventStream, dustRunId } = res.value;

    const contentParser = new AgentMessageContentParser(
      agentConfiguration,
      agentMessage.sId,
      supportedModel.delimitersConfiguration
    );

    const redis = await getRedisClient({ origin: "reasoning_generation" });
    let lastCheckCancellation = Date.now();

    const actionOutput = {
      content: "",
      thinking: "",
    };
    async function* processTokensEvents(
      stream: AsyncGenerator<GenerationTokensEvent>
    ): AsyncGenerator<ReasoningTokensEvent> {
      for await (const token of stream) {
        if (
          token.classification === "opening_delimiter" ||
          token.classification === "closing_delimiter"
        ) {
          continue;
        }

        if (token.classification === "chain_of_thought") {
          actionOutput.thinking += token.text;
        } else {
          actionOutput.content += token.text;
        }

        yield {
          type: "reasoning_tokens",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          action: new ReasoningAction({
            id: action.id,
            agentMessageId: action.agentMessageId,
            output: actionOutput.content,
            thinking: actionOutput.thinking,
            functionCallId: action.functionCallId,
            functionCallName: action.functionCallName,
            step: action.step,
          }),
          content: token.text,
          classification: token.classification,
        } satisfies ReasoningTokensEvent;
      }
    }

    for await (const event of eventStream) {
      if (event.type === "function_call") {
        continue;
      }
      if (event.type === "error") {
        yield* processTokensEvents(contentParser.flushTokens());
        yield {
          type: "reasoning_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "reasoning_error",
            message: `Error running reasoning action: ${event.content.message}`,
          },
        };
        return;
      }

      const currentTimestamp = Date.now();
      if (
        currentTimestamp - lastCheckCancellation >=
        CANCELLATION_CHECK_INTERVAL
      ) {
        try {
          const cancelled = await redis.get(
            `assistant:generation:cancelled:${agentMessage.sId}`
          );
          if (cancelled === "1") {
            return;
          }
          lastCheckCancellation = currentTimestamp;
        } catch (error) {
          logger.error({ error }, "Error checking cancellation");
        }
      }

      if (event.type === "tokens") {
        yield* processTokensEvents(
          contentParser.emitTokens(event.content.tokens.text)
        );
      }

      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (e.error) {
          yield* processTokensEvents(contentParser.flushTokens());
          yield {
            type: "reasoning_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: {
              code: "reasoning_error",
              message: `Error running reasoning action: ${e.error}`,
            },
          } satisfies ReasoningErrorEvent;
          return;
        }
      }
    }

    yield* processTokensEvents(contentParser.flushTokens());

    yield {
      type: "reasoning_thinking",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new ReasoningAction({
        id: action.id,
        agentMessageId: action.agentMessageId,
        output: actionOutput.content,
        thinking: actionOutput.thinking,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
      }),
    };

    yield {
      type: "reasoning_success",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new ReasoningAction({
        id: action.id,
        agentMessageId: action.agentMessageId,
        output: actionOutput.content,
        thinking: actionOutput.thinking,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
      }),
    };

    await action.update({
      output: actionOutput.content,
      thinking: actionOutput.thinking,
      runId: await dustRunId,
    });
  }
}

export async function reasoningActionTypesFromAgentMessageIds(
  agentMessageIds: ModelId[]
): Promise<ReasoningActionType[]> {
  const models = await AgentReasoningAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
  });

  return models.map((action) => {
    return new ReasoningAction({
      id: action.id,
      agentMessageId: action.agentMessageId,
      output: action.output,
      thinking: action.thinking,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      step: action.step,
    });
  });
}
