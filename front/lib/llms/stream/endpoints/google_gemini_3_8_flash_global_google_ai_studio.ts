import { WithDustGoogleGeminiThreeDotEightFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_8_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_8_flash_global_google_ai_studio";

export class DustGoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream extends WithDustGoogleGeminiThreeDotEightFlashConfig(
  GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream
);
