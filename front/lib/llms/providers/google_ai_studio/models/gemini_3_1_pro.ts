import { forceTemperatureToOne } from "@app/lib/llms/stream/types/configuration";
import { GEMINI_3_1_PRO_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export function WithDustGoogleGeminiThreeDotOneProConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGoogleGeminiThreeDotOnePro extends Base {
    static readonly displayName = "Gemini 3.1 Pro (Preview)";
    static readonly description =
      "Google's latest powerful model with enhanced reasoning (1m context).";
    static readonly byok = true;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = GEMINI_3_1_PRO_MODEL_CONFIG;

    // Gemini accepts 0..2, but Google recommends 1 for Gemini 3.
    static readonly configParsers = [forceTemperatureToOne];
  }

  return DustGoogleGeminiThreeDotOnePro;
}
