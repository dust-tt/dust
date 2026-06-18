import { WithDustMistralCodestralConfig } from "@app/lib/llms/providers/mistral/models/codestral";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MistralEuropeCodestralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_codestral";

export class DustMistralEuropeCodestralStream extends WithDustMistralCodestralConfig(
  MistralEuropeCodestralStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustMistralEuropeCodestralStream);
