export function WithDustClaudeSonnetFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeSonnetFive extends Base {
    static readonly displayName = "Claude Sonnet 5";
    static readonly description =
      "Anthropic's Claude Sonnet 5 model, reaching near-Opus quality on coding and agentic work while balancing power and efficiency (200k context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
  }

  return DustClaudeSonnetFive;
}
