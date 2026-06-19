export function WithDustGptFiveNanoConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveNano extends Base {
    static readonly displayName = "GPT-5 Nano";
    static readonly description =
      "OpenAI's fastest, most cost-efficient GPT-5 (400k context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
  }

  return DustGptFiveNano;
}
