import { dropReasoning } from "@app/lib/llms/stream/types/configuration";

export function WithDustMistralLargeConfig<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase) {
  abstract class DustMistralLarge extends Base {
    static readonly displayName = "Mistral Large";
    static readonly description = "Mistral's `large` model (256k context).";
    // Mistral Large is a non-reasoning model.
    static readonly defaultReasoningEffort = "none";
    // Legacy product value; the model has no separate output cap.
    static readonly maxOutputTokens = 2_048;
    static readonly byok = true;
    // Non-reasoning model: drop the reasoning effort the schema rejects.
    static readonly parseConfig = dropReasoning;
  }

  return DustMistralLarge;
}
