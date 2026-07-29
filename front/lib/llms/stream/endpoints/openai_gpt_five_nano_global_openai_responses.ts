import { WithDustGptFiveNanoConfig } from "@app/lib/llms/providers/openai/models/gpt_five_nano";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveNanoGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_nano_global_openai_responses";

export class DustOpenAIGptFiveNanoGlobalOpenAIResponsesStream extends WithDustGptFiveNanoConfig(
  OpenAIGptFiveNanoGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIGptFiveNanoGlobalOpenAIResponsesStream);
