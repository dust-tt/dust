import { NOOP_MODEL_CONFIG } from "@app/types/assistant/models/noop";

export function WithDustNoopConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  // Spread the legacy model config onto the class statics (see
  // `DustStreamEndpointConfiguration`). `Object.assign` returns
  // `class & ModelConfigurationType`, so the fields are visible to the type
  // checker without an unsafe cast.
  abstract class DustNoopConfig extends Base {}
  const WithConfig = Object.assign(DustNoopConfig, NOOP_MODEL_CONFIG);

  // Declared last so these own statics shadow (take precedence over) the spread
  // config values.
  abstract class DustNoop extends WithConfig {
    static readonly displayName = "Noop";
    static readonly description = "Noop model that does nothing.";
    static readonly byok = false;
  }

  return DustNoop;
}
