import { dropReasoning } from "@app/lib/llms/stream/types/configuration";
import { MISTRAL_LARGE_MODEL_CONFIG } from "@app/types/assistant/models/mistral";

export function WithDustMistralLargeConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustMistralLargeConfig extends Base {}
  const WithConfig = Object.assign(
    DustMistralLargeConfig,
    MISTRAL_LARGE_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustMistralLarge extends WithConfig {
    static readonly displayName = "Mistral Large";
    static readonly description = "Mistral's `large` model (256k context).";
    // Mistral Large is a non-reasoning model.
    static readonly defaultReasoningEffort = "none";
    // Legacy product value; the model has no separate output cap.
    static readonly maxOutputTokens = 2_048;
    static readonly byok = true;
    // Non-reasoning model: drop the reasoning effort the schema rejects.
    static readonly configParsers = [dropReasoning];
  }

  return DustMistralLarge;
}
