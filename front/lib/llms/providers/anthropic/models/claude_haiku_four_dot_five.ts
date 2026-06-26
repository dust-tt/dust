export function WithDustClaudeHaikuFourDotFive<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeHaikuFourDotFive extends Base {
    static readonly displayName = "Claude 4.5 Haiku";
    static readonly description =
      "Anthropic's Claude 4.5 Haiku model, cost effective and high throughput (200k context).";
    static readonly defaultReasoningEffort = "low";
    static readonly byok = true;
  }

  return DustClaudeHaikuFourDotFive;
}
