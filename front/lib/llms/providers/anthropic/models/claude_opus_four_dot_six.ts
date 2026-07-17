export function WithDustClaudeOpusFourDotSixConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeOpusFourDotSix extends Base {
    static readonly displayName = "Claude Opus 4.6";
    static readonly description =
      "Anthropic's Claude Opus 4.6 model, an advanced model with enhanced reasoning capabilities (250k context).";
    static readonly defaultReasoningEffort = "medium";
    // Dust caps usable context at 250k; the model itself supports 1M.
    static readonly contextSize = 250_000;
    static readonly byok = true;
  }

  return DustClaudeOpusFourDotSix;
}
