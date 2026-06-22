import { WithDustGoogleAiStudioGeminiThreeDotOneProConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_pro";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGlobalGeminiThreeDotOneProStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_1_pro";

export class DustGoogleAiStudioGlobalGeminiThreeDotOneProStream extends WithDustGoogleAiStudioGeminiThreeDotOneProConfig(
  GoogleAiStudioGlobalGeminiThreeDotOneProStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustGoogleAiStudioGlobalGeminiThreeDotOneProStream);
