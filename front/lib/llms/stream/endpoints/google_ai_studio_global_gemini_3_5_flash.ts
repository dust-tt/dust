import { WithDustGoogleAiStudioGemini35FlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGlobalGemini35FlashStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_5_flash";

export class DustGoogleAiStudioGlobalGemini35FlashStream extends WithDustGoogleAiStudioGemini35FlashConfig(
  GoogleAiStudioGlobalGemini35FlashStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustGoogleAiStudioGlobalGemini35FlashStream);
