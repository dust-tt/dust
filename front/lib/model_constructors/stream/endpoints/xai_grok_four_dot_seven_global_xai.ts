import { WithXaiGrokFourDotSevenConfig } from "@app/lib/model_constructors/providers/xai/models/grok_four_dot_seven";
import { XaiStream } from "@app/lib/model_constructors/stream/clients/xai";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class XaiGrokFourDotSevenGlobalXaiStream extends WithXaiGrokFourDotSevenConfig(
  XaiStream
) {
  // Short-context pricing verified 2026-09-22:
  // https://docs.x.ai/developers/pricing. Dust's 256k context and 64k output
  // caps leave at most 192k prompt tokens, below the 200k price breakpoint.
  static readonly tokenPricing = {
    cacheHit: 0.5,
    standardInput: 2.0,
    standardOutput: 6.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

XaiGrokFourDotSevenGlobalXaiStream satisfies StreamEndpointConstructor;
