export function WithDustGptFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFive extends Base {
    static readonly displayName = "GPT-5";
    static readonly description =
      "OpenAI's GPT-5 reasoning model (400k context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
  }

  return DustGptFive;
}
