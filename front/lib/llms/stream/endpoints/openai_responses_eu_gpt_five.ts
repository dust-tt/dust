import { WithDustGptFiveConfig } from "@app/lib/llms/providers/openai/models/gpt_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_eu_openai_responses";

export class DustOpenAIResponsesEuropeGptFiveStream extends WithDustGptFiveConfig(
  OpenAIGptFiveEuropeOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveStream);
