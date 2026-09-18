import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";

export class ModelDegradationFactory {
  // `expiresAt: null` is an operator-placed degradation; a date is a breaker lease.
  static async degraded(
    endpoint: DegradedModelEndpointType,
    { expiresAt = null }: { expiresAt?: Date | null } = {}
  ) {
    await ModelDegradationResource.updateDegradedEndpoints([
      { ...endpoint, degraded: true, expiresAt },
    ]);
  }
}
