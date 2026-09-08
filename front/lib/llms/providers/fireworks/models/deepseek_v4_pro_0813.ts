import { mapReasoningEffortToLowHighMax } from "@app/lib/llms/stream/types/configuration";
import { FIREWORKS_DEEPSEEK_V4_PRO_0813_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustDeepSeekDeepSeekV4Pro0813Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustDeepSeekDeepSeekV4Pro0813 extends Base {
    static readonly displayName = "DeepSeek V4 Pro";
    static readonly description =
      "DeepSeek's V4 Pro Mixture-of-Experts model with frontier reasoning, advanced coding, and 1M context (served via Fireworks).";
    // Product caps of the native 1040k/131k: same budget the `deepseek-v4-pro`
    // preview exposed, so agents migrated off it keep their prompt budget.
    static readonly contextSize = 1_000_000;
    static readonly maxOutputTokens = 64_000;
    static readonly byok = false;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = FIREWORKS_DEEPSEEK_V4_PRO_0813_MODEL_CONFIG;

    // V4 Pro has no `medium`: fold light/medium/high onto its low/high/max.
    static readonly configParsers = [mapReasoningEffortToLowHighMax];
  }

  return DustDeepSeekDeepSeekV4Pro0813;
}
