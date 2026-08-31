import { mapNonNoneReasoningToHigh } from "@app/lib/llms/stream/types/configuration";
import { FIREWORKS_KIMI_K2P6_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustMoonshotAiKimiK2Dot6Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMoonshotAiKimiK2Dot6 extends Base {
    static readonly displayName = "Kimi K2.6";
    static readonly description =
      "Moonshot AI's flagship agentic model with 262k context and vision support (served via Fireworks).";
    static readonly byok = false;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = FIREWORKS_KIMI_K2P6_MODEL_CONFIG;

    // Legacy parity: we never sent an effort to K2.6, only enabled thinking, so
    // any non-none effort maps to "high".
    static readonly configParsers = [mapNonNoneReasoningToHigh];
  }

  return DustMoonshotAiKimiK2Dot6;
}
