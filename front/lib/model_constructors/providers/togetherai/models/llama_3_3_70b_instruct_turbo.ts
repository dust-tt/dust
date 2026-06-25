import { togetheraiNonReasoningConfigSchema } from "@app/lib/model_constructors/providers/togetherai/inputConfig";
import { TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

// Verified against https://docs.together.ai/docs/serverless-models (2026-06-23):
// Llama 3.3 70B Instruct Turbo (FP8) has a 131,072-token context window.
const CONTEXT_SIZE = 131_072;
// Capability metadata only — the request does not send an explicit max (the
// openai-completions converter doesn't either), so TogetherAI uses its default.
const MAX_OUTPUT_TOKENS = 2_048;

// Mixin carrying shared config; runtime base differs per surface.
export function WithTogetheraiLlama3370BInstructTurboConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class TogetheraiLlama3370BInstructTurbo extends Base {
    static readonly modelId = TOGETHERAI_LLAMA_3_3_70B_INSTRUCT_TURBO_MODEL_ID;

    // Non-reasoning model: the API rejects `reasoning_effort`.
    static readonly configSchema = togetheraiNonReasoningConfigSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return TogetheraiLlama3370BInstructTurbo;
}
