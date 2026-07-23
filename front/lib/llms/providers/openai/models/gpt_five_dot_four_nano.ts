import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_4_NANO_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveDotFourNanoConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustGptFiveDotFourNanoConfig extends Base {}
  const WithConfig = Object.assign(
    DustGptFiveDotFourNanoConfig,
    GPT_5_4_NANO_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustGptFiveDotFourNano extends WithConfig {
    static readonly displayName = "GPT-5.4 Nano";
    static readonly description =
      "OpenAI's fastest, most cost-efficient GPT-5.4 (400k context).";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly configParsers = [dropTemperatureWhenReasoning];
  }

  return DustGptFiveDotFourNano;
}
