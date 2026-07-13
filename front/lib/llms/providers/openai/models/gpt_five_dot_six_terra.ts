export function WithDustGptFiveDotSixTerraConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotSixTerra extends Base {
    static readonly displayName = "GPT-5.6 Terra";
    static readonly description =
      "OpenAI's balanced GPT-5.6 model for strong reasoning and tool use (1M context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
  }

  return DustGptFiveDotSixTerra;
}
