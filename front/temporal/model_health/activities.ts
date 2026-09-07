import { probeEndpoint } from "@app/lib/api/llm/health/probe";
import { logModelHealthTransition } from "@app/lib/api/llm/health/transitions";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";

export async function probeEndpointActivity(
  endpoint: DegradedModelEndpointType
): Promise<boolean> {
  return probeEndpoint(endpoint);
}

export async function logModelHealthRecoveryActivity({
  endpoint,
  degradedForMs,
}: {
  endpoint: DegradedModelEndpointType;
  degradedForMs: number;
}): Promise<void> {
  logModelHealthTransition({
    endpoint,
    transition: "recovered",
    degradedForMs,
  });
}

export async function logModelHealthProbeFailedActivity({
  endpoint,
  degradedForMs,
}: {
  endpoint: DegradedModelEndpointType;
  degradedForMs: number;
}): Promise<void> {
  logModelHealthTransition({
    endpoint,
    transition: "probe_failed",
    degradedForMs,
  });
}
