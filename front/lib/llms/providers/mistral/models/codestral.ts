import { dropReasoning } from "@app/lib/llms/stream/types/configuration";
import { MISTRAL_CODESTRAL_MODEL_CONFIG } from "@app/types/assistant/models/mistral";

export function WithDustMistralCodestralConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMistralCodestral extends Base {
    static readonly displayName = "Mistral Codestral";
    static readonly description =
      "Mistral's `codestral` model, specifically designed and optimized for code generation tasks.";
    // Legacy product value; the model has no separate output cap.
    static readonly maxOutputTokens = 2_048;
    static readonly byok = true;
    // Non-reasoning model: drop the reasoning effort the schema rejects.
    static readonly configParsers = [dropReasoning];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = MISTRAL_CODESTRAL_MODEL_CONFIG;
  }

  return DustMistralCodestral;
}
