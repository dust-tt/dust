import { NOOP_MODEL_CONFIG } from "@app/types/assistant/models/noop";

export function WithDustNoopConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustNoop extends Base {
    static readonly displayName = "Noop";
    static readonly description = "Noop model that does nothing.";
    static readonly byok = false;

    // Nest the legacy model config under a single `modelConfig` static (see
    // `DustStreamEndpointConfiguration`) so consumers can retrieve the full
    // `ModelConfigurationType` off the endpoint without spreading its fields
    // onto the class statics.
    static readonly modelConfig = NOOP_MODEL_CONFIG;
  }

  return DustNoop;
}
