import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_2_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveDotTwoConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustGptFiveDotTwoConfig extends Base {}
  const WithConfig = Object.assign(
    DustGptFiveDotTwoConfig,
    GPT_5_2_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustGptFiveDotTwo extends WithConfig {
    static readonly displayName = "GPT-5.2";
    static readonly description =
      "OpenAI's GPT-5.2 reasoning model for complex reasoning tasks (400k context).";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly configParsers = [dropTemperatureWhenReasoning];
  }

  return DustGptFiveDotTwo;
}
