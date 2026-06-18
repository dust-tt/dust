export function WithDustGoogleAiStudioGemini31FlashLiteConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGoogleAiStudioGemini31FlashLite extends Base {
    static readonly displayName = "Gemini 3.1 Flash Lite";
    static readonly description =
      "Google's latest lightweight model with a 1M-token context window.";
    // Mirrors the legacy default reasoning effort ("light" → "low").
    static readonly defaultReasoningEffort = "low";
    static readonly byok = true;
  }

  return DustGoogleAiStudioGemini31FlashLite;
}
