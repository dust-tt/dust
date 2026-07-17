export function WithDustClaudeOpusFourDotSevenConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeOpusFourDotSeven extends Base {
    static readonly displayName = "Claude Opus 4.7";
    static readonly description =
      "Anthropic's Claude Opus 4.7 model, an advanced model with a step-change improvement in agentic coding (250k context).";
    static readonly defaultReasoningEffort = "medium";
    // Dust caps usable context at 250k; the model itself supports 1M.
    static readonly contextSize = 250_000;
    // Dust caps output at 64k; the model itself supports 128k.
    static readonly maxOutputTokens = 64_000;
    static readonly byok = true;
  }

  return DustClaudeOpusFourDotSeven;
}
