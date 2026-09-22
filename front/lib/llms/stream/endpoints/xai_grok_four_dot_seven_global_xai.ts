import { WithDustGrok47Config } from "@app/lib/llms/providers/xai/models/grok_four_dot_seven";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { XaiGrokFourDotSevenGlobalXaiStream } from "@app/lib/model_constructors/stream/endpoints/xai_grok_four_dot_seven_global_xai";

export class DustXaiGrokFourDotSevenGlobalXaiStream extends WithDustGrok47Config(
  XaiGrokFourDotSevenGlobalXaiStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustXaiGrokFourDotSevenGlobalXaiStream);
