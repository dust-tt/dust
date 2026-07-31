import { renderToolResultForModelAsText } from "@app/lib/api/assistant/conversation_rendering/helpers";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { tokenCountForTexts } from "@app/lib/tokenization";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * The two texts an MCP action contributes to the model's token budget: the tool call the model
 * emitted (output side) and the result the model then ingested (input side). Per-tool attribution
 * prices these two footprints, so V1 measures both.
 */
export interface ToolFootprintTexts {
  callText: string;
  resultText: string;
}

/**
 * The measured footprint of one MCP action, aligned by position with the input actions. Named after
 * the model budget each side consumes: the emitted call counts as output, the ingested result as
 * input.
 */
export interface ToolFootprintMeasurement {
  callOutputTokensCount: number;
  resultInputTokensCount: number;
}

// The model emits a tool call as a function name plus its JSON arguments. This mirrors that shape so
// the token count reflects what the model actually generated to invoke the tool.
function serializeToolCallText(action: AgentMCPActionWithOutputType): string {
  return `${action.functionCallName}\n${JSON.stringify(action.params)}`;
}

export function toolCallFootprintTexts(
  action: AgentMCPActionWithOutputType
): ToolFootprintTexts {
  return {
    callText: serializeToolCallText(action),
    // The exact text the model saw for the result, shared with conversation rendering so the
    // estimate never drifts from what was actually sent. Image content is not counted here: it is
    // priced under a separate tile-based model, out of scope for text tokenization.
    resultText: renderToolResultForModelAsText(action),
  };
}

/**
 * Measures, for each action, how many tokens the model spent emitting the tool call and how many the
 * returned result occupied in the following prompt. Results are order-aligned with `actions`.
 *
 * Uses the exact tokenizer of the run's model through core, the same path conversation rendering
 * uses to size messages, so the counts (_almost_) match what the provider billed rather than a heuristic.
 */
export async function measureToolCallFootprints(
  auth: Authenticator,
  {
    modelId,
    actions,
  }: {
    modelId: string;
    actions: AgentMCPActionWithOutputType[];
  }
): Promise<Result<ToolFootprintMeasurement[], Error>> {
  if (actions.length === 0) {
    return new Ok([]);
  }

  const model = getModelConfigByModelId(modelId);
  if (!model) {
    return new Err(
      new Error(`Cannot tokenize tool footprints: unknown model ${modelId}.`)
    );
  }

  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });

  // Tokenize the calls and the results as two homogeneous lists rather than one interleaved list, so
  // each count maps back to its action by plain index, with no call-vs-result position juggling.
  const footprints = actions.map(toolCallFootprintTexts);
  const [callCountsRes, resultCountsRes] = await Promise.all([
    tokenCountForTexts(
      footprints.map((footprint) => footprint.callText),
      model,
      credentials
    ),
    tokenCountForTexts(
      footprints.map((footprint) => footprint.resultText),
      model,
      credentials
    ),
  ]);
  if (callCountsRes.isErr()) {
    return callCountsRes;
  }
  if (resultCountsRes.isErr()) {
    return resultCountsRes;
  }
  const callCounts = callCountsRes.value;
  const resultCounts = resultCountsRes.value;

  return new Ok(
    footprints.map((_, index) => ({
      callOutputTokensCount: callCounts[index],
      resultInputTokensCount: resultCounts[index],
    }))
  );
}
