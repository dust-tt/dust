import { mapReasoningEffortToLowHighMax } from "@app/lib/llms/stream/types/configuration";
import { FIREWORKS_DEEPSEEK_V4_FLASH_0731_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";

export function WithDustDeepSeekDeepSeekV4Flash0731Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustDeepSeekDeepSeekV4Flash0731 extends Base {
    static readonly displayName = "DeepSeek V4 Flash";
    static readonly description =
      "DeepSeek's V4 Flash Mixture-of-Experts model (284B total / 13B active) tuned for fast, cost-efficient reasoning, coding and agentic work, with 256k context (served via Fireworks).";
    // Product caps of the native 1040k/384k: long contexts degrade quality, so
    // match Kimi K3, the other Fireworks 1040k model.
    static readonly contextSize = 256_000;
    static readonly maxOutputTokens = 64_000;
    static readonly byok = false;

    static readonly modelConfig = FIREWORKS_DEEPSEEK_V4_FLASH_0731_MODEL_CONFIG;

    // V4 Flash has no `medium`: fold low/medium/high onto its low/high/max.
    static readonly configParsers = [mapReasoningEffortToLowHighMax];
  }

  return DustDeepSeekDeepSeekV4Flash0731;
}
