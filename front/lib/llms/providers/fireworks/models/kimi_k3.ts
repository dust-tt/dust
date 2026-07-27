import { FIREWORKS_KIMI_K3_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustMoonshotAiKimiK3Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMoonshotAiKimiK3 extends Base {
    static readonly displayName = "Kimi K3 (Fireworks)";
    static readonly description =
      "Moonshot AI's flagship 2.8T Mixture-of-Experts model for complex coding and long-horizon agentic work, with 1M context and vision support (served via Fireworks).";
    static readonly byok = false;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = FIREWORKS_KIMI_K3_MODEL_CONFIG;
  }

  return DustMoonshotAiKimiK3;
}
