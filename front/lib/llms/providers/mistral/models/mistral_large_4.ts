import { MISTRAL_LARGE_4_MODEL_CONFIG } from "@app/types/assistant/models/mistral";

export function WithDustMistralLarge4Config<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase) {
  abstract class DustMistralLarge4 extends Base {
    static readonly displayName = "Mistral Large 4 (Preview)";
    static readonly description =
      "Mistral's `large 4` reasoning model, multimodal (512k context). Public preview.";
    // Legacy product value; the model has no separate output cap.
    static readonly maxOutputTokens = 2_048;
    static readonly byok = true;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = MISTRAL_LARGE_4_MODEL_CONFIG;
  }

  return DustMistralLarge4;
}
