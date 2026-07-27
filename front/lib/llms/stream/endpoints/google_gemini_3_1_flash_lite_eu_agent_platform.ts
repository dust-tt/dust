import { WithDustGoogleAiStudioGeminiThreeDotOneFlashLiteConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_flash_lite";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGeminiThreeDotOneFlashLiteEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_1_flash_lite_eu_agent_platform";

export class DustGoogleAiStudioGeminiThreeDotOneFlashLiteEuropeAgentPlatformStream extends WithDustGoogleAiStudioGeminiThreeDotOneFlashLiteConfig(
  GoogleAiStudioGeminiThreeDotOneFlashLiteEuropeAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleAiStudioGeminiThreeDotOneFlashLiteEuropeAgentPlatformStream
);
