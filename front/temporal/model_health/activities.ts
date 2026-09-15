import {
  clearAutomaticModelDegradation,
  getAutomaticModelDegradationExpiresAt,
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

export async function getAutomaticModelDegradationExpiresAtActivity(
  endpoint: DegradedModelEndpointType
): Promise<number | null> {
  const expiresAt = await getAutomaticModelDegradationExpiresAt(endpoint);
  return expiresAt?.getTime() ?? null;
}

export async function logModelHealthRecoveryActivity({
  endpoint,
  degradedForMs,
  observedExpiresAtMs,
}: {
  endpoint: DegradedModelEndpointType;
  degradedForMs: number;
  // Missing on workflows started before Postgres became authoritative.
  observedExpiresAtMs?: number | null;
}): Promise<boolean> {
  const observedExpiresAt =
    typeof observedExpiresAtMs === "number"
      ? new Date(observedExpiresAtMs)
      : null;
  const cleared = observedExpiresAt
    ? await clearAutomaticModelDegradation(endpoint, observedExpiresAt)
    : false;
  if (cleared) {
    logModelHealthTransition({
      endpoint,
      transition: "recovered",
      degradedForMs,
      expiresAt: observedExpiresAt ?? undefined,
      cleared,
    });
  }
  return cleared;
}

export async function logModelHealthProbeFailedActivity({
  endpoint,
  degradedForMs,
}: {
  endpoint: DegradedModelEndpointType;
  degradedForMs: number;
}): Promise<Date> {
  const expiresAt = await markModelAutomaticallyDegraded(endpoint);
  logModelHealthTransition({
    endpoint,
    transition: "probe_failed",
    degradedForMs,
    expiresAt,
  });
  return expiresAt;
}

// Replay compatibility for workflows started by the Redis-backed version.
export async function clearAutomaticModelDegradationActivity(
  _endpoint: DegradedModelEndpointType
): Promise<void> {
  return;
}
