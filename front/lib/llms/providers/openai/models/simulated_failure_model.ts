import { dropTemperatureWhenReasoning } from "@app/lib/llms/stream/types/configuration";
import { SIMULATED_FAILURE_MODEL_CONFIG } from "@app/types/assistant/models/simulated_failure_model";

export function WithDustSimulatedFailureModelConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class DustSimulatedFailureModel extends Base {
    static readonly displayName = "Simulated Failure Model";
    static readonly description =
      "Internal synthetic model for controlled provider failures.";
    static readonly byok = true;
    static readonly configParsers = [dropTemperatureWhenReasoning];
    static readonly modelConfig = SIMULATED_FAILURE_MODEL_CONFIG;
  }

  return DustSimulatedFailureModel;
}
