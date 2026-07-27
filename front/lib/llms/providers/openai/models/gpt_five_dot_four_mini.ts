import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_4_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveDotFourMiniConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotFourMini extends Base {
    static readonly displayName = "GPT-5.4 Mini";
    static readonly description =
      "OpenAI's faster, cost-efficient GPT-5.4 for well-defined tasks (400k context).";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly configParsers = [dropTemperatureWhenReasoning];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = GPT_5_4_MINI_MODEL_CONFIG;
  }

  return DustGptFiveDotFourMini;
}
