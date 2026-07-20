import { WithDustGptFiveMiniConfig } from "@app/lib/llms/providers/openai/models/gpt_five_mini";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveMiniGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_mini_global_openai_responses";

export class DustOpenAIResponsesGlobalGptFiveMiniStream extends WithDustGptFiveMiniConfig(
  OpenAIGptFiveMiniGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveMiniStream);
