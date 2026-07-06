import { WithDustGptFiveConfig } from "@app/lib/llms/providers/openai/models/gpt_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesEuropeGptFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five";

export class DustOpenAIResponsesEuropeGptFiveStream extends WithDustGptFiveConfig(
  OpenAIResponsesEuropeGptFiveStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveStream);
