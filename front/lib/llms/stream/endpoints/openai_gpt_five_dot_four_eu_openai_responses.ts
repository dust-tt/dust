import { WithDustGptFiveDotFourConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_four";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotFourEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_eu_openai_responses";

export class DustOpenAIGptFiveDotFourEuropeOpenAIResponsesStream extends WithDustGptFiveDotFourConfig(
  OpenAIGptFiveDotFourEuropeOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIGptFiveDotFourEuropeOpenAIResponsesStream);
