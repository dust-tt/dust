import { WithDustGoogleGeminiFourArgonConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_4_argon";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { EU_AGENT_PLATFORM_ENDPOINT_FILTER } from "@app/lib/llms/utils/endpoint_filters";
import { GoogleGeminiFourArgonEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_4_argon_eu_agent_platform";

export class DustGoogleGeminiFourArgonEuropeAgentPlatformStream extends WithDustGoogleGeminiFourArgonConfig(
  GoogleGeminiFourArgonEuropeAgentPlatformStream
) {
  static readonly endpointFilter = EU_AGENT_PLATFORM_ENDPOINT_FILTER;
}

defineDustStreamEndpoint(DustGoogleGeminiFourArgonEuropeAgentPlatformStream);
