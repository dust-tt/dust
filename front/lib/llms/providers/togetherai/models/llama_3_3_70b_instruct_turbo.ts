export function WithDustTogetheraiLlama3370BInstructTurboConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustTogetheraiLlama3370BInstructTurbo extends Base {
    static readonly displayName = "Llama 3.3 70B Instruct Turbo";
    static readonly description =
      "Meta's fast, powerful and open source model (128k context, served via TogetherAI).";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = false;
  }

  return DustTogetheraiLlama3370BInstructTurbo;
}
