export function WithDustClaudeFableFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustClaudeFableFive extends Base {
    static readonly displayName = "Claude Fable 5";
    static readonly description =
      "Anthropic's Claude Fable 5 model, their most intelligent model, a new tier above Opus (250k context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
  }

  return DustClaudeFableFive;
}
