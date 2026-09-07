import { dropTemperature } from "@app/lib/llms/stream/types/configuration";
import { GPT_6_ASTRA_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptSixAstraConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptSixAstra extends Base {
    static readonly displayName = "GPT-6 Astra";
    static readonly description =
      "OpenAI's GPT-6 Astra reasoning model for complex reasoning and agentic tasks (272k context).";
    static readonly byok = true;
    // Dust exposes the same context window as GPT-5.6.
    static readonly contextSize = 272_000;
    // Keep GPT-5.6's 208k input budget by reserving the same 64k for output.
    static readonly maxOutputTokens = 64_000;
    // Astra has no configurable temperature; omit it from Dust requests.
    static readonly configParsers = [dropTemperature];

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = GPT_6_ASTRA_MODEL_CONFIG;
  }

  return DustGptSixAstra;
}
