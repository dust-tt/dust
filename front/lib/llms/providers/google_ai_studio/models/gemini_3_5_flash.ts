export function WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGoogleAiStudioGeminiThreeDotFiveFlash extends Base {
    static readonly displayName = "Gemini 3.5 Flash";
    static readonly description =
      "Google's latest fast large context model (1m context).";
    // Mirrors the legacy default reasoning effort ("light" → "low").
    static readonly defaultReasoningEffort = "low";
    static readonly byok = true;
  }

  return DustGoogleAiStudioGeminiThreeDotFiveFlash;
}
