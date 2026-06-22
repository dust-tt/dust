export function WithDustClaudeOpusFourDotSevenConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeOpusFourDotSeven extends Base {
    static readonly displayName = "Claude Opus 4.7";
    static readonly description =
      "Anthropic's Claude Opus 4.7 model, an advanced model with a step-change improvement in agentic coding (200k context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
  }

  return DustClaudeOpusFourDotSeven;
}
