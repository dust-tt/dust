import type { OpenAIReasoningSummary } from "@app/lib/model_constructors/sdk/openai_responses/converters/input/utils";
import type { Model } from "@app/lib/model_constructors/types/models";
import {
  GPT_5_2,
  GPT_5_4,
  GPT_5_4_MINI,
  GPT_5_4_NANO,
  GPT_5_5,
  GPT_5_6_LUNA,
  GPT_5_6_SOL,
  GPT_5_6_TERRA,
  GPT_5_6_TERRA_LONG_CONTEXT,
  GPT_6_ASTRA,
} from "@app/lib/model_constructors/types/models";

const MODELS_WITH_CONCISE_REASONING_SUMMARIES: ReadonlySet<Model> = new Set([
  GPT_5_2,
  GPT_5_4,
  GPT_5_4_MINI,
  GPT_5_4_NANO,
  GPT_5_5,
  GPT_5_6_SOL,
  GPT_6_ASTRA,
  GPT_5_6_TERRA,
  GPT_5_6_TERRA_LONG_CONTEXT,
  GPT_5_6_LUNA,
]);

export function openAIReasoningSummaryForModel(
  model: Model,
  conciseReasoningSummary: boolean
): OpenAIReasoningSummary {
  // OpenAI introduced concise reasoning summaries with GPT-5.2.
  // https://developers.openai.com/api/docs/guides/reasoning#reasoning-summaries
  return conciseReasoningSummary &&
    MODELS_WITH_CONCISE_REASONING_SUMMARIES.has(model)
    ? "concise"
    : "auto";
}
