import { GEMINI_3_6_FLASH_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export function WithDustGoogleAiStudioGeminiThreeDotSixFlashConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustGoogleAiStudioGeminiThreeDotSixFlashConfig extends Base {}
  const WithConfig = Object.assign(
    DustGoogleAiStudioGeminiThreeDotSixFlashConfig,
    GEMINI_3_6_FLASH_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustGoogleAiStudioGeminiThreeDotSixFlash extends WithConfig {
    static readonly displayName = "Gemini 3.6 Flash";
    static readonly description =
      "Google's latest fast large context model (1m context).";
    static readonly byok = true;
  }

  return DustGoogleAiStudioGeminiThreeDotSixFlash;
}
