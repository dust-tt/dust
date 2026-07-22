import { XaiStream } from "@app/lib/model_constructors/stream/clients/xai";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { GROK_4_5 } from "@app/lib/model_constructors/types/models";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";
import { z } from "zod";

// grok-4.5 reasoning is always on: only low/medium/high are accepted (it rejects
// none/minimal/xhigh/maximal) and it defaults to high. A temperature is allowed.
// https://docs.x.ai/docs/guides/reasoning (2026-07-21)
const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["low", "medium", "high"]) })
    .default({ effort: "high" }),
});

export class XaiGrokFourDotFiveGlobalXaiStream extends XaiStream {
  static readonly model = GROK_4_5;

  static readonly configSchema = configSchema;

  // https://docs.x.ai/developers/models/grok-4.5 (2026-07-21)
  static readonly contextSize = 500_000;
  static readonly maxOutputTokens = 64_000;

  // https://docs.x.ai/docs/models (2026-07-21)
  static readonly tokenPricing = {
    cacheHit: 0.3,
    standardInput: 2.0,
    standardOutput: 6.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

XaiGrokFourDotFiveGlobalXaiStream satisfies StreamEndpointConstructor;
