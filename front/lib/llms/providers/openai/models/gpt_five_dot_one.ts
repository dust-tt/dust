import { dropTemperature } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_1_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveDotOneConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotOne extends Base {
    static readonly displayName = "GPT-5.1";
    static readonly description =
      "OpenAI's GPT-5.1 reasoning model (400k context).";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature for this model.
    static readonly configParsers = [dropTemperature];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = GPT_5_1_MODEL_CONFIG;
  }

  return DustGptFiveDotOne;
}
