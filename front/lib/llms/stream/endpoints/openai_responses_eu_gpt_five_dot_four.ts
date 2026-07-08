import { WithDustGptFiveDotFourConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_four";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesEuropeGptFiveDotFourStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_four";

export class DustOpenAIResponsesEuropeGptFiveDotFourStream extends WithDustGptFiveDotFourConfig(
  OpenAIResponsesEuropeGptFiveDotFourStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveDotFourStream);
