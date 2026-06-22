import { mistralNonReasoningConfigSchema } from "@app/lib/model_constructors/providers/mistral/inputConfig";
import { MISTRAL_SMALL_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

// Verified against https://docs.mistral.ai/getting-started/models/models_overview
// (2026-06-18): Mistral Small has a 128k-token context window.
const CONTEXT_SIZE = 128_000;
// Capability metadata only — the request does not send an explicit max (the
// legacy client doesn't either), so Mistral uses its own default.
const MAX_OUTPUT_TOKENS = 2_048;

// Mixin carrying shared config; runtime base differs per surface.
export function WithMistralSmallConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class MistralSmall extends Base {
    static readonly modelId = MISTRAL_SMALL_MODEL_ID;

    // Non-reasoning model: the API rejects `reasoning_effort`.
    static readonly configSchema = mistralNonReasoningConfigSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return MistralSmall;
}
