import { dropReasoning } from "@app/lib/llms/stream/types/configuration";

export function WithDustMistralCodestralConfig<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase) {
  abstract class DustMistralCodestral extends Base {
    static readonly displayName = "Mistral Codestral";
    static readonly description =
      "Mistral's `codestral` model, specifically designed and optimized for code generation tasks.";
    // Codestral is a non-reasoning model.
    static readonly defaultReasoningEffort = "none";
    // Legacy product value; the model has no separate output cap.
    static readonly maxOutputTokens = 2_048;
    static readonly byok = true;
    // Non-reasoning model: drop the reasoning effort the schema rejects.
    static readonly parseConfig = dropReasoning;
  }

  return DustMistralCodestral;
}
