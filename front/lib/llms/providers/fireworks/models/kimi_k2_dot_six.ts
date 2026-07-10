export function WithDustFireworksKimiK2Dot6Config<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustFireworksKimiK2Dot6 extends Base {
    static readonly displayName = "Kimi K2.6 (Fireworks)";
    static readonly description =
      "Moonshot AI's flagship agentic model with 262k context and vision support (served via Fireworks).";
    static readonly defaultReasoningEffort = "low";
    static readonly byok = false;
  }

  return DustFireworksKimiK2Dot6;
}
