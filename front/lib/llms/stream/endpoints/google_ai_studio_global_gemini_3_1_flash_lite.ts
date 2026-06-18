import { WithDustGoogleAiStudioGemini31FlashLiteConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_flash_lite";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGlobalGemini31FlashLiteStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_1_flash_lite";

export class DustGoogleAiStudioGlobalGemini31FlashLiteStream extends WithDustGoogleAiStudioGemini31FlashLiteConfig(
  GoogleAiStudioGlobalGemini31FlashLiteStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustGoogleAiStudioGlobalGemini31FlashLiteStream);
