import { WithDustGptFiveDotOneConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_one";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesEuropeGptFiveDotOneStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_one";

export class DustOpenAIResponsesEuropeGptFiveDotOneStream extends WithDustGptFiveDotOneConfig(
  OpenAIResponsesEuropeGptFiveDotOneStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveDotOneStream);
