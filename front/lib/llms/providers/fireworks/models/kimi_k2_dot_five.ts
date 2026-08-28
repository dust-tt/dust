import { FIREWORKS_KIMI_K2P5_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustMoonshotAiKimiK2Dot5Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMoonshotAiKimiK2Dot5 extends Base {
    static readonly displayName = "Kimi K2.5";
    static readonly description =
      "Moonshot AI's flagship agentic model with 262k context and vision support (served via Fireworks).";
    static readonly byok = false;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = FIREWORKS_KIMI_K2P5_MODEL_CONFIG;
  }

  return DustMoonshotAiKimiK2Dot5;
}
