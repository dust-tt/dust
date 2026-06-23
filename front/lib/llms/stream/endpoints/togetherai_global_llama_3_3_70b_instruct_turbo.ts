import { WithDustTogetheraiLlama3370BInstructTurboConfig } from "@app/lib/llms/providers/togetherai/models/llama_3_3_70b_instruct_turbo";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { TogetheraiGlobalLlama3370BInstructTurboStream } from "@app/lib/model_constructors/stream/endpoints/togetherai_global_llama_3_3_70b_instruct_turbo";

export class DustTogetheraiGlobalLlama3370BInstructTurboStream extends WithDustTogetheraiLlama3370BInstructTurboConfig(
  TogetheraiGlobalLlama3370BInstructTurboStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustTogetheraiGlobalLlama3370BInstructTurboStream);
