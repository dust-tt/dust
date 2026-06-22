import { WithDustGptFiveDotFiveConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_five";

export class DustOpenAIResponsesGlobalGptFiveDotFiveStream extends WithDustGptFiveDotFiveConfig(
  OpenAIResponsesGlobalGptFiveDotFiveStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveDotFiveStream);
