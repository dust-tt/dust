import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";

export function WithDustGptFiveDotTwoConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotTwo extends Base {
    static readonly displayName = "GPT-5.2";
    static readonly description =
      "OpenAI's GPT-5.2 reasoning model for complex reasoning tasks (400k context).";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly parseConfig = dropTemperatureWhenReasoning;
  }

  return DustGptFiveDotTwo;
}
