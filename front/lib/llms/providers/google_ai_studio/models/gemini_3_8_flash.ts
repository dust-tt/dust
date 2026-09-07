import { dropTemperature } from "@app/lib/llms/stream/types/configuration";
import { GEMINI_3_8_FLASH_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export function WithDustGoogleGeminiThreeDotEightFlashConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustGoogleGeminiThreeDotEightFlash extends Base {
    static readonly displayName = "Gemini 3.8 Flash";
    static readonly description =
      "Google's latest intelligent model for coding and agentic workflows (1m context).";
    static readonly byok = true;

    static readonly modelConfig = GEMINI_3_8_FLASH_MODEL_CONFIG;

    // https://ai.google.dev/gemini-api/docs/latest-model (2026-09-04):
    // Sampling parameters are ignored by Gemini 3.8 Flash and should be
    // removed in favor of thinking levels and structured output constraints.
    static readonly configParsers = [dropTemperature];
  }

  return DustGoogleGeminiThreeDotEightFlash;
}
