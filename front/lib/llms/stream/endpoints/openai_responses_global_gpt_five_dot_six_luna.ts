import { WithDustGptFiveDotSixLunaConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_six_luna";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesGlobalGptFiveDotSixLunaStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_six_luna";

export class DustOpenAIResponsesGlobalGptFiveDotSixLunaStream extends WithDustGptFiveDotSixLunaConfig(
  OpenAIResponsesGlobalGptFiveDotSixLunaStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveDotSixLunaStream);
