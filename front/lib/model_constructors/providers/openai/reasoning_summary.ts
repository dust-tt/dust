import type { OpenAIReasoningSummary } from "@app/lib/model_constructors/sdk/openai_responses/converters/input/utils";
import type { Model } from "@app/lib/model_constructors/types/models";

export function openAIReasoningSummaryForModel(
  model: Model
): OpenAIReasoningSummary {
  // Concise summaries are supported by OpenAI reasoning models after GPT-5.
  // https://developers.openai.com/api/docs/guides/reasoning#reasoning-summaries
  return model.startsWith("gpt-5.") ? "concise" : "auto";
}
