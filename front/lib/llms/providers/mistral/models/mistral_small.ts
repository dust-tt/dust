import { dropReasoning } from "@app/lib/llms/stream/types/configuration";
import { MISTRAL_SMALL_MODEL_CONFIG } from "@app/types/assistant/models/mistral";

export function WithDustMistralSmallConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMistralSmall extends Base {
    static readonly displayName = "Mistral Small";
    static readonly description = "Mistral's `small` model (128k context).";
    // Legacy product value; the model has no separate output cap.
    static readonly maxOutputTokens = 2_048;
    static readonly byok = true;
    // Non-reasoning model: drop the reasoning effort the schema rejects.
    static readonly configParsers = [dropReasoning];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = MISTRAL_SMALL_MODEL_CONFIG;
  }

  return DustMistralSmall;
}
