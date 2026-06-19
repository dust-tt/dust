export function WithDustGptFiveDotFourNanoConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotFourNano extends Base {
    static readonly displayName = "GPT-5.4 Nano";
    static readonly description =
      "OpenAI's fastest, most cost-efficient GPT-5.4 (400k context).";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
  }

  return DustGptFiveDotFourNano;
}
