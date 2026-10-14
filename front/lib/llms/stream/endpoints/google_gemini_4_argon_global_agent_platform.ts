import { WithDustGoogleGeminiFourArgonConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_4_argon";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiFourArgonGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_4_argon_global_agent_platform";

export class DustGoogleGeminiFourArgonGlobalAgentPlatformStream extends WithDustGoogleGeminiFourArgonConfig(
  GoogleGeminiFourArgonGlobalAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustGoogleGeminiFourArgonGlobalAgentPlatformStream);
