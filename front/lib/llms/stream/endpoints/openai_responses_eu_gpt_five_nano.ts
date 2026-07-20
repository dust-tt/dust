import { WithDustGptFiveNanoConfig } from "@app/lib/llms/providers/openai/models/gpt_five_nano";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveNanoEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_nano_eu_openai_responses";

export class DustOpenAIResponsesEuropeGptFiveNanoStream extends WithDustGptFiveNanoConfig(
  OpenAIGptFiveNanoEuropeOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveNanoStream);
