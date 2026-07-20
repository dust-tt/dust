import { WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_gemini_3_5_flash_global_google_ai_studio";

export class DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream extends WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig(
  GoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream
);
