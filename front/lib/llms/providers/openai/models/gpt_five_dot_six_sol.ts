import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_6_SOL_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveDotSixSolConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustGptFiveDotSixSolConfig extends Base {}
  const WithConfig = Object.assign(
    DustGptFiveDotSixSolConfig,
    GPT_5_6_SOL_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustGptFiveDotSixSol extends WithConfig {
    static readonly displayName = "GPT-5.6 Sol";
    static readonly description =
      "OpenAI's most capable GPT-5.6 reasoning model for complex reasoning and agentic tasks (272k context).";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly configParsers = [dropTemperatureWhenReasoning];
  }

  return DustGptFiveDotSixSol;
}
