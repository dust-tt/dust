import { GEMINI_3_1_PRO_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export function WithDustGoogleAiStudioGeminiThreeDotOneProConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustGoogleAiStudioGeminiThreeDotOneProConfig extends Base {}
  const WithConfig = Object.assign(
    DustGoogleAiStudioGeminiThreeDotOneProConfig,
    GEMINI_3_1_PRO_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustGoogleAiStudioGeminiThreeDotOnePro extends WithConfig {
    static readonly displayName = "Gemini 3.1 Pro (Preview)";
    static readonly description =
      "Google's latest powerful model with enhanced reasoning (1m context).";
    static readonly defaultReasoningEffort = "low";
    static readonly byok = true;
  }

  return DustGoogleAiStudioGeminiThreeDotOnePro;
}
