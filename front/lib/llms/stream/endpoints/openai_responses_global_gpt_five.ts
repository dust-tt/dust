import { WithDustGptFiveConfig } from "@app/lib/llms/providers/openai/models/gpt_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_global_openai_responses";

export class DustOpenAIResponsesGlobalGptFiveStream extends WithDustGptFiveConfig(
  OpenAIGptFiveGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveStream);
