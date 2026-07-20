import { WithDustMistralMedium35Config } from "@app/lib/llms/providers/mistral/models/mistral_medium_3_5";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MistralMistralMedium35EuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_mistral_medium_3_5_eu_mistral";

export class DustMistralEuropeMistralMedium35Stream extends WithDustMistralMedium35Config(
  MistralMistralMedium35EuropeMistralStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustMistralEuropeMistralMedium35Stream);
