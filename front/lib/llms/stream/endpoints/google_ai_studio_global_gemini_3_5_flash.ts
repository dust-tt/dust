import { WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGlobalGeminiThreeDotFiveFlashStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_5_flash";

export class DustGoogleAiStudioGlobalGeminiThreeDotFiveFlashStream extends WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig(
  GoogleAiStudioGlobalGeminiThreeDotFiveFlashStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustGoogleAiStudioGlobalGeminiThreeDotFiveFlashStream);
