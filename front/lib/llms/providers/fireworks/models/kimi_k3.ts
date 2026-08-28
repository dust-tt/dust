import {
  forceTemperatureToZero,
  mapReasoningEffortToLowHighMax,
} from "@app/lib/llms/stream/types/configuration";
import { FIREWORKS_KIMI_K3_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustMoonshotAiKimiK3Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMoonshotAiKimiK3 extends Base {
    static readonly displayName = "Kimi K3";
    static readonly description =
      "Moonshot AI's flagship 2.8T Mixture-of-Experts model for complex coding and long-horizon agentic work, with 256k context and vision support (served via Fireworks).";
    // Dust caps usable context at 256k; the model itself supports 1040k.
    static readonly contextSize = 256_000;
    // Dust caps output at 64k; Fireworks defaults to a 131k completion budget.
    // Thinking is always on for K3, so reasoning tokens spend this budget too.
    static readonly maxOutputTokens = 64_000;
    static readonly byok = false;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = FIREWORKS_KIMI_K3_MODEL_CONFIG;

    // K3 has no `medium`: fold low/medium/high onto its low/high/max. Use the
    // lowest Fireworks-supported temperature on every request.
    static readonly configParsers = [
      forceTemperatureToZero,
      mapReasoningEffortToLowHighMax,
    ];
  }

  return DustMoonshotAiKimiK3;
}
