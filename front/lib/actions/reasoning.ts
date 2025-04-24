import { DEFAULT_REASONING_ACTION_NAME } from "@app/lib/actions/constants";
import { runActionStreamed } from "@app/lib/actions/server";
import type {
  BaseActionRunParams,
  ExtractActionBlob,
} from "@app/lib/actions/types";
import {
  BaseAction,
  BaseActionConfigurationServerRunner,
} from "@app/lib/actions/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { dustAppRunInputsToInputSchema } from "@app/lib/actions/types/agent";
import { isReasoningConfiguration } from "@app/lib/actions/types/guards";
import { AgentMessageContentParser } from "@app/lib/api/assistant/agent_message_content_parser";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import { getRedisClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentReasoningAction } from "@app/lib/models/assistant/actions/reasoning";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import logger from "@app/logger/logger";
import type {
  FunctionCallType,
  FunctionMessageTypeModel,
  GenerationTokensEvent,
  ModelId,
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffortIdType,
  Result,
  TokensClassification,
} from "@app/types";
import {
  CLAUDE_3_7_SONNET_20250219_MODEL_ID,
  isProviderWhitelisted,
  Ok,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";

const CANCELLATION_CHECK_INTERVAL = 500;

const REASONING_GENERATION_TOKENS = 20480;

export type ReasoningConfigurationType = {
  description: string | null;
  id: ModelId;
  modelId: ModelIdType;
  name: string;
  providerId: ModelProviderIdType;
  reasoningEffort: ReasoningEffortIdType | null;
  sId: string;
  temperature: number | null;
  type: "reasoning_configuration";
};

export type ReasoningModelConfiguration = Omit<
  ReasoningConfigurationType,
  "id" | "sId" | "type" | "temperature"
>;

type ReasoningErrorEvent = {
  type: "reasoning_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: "reasoning_error";
    message: string;
  };
};

type ReasoningStartedEvent = {
  type: "reasoning_started";
  created: number;
  configurationId: string;
  messageId: string;
  action: ReasoningActionType;
};

type ReasoningThinkingEvent = {
  type: "reasoning_thinking";
  created: number;
  configurationId: string;
  messageId: string;
  action: ReasoningActionType;
};

type ReasoningSuccessEvent = {
  type: "reasoning_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: ReasoningActionType;
};

type ReasoningTokensEvent = {
  type: "reasoning_tokens";
  created: number;
  configurationId: string;
  messageId: string;
  action: ReasoningActionType;
  content: string;
  classification: TokensClassification;
};

export type ReasoningActionRunningEvents =
  | ReasoningStartedEvent
  | ReasoningThinkingEvent
  | ReasoningTokensEvent;

type ReasoningActionBlob = ExtractActionBlob<ReasoningActionType>;

export class ReasoningActionType extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly output: string | null;
  readonly thinking: string | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly type = "reasoning_action";

  constructor(blob: ReasoningActionBlob) {
    super(blob.id, blob.type);

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
      inputSchema: dustAppRunInputsToInputSchema([]),
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
      action: new ReasoningActionType({
        id: action.id,
        agentMessageId: action.agentMessageId,
        output: null,
        thinking: null,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
        type: "reasoning_action",
        generatedFiles: [],
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

    if (supportedModel.modelId === CLAUDE_3_7_SONNET_20250219_MODEL_ID) {
      // We can't pass a temperature different from 1.0 in thinking mode: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking#important-considerations-when-using-extended-thinking
      config.MODEL.temperature = 1.0;
      delete config.MODEL.top_p;
      // Pass some extra field: https://docs.anthropic.com/en/docs/about-claude/models/extended-thinking-models#extended-output-capabilities-beta
      config.MODEL.anthropic_beta_thinking = {
        type: "enabled",
        budget_tokens: 6400,
      };
      // Add the beta flag for larger outputs.
      config.MODEL.anthropic_beta_flags = ["output-128k-2025-02-19"];
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
          action: new ReasoningActionType({
            id: action.id,
            agentMessageId: action.agentMessageId,
            output: actionOutput.content,
            thinking: actionOutput.thinking,
            functionCallId: action.functionCallId,
            functionCallName: action.functionCallName,
            step: action.step,
            type: "reasoning_action",
            generatedFiles: [],
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
      action: new ReasoningActionType({
        id: action.id,
        agentMessageId: action.agentMessageId,
        output: actionOutput.content,
        thinking: actionOutput.thinking,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
        type: "reasoning_action",
        generatedFiles: [],
      }),
    };

    yield {
      type: "reasoning_success",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new ReasoningActionType({
        id: action.id,
        agentMessageId: action.agentMessageId,
        output: actionOutput.content,
        thinking: actionOutput.thinking,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
        type: "reasoning_action",
        generatedFiles: [],
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
    return new ReasoningActionType({
      id: action.id,
      agentMessageId: action.agentMessageId,
      output: action.output,
      thinking: action.thinking,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      step: action.step,
      type: "reasoning_action",
      generatedFiles: [],
    });
  });
}
