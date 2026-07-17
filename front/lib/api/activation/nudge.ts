import type { Authenticator } from "@app/lib/auth";
import { ActivationNudgeResource } from "@app/lib/resources/activation_nudge_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS } from "@app/temporal/activation_scheduler/config";
import isNumber from "lodash/isNumber";

export function getActivationNudgeFrequencyCapDays(
  auth: Authenticator
): number {
  const workspace = auth.getNonNullableWorkspace();
  const customFrequencyCapDays =
    workspace.metadata?.activationNudgeFrequencyCapDays;

  if (isNumber(customFrequencyCapDays)) {
    return customFrequencyCapDays;
  }
  return DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS;
}

// Frequency cap: gates re-nudging a pod that was already nudged within the
// workspace's configured cap window.
export async function isEligibleForNudge(
  auth: Authenticator,
  pod: SpaceResource
): Promise<boolean> {
  const latestNudge = await ActivationNudgeResource.fetchLatestForSpace(auth, {
    pod,
  });
  if (!latestNudge) {
    return true;
  }

  const frequencyCapDays = getActivationNudgeFrequencyCapDays(auth);
  const frequencyCapMs = frequencyCapDays * 24 * 60 * 60 * 1000;

  return Date.now() - latestNudge.createdAt.getTime() >= frequencyCapMs;
}
