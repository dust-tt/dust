import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_6_TERRA_LONG_CONTEXT_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveDotSixTerraLongContextConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGptFiveDotSixTerraLongContext extends Base {
    static readonly displayName = "GPT-5.6 Terra (1M context)";
    static readonly description =
      "OpenAI's balanced GPT-5.6 model with its full 1.05M context window.";
    static readonly byok = true;
    static readonly configParsers = [dropTemperatureWhenReasoning];
    static readonly modelConfig = GPT_5_6_TERRA_LONG_CONTEXT_MODEL_CONFIG;
  }

  return DustGptFiveDotSixTerraLongContext;
}
