import { WithDustGptFiveDotTwoConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_two";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotTwoEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_two_eu_openai_responses";

export class DustOpenAIGptFiveDotTwoEuropeOpenAIResponsesStream extends WithDustGptFiveDotTwoConfig(
  OpenAIGptFiveDotTwoEuropeOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIGptFiveDotTwoEuropeOpenAIResponsesStream);
