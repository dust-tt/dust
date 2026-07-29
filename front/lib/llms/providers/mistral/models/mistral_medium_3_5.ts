import { dropTemperature } from "@app/lib/llms/stream/types/configuration";
import { MISTRAL_MEDIUM_3_5_MODEL_CONFIG } from "@app/types/assistant/models/mistral";

export function WithDustMistralMedium35Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMistralMedium35 extends Base {
    static readonly displayName = "Mistral Medium 3.5";
    static readonly description =
      "Mistral's `medium 3.5` model, multimodal and optimized for agentic and coding use cases (256k context).";
    // Legacy product value; the model has no separate output cap.
    static readonly maxOutputTokens = 2_048;
    static readonly byok = true;
    // Mistral rejects an explicit temperature on this model; drop it (matches
    // the legacy client's REASONING_OVERWRITES and the schema's undefined temp).
    static readonly configParsers = [dropTemperature];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = MISTRAL_MEDIUM_3_5_MODEL_CONFIG;
  }

  return DustMistralMedium35;
}
