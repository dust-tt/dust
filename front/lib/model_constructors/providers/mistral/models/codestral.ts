import { mistralNonReasoningConfigSchema } from "@app/lib/model_constructors/providers/mistral/inputConfig";
import { MISTRAL_CODESTRAL_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

// Verified against https://docs.mistral.ai/getting-started/models/models_overview
// (2026-06-18): Codestral has a 128k-token context window. It is a code model
// with no vision support (enforced at the model-config/agent layer).
const CONTEXT_SIZE = 128_000;
// Capability metadata only — the request does not send an explicit max (the
// legacy client doesn't either), so Mistral uses its own default.
const MAX_OUTPUT_TOKENS = 2_048;

// Mixin carrying shared config; runtime base differs per surface.
export function WithMistralCodestralConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class MistralCodestral extends Base {
    static readonly modelId = MISTRAL_CODESTRAL_MODEL_ID;

    // Non-reasoning model: the API rejects `reasoning_effort`.
    static readonly configSchema = mistralNonReasoningConfigSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return MistralCodestral;
}
