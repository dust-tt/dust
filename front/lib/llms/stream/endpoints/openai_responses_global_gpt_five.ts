import { WithDustGptFiveConfig } from "@app/lib/llms/providers/openai/models/gpt_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesGlobalGptFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five";

export class DustOpenAIResponsesGlobalGptFiveStream extends WithDustGptFiveConfig(
  OpenAIResponsesGlobalGptFiveStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveStream);
