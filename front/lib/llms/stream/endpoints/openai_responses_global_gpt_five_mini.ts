import { WithDustGptFiveMiniConfig } from "@app/lib/llms/providers/openai/models/gpt_five_mini";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesGlobalGptFiveMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_mini";

export class DustOpenAIResponsesGlobalGptFiveMiniStream extends WithDustGptFiveMiniConfig(
  OpenAIResponsesGlobalGptFiveMiniStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveMiniStream);
