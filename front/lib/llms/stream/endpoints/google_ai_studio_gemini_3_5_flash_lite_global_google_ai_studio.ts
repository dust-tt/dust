import { WithDustGoogleAiStudioGeminiThreeDotFiveFlashLiteConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash_lite";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_gemini_3_5_flash_lite_global_google_ai_studio";

export class DustGoogleAiStudioGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioStream extends WithDustGoogleAiStudioGeminiThreeDotFiveFlashLiteConfig(
  GoogleAiStudioGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleAiStudioGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioStream
);
