import { WithDustGptFiveDotSixSolConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_six_sol";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesEuropeGptFiveDotSixSolStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_six_sol";

export class DustOpenAIResponsesEuropeGptFiveDotSixSolStream extends WithDustGptFiveDotSixSolConfig(
  OpenAIResponsesEuropeGptFiveDotSixSolStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveDotSixSolStream);
