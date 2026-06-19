export function WithDustGptFiveDotFourMiniConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotFourMini extends Base {
    static readonly displayName = "GPT-5.4 Mini";
    static readonly description =
      "OpenAI's faster, cost-efficient GPT-5.4 for well-defined tasks (400k context).";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
  }

  return DustGptFiveDotFourMini;
}
