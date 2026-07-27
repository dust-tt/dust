import { GROK_4_5_MODEL_CONFIG } from "@app/types/assistant/models/xai";

export function WithDustGrok45Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGrok45 extends Base {
    static readonly displayName = "Grok 4.5";
    static readonly description =
      "xAI's Grok 4.5 flagship model (500k context, reasoning, vision).";
    static readonly byok = false;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = GROK_4_5_MODEL_CONFIG;
  }

  return DustGrok45;
}
