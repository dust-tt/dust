import { WithDustGoogleAiStudioGemini31ProConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_pro";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGlobalGemini31ProStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_1_pro";

export class DustGoogleAiStudioGlobalGemini31ProStream extends WithDustGoogleAiStudioGemini31ProConfig(
  GoogleAiStudioGlobalGemini31ProStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustGoogleAiStudioGlobalGemini31ProStream);
