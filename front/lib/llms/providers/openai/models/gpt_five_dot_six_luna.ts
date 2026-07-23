import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_6_LUNA_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveDotSixLunaConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustGptFiveDotSixLunaConfig extends Base {}
  const WithConfig = Object.assign(
    DustGptFiveDotSixLunaConfig,
    GPT_5_6_LUNA_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustGptFiveDotSixLuna extends WithConfig {
    static readonly displayName = "GPT-5.6 Luna";
    static readonly description =
      "OpenAI's fastest, most cost-efficient GPT-5.6 model for high-volume workloads (272k context).";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly configParsers = [dropTemperatureWhenReasoning];
  }

  return DustGptFiveDotSixLuna;
}
