import { WithDustGptSixLunaConfig } from "@app/lib/llms/providers/openai/models/gpt_six_luna";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptSixLunaGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_six_luna_global_openai_responses";

export class DustOpenAIGptSixLunaGlobalOpenAIResponsesStream extends WithDustGptSixLunaConfig(
  OpenAIGptSixLunaGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIGptSixLunaGlobalOpenAIResponsesStream);
