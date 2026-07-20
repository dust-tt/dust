import { WithDustMistralSmallConfig } from "@app/lib/llms/providers/mistral/models/mistral_small";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MistralMistralSmallEuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_mistral_small_eu_mistral";

export class DustMistralEuropeMistralSmallStream extends WithDustMistralSmallConfig(
  MistralMistralSmallEuropeMistralStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustMistralEuropeMistralSmallStream);
