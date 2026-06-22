import { WithDustMistralSmallConfig } from "@app/lib/llms/providers/mistral/models/mistral_small";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MistralEuropeMistralSmallStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_small";

export class DustMistralEuropeMistralSmallStream extends WithDustMistralSmallConfig(
  MistralEuropeMistralSmallStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustMistralEuropeMistralSmallStream);
