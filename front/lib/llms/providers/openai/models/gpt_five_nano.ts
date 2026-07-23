import { dropTemperature } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_NANO_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveNanoConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveNano extends Base {
    static readonly displayName = "GPT-5 Nano";
    static readonly description =
      "OpenAI's fastest, most cost-efficient GPT-5 (400k context).";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature for this model.
    static readonly configParsers = [dropTemperature];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = GPT_5_NANO_MODEL_CONFIG;
  }

  return DustGptFiveNano;
}
