export function WithDustGptFiveDotFourConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotFour extends Base {
    static readonly displayName = "GPT-5.4";
    static readonly description =
      "OpenAI's GPT-5.4 reasoning model for complex reasoning and agentic tasks (1M context).";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
  }

  return DustGptFiveDotFour;
}
