import { WithDustGptFiveDotSixLunaConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_six_luna";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_luna_global_openai_responses";

export class DustOpenAIResponsesGlobalGptFiveDotSixLunaStream extends WithDustGptFiveDotSixLunaConfig(
  OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveDotSixLunaStream);
