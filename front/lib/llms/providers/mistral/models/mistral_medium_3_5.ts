export function WithDustMistralMedium35Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMistralMedium35 extends Base {
    static readonly displayName = "Mistral Medium 3.5";
    static readonly description =
      "Mistral's `medium 3.5` model, multimodal and optimized for agentic and coding use cases (256k context).";
    static readonly defaultReasoningEffort = "none";
    // Legacy product value; the model has no separate output cap.
    static readonly maxOutputTokens = 2_048;
    static readonly byok = true;
  }

  return DustMistralMedium35;
}
