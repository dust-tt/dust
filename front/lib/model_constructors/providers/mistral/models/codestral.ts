import { mistralNonReasoningConfigSchema } from "@app/lib/model_constructors/providers/mistral/inputConfig";
import { MISTRAL_CODESTRAL } from "@app/lib/model_constructors/types/models";

// Verified against https://docs.mistral.ai/getting-started/models/models_overview
// (2026-06-18): Codestral has a 128k-token context window. It is a code model
// with no vision support (enforced at the model-config/agent layer).
const CONTEXT_SIZE = 128_000;
// Capability metadata only (not sent to the API — Mistral uses its own
// default). Mistral publishes no separate output cap, so the ceiling is the
// context window; the Dust layer applies the 2048 product value.
const MAX_OUTPUT_TOKENS = CONTEXT_SIZE;

// Mixin carrying shared config; runtime base differs per surface.
export function WithMistralCodestralConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class MistralCodestral extends Base {
    static readonly model = MISTRAL_CODESTRAL;

    // Non-reasoning model: the API rejects `reasoning_effort`.
    static readonly configSchema = mistralNonReasoningConfigSchema;

    static readonly contextSize = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return MistralCodestral;
}
