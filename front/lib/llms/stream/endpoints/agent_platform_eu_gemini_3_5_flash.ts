import { WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGeminiThreeDotFiveFlashEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_gemini_3_5_flash_eu_agent_platform";

export class DustAgentPlatformEuropeGeminiThreeDotFiveFlashStream extends WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig(
  GoogleAiStudioGeminiThreeDotFiveFlashEuropeAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAgentPlatformEuropeGeminiThreeDotFiveFlashStream);
