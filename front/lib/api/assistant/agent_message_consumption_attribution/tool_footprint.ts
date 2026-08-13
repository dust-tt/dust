import { getEnabledSkillInputTextByActionId } from "@app/lib/api/assistant/agent_message_consumption_attribution/enabled_skill_footprint";
import { renderActionForMultiActionsModel } from "@app/lib/api/assistant/conversation_rendering/helpers";
import { getTextContentFromMessage } from "@app/lib/api/assistant/utils";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import {
  GPT_4_1_MINI_MODEL_CONFIG,
  GPT_4_1_MODEL_CONFIG,
} from "@app/types/assistant/models/openai";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// Consumption attribution also runs for historical messages. These models are no longer in the
// serving registry, but their immutable tokenizer configurations remain valid for old run usage.
const HISTORICAL_TOKENIZATION_MODEL_CONFIGS = [
  GPT_4_1_MODEL_CONFIG,
  GPT_4_1_MINI_MODEL_CONFIG,
];

/**
 * The two texts an MCP action contributes to the model's token budget: the tool call the model
 * emitted on the output side and the model input created by the execution. Most tools only create a
 * renderable result. Enabling a skill also creates an instruction message and tool definitions.
 */
export interface ToolFootprintTexts {
  callText: string;
  /** Model input created by the execution, not parameters passed into the tool. */
  inputText: string;
}

/**
 * The measured footprint of one MCP action, aligned by position with the input actions. Named after
 * the model budget each side consumes. The emitted call counts as output, and everything the
 * execution adds to later model requests counts as input.
 */
export interface ToolFootprintMeasurement {
  callOutputTokensCount: number;
  /** Tokens added to model input by the execution, not tokens in the tool arguments. */
  inputTokensCount: number;
}

/**
 * One tool call to measure: the enriched action used to render the result, and the raw arguments
 * string the model emitted for the call. The arguments come straight from the resource rather than
 * the serialized action, so they exclude the inputs Dust injects afterwards.
 */
export interface ToolCallFootprintInput {
  action: AgentMCPActionWithOutputType;
  functionCallArguments: string;
}

export async function toolCallFootprintTexts(
  auth: Authenticator,
  { action, functionCallArguments }: ToolCallFootprintInput,
  {
    additionalInputText,
    conversationId,
    model,
  }: {
    additionalInputText?: string;
    conversationId: string;
    model: ModelConfigurationType;
  }
): Promise<ToolFootprintTexts> {
  // This applies model-facing output rewrites, such as semantic search rendering.
  const renderedResult = await renderActionForMultiActionsModel(
    auth,
    action,
    model,
    { conversationId }
  );

  return {
    // The tool call as the model emitted it: its name plus the arguments it generated.
    callText: `${action.functionCallName}\n${functionCallArguments}`,
    // Tool input means the model input created by this execution. Most tools contribute only their
    // rendered result. Enabling a skill also adds its instructions and tool definitions to later
    // requests, so those consequences belong to the same tool row.
    inputText: [getTextContentFromMessage(renderedResult), additionalInputText]
      .filter((text): text is string => text !== undefined)
      .join("\n"),
  };
}

/**
 * Measures, for each action, how many tokens the model spent emitting the tool call and how many
 * input tokens the execution contributes. Results stay aligned with `toolCalls`.
 *
 * Uses the exact tokenizer of the run's model through core, the same path conversation rendering
 * uses to size messages, so the counts closely match provider tokenization rather than a heuristic.
 */
export async function measureToolCallFootprints(
  auth: Authenticator,
  {
    conversationId,
    modelId,
    toolCalls,
  }: {
    conversationId: string;
    modelId: string;
    toolCalls: ToolCallFootprintInput[];
  }
): Promise<Result<ToolFootprintMeasurement[], Error>> {
  if (toolCalls.length === 0) {
    return new Ok([]);
  }

  const model =
    getModelConfigByModelId(modelId) ??
    HISTORICAL_TOKENIZATION_MODEL_CONFIGS.find(
      (configuration) => configuration.modelId === modelId
    );
  if (!model) {
    return new Err(
      new Error(`Cannot tokenize tool footprints: unknown model ${modelId}.`)
    );
  }

  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });

  const enabledSkillInputTextByActionId =
    await getEnabledSkillInputTextByActionId(
      auth,
      toolCalls.map(({ action }) => action)
    );

  // Rendering can sign model-facing file URLs, so keep it bounded while preserving input order.
  const footprints = await concurrentExecutor(
    toolCalls,
    (toolCall) =>
      toolCallFootprintTexts(auth, toolCall, {
        additionalInputText: enabledSkillInputTextByActionId.get(
          toolCall.action.sId
        ),
        conversationId,
        model,
      }),
    { concurrency: 5 }
  );
  // Tokenize the calls and inputs as two homogeneous lists so each count maps back to its call by
  // plain index, with no call-vs-input position juggling.
  const [callCountsRes, inputCountsRes] = await Promise.all([
    tokenCountForTexts(
      footprints.map((footprint) => footprint.callText),
      model,
      credentials
    ),
    tokenCountForTexts(
      footprints.map((footprint) => footprint.inputText),
      model,
      credentials
    ),
  ]);
  if (callCountsRes.isErr()) {
    return callCountsRes;
  }
  if (inputCountsRes.isErr()) {
    return inputCountsRes;
  }

  const callCounts = callCountsRes.value;
  const inputCounts = inputCountsRes.value;

  return new Ok(
    footprints.map((_, index) => ({
      callOutputTokensCount: callCounts[index],
      inputTokensCount: inputCounts[index],
    }))
  );
}
