import { WithDustGptFiveDotFiveConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesEuropeGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_five";

export class DustOpenAIResponsesEuropeGptFiveDotFiveStream extends WithDustGptFiveDotFiveConfig(
  OpenAIResponsesEuropeGptFiveDotFiveStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveDotFiveStream);
