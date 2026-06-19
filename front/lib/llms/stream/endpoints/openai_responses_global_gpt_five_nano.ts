import { WithDustGptFiveNanoConfig } from "@app/lib/llms/providers/openai/models/gpt_five_nano";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesGlobalGptFiveNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_nano";

export class DustOpenAIResponsesGlobalGptFiveNanoStream extends WithDustGptFiveNanoConfig(
  OpenAIResponsesGlobalGptFiveNanoStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveNanoStream);
