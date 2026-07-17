export function WithDustGptFiveDotSixSolConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotSixSol extends Base {
    static readonly displayName = "GPT-5.6 Sol";
    static readonly description =
      "OpenAI's most capable GPT-5.6 reasoning model for complex reasoning and agentic tasks (272k context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
  }

  return DustGptFiveDotSixSol;
}
