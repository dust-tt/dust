import { forceTemperatureToOne } from "@app/lib/llms/stream/types/configuration";
import { GEMINI_3_7_FLASH_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export function WithDustGoogleGeminiThreeDotSevenFlashConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGoogleGeminiThreeDotSevenFlash extends Base {
    static readonly displayName = "Gemini 3.7 Flash";
    static readonly description =
      "Google's fast large context model (1m context).";
    static readonly byok = true;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = GEMINI_3_7_FLASH_MODEL_CONFIG;

    // Gemini accepts 0..2, but Google recommends 1 for Gemini 3. Unlike 3.6
    // Flash there is no `none` to map: the model config does not expose a
    // thinking-off effort and `minimal` is rejected, so `light` already lands
    // on the lowest available thinking level (`low`).
    static readonly configParsers = [forceTemperatureToOne];
  }

  return DustGoogleGeminiThreeDotSevenFlash;
}
