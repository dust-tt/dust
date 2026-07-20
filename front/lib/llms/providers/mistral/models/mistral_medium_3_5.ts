import { dropTemperature } from "@app/lib/llms/stream/types/configuration";

export function WithDustMistralMedium35Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMistralMedium35 extends Base {
    static readonly displayName = "Mistral Medium 3.5";
    static readonly description =
      "Mistral's `medium 3.5` model, multimodal and optimized for agentic and coding use cases (256k context).";
    static readonly defaultReasoningEffort = "none";
    // Legacy product value; the model has no separate output cap.
    static readonly maxOutputTokens = 2_048;
    static readonly byok = true;
    // Mistral rejects an explicit temperature on this model; drop it (matches
    // the legacy client's REASONING_OVERWRITES and the schema's undefined temp).
    static readonly parseConfig = dropTemperature;
  }

  return DustMistralMedium35;
}
