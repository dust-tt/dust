import { WithDustTogetheraiLlama3370BInstructTurboConfig } from "@app/lib/llms/providers/togetherai/models/llama_3_3_70b_instruct_turbo";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { TogetheraiUsLlama3370BInstructTurboStream } from "@app/lib/model_constructors/stream/endpoints/togetherai_us_llama_3_3_70b_instruct_turbo";

export class DustTogetheraiUsLlama3370BInstructTurboStream extends WithDustTogetheraiLlama3370BInstructTurboConfig(
  TogetheraiUsLlama3370BInstructTurboStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustTogetheraiUsLlama3370BInstructTurboStream);
