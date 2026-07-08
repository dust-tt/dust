import { WithDustGptFiveMiniConfig } from "@app/lib/llms/providers/openai/models/gpt_five_mini";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesEuropeGptFiveMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_mini";

export class DustOpenAIResponsesEuropeGptFiveMiniStream extends WithDustGptFiveMiniConfig(
  OpenAIResponsesEuropeGptFiveMiniStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveMiniStream);
