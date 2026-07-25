import { WithDustGoogleAiStudioGeminiThreeDotSixFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_6_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGeminiThreeDotSixFlashGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_gemini_3_6_flash_global_google_ai_studio";

export class DustGoogleAiStudioGeminiThreeDotSixFlashGlobalGoogleAiStudioStream extends WithDustGoogleAiStudioGeminiThreeDotSixFlashConfig(
  GoogleAiStudioGeminiThreeDotSixFlashGlobalGoogleAiStudioStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleAiStudioGeminiThreeDotSixFlashGlobalGoogleAiStudioStream
);
