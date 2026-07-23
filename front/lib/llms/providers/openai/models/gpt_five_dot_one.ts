import { dropTemperature } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_1_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveDotOneConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustGptFiveDotOneConfig extends Base {}
  const WithConfig = Object.assign(
    DustGptFiveDotOneConfig,
    GPT_5_1_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustGptFiveDotOne extends WithConfig {
    static readonly displayName = "GPT-5.1";
    static readonly description =
      "OpenAI's GPT-5.1 reasoning model (400k context).";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature for this model.
    static readonly configParsers = [dropTemperature];
  }

  return DustGptFiveDotOne;
}
