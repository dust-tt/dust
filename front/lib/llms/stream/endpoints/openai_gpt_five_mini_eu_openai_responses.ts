import { WithDustGptFiveMiniConfig } from "@app/lib/llms/providers/openai/models/gpt_five_mini";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveMiniEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_mini_eu_openai_responses";

export class DustOpenAIGptFiveMiniEuropeOpenAIResponsesStream extends WithDustGptFiveMiniConfig(
  OpenAIGptFiveMiniEuropeOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIGptFiveMiniEuropeOpenAIResponsesStream);
