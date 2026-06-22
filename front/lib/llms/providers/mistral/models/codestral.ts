export function WithDustMistralCodestralConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMistralCodestral extends Base {
    static readonly displayName = "Mistral Codestral";
    static readonly description =
      "Mistral's `codestral` model, specifically designed and optimized for code generation tasks.";
    // Codestral is a non-reasoning model.
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
  }

  return DustMistralCodestral;
}
