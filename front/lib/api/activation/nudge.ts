import type { Authenticator } from "@app/lib/auth";
import { ActivationNudgeResource } from "@app/lib/resources/activation_nudge_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import {
  DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS,
  DEFAULT_ACTIVATION_NUDGE_MAX_UNANSWERED_COUNT,
} from "@app/temporal/activation_scheduler/config";
import isNumber from "lodash/isNumber";
import uniq from "lodash/uniq";

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

export function getActivationNudgeMaxUnansweredCount(
  auth: Authenticator
): number {
  const workspace = auth.getNonNullableWorkspace();
  const customMaxUnansweredCount =
    workspace.metadata?.activationNudgeMaxUnansweredCount;

  if (isNumber(customMaxUnansweredCount)) {
    return customMaxUnansweredCount;
  }
  return DEFAULT_ACTIVATION_NUDGE_MAX_UNANSWERED_COUNT;
}

// Counts how many of the pod's most recent nudges, starting from the latest
// and going backwards, got no message from the nudged user (a nudge is
// "unanswered" if the pod has no message from that user since it fired). The
// count stops at the first answered nudge, so a reply resets the streak.
async function countUnansweredNudgeStreak(
  auth: Authenticator,
  pod: SpaceResource,
  { limit }: { limit: number }
): Promise<number> {
  const recentNudges = await ActivationNudgeResource.listRecentForSpace(auth, {
    pod,
    limit,
  });
  if (recentNudges.length === 0) {
    return 0;
  }

  const oldestNudge = recentNudges[recentNudges.length - 1];
  const triggerIds = uniq(recentNudges.map((nudge) => nudge.triggerId));
  const replyTimestamps =
    await ConversationResource.listUserMessageTimestampsForTriggers(auth, {
      triggerIds,
      userId: oldestNudge.userId,
      since: oldestNudge.createdAt,
    });

  let streak = 0;
  for (let i = 0; i < recentNudges.length; i++) {
    const windowStart = recentNudges[i].createdAt;
    const windowEnd = i === 0 ? new Date() : recentNudges[i - 1].createdAt;

    const wasAnswered = replyTimestamps.some(
      (t) => t >= windowStart && t < windowEnd
    );
    if (wasAnswered) {
      break;
    }
    streak++;
  }

  return streak;
}

// Gates re-nudging a pod on two conditions:
// - Frequency cap: was the pod nudged within the workspace's configured cap
//   window?
// - Unanswered cap: have the pod's most recent nudges gone unanswered (no
//   user message since they fired), up to the workspace's configured max?
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
  const msSinceLastNudge = Date.now() - latestNudge.createdAt.getTime();
  if (msSinceLastNudge < frequencyCapMs) {
    return false;
  }

  const maxUnansweredCount = getActivationNudgeMaxUnansweredCount(auth);
  const unansweredStreak = await countUnansweredNudgeStreak(auth, pod, {
    limit: maxUnansweredCount,
  });

  return unansweredStreak < maxUnansweredCount;
}
