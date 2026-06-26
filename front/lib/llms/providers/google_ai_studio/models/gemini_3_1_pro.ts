export function WithDustGoogleAiStudioGeminiThreeDotOneProConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGoogleAiStudioGeminiThreeDotOnePro extends Base {
    static readonly displayName = "Gemini 3.1 Pro (Preview)";
    static readonly description =
      "Google's latest powerful model with enhanced reasoning (1m context).";
    static readonly defaultReasoningEffort = "low";
    static readonly byok = true;
  }

  return DustGoogleAiStudioGeminiThreeDotOnePro;
}
