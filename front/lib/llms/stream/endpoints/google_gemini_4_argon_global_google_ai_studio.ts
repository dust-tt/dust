import { WithDustGoogleGeminiFourArgonConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_4_argon";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiFourArgonGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_4_argon_global_google_ai_studio";

export class DustGoogleGeminiFourArgonGlobalGoogleAiStudioStream extends WithDustGoogleGeminiFourArgonConfig(
  GoogleGeminiFourArgonGlobalGoogleAiStudioStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustGoogleGeminiFourArgonGlobalGoogleAiStudioStream);
