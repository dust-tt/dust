import { GEMINI_3_5_FLASH_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export function WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustGoogleAiStudioGeminiThreeDotFiveFlashConfig extends Base {}
  const WithConfig = Object.assign(
    DustGoogleAiStudioGeminiThreeDotFiveFlashConfig,
    GEMINI_3_5_FLASH_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustGoogleAiStudioGeminiThreeDotFiveFlash extends WithConfig {
    static readonly displayName = "Gemini 3.5 Flash";
    static readonly description =
      "Google's latest fast large context model (1m context).";
    static readonly byok = true;
  }

  return DustGoogleAiStudioGeminiThreeDotFiveFlash;
}
