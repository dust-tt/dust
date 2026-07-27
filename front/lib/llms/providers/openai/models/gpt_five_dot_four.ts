import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_4_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveDotFourConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotFour extends Base {
    static readonly displayName = "GPT-5.4";
    static readonly description =
      "OpenAI's GPT-5.4 reasoning model for complex reasoning and agentic tasks (1M context).";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly configParsers = [dropTemperatureWhenReasoning];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = GPT_5_4_MODEL_CONFIG;
  }

  return DustGptFiveDotFour;
}
