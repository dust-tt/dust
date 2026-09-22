import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";
import { GPT_6_LUNA_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptSixLunaConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptSixLuna extends Base {
    static readonly displayName = "GPT-6 Luna";
    static readonly description =
      "OpenAI's fastest, most cost-efficient GPT-6 model for high-volume workloads (272k context).";
    static readonly byok = true;
    // Dust exposes the same context window as the rest of the GPT-6 family.
    static readonly contextSize = 272_000;
    // Keep the family's 208k input budget by reserving the same 64k for output.
    static readonly maxOutputTokens = 64_000;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly configParsers = [dropTemperatureWhenReasoning];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = GPT_6_LUNA_MODEL_CONFIG;
  }

  return DustGptSixLuna;
}
