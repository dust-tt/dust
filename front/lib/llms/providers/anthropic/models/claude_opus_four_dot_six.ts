export function WithDustClaudeOpusFourDotSixConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeOpusFourDotSix extends Base {
    static readonly displayName = "Claude Opus 4.6";
    static readonly description =
      "Anthropic's Claude Opus 4.6 model, an advanced model with enhanced reasoning capabilities (200k context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
  }

  return DustClaudeOpusFourDotSix;
}
