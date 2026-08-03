import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_6_TERRA_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveDotSixTerraConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotSixTerra extends Base {
    static readonly displayName = "GPT-5.6 Terra";
    static readonly description =
      "OpenAI's balanced GPT-5.6 model for strong reasoning and tool use (272k context).";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly configParsers = [dropTemperatureWhenReasoning];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = GPT_5_6_TERRA_MODEL_CONFIG;
  }

  return DustGptFiveDotSixTerra;
}
