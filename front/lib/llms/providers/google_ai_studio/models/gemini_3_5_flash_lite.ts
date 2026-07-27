import { GEMINI_3_5_FLASH_LITE_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export function WithDustGoogleAiStudioGeminiThreeDotFiveFlashLiteConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustGoogleAiStudioGemini35FlashLiteConfig extends Base {}
  const WithConfig = Object.assign(
    DustGoogleAiStudioGemini35FlashLiteConfig,
    GEMINI_3_5_FLASH_LITE_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustGoogleAiStudioGemini35FlashLite extends WithConfig {
    static readonly displayName = "Gemini 3.5 Flash Lite";
    static readonly description =
      "Google's latest lightweight large context model (1m context).";
    static readonly byok = true;
  }

  return DustGoogleAiStudioGemini35FlashLite;
}
