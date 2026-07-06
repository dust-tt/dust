import { WithDustGptFiveNanoConfig } from "@app/lib/llms/providers/openai/models/gpt_five_nano";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesEuropeGptFiveNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_nano";

export class DustOpenAIResponsesEuropeGptFiveNanoStream extends WithDustGptFiveNanoConfig(
  OpenAIResponsesEuropeGptFiveNanoStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveNanoStream);
