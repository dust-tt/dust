import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";

export function WithDustGptFiveDotFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotFive extends Base {
    static readonly displayName = "GPT-5.5";
    static readonly description =
      "OpenAI's GPT-5.5 reasoning model, with strong reasoning and tool-use capabilities (1M context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly configParsers = [dropTemperatureWhenReasoning];
  }

  return DustGptFiveDotFive;
}
