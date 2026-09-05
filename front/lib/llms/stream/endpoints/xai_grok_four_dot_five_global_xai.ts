import { WithDustGrok45Config } from "@app/lib/llms/providers/xai/models/grok_four_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { XaiGrokFourDotFiveGlobalXaiStream } from "@app/lib/model_constructors/stream/endpoints/xai_grok_four_dot_five_global_xai";

export class DustXaiGrokFourDotFiveGlobalXaiStream extends WithDustGrok45Config(
  XaiGrokFourDotFiveGlobalXaiStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustXaiGrokFourDotFiveGlobalXaiStream);
