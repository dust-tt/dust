import { mapReasoningEffortToLowHighMax } from "@app/lib/llms/stream/types/configuration";
import { FIREWORKS_DEEPSEEK_V4P1_FLASH_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustDeepSeekDeepSeekV41FlashConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustDeepSeekDeepSeekV41Flash extends Base {
    static readonly displayName = "DeepSeek V4.1 Flash";
    static readonly description =
      "DeepSeek's V4.1 Flash multimodal Mixture-of-Experts model (552B backbone, 8B/16B active) (served via Fireworks).";
    // Product caps of the native 1040k/384k: long contexts degrade quality
    static readonly contextSize = 256_000;
    static readonly maxOutputTokens = 64_000;
    static readonly byok = false;

    static readonly modelConfig = FIREWORKS_DEEPSEEK_V4P1_FLASH_MODEL_CONFIG;

    // V4.1 Flash has no `medium`: fold low/medium/high onto its low/high/max.
    static readonly configParsers = [mapReasoningEffortToLowHighMax];
  }

  return DustDeepSeekDeepSeekV41Flash;
}
