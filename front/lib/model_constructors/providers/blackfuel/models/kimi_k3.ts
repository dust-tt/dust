import { blackfuelConfigSchema } from "@app/lib/model_constructors/providers/blackfuel/inputConfig";
import { KIMI_K3 } from "@app/lib/model_constructors/types/models";
import { z } from "zod";

// `context_length` from Blackfuel's `GET /v1/models` (2026-10-05).
const CONTEXT_SIZE = 1_048_576;
// Moonshot's default `max_completion_tokens`:
// https://platform.kimi.ai/docs/guide/kimi-k3-quickstart
const MAX_OUTPUT_TOKENS = 131_072;

const DEFAULT_REASONING_EFFORT = "maximal";

// Moonshot documents exactly low/high/max for K3, with `max` as the model
// default: https://platform.kimi.ai/docs/guide/use-reasoning-effort
// Blackfuel lists the same three in `reasoning.supported_efforts` and rejects
// minimal/medium/xhigh with a 400. It also accepts `none`, which turns thinking
// off (verified live 2026-10-05), but we expose the documented set only, as on
// Fireworks, since undocumented efforts can change without notice.
//
// `temperature` is accepted at every value tested, and a forced tool call works
// at every effort (verified live 2026-10-05).
const configSchema = blackfuelConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(["low", "high", "maximal"]) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

export function WithMoonshotAiKimiK3BlackfuelConfig<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase) {
  abstract class MoonshotAiKimiK3Blackfuel extends Base {
    static readonly model = KIMI_K3;

    static readonly configSchema = configSchema;

    // Typed as `number` so the Dust layer can apply product caps.
    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return MoonshotAiKimiK3Blackfuel;
}
