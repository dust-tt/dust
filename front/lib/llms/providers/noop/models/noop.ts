export function WithDustNoopConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustNoop extends Base {
    static readonly displayName = "Noop";
    static readonly description = "Noop model that does nothing.";
    static readonly defaultReasoningEffort = "none";
    static readonly byok = false;
  }

  return DustNoop;
}
