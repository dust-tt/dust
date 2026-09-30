import { WithDustGptSixDotOneSolConfig } from "@app/lib/llms/providers/openai/models/gpt_six_dot_one_sol";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { PREMIUM_MODEL_ENDPOINT_FILTER } from "@app/lib/llms/utils/endpoint_filters";
import { OpenAIGptSixDotOneSolGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_six_dot_one_sol_global_openai_responses";

export class DustOpenAIGptSixDotOneSolGlobalOpenAIResponsesStream extends WithDustGptSixDotOneSolConfig(
  OpenAIGptSixDotOneSolGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = PREMIUM_MODEL_ENDPOINT_FILTER;
}

defineDustStreamEndpoint(DustOpenAIGptSixDotOneSolGlobalOpenAIResponsesStream);
