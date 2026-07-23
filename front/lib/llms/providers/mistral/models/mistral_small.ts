import { dropReasoning } from "@app/lib/llms/stream/types/configuration";
import { MISTRAL_SMALL_MODEL_CONFIG } from "@app/types/assistant/models/mistral";

export function WithDustMistralSmallConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustMistralSmallConfig extends Base {}
  const WithConfig = Object.assign(
    DustMistralSmallConfig,
    MISTRAL_SMALL_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustMistralSmall extends WithConfig {
    static readonly displayName = "Mistral Small";
    static readonly description = "Mistral's `small` model (128k context).";
    // Mistral Small is a non-reasoning model.
    static readonly defaultReasoningEffort = "none";
    // Legacy product value; the model has no separate output cap.
    static readonly maxOutputTokens = 2_048;
    static readonly byok = true;
    // Non-reasoning model: drop the reasoning effort the schema rejects.
    static readonly configParsers = [dropReasoning];
  }

  return DustMistralSmall;
}
