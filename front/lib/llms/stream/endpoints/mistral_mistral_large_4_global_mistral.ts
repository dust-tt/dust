import { WithDustMistralLarge4Config } from "@app/lib/llms/providers/mistral/models/mistral_large_4";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MistralMistralLarge4GlobalMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_mistral_large_4_global_mistral";

export class DustMistralMistralLarge4GlobalMistralStream extends WithDustMistralLarge4Config(
  MistralMistralLarge4GlobalMistralStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustMistralMistralLarge4GlobalMistralStream);
