import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";
import { GPT_5_6_TERRA_MODEL_CONFIG } from "@app/types/assistant/models/openai";

export function WithDustGptFiveDotSixTerraConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustGptFiveDotSixTerraConfig extends Base {}
  const WithConfig = Object.assign(
    DustGptFiveDotSixTerraConfig,
    GPT_5_6_TERRA_MODEL_CONFIG
  );

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustGptFiveDotSixTerra extends WithConfig {
    static readonly displayName = "GPT-5.6 Terra";
    static readonly description =
      "OpenAI's balanced GPT-5.6 model for strong reasoning and tool use (272k context).";
    static readonly byok = true;
    // The Responses API rejects an explicit temperature while reasoning is on.
    static readonly configParsers = [dropTemperatureWhenReasoning];
  }

  return DustGptFiveDotSixTerra;
}
