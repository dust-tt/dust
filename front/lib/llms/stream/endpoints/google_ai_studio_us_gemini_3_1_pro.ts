import { WithDustGoogleAiStudioGeminiThreeDotOneProConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_pro";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioUsGeminiThreeDotOneProStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_us_gemini_3_1_pro";

export class DustGoogleAiStudioUsGeminiThreeDotOneProStream extends WithDustGoogleAiStudioGeminiThreeDotOneProConfig(
  GoogleAiStudioUsGeminiThreeDotOneProStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustGoogleAiStudioUsGeminiThreeDotOneProStream);
