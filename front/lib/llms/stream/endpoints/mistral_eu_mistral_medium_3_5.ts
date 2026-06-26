import { WithDustMistralMedium35Config } from "@app/lib/llms/providers/mistral/models/mistral_medium_3_5";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { MistralEuropeMistralMedium35Stream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_medium_3_5";

export class DustMistralEuropeMistralMedium35Stream extends WithDustMistralMedium35Config(
  MistralEuropeMistralMedium35Stream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustMistralEuropeMistralMedium35Stream);
