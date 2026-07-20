import { dropReasoning } from "@app/lib/llms/stream/types/configuration";

export function WithDustMistralSmallConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMistralSmall extends Base {
    static readonly displayName = "Mistral Small";
    static readonly description = "Mistral's `small` model (128k context).";
    // Mistral Small is a non-reasoning model.
    static readonly defaultReasoningEffort = "none";
    // Legacy product value; the model has no separate output cap.
    static readonly maxOutputTokens = 2_048;
    static readonly byok = true;
    // Non-reasoning model: drop the reasoning effort the schema rejects.
    static readonly parseConfig = dropReasoning;
  }

  return DustMistralSmall;
}
