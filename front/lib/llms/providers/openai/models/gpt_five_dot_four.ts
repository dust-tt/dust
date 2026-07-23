import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_4_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveDotFourConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustGptFiveDotFourConfig extends Base {}
  const WithConfig = Object.assign(
    DustGptFiveDotFourConfig,
    GPT_5_4_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustGptFiveDotFour extends WithConfig {
    static readonly displayName = "GPT-5.4";
    static readonly description =
      "OpenAI's GPT-5.4 reasoning model for complex reasoning and agentic tasks (1M context).";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly configParsers = [dropTemperatureWhenReasoning];
  }

  return DustGptFiveDotFour;
}
