import { WithDustGoogleAiStudioGeminiThreeDotFiveFlashLiteConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash_lite";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGeminiThreeDotFiveFlashLiteEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_gemini_3_5_flash_lite_eu_agent_platform";

export class DustGoogleAiStudioGeminiThreeDotFiveFlashLiteEuropeAgentPlatformStream extends WithDustGoogleAiStudioGeminiThreeDotFiveFlashLiteConfig(
  GoogleAiStudioGeminiThreeDotFiveFlashLiteEuropeAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleAiStudioGeminiThreeDotFiveFlashLiteEuropeAgentPlatformStream
);
