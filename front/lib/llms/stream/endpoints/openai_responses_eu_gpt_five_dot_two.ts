import { WithDustGptFiveDotTwoConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_two";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesEuropeGptFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_two";

export class DustOpenAIResponsesEuropeGptFiveDotTwoStream extends WithDustGptFiveDotTwoConfig(
  OpenAIResponsesEuropeGptFiveDotTwoStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveDotTwoStream);
