import { WithDustMistralLargeConfig } from "@app/lib/llms/providers/mistral/models/mistral_large";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MistralMistralLargeEuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_mistral_large_eu_mistral";

export class DustMistralMistralLargeEuropeMistralStream extends WithDustMistralLargeConfig(
  MistralMistralLargeEuropeMistralStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustMistralMistralLargeEuropeMistralStream);
