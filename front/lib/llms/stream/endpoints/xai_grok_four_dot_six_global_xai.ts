import { WithDustGrok46Config } from "@app/lib/llms/providers/xai/models/grok_four_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { XaiGrokFourDotSixGlobalXaiStream } from "@app/lib/model_constructors/stream/endpoints/xai_grok_four_dot_six_global_xai";

export class DustXaiGrokFourDotSixGlobalXaiStream extends WithDustGrok46Config(
  XaiGrokFourDotSixGlobalXaiStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustXaiGrokFourDotSixGlobalXaiStream);
