import { applyDegradedEndpointCacheUpdate } from "@app/lib/api/assistant/degraded_models";
import { DEGRADATION_LEASE_MS } from "@app/lib/api/llm/health/config";
import { probeEndpoint } from "@app/lib/api/llm/health/probe";
import { logModelHealthTransition } from "@app/lib/api/llm/health/transitions";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";

export async function probeEndpointActivity(
  endpoint: DegradedModelEndpointType
): Promise<boolean> {
  return probeEndpoint(endpoint);
}

export async function logModelHealthRecoveryActivity({
  endpoint,
  degradedForMs,
  persistDegradation,
}: {
  endpoint: DegradedModelEndpointType;
  degradedForMs: number;
  persistDegradation: boolean;
}): Promise<void> {
  if (persistDegradation) {
    const updates = [{ ...endpoint, degraded: false as const }];
    await ModelDegradationResource.updateDegradedEndpoints(updates);
    applyDegradedEndpointCacheUpdate(updates);
  }
  logModelHealthTransition({
    endpoint,
    transition: "recovered",
    degradedForMs,
  });
}

export async function logModelHealthProbeFailedActivity({
  endpoint,
  degradedForMs,
  persistDegradation,
}: {
  endpoint: DegradedModelEndpointType;
  degradedForMs: number;
  persistDegradation: boolean;
}): Promise<void> {
  let expiresAt: Date | undefined;
  if (persistDegradation) {
    expiresAt = new Date(Date.now() + DEGRADATION_LEASE_MS);
    const updates = [{ ...endpoint, degraded: true as const, expiresAt }];
    await ModelDegradationResource.updateDegradedEndpoints(updates);
    applyDegradedEndpointCacheUpdate(updates);
  }
  logModelHealthTransition({
    endpoint,
    transition: "probe_failed",
    degradedForMs,
    expiresAt,
  });
}
