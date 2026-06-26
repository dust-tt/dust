import { WithDustGptFiveDotTwoConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_two";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesGlobalGptFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_two";

export class DustOpenAIResponsesGlobalGptFiveDotTwoStream extends WithDustGptFiveDotTwoConfig(
  OpenAIResponsesGlobalGptFiveDotTwoStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveDotTwoStream);
