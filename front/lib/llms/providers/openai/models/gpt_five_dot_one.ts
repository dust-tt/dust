export function WithDustGptFiveDotOneConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotOne extends Base {
    static readonly displayName = "GPT-5.1";
    static readonly description =
      "OpenAI's GPT-5.1 reasoning model (400k context).";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
  }

  return DustGptFiveDotOne;
}
