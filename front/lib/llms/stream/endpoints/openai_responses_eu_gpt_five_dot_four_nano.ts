import { WithDustGptFiveDotFourNanoConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_four_nano";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesEuropeGptFiveDotFourNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_four_nano";

export class DustOpenAIResponsesEuropeGptFiveDotFourNanoStream extends WithDustGptFiveDotFourNanoConfig(
  OpenAIResponsesEuropeGptFiveDotFourNanoStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveDotFourNanoStream);
