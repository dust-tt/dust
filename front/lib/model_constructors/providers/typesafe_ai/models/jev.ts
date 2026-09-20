import { typeSafeAiConfigSchema } from "@app/lib/model_constructors/providers/typesafe_ai/inputConfig";
import { JEV } from "@app/lib/model_constructors/types/models";

// TODO(2026-09-20 pierre): confirm against TypeSafe's published model card
// (https://docs.typesafe.ai) and replace. `jev` bills on the `input_tokens` /
// `output_tokens` its API reports, but the limits and rates are not in the SDK
// package and we have no key to call `client.models.list()` with yet.
const CONTEXT_SIZE = 0;
const MAX_OUTPUT_TOKENS = 0;

export function WithJevConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class Jev extends Base {
    static readonly model = JEV;

    static readonly configSchema = typeSafeAiConfigSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return Jev;
}
