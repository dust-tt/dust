import { makeGroupLimitAwuCreditsRateLimitKeyForGroup } from "@app/lib/api/assistant/rate_limits";
import { areGroupLimitsEnabled } from "@app/lib/api/groups/group_limit_eligibility";
import { resolveLimitGroupForUser } from "@app/lib/api/groups/limit_group";
import type { Authenticator } from "@app/lib/auth";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import { addFixedWindowCount } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";

export async function recordGroupLimitUsage(
  auth: Authenticator,
  {
    user,
    agentMessageId,
    incrementBy,
  }: { user: UserResource; agentMessageId: string; incrementBy: number }
): Promise<void> {
  if (!Number.isFinite(incrementBy) || incrementBy <= 0) {
    return;
  }
  if (!(await areGroupLimitsEnabled(auth))) {
    return;
  }

  const agentMessage = await ConversationResource.fetchAgentMessageLimitGroup(
    auth,
    { agentMessageId }
  );
  if (!agentMessage) {
    return;
  }

  let limitGroup: GroupResource | null;
  if (agentMessage.limitGroupModelId !== null) {
    const [storedGroup] = await GroupResource.dangerouslyFetchByModelIds(auth, [
      agentMessage.limitGroupModelId,
    ]);
    limitGroup = storedGroup ?? null;
  } else {
    limitGroup = await resolveLimitGroupForUser(auth, { user });
    if (limitGroup) {
      await ConversationResource.setAgentMessageLimitGroup(auth, {
        agentMessageModelId: agentMessage.agentMessageModelId,
        limitGroupModelId: limitGroup.id,
      });
    }
  }
  if (!limitGroup) {
    return;
  }

  const workspace = auth.getNonNullableWorkspace();
  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return;
  }

  await addFixedWindowCount({
    key: makeGroupLimitAwuCreditsRateLimitKeyForGroup(workspace, limitGroup),
    bounds,
    incrementBy: roundCreditsToMicroCredits(incrementBy),
    logger,
  });
}
