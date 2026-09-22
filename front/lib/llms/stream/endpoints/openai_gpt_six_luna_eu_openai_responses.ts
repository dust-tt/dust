import { WithDustGptSixLunaConfig } from "@app/lib/llms/providers/openai/models/gpt_six_luna";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptSixLunaEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_six_luna_eu_openai_responses";

export class DustOpenAIGptSixLunaEuropeOpenAIResponsesStream extends WithDustGptSixLunaConfig(
  OpenAIGptSixLunaEuropeOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIGptSixLunaEuropeOpenAIResponsesStream);
