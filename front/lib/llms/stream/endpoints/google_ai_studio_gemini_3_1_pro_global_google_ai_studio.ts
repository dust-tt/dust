import { WithDustGoogleAiStudioGeminiThreeDotOneProConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_pro";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_gemini_3_1_pro_global_google_ai_studio";

export class DustGoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioStream extends WithDustGoogleAiStudioGeminiThreeDotOneProConfig(
  GoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustGoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioStream);
