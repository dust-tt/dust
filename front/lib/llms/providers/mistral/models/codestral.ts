import { dropReasoning } from "@app/lib/llms/stream/types/configuration";
import { MISTRAL_CODESTRAL_MODEL_CONFIG } from "@app/types/assistant/models/mistral";

export function WithDustMistralCodestralConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustMistralCodestralConfig extends Base {}
  const WithConfig = Object.assign(
    DustMistralCodestralConfig,
    MISTRAL_CODESTRAL_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustMistralCodestral extends WithConfig {
    static readonly displayName = "Mistral Codestral";
    static readonly description =
      "Mistral's `codestral` model, specifically designed and optimized for code generation tasks.";
    // Legacy product value; the model has no separate output cap.
    static readonly maxOutputTokens = 2_048;
    static readonly byok = true;
    // Non-reasoning model: drop the reasoning effort the schema rejects.
    static readonly configParsers = [dropReasoning];
  }

  return DustMistralCodestral;
}
