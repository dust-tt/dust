import { WithDustGoogleGeminiThreeDotFiveFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_5_flash_global_google_ai_studio";

export class DustGoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream extends WithDustGoogleGeminiThreeDotFiveFlashConfig(
  GoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream
);
