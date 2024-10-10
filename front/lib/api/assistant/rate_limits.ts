import type {
  LightWorkspaceType,
  MaxMessagesTimeframeType,
} from "@dust-tt/types";

import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";

export const makeMessageRateLimitKeyForWorkspace = (
  owner: LightWorkspaceType
) => {
  return `postUserMessage:${owner.sId}`;
};

export const makeAgentMentionsRateLimitKeyForWorkspace = (
  owner: LightWorkspaceType,
  maxMessagesTimeframe: MaxMessagesTimeframeType
) => {
  return `workspace:${owner.id}:agent_message_count:${maxMessagesTimeframe}`;
};

export async function resetWorkspaceRateLimit(auth: Authenticator) {
  await runOnRedis(async (redis) => {
    const workspace = auth.getNonNullableWorkspace();
    const plan = auth.getNonNullablePlan();

    await redis.expire(makeMessageRateLimitKeyForWorkspace(workspace), 0);
    await redis.expire(
      makeAgentMentionsRateLimitKeyForWorkspace(
        workspace,
        plan.limits.assistant.maxMessagesTimeframe
      ),
      0
    );
  });
}
