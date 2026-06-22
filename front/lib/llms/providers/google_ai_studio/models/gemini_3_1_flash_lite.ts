export function WithDustGoogleAiStudioGeminiThreeDotOneFlashLiteConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGoogleAiStudioGemini31FlashLite extends Base {
    static readonly displayName = "Gemini 3.1 Flash Lite";
    static readonly description =
      "Google's latest lightweight large context model (1m context).";
    // Mirrors the legacy default reasoning effort ("light" → "low").
    static readonly defaultReasoningEffort = "low";
    static readonly byok = true;
  }

  return DustGoogleAiStudioGemini31FlashLite;
}
