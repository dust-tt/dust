export function WithDustClaudeOpusFourDotEightConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeOpusFourDotEight extends Base {
    static readonly displayName = "Claude Opus 4.8";
    static readonly description =
      "Anthropic's Claude Opus 4.8 model, the latest and most capable model with stronger agentic coding, reasoning, and judgement (250k context).";
    static readonly defaultReasoningEffort = "medium";
    // Dust caps usable context at 250k; the model itself supports 1M.
    static readonly contextSize = 250_000;
    // Dust caps output at 64k; the model itself supports 128k.
    static readonly maxOutputTokens = 64_000;
    static readonly byok = true;
  }

  return DustClaudeOpusFourDotEight;
}
