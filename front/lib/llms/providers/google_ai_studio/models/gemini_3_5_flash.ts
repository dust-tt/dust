export function WithDustGoogleAiStudioGemini35FlashConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGoogleAiStudioGemini35Flash extends Base {
    static readonly displayName = "Gemini 3.5 Flash";
    static readonly description =
      "Google's latest fast model with a 1M-token context window.";
    // Mirrors the legacy default reasoning effort ("light" → "low").
    static readonly defaultReasoningEffort = "low";
    static readonly byok = true;
  }

  return DustGoogleAiStudioGemini35Flash;
}
