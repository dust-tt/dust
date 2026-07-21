import { WithDustGoogleAiStudioGeminiThreeDotOneFlashLiteConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_flash_lite";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_gemini_3_1_flash_lite_global_google_ai_studio";

export class DustGoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream extends WithDustGoogleAiStudioGeminiThreeDotOneFlashLiteConfig(
  GoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream
);
