export function WithDustGptFiveMiniConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveMini extends Base {
    static readonly displayName = "GPT-5 Mini";
    static readonly description =
      "OpenAI's faster, cost-efficient GPT-5 for well-defined tasks (400k context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
  }

  return DustGptFiveMini;
}
