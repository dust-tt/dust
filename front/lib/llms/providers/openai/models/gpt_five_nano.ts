import { dropTemperature } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_NANO_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveNanoConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustGptFiveNanoConfig extends Base {}
  const WithConfig = Object.assign(
    DustGptFiveNanoConfig,
    GPT_5_NANO_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustGptFiveNano extends WithConfig {
    static readonly displayName = "GPT-5 Nano";
    static readonly description =
      "OpenAI's fastest, most cost-efficient GPT-5 (400k context).";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature for this model.
    static readonly configParsers = [dropTemperature];
  }

  return DustGptFiveNano;
}
