import { WithDustGoogleGeminiThreeDotSevenFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_7_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_7_flash_global_google_ai_studio";

export class DustGoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStream extends WithDustGoogleGeminiThreeDotSevenFlashConfig(
  GoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStream
);
