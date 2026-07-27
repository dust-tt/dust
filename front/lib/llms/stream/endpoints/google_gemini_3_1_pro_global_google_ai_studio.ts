import { WithDustGoogleGeminiThreeDotOneProConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_pro";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiThreeDotOneProGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_1_pro_global_google_ai_studio";

export class DustGoogleGeminiThreeDotOneProGlobalGoogleAiStudioStream extends WithDustGoogleGeminiThreeDotOneProConfig(
  GoogleGeminiThreeDotOneProGlobalGoogleAiStudioStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleGeminiThreeDotOneProGlobalGoogleAiStudioStream
);
