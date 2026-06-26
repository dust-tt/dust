import { WithDustMistralLargeConfig } from "@app/lib/llms/providers/mistral/models/mistral_large";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MistralEuropeMistralLargeStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_large";

export class DustMistralEuropeMistralLargeStream extends WithDustMistralLargeConfig(
  MistralEuropeMistralLargeStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustMistralEuropeMistralLargeStream);
