import type {
  AgentActionSpecification,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  Result,
  VisualizationActionType,
  VisualizationConfigurationType,
  VisualizationErrorEvent,
  VisualizationGenerationTokensEvent,
  VisualizationParamsEvent,
  VisualizationSuccessEvent,
} from "@dust-tt/types";
import {
  BaseAction,
  cloneBaseConfig,
  DustProdActionRegistry,
  Ok,
  VisualizationActionOutputSchema,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";

import { runActionStreamed } from "@app/lib/actions/server";
import { DEFAULT_VISUALIZATION_ACTION_NAME } from "@app/lib/api/assistant/actions/names";
import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import { renderConversationForModelMultiActions } from "@app/lib/api/assistant/generation";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { AgentVisualizationAction } from "@app/lib/models/assistant/actions/visualization";
import logger from "@app/logger/logger";

interface VisualizationActionBlob {
  id: ModelId; // VisualizationAction
  agentMessageId: ModelId;
  generation: string | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}

export class VisualizationAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly generation: string | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly type = "visualization_action";

  constructor(blob: VisualizationActionBlob) {
    super(blob.id, "visualization_action");

    this.agentMessageId = blob.agentMessageId;
    this.generation = blob.generation;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  // Visualization is not a function call, it is pure generation cause we need streaming.
  // We fake a function call for the multi-actions model because
  // we cannot render two agent messages in a row.
  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? DEFAULT_VISUALIZATION_ACTION_NAME,
      arguments: JSON.stringify({}),
    };
  }

  renderForMultiActionsModel(): FunctionMessageTypeModel {
    let content = "VISUALIZATION OUTPUT:\n";
    if (this.generation === null) {
      content += "The visualization failed.\n";
    } else {
      content += this.generation ?? "";
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? DEFAULT_VISUALIZATION_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

/**
 * Params generation.
 */

export class VisualizationConfigurationServerRunner extends BaseActionConfigurationServerRunner<VisualizationConfigurationType> {
  async buildSpecification(
    auth: Authenticator,
    { name, description }: { name: string; description: string | null }
  ): Promise<Result<AgentActionSpecification, Error>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Unexpected unauthenticated call to `runVisualizationAction`"
      );
    }

    return new Ok({
      name,
      description:
        description ||
        "Generates code to represent the requested data in a graph.",
      inputs: [],
    });
  }

  // Visualization does not use citations.
  getCitationsCount(): number {
    return 0;
  }

  // Create the VisualizationAction object in the database and yield an event for the generation of
  // the params. We store the action here as the params have been generated, if an error occurs
  // later on, the action won't have outputs but the error will be stored on the parent agent
  // message.
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
    | VisualizationParamsEvent
    | VisualizationSuccessEvent
    | VisualizationErrorEvent
    | VisualizationGenerationTokensEvent,
    void
  > {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Unexpected unauthenticated call to `run` for visualization action"
      );
    }

    const { actionConfiguration } = this;

    // Create the VisualizationAction object in the database and yield an event for the generation of
    // the params. We store the action here as the params have been generated, if an error occurs
    // later on, the action won't have outputs but the error will be stored on the parent agent
    // message.
    const action = await AgentVisualizationAction.create({
      visualizationConfigurationId: actionConfiguration.sId,
      generation: null,
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step,
    });

    const now = Date.now();

    yield {
      type: "visualization_params",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new VisualizationAction({
        id: action.id,
        agentMessageId: action.agentMessageId,
        generation: null,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        step: action.step,
      }),
    };

    // Turn the conversation into a digest that can be presented to the model.
    const MIN_GENERATION_TOKENS = 2048;
    const agentModelConfig = getSupportedModelConfig(agentConfiguration.model);
    const modelConversationRes = await renderConversationForModelMultiActions({
      conversation,
      model: agentModelConfig,
      prompt: "", // There is no prompt for title generation.
      allowedTokenCount: agentModelConfig.contextSize - MIN_GENERATION_TOKENS,
      excludeActions: false,
      excludeImages: true,
    });

    if (modelConversationRes.isErr()) {
      yield {
        type: "visualization_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "conversation_rendering_error",
          message: modelConversationRes.error.message,
        },
      };
      return;
    }

    // Configure the Vizualization Dust App to the assistant model configuration.
    const config = cloneBaseConfig(
      DustProdActionRegistry["assistant-v2-visualization"].config
    );
    const model = agentConfiguration.model;
    config.MODEL.provider_id = model.providerId;
    config.MODEL.model_id = model.modelId;
    config.MODEL.temperature = model.temperature;

    // Execute the Vizualization Dust App.
    const visualizationRes = await runActionStreamed(
      auth,
      "assistant-v2-visualization",
      config,
      [
        {
          conversation: modelConversationRes.value.modelConversation,
        },
      ],
      {
        conversationId: conversation.sId,
        workspaceId: conversation.owner.sId,
        agentMessageId: agentMessage.sId,
      }
    );

    if (visualizationRes.isErr()) {
      yield {
        type: "visualization_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "code_interpeter_execution_error",
          message: visualizationRes.error.message,
        },
      };
      return;
    }

    const { eventStream, dustRunId } = visualizationRes.value;
    let generation: string | null = null;

    for await (const event of eventStream) {
      if (event.type === "tokens") {
        yield {
          type: "visualization_generation_tokens",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          actionId: action.id,
          text: event.content.tokens.text,
        };
      }
      if (event.type === "error") {
        logger.error(
          {
            workspaceId: owner.id,
            conversationId: conversation.id,
            error: event.content.message,
          },
          "Error running visualization action"
        );
        yield {
          type: "visualization_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "visualization_execution_error",
            message: event.content.message,
          },
        };
        return;
      }
      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];
        if (e.error) {
          logger.error(
            {
              workspaceId: owner.id,
              conversationId: conversation.id,
              error: e.error,
            },
            "Error running visualization action"
          );
          yield {
            type: "visualization_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: {
              code: "visualization_execution_error",
              message: e.error,
            },
          };
          return;
        }

        if (event.content.block_name === "OUTPUT" && e.value) {
          const outputValidation = VisualizationActionOutputSchema.decode(
            e.value
          );
          if (isLeft(outputValidation)) {
            logger.error(
              {
                workspaceId: owner.id,
                conversationId: conversation.id,
                error: outputValidation.left,
              },
              "Error running visualization action"
            );
            yield {
              type: "visualization_error",
              created: Date.now(),
              configurationId: agentConfiguration.sId,
              messageId: agentMessage.sId,
              error: {
                code: "visualization_execution_error",
                message: `Invalid output from visualization action: ${outputValidation.left}`,
              },
            };
            return;
          }
          generation = outputValidation.right.generation;
        }
      }
    }

    logger.info(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        elapsed: Date.now() - now,
      },
      "[ASSISTANT_TRACE] Visualization action execution"
    );

    await action.update({ runId: await dustRunId, generation });
  }
}

/**
 * Action rendering.
 */

// Internal interface for the retrieval and rendering of a actions from AgentMessage ModelIds. This
// should not be used outside of api/assistant. We allow a ModelId interface here because for
// optimization purposes to avoid duplicating DB requests while having clear action specific code.
export async function visualizationActionTypesFromAgentMessageIds(
  agentMessageIds: ModelId[]
): Promise<VisualizationActionType[]> {
  const models = await AgentVisualizationAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
  });

  return models.map((action) => {
    return new VisualizationAction({
      id: action.id,
      agentMessageId: action.agentMessageId,
      generation: action.generation,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      step: action.step,
    });
  });
}
