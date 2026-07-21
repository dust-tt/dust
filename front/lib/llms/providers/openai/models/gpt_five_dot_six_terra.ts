import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";

export function WithDustGptFiveDotSixTerraConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotSixTerra extends Base {
    static readonly displayName = "GPT-5.6 Terra";
    static readonly description =
      "OpenAI's balanced GPT-5.6 model for strong reasoning and tool use (272k context).";
    static readonly defaultReasoningEffort = "medium";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly configParsers = [dropTemperatureWhenReasoning];
  }

  return DustGptFiveDotSixTerra;
}
