export function WithDustMistralCodestralConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustMistralCodestral extends Base {
    static readonly displayName = "Codestral";
    static readonly description = "Mistral's code model (128k context).";
    // Codestral is a non-reasoning model.
    static readonly defaultReasoningEffort = "none";
    static readonly byok = true;
  }

  return DustMistralCodestral;
}
