import { WithDustGptSixAstraConfig } from "@app/lib/llms/providers/openai/models/gpt_six_astra";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { PREMIUM_MODEL_ENDPOINT_FILTER } from "@app/lib/llms/utils/endpoint_filters";
import { OpenAIGptSixAstraGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_six_astra_global_openai_responses";

export class DustOpenAIGptSixAstraGlobalOpenAIResponsesStream extends WithDustGptSixAstraConfig(
  OpenAIGptSixAstraGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {
    and: [
      PREMIUM_MODEL_ENDPOINT_FILTER,
      { not: { featureFlags: { contains: "disable_gpt_6_astra" as const } } },
    ],
  };
}

defineDustStreamEndpoint(DustOpenAIGptSixAstraGlobalOpenAIResponsesStream);
