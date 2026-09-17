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
    await ModelDegradationResource.updateDegradedEndpoints([
      { ...endpoint, degraded: false },
    ]);
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
  const expiresAt = persistDegradation
    ? new Date(Date.now() + DEGRADATION_LEASE_MS)
    : undefined;
  if (expiresAt) {
    await ModelDegradationResource.updateDegradedEndpoints([
      { ...endpoint, degraded: true, expiresAt },
    ]);
  }
  logModelHealthTransition({
    endpoint,
    transition: "probe_failed",
    degradedForMs,
    expiresAt,
  });
}
