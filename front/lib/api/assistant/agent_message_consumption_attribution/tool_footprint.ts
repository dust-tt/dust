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
 * emitted (output side) and the result's renderable footprint (input side). The result is priced by
 * the input it would occupy if carried into a later prompt, which it may never be (the message can
 * end, or the tool can be denied, before any following turn). Per-tool attribution prices both
 * footprints, so V1 measures them.
 */
export interface ToolFootprintTexts {
  callText: string;
  resultText: string;
}

/**
 * The measured footprint of one MCP action, aligned by position with the input actions. Named after
 * the model budget each side consumes: the emitted call counts as output, and the result counts as
 * the input it would occupy if carried into a later prompt, which it may never be.
 */
export interface ToolFootprintMeasurement {
  callOutputTokensCount: number;
  resultInputTokensCount: number;
}

/**
 * One tool call to measure: the enriched action for the result the model ingested, and the raw
 * arguments string the model emitted for the call. The arguments come straight from the resource
 * rather than the serialized action, so they exclude the inputs Dust injects afterwards.
 */
export interface ToolCallFootprintInput {
  action: AgentMCPActionWithOutputType;
  functionCallArguments: string;
}

export function toolCallFootprintTexts({
  action,
  functionCallArguments,
}: ToolCallFootprintInput): ToolFootprintTexts {
  return {
    // The tool call as the model emitted it: its name plus the arguments it generated.
    callText: `${action.functionCallName}\n${functionCallArguments}`,
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
    toolCalls,
  }: {
    modelId: string;
    toolCalls: ToolCallFootprintInput[];
  }
): Promise<Result<ToolFootprintMeasurement[], Error>> {
  if (toolCalls.length === 0) {
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
  // each count maps back to its call by plain index, with no call-vs-result position juggling.
  const footprints = toolCalls.map(toolCallFootprintTexts);
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
