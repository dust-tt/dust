export function WithDustGoogleAiStudioGemini31ProConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGoogleAiStudioGemini31Pro extends Base {
    static readonly displayName = "Gemini 3.1 Pro (Preview)";
    static readonly description =
      "Google's Gemini 3.1 Pro model, a state-of-the-art reasoning model with a 1M-token context window.";
    static readonly defaultReasoningEffort = "low";
    static readonly byok = true;
  }

  return DustGoogleAiStudioGemini31Pro;
}
