import { WithDustMistralCodestralConfig } from "@app/lib/llms/providers/mistral/models/codestral";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MistralCodestralEuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_codestral_eu_mistral";

export class DustMistralCodestralEuropeMistralStream extends WithDustMistralCodestralConfig(
  MistralCodestralEuropeMistralStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustMistralCodestralEuropeMistralStream);
