export function WithDustClaudeOpusFourDotEightConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeOpusFourDotEight extends Base {
    static readonly displayName = "Claude Opus 4.8";
    static readonly description =
      "Anthropic's Claude Opus 4.8 model, the latest and most capable model with stronger agentic coding, reasoning, and judgement (200k context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
  }

  return DustClaudeOpusFourDotEight;
}
