import {
  forceTemperatureToOne,
  mapReasoningNoneToMinimal,
} from "@app/lib/llms/stream/types/configuration";
import { GEMINI_3_5_FLASH_LITE_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export function WithDustGoogleGeminiThreeDotFiveFlashLiteConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGoogleGemini35FlashLite extends Base {
    static readonly displayName = "Gemini 3.5 Flash Lite";
    static readonly description =
      "Google's latest lightweight large context model (1m context).";
    static readonly byok = true;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = GEMINI_3_5_FLASH_LITE_MODEL_CONFIG;

    // Gemini accepts 0..2, but Google recommends 1 for Gemini 3. This model
    // cannot disable thinking (`thinkingBudget: 0` is rejected), so a requested
    // "none" is mapped down to the minimum thinking level, as the legacy router
    // effectively did.
    static readonly configParsers = [
      forceTemperatureToOne,
      mapReasoningNoneToMinimal,
    ];
  }

  return DustGoogleGemini35FlashLite;
}
