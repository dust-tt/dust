import { WithDustGptFiveDotSixSolConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_six_sol";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesGlobalGptFiveDotSixSolStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_six_sol";

export class DustOpenAIResponsesGlobalGptFiveDotSixSolStream extends WithDustGptFiveDotSixSolConfig(
  OpenAIResponsesGlobalGptFiveDotSixSolStream,
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveDotSixSolStream);
