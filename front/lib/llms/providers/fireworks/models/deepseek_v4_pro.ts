import { forceHighReasoningEffort } from "@app/lib/llms/stream/types/configuration";
import { FIREWORKS_DEEPSEEK_V4_PRO_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustDeepSeekDeepSeekV4ProConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustDeepSeekDeepSeekV4Pro extends Base {
    static readonly displayName = "DeepSeek V4 Pro (Fireworks)";
    static readonly description =
      "DeepSeek's V4 Pro Mixture-of-Experts model with frontier reasoning, advanced coding, and 1M context (served via Fireworks).";
    // Preserve the existing Dust product caps while the constructor exposes
    // Fireworks' native 1040k context and DeepSeek's native 384k output.
    static readonly contextSize = 1_000_000;
    static readonly maxOutputTokens = 64_000;
    static readonly byok = false;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = FIREWORKS_DEEPSEEK_V4_PRO_MODEL_CONFIG;

    // Legacy parity: this model always ran at `high`.
    static readonly configParsers = [forceHighReasoningEffort];
  }

  return DustDeepSeekDeepSeekV4Pro;
}
