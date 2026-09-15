import {
  clearAutomaticModelDegradation,
  markModelAutomaticallyDegraded,
} from "@app/lib/api/llm/health/automatic_degradation";
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
  await clearAutomaticModelDegradation(endpoint);
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
  await markModelAutomaticallyDegraded(endpoint);
  logModelHealthTransition({
    endpoint,
    transition: "probe_failed",
    degradedForMs,
  });
}

export async function clearAutomaticModelDegradationActivity(
  endpoint: DegradedModelEndpointType
): Promise<void> {
  await clearAutomaticModelDegradation(endpoint);
}
