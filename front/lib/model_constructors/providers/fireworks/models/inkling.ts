import { fireworksConfigSchema } from "@app/lib/model_constructors/providers/fireworks/inputConfig";
import { INKLING } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// Verified 2026-08-14 against Fireworks' public model page and live model API:
// https://fireworks.ai/models/fireworks/inkling
// The metadata API reports 1,048,576 tokens, but live inference enforces a
// 1,000,000-token prompt-plus-completion budget. Use the runtime limit.
const CONTEXT_SIZE = 1_000_000;
// Fireworks reports 1,000,000 as the maximum completion-token value, subject to
// the shared prompt-plus-completion budget. Dust applies a 64k product cap.
const MAX_OUTPUT_TOKENS = 1_000_000;

// Thinking Machines maps named efforts onto continuous levels and defaults to
// high (0.9), as shown in its official tokenizer-template change:
// https://huggingface.co/thinkingmachines/Inkling/commit/0992a1edfe2539ffea897c6d85ae7dc64dff8823
// Its API docs also list low/medium/high/xhigh/max, with max equivalent to
// xhigh: https://tinker-docs.thinkingmachines.ai/tinker/compatible-apis/anthropic/
//
// Confirmed live through Fireworks on 2026-08-14: none/low/medium/high/xhigh/max
// work across temperatures 0, 0.1, and 1; `minimal` is rejected by Fireworks.
// The endpoint accepts `none`, though Inkling still emits a short reasoning
// trace at that effort. Forced tool selection did not complete in three
// separate 60-second runs, while automatic tool use works, so forcing is not
// exposed for this endpoint.
const configSchema = fireworksConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(["none", "low", "medium", "high", "xhigh", "maximal"]),
    })
    .default({ effort: "high" }),
  forceTool: z.undefined(),
});

export function WithThinkingMachinesInklingConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class ThinkingMachinesInkling extends Base {
    static readonly model = INKLING;
    static readonly configSchema = configSchema;
    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return ThinkingMachinesInkling;
}
