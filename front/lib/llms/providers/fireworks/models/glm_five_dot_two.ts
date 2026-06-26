export function WithDustFireworksGlm52Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustFireworksGlm52 extends Base {
    static readonly displayName = "GLM-5.2 (Fireworks)";
    static readonly description =
      "Z.ai's GLM-5.2 Mixture-of-Experts model with advanced coding and long-horizon agentic capabilities (1M context, served via Fireworks).";
    static readonly defaultReasoningEffort = "low";
    static readonly byok = false;
  }

  return DustFireworksGlm52;
}
