import { dropTemperature } from "@app/lib/llms/stream/types/configuration";
import { MISTRAL_MEDIUM_3_5_MODEL_CONFIG } from "@app/types/assistant/models/mistral";

export function WithDustMistralMedium35Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustMistralMedium35Config extends Base {}
  const WithConfig = Object.assign(
    DustMistralMedium35Config,
    MISTRAL_MEDIUM_3_5_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustMistralMedium35 extends WithConfig {
    static readonly displayName = "Mistral Medium 3.5";
    static readonly description =
      "Mistral's `medium 3.5` model, multimodal and optimized for agentic and coding use cases (256k context).";
    static readonly defaultReasoningEffort = "none";
    // Legacy product value; the model has no separate output cap.
    static readonly maxOutputTokens = 2_048;
    static readonly byok = true;
    // Mistral rejects an explicit temperature on this model; drop it (matches
    // the legacy client's REASONING_OVERWRITES and the schema's undefined temp).
    static readonly configParsers = [dropTemperature];
  }

  return DustMistralMedium35;
}
